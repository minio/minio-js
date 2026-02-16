/*
 * MinIO Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2015 MinIO, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { LEGAL_HOLD_STATUS, RETENTION_MODES, RETENTION_VALIDITY_UNITS } from './helpers.ts'
import { callbackify } from './internal/callbackify.ts'
import { TypedClient } from './internal/client.ts'
import { CopyConditions } from './internal/copy-conditions.ts'
import { PostPolicy } from './internal/post-policy.ts'

export * from './errors.ts'
export * from './helpers.ts'
export * from './notification.ts'
export { CopyConditions, PostPolicy }
export { IamAwsProvider } from './IamAwsProvider.ts'
export type { MakeBucketOpt } from './internal/client.ts'
export type { ClientOptions, NoResultCallback, RemoveOptions } from './internal/client.ts'
export type { Region } from './internal/s3-endpoints.ts'
export type {
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
  PostPolicyResult,
  PutObjectLegalHoldOptions,
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
} from './internal/type.ts'

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

export class Client extends TypedClient {}

// refactored API use promise internally
Client.prototype.makeBucket = callbackify(Client.prototype.makeBucket)
Client.prototype.bucketExists = callbackify(Client.prototype.bucketExists)
Client.prototype.removeBucket = callbackify(Client.prototype.removeBucket)
Client.prototype.listBuckets = callbackify(Client.prototype.listBuckets)

Client.prototype.getObject = callbackify(Client.prototype.getObject)
Client.prototype.fGetObject = callbackify(Client.prototype.fGetObject)
Client.prototype.getPartialObject = callbackify(Client.prototype.getPartialObject)
Client.prototype.statObject = callbackify(Client.prototype.statObject)
Client.prototype.putObjectRetention = callbackify(Client.prototype.putObjectRetention)
Client.prototype.putObject = callbackify(Client.prototype.putObject)
Client.prototype.fPutObject = callbackify(Client.prototype.fPutObject)
Client.prototype.removeObject = callbackify(Client.prototype.removeObject)

Client.prototype.removeBucketReplication = callbackify(Client.prototype.removeBucketReplication)
Client.prototype.setBucketReplication = callbackify(Client.prototype.setBucketReplication)
Client.prototype.getBucketReplication = callbackify(Client.prototype.getBucketReplication)
Client.prototype.getObjectLegalHold = callbackify(Client.prototype.getObjectLegalHold)
Client.prototype.setObjectLegalHold = callbackify(Client.prototype.setObjectLegalHold)
Client.prototype.setObjectLockConfig = callbackify(Client.prototype.setObjectLockConfig)
Client.prototype.getObjectLockConfig = callbackify(Client.prototype.getObjectLockConfig)
Client.prototype.getBucketPolicy = callbackify(Client.prototype.getBucketPolicy)
Client.prototype.setBucketPolicy = callbackify(Client.prototype.setBucketPolicy)
Client.prototype.getBucketTagging = callbackify(Client.prototype.getBucketTagging)
Client.prototype.getObjectTagging = callbackify(Client.prototype.getObjectTagging)
Client.prototype.setBucketTagging = callbackify(Client.prototype.setBucketTagging)
Client.prototype.removeBucketTagging = callbackify(Client.prototype.removeBucketTagging)
Client.prototype.setObjectTagging = callbackify(Client.prototype.setObjectTagging)
Client.prototype.removeObjectTagging = callbackify(Client.prototype.removeObjectTagging)
Client.prototype.getBucketVersioning = callbackify(Client.prototype.getBucketVersioning)
Client.prototype.setBucketVersioning = callbackify(Client.prototype.setBucketVersioning)
Client.prototype.selectObjectContent = callbackify(Client.prototype.selectObjectContent)
Client.prototype.setBucketLifecycle = callbackify(Client.prototype.setBucketLifecycle)
Client.prototype.getBucketLifecycle = callbackify(Client.prototype.getBucketLifecycle)
Client.prototype.removeBucketLifecycle = callbackify(Client.prototype.removeBucketLifecycle)
Client.prototype.setBucketEncryption = callbackify(Client.prototype.setBucketEncryption)
Client.prototype.getBucketEncryption = callbackify(Client.prototype.getBucketEncryption)
Client.prototype.removeBucketEncryption = callbackify(Client.prototype.removeBucketEncryption)
Client.prototype.getObjectRetention = callbackify(Client.prototype.getObjectRetention)
Client.prototype.removeObjects = callbackify(Client.prototype.removeObjects)
Client.prototype.removeIncompleteUpload = callbackify(Client.prototype.removeIncompleteUpload)
Client.prototype.copyObject = callbackify(Client.prototype.copyObject)
Client.prototype.composeObject = callbackify(Client.prototype.composeObject)
Client.prototype.presignedUrl = callbackify(Client.prototype.presignedUrl)
Client.prototype.presignedGetObject = callbackify(Client.prototype.presignedGetObject)
Client.prototype.presignedPutObject = callbackify(Client.prototype.presignedPutObject)
Client.prototype.presignedPostPolicy = callbackify(Client.prototype.presignedPostPolicy)
Client.prototype.setBucketNotification = callbackify(Client.prototype.setBucketNotification)
Client.prototype.getBucketNotification = callbackify(Client.prototype.getBucketNotification)
Client.prototype.removeAllBucketNotification = callbackify(Client.prototype.removeAllBucketNotification)
