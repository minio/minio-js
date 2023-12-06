// imported from https://github.com/DefinitelyTyped/DefinitelyTyped/blob/93cfb0ec069731dcdfc31464788613f7cddb8192/types/minio/index.d.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Readable as ReadableStream } from 'node:stream'

import type {
  CopyDestinationOptions,
  CopySourceOptions,
  LEGAL_HOLD_STATUS,
  RETENTION_MODES,
  RETENTION_VALIDITY_UNITS,
} from './helpers.ts'
import type { ClientOptions, NoResultCallback, RemoveOptions } from './internal/client.ts'
import { TypedClient } from './internal/client.ts'
import { CopyConditions } from './internal/copy-conditions.ts'
import { PostPolicy } from './internal/post-policy.ts'
import type {
  BucketItem,
  BucketItemCopy,
  BucketItemFromList,
  BucketItemStat,
  BucketItemWithMetadata,
  BucketStream,
  EmptyObject,
  ExistingObjectReplication,
  GetObjectLegalHoldOptions,
  IncompleteUploadedBucketItem,
  IsoDate,
  ItemBucketMetadata,
  ItemBucketMetadataList,
  LegalHoldStatus,
  MetadataItem,
  ObjectLockInfo,
  PutObjectLegalHoldOptions,
  ReplicaModifications,
  ReplicationConfig,
  ReplicationConfigOpts,
  ReplicationRule,
  ReplicationRuleAnd,
  ReplicationRuleDestination,
  ReplicationRuleFilter,
  ReplicationRuleStatus,
  ResultCallback,
  Retention,
  RetentionOptions,
  SourceSelectionCriteria,
  Tag,
  VersionIdentificator,
} from './internal/type.ts'
import type { NotificationConfig, NotificationEvent, NotificationPoller } from './notification.ts'

export * from './errors.ts'
export * from './helpers.ts'
export type { Region } from './internal/s3-endpoints.ts'
export type * from './notification.ts'
export * from './notification.ts'
export { CopyConditions, PostPolicy }
export type { MakeBucketOpt } from './internal/client.ts'
export type {
  BucketItem,
  BucketItemCopy,
  BucketItemFromList,
  BucketItemStat,
  BucketItemWithMetadata,
  BucketStream,
  ClientOptions,
  EmptyObject,
  ExistingObjectReplication,
  GetObjectLegalHoldOptions,
  IncompleteUploadedBucketItem,
  IsoDate,
  ItemBucketMetadata,
  ItemBucketMetadataList,
  LegalHoldStatus,
  MetadataItem,
  NoResultCallback,
  ObjectLockInfo,
  PutObjectLegalHoldOptions,
  RemoveOptions,
  ReplicaModifications,
  ReplicationConfig,
  ReplicationConfigOpts,
  ReplicationRule,
  ReplicationRuleAnd,
  ReplicationRuleDestination,
  ReplicationRuleFilter,
  ReplicationRuleStatus,
  Retention,
  RetentionOptions,
  SourceSelectionCriteria,
  Tag,
}

/**
 * @deprecated keep for backward compatible, use `RETENTION_MODES` instead
 */
export type Mode = RETENTION_MODES

/**
 * @deprecated keep for backward compatible
 */
export type LockUnit = RETENTION_VALIDITY_UNITS

export type VersioningConfig = Record<string | number | symbol, unknown>
export type TagList = Record<string, string>
export type Lifecycle = LifecycleConfig | null | ''
export type Encryption = EncryptionConfig | EmptyObject
export interface PostPolicyResult {
  postURL: string
  formData: {
    [key: string]: any
  }
}

export interface LifecycleConfig {
  Rule: LifecycleRule[]
}

export interface LifecycleRule {
  [key: string]: any
}

export interface LockConfig {
  mode: RETENTION_MODES
  unit: RETENTION_VALIDITY_UNITS
  validity: number
}

export interface EncryptionConfig {
  Rule: EncryptionRule[]
}

export interface EncryptionRule {
  [key: string]: any
}

