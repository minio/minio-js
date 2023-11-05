import type * as http from 'node:http'
import type { Readable as ReadableStream } from 'node:stream'

export type VersionIdentificator = {
  versionId?: string
}

export type Binary = string | Buffer

// nodejs IncomingHttpHeaders is Record<string, string | string[]>, but it's actually this:
export type ResponseHeader = Record<string, string>

export type ObjectMetaData = Record<string, string | number>

export type RequestHeaders = Record<string, string | boolean | number | undefined>

export interface LifecycleConfig {
  Rule: LifecycleRule[]
}

export interface LifecycleRule {
  [key: string]: any
}

export type UploadID = string
export type NoResultCallback = (error: unknown | null) => void
export type TagList = Record<string, string>
export type VersionIdentification = { versionId?: string }
export type Lifecycle = LifecycleConfig | null | ''
export type Lock = LockConfig | EmptyObject
export type Retention = RetentionOptions | EmptyObject
export type IsoDate = string

export type GetObjectOpt = {
  versionId?: string
}

export interface RetentionOptions {
  versionId: string
  mode?: RETENTION_MODES
  retainUntilDate?: IsoDate
  governanceBypass?: boolean
}

export interface LockConfig {
  objectLockEnabled?: 'Enabled'
  mode: LEGAL_HOLD_STATUS
  unit: RETENTION_VALIDITY_UNITS
  validity: number
}

export type Encryption =
  | {
      type: ENCRYPTION_TYPES.SSEC
    }
  | {
      type: ENCRYPTION_TYPES.KMS
      SSEAlgorithm?: string
      KMSMasterKeyID?: string
    }

export type EnabledOrDisabledStatus = 'Enabled' | 'Disabled'

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

export interface UploadedObjectInfo {
  etag: string
  versionId: string | null
}

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
      prefix?: never
      lastModified: Date
    }
  | {
      name?: never
      etag?: never
      lastModified?: never
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

export interface PostPolicyResult {
  postURL: string
  formData: {
    [key: string]: any
  }
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

/* Replication Config types */
export type ReplicationRuleStatus = {
  Status: EnabledOrDisabledStatus
}

export type Tag = {
  Key: string
  Value: string
}

export interface EncryptionConfig {
  Rule?: EncryptionRule[]
}

export interface EncryptionRule {
  [key: string]: any
}

export interface LegalHoldOptions {
  versionId?: string
  status: LEGAL_HOLD_STATUS
}

export type ReplicationRuleDestination = {
  Bucket: string
  StorageClass: string
}
export type ReplicationRuleAnd = {
  Prefix: string
  Tags: Tag[]
}

export type ReplicationRuleFilter = {
  Prefix: string
  And: ReplicationRuleAnd
  Tag: Tag
}

export type ReplicaModifications = {
  Status: ReplicationRuleStatus
}

export type SourceSelectionCriteria = {
  ReplicaModifications: ReplicaModifications
}

export type ExistingObjectReplication = {
  Status: ReplicationRuleStatus
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

export type ReplicationRule = {
  ID: string
  Status: ReplicationRuleStatus
  Priority: number
  DeleteMarkerReplication: ReplicationRuleStatus // should be set to "Disabled" by default
  DeleteReplication: ReplicationRuleStatus
  Destination: ReplicationRuleDestination
  Filter: ReplicationRuleFilter
  SourceSelectionCriteria: SourceSelectionCriteria
  ExistingObjectReplication: ExistingObjectReplication
}

export type ReplicationConfigOpts = {
  role: string
  rules: ReplicationRule[]
}

export type ReplicationConfig = {
  ReplicationConfiguration: ReplicationConfigOpts
}
/* Replication Config types */

export type ResultCallback<T> = (error: unknown | null, result: T) => void

export type GetObjectLegalHoldOptions = {
  versionId: string
}
/**
 * @deprecated keep for backward compatible, use `LEGAL_HOLD_STATUS` instead
 */
export type LegalHoldStatus = LEGAL_HOLD_STATUS

export type PutObjectLegalHoldOptions = {
  versionId?: string
  status: LEGAL_HOLD_STATUS
}

export type EmptyObject = Record<string, never>

export type ObjectLockInfo =
  | {
      objectLockEnabled: EnabledOrDisabledStatus
      mode: RETENTION_MODES
      unit: RETENTION_VALIDITY_UNITS
      validity: number
    }
  | EmptyObject

export type ObjectLockConfigParam = {
  ObjectLockEnabled?: 'Enabled' | undefined
  Rule?:
    | {
        DefaultRetention:
          | {
              Mode: RETENTION_MODES
              Days: number
              Years: number
            }
          | EmptyObject
      }
    | EmptyObject
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

export type ListObjectV1Opt = {
  Delimiter?: string
  MaxKeys?: number
  IncludeVersion?: boolean
}
