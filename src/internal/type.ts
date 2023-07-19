import type * as http from 'node:http'
import type { Readable as ReadableStream } from 'node:stream'

export type Binary = string | Buffer

// nodejs IncomingHttpHeaders is Record<string, string | string[]>, but it's actually this:
export type ResponseHeader = Record<string, string>

export type ObjectMetaData = Record<string, string | number>

export type RequestHeaders = Record<string, string | boolean | number | undefined>

export type Encryption =
  | {
      type: ENCRYPTION_TYPES.SSEC
    }
  | {
      type: ENCRYPTION_TYPES.KMS
      SSEAlgorithm?: string
      KMSMasterKeyID?: string
    }

export enum ENCRYPTION_TYPES {
  /**
   * SSEC represents server-side-encryption with customer provided keys
   */
  SSEC = 'SSE-C',
  /**
   * KMS represents server-side-encryption with managed keys
   */
  KMS = 'KMS',
}

export enum RETENTION_MODES {
  GOVERNANCE = 'GOVERNANCE',
  COMPLIANCE = 'COMPLIANCE',
}

export enum RETENTION_VALIDITY_UNITS {
  DAYS = 'Days',
  YEARS = 'Years',
}

export enum LEGAL_HOLD_STATUS {
  ENABLED = 'ON',
  DISABLED = 'OFF',
}

export type Transport = Pick<typeof http, 'request'>

export interface IRequest {
  protocol: string
  port?: number | string
  method: string
  path: string
  headers: RequestHeaders
}

export type ICanonicalRequest = string

export interface IncompleteUploadedBucketItem {
  key: string
  uploadId: string
  size: number
}

export interface MetadataItem {
  Key: string
  Value: string
}

export interface ItemBucketMetadataList {
  Items: MetadataItem[]
}

export interface ItemBucketMetadata {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

export interface BucketItemFromList {
  name: string
  creationDate: Date
}

export interface BucketItemCopy {
  etag: string
  lastModified: Date
}

export type BucketItem =
  | {
      name: string
      size: number
      etag: string
      lastModified: Date
    }
  | {
      prefix: string
      size: 0
    }

export type BucketItemWithMetadata = BucketItem & {
  metadata?: ItemBucketMetadata | ItemBucketMetadataList
}

export interface BucketStream<T> extends ReadableStream {
  on(event: 'data', listener: (item: T) => void): this

  on(event: 'end' | 'pause' | 'readable' | 'resume' | 'close', listener: () => void): this

  on(event: 'error', listener: (err: Error) => void): this

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string | symbol, listener: (...args: any[]) => void): this
}

export interface BucketItemStat {
  size: number
  etag: string
  lastModified: Date
  metaData: ItemBucketMetadata
  versionId?: string | null
}

export type StatObjectOpts = {
  versionId?: string
}
