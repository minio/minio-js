import type { Readable as ReadableStream } from 'node:stream'

export type Binary = string | Buffer
export type RequestHeaders = Record<string, string | boolean | number>

export interface IRequest {
  protocol: string
  port?: number | string
  method: string
  path: string
  headers: RequestHeaders
}

export type ICanonicalRequest = string

export interface ICredentials {
  accessKey: string
  secretKey: string
  sessionToken?: string
}

export type UploadID = string

export type LockUnit = 'Days' | 'Years'
export type LegalHoldStatus = 'ON' | 'OFF'
export type NoResultCallback = (error: unknown | null) => void
export type ResultCallback<T> = (error: unknown | null, result: T) => void
export type TagList = Record<string, string>
export type EmptyObject = Record<string, never>
export type VersionIdentification = { versionId?: string }
export type Lifecycle = LifecycleConfig | null | ''
export type Lock = LockConfig | EmptyObject
export type Encryption = EncryptionConfig | EmptyObject
export type Retention = RetentionOptions | EmptyObject
export type IsoDate = string

export type GetObjectOpt = {
  versionId?: string
}

export interface BucketItemCopy {
  etag: string
  lastModified?: Date
}

export interface BucketItem {
  name: string
  prefix: string
  size: number
  etag: string
  lastModified: Date
}

export interface BucketItemWithMetadata extends BucketItem {
  metadata: ItemBucketMetadata | ItemBucketMetadataList
}

export type StatObjectOpts = {
  versionId?: string
}

export interface BucketItemStat {
  size: number
  etag: string
  lastModified: Date
  metaData: ItemBucketMetadata
  // version id of the object if available
  versionId: string | null
}

export interface IncompleteUploadedBucketItem {
  key: string
  uploadId: string
  size: number
}

export interface BucketStream<T> extends ReadableStream {
  on(event: 'data', listener: (item: T) => void): this

  on(event: 'end' | 'pause' | 'readable' | 'resume' | 'close', listener: () => void): this

  on(event: 'error', listener: (err: Error) => void): this

  on(event: string | symbol, listener: (...args: any[]) => void): this
}

export interface PostPolicyResult {
  postURL: string
  formData: {
    [key: string]: any
  }
}

export interface MetadataItem {
  Key: string
  Value: string
}

export interface ItemBucketMetadataList {
  Items: MetadataItem[]
}

export interface ItemBucketMetadata {
  [key: string]: any
}

export interface UploadedObjectInfo {
  etag: string
  versionId: string | null
}

export interface Tag {
  Key: string
  Value: string
}

export interface LifecycleConfig {
  Rule: LifecycleRule[]
}

export interface LifecycleRule {
  [key: string]: any
}

export interface LockConfig {
  objectLockEnabled?: 'Enabled'
  mode: Mode
  unit: LockUnit
  validity: number
}

export interface EncryptionConfig {
  Rule: EncryptionRule[]
}

export interface EncryptionRule {
  [key: string]: any
}

export interface ReplicationConfig {
  role: string
  rules: []
}

export interface ReplicationConfig {
  [key: string]: any
}

export interface RetentionOptions {
  versionId: string
  mode?: Mode
  retainUntilDate?: IsoDate
  governanceBypass?: boolean
}

export interface LegalHoldOptions {
  versionId?: string
  status: LegalHoldStatus
}

export interface InputSerialization {
  CompressionType?: 'NONE' | 'GZIP' | 'BZIP2'
  CSV?: {
    AllowQuotedRecordDelimiter?: boolean
    Comments?: string
    FieldDelimiter?: string
    FileHeaderInfo?: 'NONE' | 'IGNORE' | 'USE'
    QuoteCharacter?: string
    QuoteEscapeCharacter?: string
    RecordDelimiter?: string
  }
  JSON?: {
    Type: 'DOCUMENT' | 'LINES'
  }
  Parquet?: EmptyObject
}

export interface OutputSerialization {
  CSV?: {
    FieldDelimiter?: string
    QuoteCharacter?: string
    QuoteEscapeCharacter?: string
    QuoteFields?: string
    RecordDelimiter?: string
  }
  JSON?: {
    RecordDelimiter?: string
  }
}

export interface SelectOptions {
  expression: string
  expressionType?: string
  inputSerialization: InputSerialization
  outputSerialization: OutputSerialization
  requestProgress?: { Enabled: boolean }
  scanRange?: { Start: number; End: number }
}

export interface SourceObjectStats {
  size: number
  metaData: string
  lastModicied: Date
  versionId: string
  etag: string
}

export interface MakeBucketOpt {
  ObjectLocking?: boolean
}

export interface RemoveOptions {
  versionId?: string
  forceDelete?: boolean
  governanceBypass?: boolean
}

export interface BucketItemFromList {
  name: string
  // date when bucket was created
  creationDate: Date
}

export type VersioningConfig = Record<string | number | symbol, unknown>

export interface VersionConfigInput {
  Status?: string
  MfaDelete?: string

  [key: string]: any
}

export type Mode = 'COMPLIANCE' | 'GOVERNANCE'

export type ListObjectV1Opt = {
  Delimiter?: string
  MaxKeys?: number
  IncludeVersion?: boolean
}
