import { Injectable, Logger, type OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Client } from 'minio'

import type { Env } from '../../config/env'

/** Long enough to pick a file and upload it, short enough to be worth little. */
const UPLOAD_URL_TTL_SECONDS = 10 * 60
/** Long enough to render a page and click through, and no longer. */
const DOWNLOAD_URL_TTL_SECONDS = 5 * 60

/**
 * MinIO, wrapped. The one module with no schema of its own.
 *
 * The bucket is private and stays private: files reach the browser through a
 * presigned URL that expires, never through a public object. A public bucket
 * would mean every attachment in every organisation is readable by anyone who
 * has ever seen one URL — the scoping layer stops at the database otherwise.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name)
  private readonly client: Client
  private readonly bucket: string

  constructor(config: ConfigService<Env, true>) {
    this.bucket = config.get('MINIO_BUCKET', { infer: true })
    this.client = new Client({
      endPoint: config.get('MINIO_ENDPOINT', { infer: true }),
      port: config.get('MINIO_PORT', { infer: true }),
      useSSL: config.get('MINIO_USE_SSL', { infer: true }),
      accessKey: config.get('MINIO_ACCESS_KEY', { infer: true }),
      secretKey: config.get('MINIO_SECRET_KEY', { infer: true }),
    })
  }

  /**
   * Creates the bucket if it is missing, and warns rather than throwing if
   * MinIO cannot be reached: a storage outage should show up as a failing
   * readiness check, not as an API that will not start.
   */
  async onModuleInit(): Promise<void> {
    try {
      if (!(await this.client.bucketExists(this.bucket))) {
        await this.client.makeBucket(this.bucket)
        this.logger.log({ bucket: this.bucket }, 'Created the storage bucket')
      }
    } catch (error) {
      this.logger.warn(
        { err: error, bucket: this.bucket },
        'Could not reach MinIO at startup; /health/ready will report it',
      )
    }
  }

  /** True when MinIO answers. Wired into readiness, never into liveness. */
  async isReachable(): Promise<boolean> {
    try {
      return await this.client.bucketExists(this.bucket)
    } catch {
      return false
    }
  }

  /**
   * Where a file lives. Keyed by org first so that a misdirected key is
   * visible as a wrong prefix rather than an anonymous uuid, and so a whole
   * organisation's objects can be listed or removed together.
   */
  keyFor(
    orgId: string,
    entityType: string,
    entityId: string,
    fileName: string,
  ): string {
    const safeName = fileName.replace(/[^\w.-]+/g, '_').slice(-120)
    return `${orgId}/${entityType}/${entityId}/${crypto.randomUUID()}-${safeName}`
  }

  /** A URL the browser can PUT one file to, and nothing else. */
  presignedUpload(key: string, ttl = UPLOAD_URL_TTL_SECONDS): Promise<string> {
    return this.client.presignedPutObject(this.bucket, key, ttl)
  }

  presignedDownload(
    key: string,
    ttl = DOWNLOAD_URL_TTL_SECONDS,
  ): Promise<string> {
    return this.client.presignedGetObject(this.bucket, key, ttl)
  }

  /**
   * Deleting the row is not enough — the database cannot cascade into object
   * storage, which is also why the two are backed up separately.
   */
  remove(key: string): Promise<void> {
    return this.client.removeObject(this.bucket, key)
  }
}
