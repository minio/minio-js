// imported from https://github.com/DefinitelyTyped/DefinitelyTyped/blob/93cfb0ec069731dcdfc31464788613f7cddb8192/types/minio/index.d.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { LEGAL_HOLD_STATUS, RETENTION_MODES, RETENTION_VALIDITY_UNITS } from './helpers.ts'
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
  InputSerialization,
  IsoDate,
  ItemBucketMetadata,
  ItemBucketMetadataList,
  LegalHoldStatus,
  LifecycleConfig,
  LifecycleRule,
  MetadataItem,
  ObjectLockInfo,
  OutputSerialization,
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
  ScanRange,
  SelectOptions,
  SelectProgress,
  SourceSelectionCriteria,
  Tag,
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
  InputSerialization,
  IsoDate,
  ItemBucketMetadata,
  ItemBucketMetadataList,
  LegalHoldStatus,
  LifecycleConfig,
  LifecycleRule,
  MetadataItem,
  NoResultCallback,
  ObjectLockInfo,
  OutputSerialization,
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
  ScanRange,
  SelectOptions,
  SelectProgress,
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

export interface PostPolicyResult {
  postURL: string
  formData: {
    [key: string]: any
  }
}

export interface LockConfig {
  mode: RETENTION_MODES
  unit: RETENTION_VALIDITY_UNITS
  validity: number
}

export interface LegalHoldOptions {
  versionId: string
  status: LEGAL_HOLD_STATUS
}

export interface SourceObjectStats {
  size: number
  metaData: string
  lastModicied: Date
  versionId: string
  etag: string
}

// Exports from library
export class Client extends TypedClient {
  listObjects(bucketName: string, prefix?: string, recursive?: boolean): BucketStream<BucketItem>

  listObjectsV2(bucketName: string, prefix?: string, recursive?: boolean, startAfter?: string): BucketStream<BucketItem>

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
}
