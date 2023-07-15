// imported from https://github.com/DefinitelyTyped/DefinitelyTyped/blob/93cfb0ec069731dcdfc31464788613f7cddb8192/types/minio/index.d.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

import { EventEmitter } from 'node:events'
import type { Readable as ReadableStream } from 'node:stream'

import type { CopyDestinationOptions, CopySourceOptions } from './helpers.ts'
import type { ClientOptions } from './internal/client.ts'
import { TypedClient } from './internal/client.ts'
import { CopyConditions } from './internal/copy-conditions.ts'
import { PostPolicy } from './internal/post-policy.ts'
import type { Region } from './internal/s3-endpoints.ts'
import type {
  BucketItem,
  BucketItemCopy,
  BucketItemFromList,
  BucketItemStat,
  BucketItemWithMetadata,
  BucketStream,
  EmptyObject,
  Encryption,
  ENCRYPTION_TYPES,
  EncryptionConfig,
  EncryptionRule,
  GetObjectOpts,
  IncompleteUploadedBucketItem,
  InputSerialization,
  IsoDate,
  ItemBucketMetadata,
  ItemBucketMetadataList,
  LEGAL_HOLD_STATUS,
  LegalHoldOptions,
  LegalHoldStatus,
  Lifecycle,
  LifecycleConfig,
  LifecycleRule,
  ListObjectsOpts,
  Lock,
  LockConfig,
  MakeBucketOpt,
  MetadataItem,
  NoResultCallback,
  OutputSerialization,
  PostPolicyResult,
  RemoveOptions,
  ReplicationConfig,
  ResultCallback,
  Retention,
  RETENTION_MODES,
  RETENTION_VALIDITY_UNITS,
  RetentionOptions,
  S3ListObject,
  SelectOptions,
  SourceObjectStats,
  StatObjectOpts,
  Tag,
  TagList,
  UploadedObjectInfo,
  VersionIdentification,
  VersioningConfig,
} from './internal/type.ts'

export * from './helpers.ts'
export type { Region } from './internal/s3-endpoints.ts'
export { CopyConditions, PostPolicy }
export type {
  BucketItem,
  BucketItemCopy,
  BucketItemFromList,
  BucketItemStat,
  BucketItemWithMetadata,
  BucketStream,
  ClientOptions,
  EmptyObject,
  Encryption,
  ENCRYPTION_TYPES,
  EncryptionConfig,
  EncryptionRule,
  GetObjectOpts,
  IncompleteUploadedBucketItem,
  InputSerialization,
  IsoDate,
  ItemBucketMetadata,
  ItemBucketMetadataList,
  LEGAL_HOLD_STATUS,
  LegalHoldOptions,
  LegalHoldStatus,
  Lifecycle,
  LifecycleConfig,
  LifecycleRule,
  ListObjectsOpts,
  Lock,
  LockConfig,
  MakeBucketOpt,
  MetadataItem,
  NoResultCallback,
  OutputSerialization,
  PostPolicyResult,
  RemoveOptions,
  ReplicationConfig,
  ResultCallback,
  Retention,
  RETENTION_MODES,
  RETENTION_VALIDITY_UNITS,
  RetentionOptions,
  S3ListObject,
  SelectOptions,
  SourceObjectStats,
  StatObjectOpts,
  Tag,
  TagList,
  UploadedObjectInfo,
  VersionIdentification,
  VersioningConfig,
}

// Exports only from typings
export type NotificationEvent =
  | 's3:ObjectCreated:*'
  | 's3:ObjectCreated:Put'
  | 's3:ObjectCreated:Post'
  | 's3:ObjectCreated:Copy'
  | 's3:ObjectCreated:CompleteMultipartUpload'
  | 's3:ObjectRemoved:*'
  | 's3:ObjectRemoved:Delete'
  | 's3:ObjectRemoved:DeleteMarkerCreated'
  | 's3:ReducedRedundancyLostObject'
  | 's3:TestEvent'
  | 's3:ObjectRestore:Post'
  | 's3:ObjectRestore:Completed'
  | 's3:Replication:OperationFailedReplication'
  | 's3:Replication:OperationMissedThreshold'
  | 's3:Replication:OperationReplicatedAfterThreshold'
  | 's3:Replication:OperationNotTracked'
  | string

