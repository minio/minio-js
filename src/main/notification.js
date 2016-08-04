/*
 * Minio Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2016 Minio, Inc.
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

// Notification config - array of target configs.
// Target configs can be
// 1. Topic (simple notification service)
// 2. Queue (simple queue service)
// 3. CloudFront (lambda function)
export class NotificationConfig {
  add(target) {
    let instance = ''
    if (target instanceof TopicConfig) {
      instance = 'TopicConfiguration'
    }
    if (target instanceof QueueConfig) {
      instance = 'QueueConfiguration'
    }
    if (target instanceof CloudFunctionConfig) {
      instance = 'CloudFunctionConfiguration'
    }
    if (!this[instance]) this[instance] = []
    this[instance].push(target)
  }
}

// Base class for three supported configs.
class TargetConfig {
  setId(id) {
    this.Id = id
  }
  addEvent(newevent){
    if (!this.Event) this.Event = []
    this.Event.push(newevent)
  }
  addFilterSuffix(suffix) {
    if (!this.Filter) this.Filter = {S3Key : {FilterRule:[]}}
    this.Filter.S3Key.FilterRule.push({Name:"suffix", Value:suffix})
  }
  addFilterPrefix(prefix) {
    if (!this.Filter) this.Filter = {S3Key : {FilterRule:[]}}
    this.Filter.S3Key.FilterRule.push({Name:"prefix", Value:prefix})
  }
}

// 1. Topic (simple notification service)
export class TopicConfig extends TargetConfig {
  constructor(arn) {
    super();
    this.Topic = arn
  }
}

// 2. Queue (simple queue service)
export class QueueConfig extends TargetConfig {
  constructor(arn) {
    super();
    this.Queue = arn
  }
}

// 3. CloudFront (lambda function)
export class CloudFunctionConfig extends TargetConfig {
  constructor(arn) {
    super();
    this.CloudFunction = arn
  }
}

export const buildARN = (partition, service, region, accountId, resource) => {
  return "arn:" + partition + ":" + service + ":" + region + ":" + accountId + ":" + resource
}


export const ObjectCreatedAll                      = "s3:ObjectCreated:*"
export const ObjectCreatedPut                      = "s3:ObjectCreated:Put"
export const ObjectCreatedPost                     = "s3:ObjectCreated:Post"
export const ObjectCreatedCopy                     = "s3:ObjectCreated:Copy"
export const ObjectCreatedCompleteMultipartUpload  = "sh:ObjectCreated:CompleteMultipartUpload"
export const ObjectRemovedAll                      = "s3:ObjectRemoved:*"
export const ObjectRemovedDelete                   = "s3:ObjectRemoved:Delete"
export const ObjectRemovedDeleteMarkerCreated      = "s3:ObjectRemoved:DeleteMarkerCreated"
export const ObjectReducedRedundancyLostObject     = "s3:ReducedRedundancyLostObject"