export interface LegalHoldOptions {
  versionId: string
  status: LEGAL_HOLD_STATUS
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

// No need to export this. But without it - linter error.
export class TargetConfig {
  setId(id: unknown): void

  addEvent(newEvent: unknown): void

  addFilterSuffix(suffix: string): void

  addFilterPrefix(prefix: string): void
}

// Exports from library
export class Client extends TypedClient {
  listObjects(bucketName: string, prefix?: string, recursive?: boolean): BucketStream<BucketItem>

  listObjectsV2(bucketName: string, prefix?: string, recursive?: boolean, startAfter?: string): BucketStream<BucketItem>

  setBucketTagging(bucketName: string, tags: TagList, callback: NoResultCallback): void
  setBucketTagging(bucketName: string, tags: TagList): Promise<void>

  removeBucketTagging(bucketName: string, callback: NoResultCallback): void
  removeBucketTagging(bucketName: string): Promise<void>

  setBucketLifecycle(bucketName: string, lifecycleConfig: Lifecycle, callback: NoResultCallback): void
  setBucketLifecycle(bucketName: string, lifecycleConfig: Lifecycle): Promise<void>

  getBucketLifecycle(bucketName: string, callback: ResultCallback<Lifecycle>): void
  getBucketLifecycle(bucketName: string): Promise<Lifecycle>

  removeBucketLifecycle(bucketName: string, callback: NoResultCallback): void
  removeBucketLifecycle(bucketName: string): Promise<void>

  getBucketEncryption(bucketName: string, callback: ResultCallback<Encryption>): void
  getBucketEncryption(bucketName: string): Promise<Encryption>

  setBucketEncryption(bucketName: string, encryptionConfig: Encryption, callback: NoResultCallback): void
  setBucketEncryption(bucketName: string, encryptionConfig: Encryption): Promise<void>

  removeBucketEncryption(bucketName: string, callback: NoResultCallback): void
  removeBucketEncryption(bucketName: string): Promise<void>

  // Object operations
  getObject(bucketName: string, objectName: string, callback: ResultCallback<ReadableStream>): void
  getObject(bucketName: string, objectName: string): Promise<ReadableStream>

  getPartialObject(
    bucketName: string,
    objectName: string,
    offset: number,
    callback: ResultCallback<ReadableStream>,
  ): void
  getPartialObject(
    bucketName: string,
    objectName: string,
    offset: number,
    length: number,
    callback: ResultCallback<ReadableStream>,
  ): void
  getPartialObject(bucketName: string, objectName: string, offset: number, length?: number): Promise<ReadableStream>

  fGetObject(bucketName: string, objectName: string, filePath: string, callback: NoResultCallback): void
  fGetObject(bucketName: string, objectName: string, filePath: string): Promise<void>

  copyObject(
    bucketName: string,
    objectName: string,
    sourceObject: string,
    conditions: CopyConditions,
    callback: ResultCallback<BucketItemCopy>,
  ): void
  copyObject(
    bucketName: string,
    objectName: string,
    sourceObject: string,
    conditions: CopyConditions,
  ): Promise<BucketItemCopy>

  removeObjects(bucketName: string, objectsList: string[], callback: NoResultCallback): void
  removeObjects(bucketName: string, objectsList: string[]): Promise<void>

  removeIncompleteUpload(bucketName: string, objectName: string, callback: NoResultCallback): void
  removeIncompleteUpload(bucketName: string, objectName: string): Promise<void>

  getObjectRetention(
    bucketName: string,
    objectName: string,
    options: VersionIdentificator,
    callback: ResultCallback<Retention>,
  ): void
  getObjectRetention(bucketName: string, objectName: string, options: VersionIdentificator): Promise<Retention>

  setObjectTagging(bucketName: string, objectName: string, tags: TagList, callback: NoResultCallback): void
  setObjectTagging(
    bucketName: string,
    objectName: string,
    tags: TagList,
    putOptions: VersionIdentificator,
    callback: NoResultCallback,
  ): void
  setObjectTagging(
    bucketName: string,
    objectName: string,
    tags: TagList,
    putOptions?: VersionIdentificator,
  ): Promise<void>