/**
 * @deprecated keep for backward compatible, use `RETENTION_MODES` instead
 */
export type Mode = RETENTION_MODES

/**
 * @deprecated keep for backward compatible
 */
export type LockUnit = RETENTION_VALIDITY_UNITS

// No need to export this. But without it - linter error.
export class TargetConfig {
  setId(id: unknown): void

  addEvent(newEvent: unknown): void

  addFilterSuffix(suffix: string): void

  addFilterPrefix(prefix: string): void
}

// Exports from library
export class Client extends TypedClient {
  // Bucket operations
  makeBucket(bucketName: string, region: Region, makeOpts: MakeBucketOpt, callback: NoResultCallback): void
  makeBucket(bucketName: string, region: Region, callback: NoResultCallback): void
  makeBucket(bucketName: string, callback: NoResultCallback): void
  makeBucket(bucketName: string, region?: Region, makeOpts?: MakeBucketOpt): Promise<void>

  bucketExists(bucketName: string, callback: ResultCallback<boolean>): void
  bucketExists(bucketName: string): Promise<boolean>

  listObjects(
    bucketName: string,
    prefix?: string,
    recursive?: boolean,
    listOpts?: ListObjectsOpts,
  ): BucketStream<S3ListObject>

  listObjectsV2(
    bucketName: string,
    prefix?: string,
    recursive?: boolean,
    startAfter?: string,
  ): BucketStream<S3ListObject>

  listIncompleteUploads(
    bucketName: string,
    prefix?: string,
    recursive?: boolean,
  ): BucketStream<IncompleteUploadedBucketItem>

  getBucketVersioning(bucketName: string, callback: ResultCallback<VersioningConfig>): void
  getBucketVersioning(bucketName: string): Promise<VersioningConfig>

  setBucketVersioning(bucketName: string, versioningConfig: any, callback: NoResultCallback): void
  setBucketVersioning(bucketName: string, versioningConfig: any): Promise<void>

  getBucketTagging(bucketName: string, callback: ResultCallback<Tag[]>): void
  getBucketTagging(bucketName: string): Promise<Tag[]>

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

  setObjectLockConfig(bucketName: string, callback: NoResultCallback): void
  setObjectLockConfig(bucketName: string, lockConfig: Lock, callback: NoResultCallback): void
  setObjectLockConfig(bucketName: string, lockConfig?: Lock): Promise<void>

  getObjectLockConfig(bucketName: string, callback: ResultCallback<Lock>): void
  getObjectLockConfig(bucketName: string): Promise<Lock>

  getBucketEncryption(bucketName: string, callback: ResultCallback<Encryption>): void
  getBucketEncryption(bucketName: string): Promise<Encryption>

  setBucketEncryption(bucketName: string, encryptionConfig: Encryption, callback: NoResultCallback): void
  setBucketEncryption(bucketName: string, encryptionConfig: Encryption): Promise<void>

  removeBucketEncryption(bucketName: string, callback: NoResultCallback): void
  removeBucketEncryption(bucketName: string): Promise<void>

  setBucketReplication(bucketName: string, replicationConfig: ReplicationConfig, callback: NoResultCallback): void
  setBucketReplication(bucketName: string, replicationConfig: ReplicationConfig): Promise<void>

  getBucketReplication(bucketName: string, callback: ResultCallback<ReplicationConfig>): void
  getBucketReplication(bucketName: string): Promise<ReplicationConfig>

