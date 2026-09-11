import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import type { Env } from '../../config/env'

/** Long enough to pick a file and upload it, short enough to be worth little. */
const UPLOAD_URL_TTL_SECONDS = 10 * 60
/** Long enough to render a page and click through, and no longer. */
const DOWNLOAD_URL_TTL_SECONDS = 5 * 60

/**
 * Object storage, wrapped. The one module with no schema of its own.
 *
 * Speaks plain S3 through the AWS SDK rather than a vendor's own client, so
 * the server underneath is a deployment choice: Garage in `docker-compose.yml`
 * today, and nothing here would change for SeaweedFS or S3 itself.
 *
 * The bucket is private and stays private: files reach the browser through a
 * presigned URL that expires, never through a public object. A public bucket
 * would make every attachment in every organisation readable by anyone who has
 * ever seen one URL — org scoping stops at the database.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name)
  private readonly client: S3Client
  private readonly bucket: string
  private readonly browserOrigins: string[]

  constructor(config: ConfigService<Env, true>) {
    this.bucket = config.get('S3_BUCKET', { infer: true })

    // Absent means the app's own origin, which is the answer in every
    // single-domain deployment: the page doing the uploading is served from
    // `APP_URL`, so that is where the PUT comes from.
    this.browserOrigins = config.get('S3_CORS_ORIGINS', { infer: true }) ?? [
      new URL(config.get('APP_URL', { infer: true })).origin,
    ]

    const useSsl = config.get('S3_USE_SSL', { infer: true })
    const host = config.get('S3_HOST', { infer: true })
    const port = config.get('S3_PORT', { infer: true })

    this.client = new S3Client({
      // Has to match what the server signs with. Garage's own default is
      // "garage"; a mismatch fails every request with "Authorization header
      // malformed", which reads like a credentials problem and is not one.
      region: config.get('S3_REGION', { infer: true }),
      endpoint: `${useSsl ? 'https' : 'http'}://${host}:${port}`,
      // Bucket in the path, not the hostname. Virtual-host style needs
      // wildcard DNS, which a single box behind Caddy does not have.
      forcePathStyle: true,
      // The SDK adds a CRC32 checksum to every upload by default. On a
      // presigned URL that is a header the browser never sends, and the store
      // rejects the PUT with "Invalid digest" — proven against Garage, and it
      // would fail the same way from a real browser.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY', { infer: true }),
        secretAccessKey: config.get('S3_SECRET_KEY', { infer: true }),
      },
    })
  }

  /**
   * Brings the bucket to the state the application needs: it exists, and a
   * browser on our own origin may upload to it.
   *
   * Warns rather than throwing if the store cannot be reached — an outage
   * should show up as a failing readiness check, not as an API that will not
   * start. Both steps are idempotent, so every boot re-asserts them.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }))
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }))
        this.logger.log({ bucket: this.bucket }, 'Created the storage bucket')
      } catch (error) {
        this.logger.warn(
          { err: error, bucket: this.bucket },
          'Could not reach object storage at startup; /health/ready reports it',
        )

        return
      }
    }

    await this.allowBrowserUploads()
  }

  /**
   * The CORS rule that lets an avatar go from the browser to the bucket.
   *
   * A profile picture is PUT straight here, so the request is cross-origin —
   * the page comes from `APP_URL` and the upload goes to object storage. With
   * no rule the browser's preflight is refused outright (Garage answers
   * "403 Forbidden: This CORS request is not allowed") and the PUT is never
   * sent, so there is no failed request in any log to explain it.
   *
   * Here rather than in `deploy/init/garage.sh` because this is the standard
   * way to make the call and that script has no standard way to make it:
   * bucket CORS is an S3 operation, Garage's admin API has no endpoint for it
   * (`/v2/PutBucketCors` answers "Unknown API endpoint"), and the init image
   * is a shell with curl — which would mean hand-writing SigV4. This service
   * already holds a configured, credentialled S3 client and already creates
   * the bucket at boot, and creating a bucket is the larger act of the two.
   *
   * 🔒 **Named origins, never `*`.** A wildcard would work identically for the
   * app and hand every page on the internet something to aim a stolen
   * presigned URL from. PUT alone, too: the download side is an `<img>`
   * following a redirect to a presigned GET, which is not a cross-origin
   * fetch, so allowing GET would grant what nothing asks for.
   */
  private async allowBrowserUploads(): Promise<void> {
    try {
      await this.client.send(
        new PutBucketCorsCommand({
          Bucket: this.bucket,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedOrigins: this.browserOrigins,
                AllowedMethods: ['PUT'],
                AllowedHeaders: ['content-type'],
                MaxAgeSeconds: 3000,
              },
            ],
          },
        }),
      )
    } catch (error) {
      // Not fatal: everything except uploading a picture still works, and an
      // API that refuses to start over it would be a worse outage than the
      // one it is reporting.
      this.logger.warn(
        { err: error, bucket: this.bucket, origins: this.browserOrigins },
        'Could not set the storage CORS rule; browser uploads will be refused',
      )
    }
  }

  /** True when the store answers. Wired into readiness, never into liveness. */
  async isReachable(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }))
      return true
    } catch {
      return false
    }
  }

  /**
   * Where a file lives. Keyed by org first so a misdirected key is visible as
   * a wrong prefix rather than an anonymous uuid, and so one organisation's
   * objects can be listed or removed together.
   */
  keyFor(
    orgId: string,
    entityType: string,
    entityId: string,
    fileName: string,
  ): string {
    // \w is [A-Za-z0-9_], so it replaced every Thai character in the name and
    // "ใบเสร็จ 2026.pdf" arrived as "_2026.pdf". \p{M} is not optional here:
    // Thai vowels and tone marks are combining marks, not letters, so
    // \p{L}\p{N} alone still hollows the word out to "ใบเสร_จ". Path
    // separators are still replaced, so ../ cannot climb out of the prefix.
    const safeName = [...fileName.replace(/[^\p{L}\p{N}\p{M}._-]+/gu, '_')]
      // Sliced by code point, not code unit: cutting the tail of a Thai name
      // mid-character would leave a tone mark with nothing to sit on.
      .slice(-120)
      .join('')

    return `${orgId}/${entityType}/${entityId}/${crypto.randomUUID()}-${safeName}`
  }

  /** A URL the browser can PUT one file to, and nothing else. */
  presignedUpload(key: string, ttl = UPLOAD_URL_TTL_SECONDS): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: ttl },
    )
  }

  presignedDownload(
    key: string,
    ttl = DOWNLOAD_URL_TTL_SECONDS,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: ttl },
    )
  }

  /**
   * Deleting the row is not enough — the database cannot cascade into object
   * storage, which is also why the two are backed up separately.
   */
  async remove(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    )
  }
}
