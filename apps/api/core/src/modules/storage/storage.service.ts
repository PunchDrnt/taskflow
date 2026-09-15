import type { Readable } from 'node:stream'
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import type { Env } from '../../config/env'

/** What `get` hands back: enough to answer an HTTP request with the object. */
export interface StoredObject {
  body: Readable
  contentType: string
  contentLength: number | undefined
  etag: string | undefined
}

/**
 * Object storage, wrapped. The one module with no schema of its own.
 *
 * Speaks plain S3 through the AWS SDK rather than a vendor's own client, so
 * the server underneath is a deployment choice: Garage in `docker-compose.yml`
 * today, and nothing here would change for SeaweedFS or S3 itself.
 *
 * 🔒 **The browser never talks to this store.** Bytes go in through the API
 * and come back out through the API, so the bucket needs no public route, no
 * CORS rule and no presigned URL — and the store can sit on a private network
 * with nothing published, which is what `deploy/compose.yml` does.
 *
 * It was the other way around until the deploy made the cost visible: a
 * presigned PUT straight from the browser keeps the file out of Node, but it
 * also means the browser must be able to *reach* the store, and `S3_HOST` on
 * the server is `garage` — a name that resolves inside one Docker network and
 * nowhere else. Publishing it would have meant a second public origin, a CORS
 * rule to police it, and a signed URL that carries no size limit of its own.
 * A 40KB avatar through Node is cheaper than all three. Phase 3's attachments
 * are a different size of question and may want presigning back; they can have
 * it, with a POST policy that actually constrains what may be sent.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name)
  private readonly client: S3Client
  private readonly bucket: string

  constructor(config: ConfigService<Env, true>) {
    this.bucket = config.get('S3_BUCKET', { infer: true })

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
      // The SDK adds a CRC32 checksum to every request by default and Garage
      // rejects it with "Invalid digest" — measured. Kept at WHEN_REQUIRED
      // now that the SDK is the only client, because the alternative is an
      // upload that fails against this store and works against S3.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY', { infer: true }),
        secretAccessKey: config.get('S3_SECRET_KEY', { infer: true }),
      },
    })
  }

  /**
   * Makes sure the bucket exists.
   *
   * Warns rather than throwing if the store cannot be reached — an outage
   * should show up as a failing readiness check, not as an API that will not
   * start. Idempotent, so every boot re-asserts it.
   *
   * A bucket created before the browser stopped uploading still carries the
   * CORS rule this used to set, and it is left alone: a rule naming an origin
   * grants nothing on its own, since every request to a private bucket still
   * needs a signature and nothing outside this process can produce one.
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
      }
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
   * Stores one object. The caller has already decided the bytes are allowed —
   * this is where they land, not where they are judged.
   *
   * `ContentType` is written now because it is the only chance: the object is
   * served back with whatever is recorded here, and a picture served as
   * `application/octet-stream` is a picture the browser offers to download.
   */
  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: body.byteLength,
      }),
    )
  }

  /**
   * Reads one object back as a stream, so a response can be piped rather than
   * assembled in memory — the size limit is on the way in, and this side
   * should not grow one of its own.
   *
   * Null when there is no such object, which is a 404 for the caller rather
   * than a 500: a key can outlive its file, and a row pointing at a deleted
   * object is a missing picture, not a broken server.
   */
  async get(key: string): Promise<StoredObject | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      )

      if (result.Body === undefined) return null

      return {
        body: result.Body as Readable,
        contentType: result.ContentType ?? 'application/octet-stream',
        contentLength: result.ContentLength,
        etag: result.ETag,
      }
    } catch (error) {
      if (isMissing(error)) return null

      throw error
    }
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

/**
 * "No such key", told apart from a store that is down.
 *
 * The SDK raises `NoSuchKey` and some servers answer a bare 404 without one,
 * so both are checked — mistaking an outage for a missing file would turn
 * every avatar on the page into a silent blank while storage burned.
 */
function isMissing(error: unknown): boolean {
  const shape = error as {
    name?: string
    $metadata?: { httpStatusCode?: number }
  }

  return shape.name === 'NoSuchKey' || shape.$metadata?.httpStatusCode === 404
}