  // Object operations
  getObject(bucketName: string, objectName: string, callback: ResultCallback<ReadableStream>): void
  getObject(
    bucketName: string,
    objectName: string,
    getOpts: GetObjectOpts,
    Getcallback: ResultCallback<ReadableStream>,
  ): void
  getObject(bucketName: string, objectName: string, getOpts?: GetObjectOpts): Promise<ReadableStream>

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
  getPartialObject(
    bucketName: string,
    objectName: string,
    offset: number,
    getOpts: GetObjectOpts,
    callback: ResultCallback<ReadableStream>,
  ): void
  getPartialObject(
    bucketName: string,
    objectName: string,
    offset: number,
    length: number,
    getOpts: GetObjectOpts,
    callback: ResultCallback<ReadableStream>,
  ): void
  getPartialObject(
    bucketName: string,
    objectName: string,
    offset: number,
    length?: number,
    getOpts?: GetObjectOpts,
  ): Promise<ReadableStream>

  fGetObject(bucketName: string, objectName: string, filePath: string, callback: NoResultCallback): void
  fGetObject(
    bucketName: string,
    objectName: string,
    filePath: string,
    getOpts: GetObjectOpts,
    callback: NoResultCallback,
  ): void
  fGetObject(bucketName: string, objectName: string, filePath: string, getOpts?: GetObjectOpts): Promise<void>

  putObject(
    bucketName: string,
    objectName: string,
    stream: ReadableStream | Buffer | string,
    callback: ResultCallback<UploadedObjectInfo>,
  ): void
  putObject(
    bucketName: string,
    objectName: string,
    stream: ReadableStream | Buffer | string,
    size: number,
    callback: ResultCallback<UploadedObjectInfo>,
  ): void
  putObject(
    bucketName: string,
    objectName: string,
    stream: ReadableStream | Buffer | string,
    size: number,
    metaData: ItemBucketMetadata,
    callback: ResultCallback<UploadedObjectInfo>,
  ): void
  putObject(
    bucketName: string,
    objectName: string,
    stream: ReadableStream | Buffer | string,
    size?: number,
    metaData?: ItemBucketMetadata,
  ): Promise<UploadedObjectInfo>
  putObject(
    bucketName: string,
    objectName: string,
    stream: ReadableStream | Buffer | string,
    metaData?: ItemBucketMetadata,
  ): Promise<UploadedObjectInfo>

  fPutObject(
    bucketName: string,
    objectName: string,
    filePath: string,
    metaData: ItemBucketMetadata,
    callback: ResultCallback<UploadedObjectInfo>,
  ): void
  fPutObject(
    bucketName: string,
    objectName: string,
    filePath: string,
    metaData?: ItemBucketMetadata,
  ): Promise<UploadedObjectInfo>

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

  statObject(bucketName: string, objectName: string, callback: ResultCallback<BucketItemStat>): void
  statObject(
    bucketName: string,
    objectName: string,
    statOpts: StatObjectOpts,
    callback: ResultCallback<BucketItemStat>,
  ): void
  statObject(bucketName: string, objectName: string, statOpts?: StatObjectOpts): Promise<BucketItemStat>

  removeObjects(bucketName: string, objectsList: string[], callback: NoResultCallback): void
  removeObjects(bucketName: string, objectsList: string[]): Promise<void>

  removeIncompleteUpload(bucketName: string, objectName: string, callback: NoResultCallback): void
  removeIncompleteUpload(bucketName: string, objectName: string): Promise<void>

  putObjectRetention(bucketName: string, objectName: string, callback: NoResultCallback): void
  putObjectRetention(
    bucketName: string,
    objectName: string,
    retentionOptions: Retention,
    callback: NoResultCallback,
  ): void
  putObjectRetention(bucketName: string, objectName: string, retentionOptions?: Retention): Promise<void>

  getObjectRetention(
    bucketName: string,
    objectName: string,
    options: VersionIdentification,
    callback: ResultCallback<Retention>,
  ): void
  getObjectRetention(bucketName: string, objectName: string, options: VersionIdentification): Promise<Retention>

