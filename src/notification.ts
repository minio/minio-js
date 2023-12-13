/*
 * MinIO Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2016 MinIO, Inc.
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

import { EventEmitter } from 'eventemitter3'
import jsonLineParser from 'stream-json/jsonl/Parser.js'

import { DEFAULT_REGION } from './helpers.ts'
import type { TypedClient } from './internal/client.ts'
import { pipesetup, uriEscape } from './internal/helper.ts'

// TODO: type this

type Event = unknown

// Base class for three supported configs.
export class TargetConfig {
  private Filter?: { S3Key: { FilterRule: { Name: string; Value: string }[] } }
  private Event?: Event[]
  private Id: unknown

  setId(id: unknown) {
    this.Id = id
  }

  addEvent(newevent: Event) {
    if (!this.Event) {
      this.Event = []
    }
    this.Event.push(newevent)
  }

  addFilterSuffix(suffix: string) {
    if (!this.Filter) {
      this.Filter = { S3Key: { FilterRule: [] } }
    }
    this.Filter.S3Key.FilterRule.push({ Name: 'suffix', Value: suffix })
  }

  addFilterPrefix(prefix: string) {
    if (!this.Filter) {
      this.Filter = { S3Key: { FilterRule: [] } }
    }
    this.Filter.S3Key.FilterRule.push({ Name: 'prefix', Value: prefix })
  }
}

// 1. Topic (simple notification service)
export class TopicConfig extends TargetConfig {
  private Topic: string

  constructor(arn: string) {
    super()
    this.Topic = arn
  }
}

// 2. Queue (simple queue service)
export class QueueConfig extends TargetConfig {
  private Queue: string

  constructor(arn: string) {
    super()
    this.Queue = arn
  }
}

// 3. CloudFront (lambda function)
export class CloudFunctionConfig extends TargetConfig {
  private CloudFunction: string

  constructor(arn: string) {
    super()
    this.CloudFunction = arn
  }
}

// Notification config - array of target configs.
// Target configs can be
// 1. Topic (simple notification service)
// 2. Queue (simple queue service)
// 3. CloudFront (lambda function)
export class NotificationConfig {
  private TopicConfiguration?: TargetConfig[]
  private CloudFunctionConfiguration?: TargetConfig[]
  private QueueConfiguration?: TargetConfig[]

  add(target: TargetConfig) {
    let instance: TargetConfig[] | undefined
    if (target instanceof TopicConfig) {
      instance = this.TopicConfiguration ??= []
    }
    if (target instanceof QueueConfig) {
      instance = this.QueueConfiguration ??= []
    }
    if (target instanceof CloudFunctionConfig) {
      instance = this.CloudFunctionConfiguration ??= []
    }
    if (instance) {
      instance.push(target)
    }
  }
}

export const buildARN = (partition: string, service: string, region: string, accountId: string, resource: string) => {
  return 'arn:' + partition + ':' + service + ':' + region + ':' + accountId + ':' + resource
}
export const ObjectCreatedAll = 's3:ObjectCreated:*'
export const ObjectCreatedPut = 's3:ObjectCreated:Put'
export const ObjectCreatedPost = 's3:ObjectCreated:Post'
export const ObjectCreatedCopy = 's3:ObjectCreated:Copy'
export const ObjectCreatedCompleteMultipartUpload = 's3:ObjectCreated:CompleteMultipartUpload'
export const ObjectRemovedAll = 's3:ObjectRemoved:*'
export const ObjectRemovedDelete = 's3:ObjectRemoved:Delete'
export const ObjectRemovedDeleteMarkerCreated = 's3:ObjectRemoved:DeleteMarkerCreated'
export const ObjectReducedRedundancyLostObject = 's3:ReducedRedundancyLostObject'
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
  | string // put string at least so auto-complete could work

// TODO: type this
export type NotificationRecord = unknown
// Poll for notifications, used in #listenBucketNotification.
// Listening constitutes repeatedly requesting s3 whether or not any
// changes have occurred.
export class NotificationPoller extends EventEmitter<{
  notification: (event: NotificationRecord) => void
  error: (error: unknown) => void
}> {
  private client: TypedClient
  private bucketName: string
  private prefix: string
  private suffix: string
  private events: NotificationEvent[]
  private ending: boolean

  constructor(client: TypedClient, bucketName: string, prefix: string, suffix: string, events: NotificationEvent[]) {
    super()

    this.client = client
    this.bucketName = bucketName
    this.prefix = prefix
    this.suffix = suffix
    this.events = events

    this.ending = false
  }

  // Starts the polling.
  start() {
    this.ending = false

    process.nextTick(() => {
      this.checkForChanges()
    })
  }

  // Stops the polling.
  stop() {
    this.ending = true
  }

  checkForChanges() {
    // Don't continue if we're looping again but are cancelled.
    if (this.ending) {
      return
    }

    const method = 'GET'
    const queries = []
    if (this.prefix) {
      const prefix = uriEscape(this.prefix)
      queries.push(`prefix=${prefix}`)
    }
    if (this.suffix) {
      const suffix = uriEscape(this.suffix)
      queries.push(`suffix=${suffix}`)
    }
    if (this.events) {
      this.events.forEach((s3event) => queries.push('events=' + uriEscape(s3event)))
    }
    queries.sort()

    let query = ''
    if (queries.length > 0) {
      query = `${queries.join('&')}`
    }
    const region = this.client.region || DEFAULT_REGION

    this.client.makeRequestAsync({ method, bucketName: this.bucketName, query }, '', [200], region).then(
      (response) => {
        const asm = jsonLineParser.make()

        pipesetup(response, asm)
          .on('data', (data) => {
            // Data is flushed periodically (every 5 seconds), so we should
            // handle it after flushing from the JSON parser.
            let records = data.value.Records
            // If null (= no records), change to an empty array.
            if (!records) {
              records = []
            }

            // Iterate over the notifications and emit them individually.
            records.forEach((record: NotificationRecord) => {
              this.emit('notification', record)
            })

            // If we're done, stop.
            if (this.ending) {
              response?.destroy()
            }
          })
          .on('error', (e) => this.emit('error', e))
          .on('end', () => {
            // Do it again, if we haven't cancelled yet.
            process.nextTick(() => {
              this.checkForChanges()
            })
          })
      },
      (e) => {
        return this.emit('error', e)
      },
    )
  }
}