  removeObjectTagging(bucketName: string, objectName: string, callback: NoResultCallback): void
  removeObjectTagging(
    bucketName: string,
    objectName: string,
    removeOptions: VersionIdentificator,
    callback: NoResultCallback,
  ): void
  removeObjectTagging(bucketName: string, objectName: string, removeOptions?: VersionIdentificator): Promise<void>

  composeObject(
    destObjConfig: CopyDestinationOptions,
    sourceObjList: CopySourceOptions[],
    callback: ResultCallback<SourceObjectStats>,
  ): void
  composeObject(destObjConfig: CopyDestinationOptions, sourceObjList: CopySourceOptions[]): Promise<SourceObjectStats>

  selectObjectContent(
    bucketName: string,
    objectName: string,
    selectOpts: SelectOptions,
    callback: NoResultCallback,
  ): void
  selectObjectContent(bucketName: string, objectName: string, selectOpts: SelectOptions): Promise<void>

  // Presigned operations
  presignedUrl(httpMethod: string, bucketName: string, objectName: string, callback: ResultCallback<string>): void
  presignedUrl(
    httpMethod: string,
    bucketName: string,
    objectName: string,
    expiry: number,
    callback: ResultCallback<string>,
  ): void
  presignedUrl(
    httpMethod: string,
    bucketName: string,
    objectName: string,
    expiry: number,
    reqParams: { [key: string]: any },
    callback: ResultCallback<string>,
  ): void
  presignedUrl(
    httpMethod: string,
    bucketName: string,
    objectName: string,
    expiry: number,
    reqParams: { [key: string]: any },
    requestDate: Date,
    callback: ResultCallback<string>,
  ): void
  presignedUrl(
    httpMethod: string,
    bucketName: string,
    objectName: string,
    expiry?: number,
    reqParams?: { [key: string]: any },
    requestDate?: Date,
  ): Promise<string>

  presignedGetObject(bucketName: string, objectName: string, callback: ResultCallback<string>): void
  presignedGetObject(bucketName: string, objectName: string, expiry: number, callback: ResultCallback<string>): void
  presignedGetObject(
    bucketName: string,
    objectName: string,
    expiry: number,
    respHeaders: { [key: string]: any },
    callback: ResultCallback<string>,
  ): void
  presignedGetObject(
    bucketName: string,
    objectName: string,
    expiry: number,
    respHeaders: { [key: string]: any },
    requestDate: Date,
    callback: ResultCallback<string>,
  ): void
  presignedGetObject(
    bucketName: string,
    objectName: string,
    expiry?: number,
    respHeaders?: { [key: string]: any },
    requestDate?: Date,
  ): Promise<string>

  presignedPutObject(bucketName: string, objectName: string, callback: ResultCallback<string>): void
  presignedPutObject(bucketName: string, objectName: string, expiry: number, callback: ResultCallback<string>): void
  presignedPutObject(bucketName: string, objectName: string, expiry?: number): Promise<string>

  presignedPostPolicy(policy: PostPolicy, callback: ResultCallback<PostPolicyResult>): void
  presignedPostPolicy(policy: PostPolicy): Promise<PostPolicyResult>

  // Bucket Policy & Notification operations
  getBucketNotification(bucketName: string, callback: ResultCallback<NotificationConfig>): void
  getBucketNotification(bucketName: string): Promise<NotificationConfig>

  setBucketNotification(
    bucketName: string,
    bucketNotificationConfig: NotificationConfig,
    callback: NoResultCallback,
  ): void
  setBucketNotification(bucketName: string, bucketNotificationConfig: NotificationConfig): Promise<void>

  removeAllBucketNotification(bucketName: string, callback: NoResultCallback): void
  removeAllBucketNotification(bucketName: string): Promise<void>

  listenBucketNotification(
    bucketName: string,
    prefix: string,
    suffix: string,
    events: NotificationEvent[],
  ): NotificationPoller

  // Other
  newPostPolicy(): PostPolicy
}