  setObjectTagging(bucketName: string, objectName: string, tags: TagList, callback: NoResultCallback): void
  setObjectTagging(
    bucketName: string,
    objectName: string,
    tags: TagList,
    putOptions: VersionIdentification,
    callback: NoResultCallback,
  ): void
  setObjectTagging(
    bucketName: string,
    objectName: string,
    tags: TagList,
    putOptions?: VersionIdentification,
  ): Promise<void>

  removeObjectTagging(bucketName: string, objectName: string, callback: NoResultCallback): void
  removeObjectTagging(
    bucketName: string,
    objectName: string,
    removeOptions: VersionIdentification,
    callback: NoResultCallback,
  ): void
  removeObjectTagging(bucketName: string, objectName: string, removeOptions?: VersionIdentification): Promise<void>

  getObjectTagging(bucketName: string, objectName: string, callback: ResultCallback<Tag[]>): void
  getObjectTagging(
    bucketName: string,
    objectName: string,
    getOptions: GetObjectOpts,
    callback: ResultCallback<Tag[]>,
  ): void
  getObjectTagging(bucketName: string, objectName: string, getOptions?: VersionIdentification): Promise<Tag[]>

  getObjectLegalHold(bucketName: string, objectName: string, callback: ResultCallback<LegalHoldOptions>): void
  getObjectLegalHold(
    bucketName: string,
    objectName: string,
    getOptions: VersionIdentification,
    callback: ResultCallback<LegalHoldOptions>,
  ): void
  getObjectLegalHold(
    bucketName: string,
    objectName: string,
    getOptions?: VersionIdentification,
  ): Promise<LegalHoldOptions>

  setObjectLegalHold(bucketName: string, objectName: string, callback: NoResultCallback): void
  setObjectLegalHold(
    bucketName: string,
    objectName: string,
    setOptions: LegalHoldOptions,
    callback: NoResultCallback,
  ): void
  setObjectLegalHold(bucketName: string, objectName: string, setOptions?: LegalHoldOptions): Promise<void>

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

  getBucketPolicy(bucketName: string, callback: ResultCallback<string>): void
  getBucketPolicy(bucketName: string): Promise<string>

  setBucketPolicy(bucketName: string, bucketPolicy: string, callback: NoResultCallback): void
  setBucketPolicy(bucketName: string, bucketPolicy: string): Promise<void>

  listenBucketNotification(
    bucketName: string,
    prefix: string,
    suffix: string,
    events: NotificationEvent[],
  ): NotificationPoller

  // Other
  newPostPolicy(): PostPolicy
}

export declare class NotificationPoller extends EventEmitter {
  stop(): void

  start(): void

  // must to be public?
  checkForChanges(): void
}

export declare class NotificationConfig {
  add(target: TopicConfig | QueueConfig | CloudFunctionConfig): void
}

export declare class TopicConfig extends TargetConfig {
  constructor(arn: string)
}

export declare class QueueConfig extends TargetConfig {
  constructor(arn: string)
}

export declare class CloudFunctionConfig extends TargetConfig {
  constructor(arn: string)
}

export declare function buildARN(
  partition: string,
  service: string,
  region: string,
  accountId: string,
  resource: string,
): string

export declare const ObjectCreatedAll: NotificationEvent // s3:ObjectCreated:*'
export declare const ObjectCreatedPut: NotificationEvent // s3:ObjectCreated:Put
export declare const ObjectCreatedPost: NotificationEvent // s3:ObjectCreated:Post
export declare const ObjectCreatedCopy: NotificationEvent // s3:ObjectCreated:Copy
export declare const ObjectCreatedCompleteMultipartUpload: NotificationEvent // s3:ObjectCreated:CompleteMultipartUpload
export declare const ObjectRemovedAll: NotificationEvent // s3:ObjectRemoved:*
export declare const ObjectRemovedDelete: NotificationEvent // s3:ObjectRemoved:Delete
export declare const ObjectRemovedDeleteMarkerCreated: NotificationEvent // s3:ObjectRemoved:DeleteMarkerCreated
export declare const ObjectReducedRedundancyLostObject: NotificationEvent // s3:ReducedRedundancyLostObject
