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
    // type can be : TopicConfiguration QueueConfiguration CloudFunctionConfiguration
    var type = target.type
    delete(target.type)
    if (!this[type]) this[type] = []
    this[type].push(target)
  }
}

// Base class for three supported configs.
class TargetConfig {
  setResource(resource) {
    this.resource = resource
  }
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
class TopicConfig extends TargetConfig {
  constructor() {
    super();
    this.type = 'TopicConfiguration'
    this.service = 'sns'
    this.arnTag = 'Topic'
  }
}

// 2. Queue (simple queue service)
class QueueConfig extends TargetConfig {
  constructor() {
    super();
    this.type = 'QueueConfiguration'
    this.service = 'sqs'
    this.arnTag = 'Queue'
  }
}

// 3. CloudFront (lambda function)
class CloudFunctionConfig extends TargetConfig {
  constructor() {
    super();
    this.type = 'CloudFunctionConfiguration'
    this.service = 'sqs'
    this.arnTag = 'CloudFunction'
  }
}

// Namespace for all the notification related features.
export var Notification = {
  Config: NotificationConfig,
  Topic: TopicConfig,
  Queue: QueueConfig,
  CloudFunction: CloudFunctionConfig,
  Event: {
    ObjectCreatedAll                      : "s3:ObjectCreated:*",
    ObjectCreatedPut                       : "s3:ObjectCreated:Put",
    ObjectCreatedPost                     : "s3:ObjectCreated:Post",
    ObjectCreatedCopy                     : "s3:ObjectCreated:Copy",
    ObjectCreatedCompleteMultipartUpload  : "sh:ObjectCreated:CompleteMultipartUpload",
    ObjectRemovedAll                      : "s3:ObjectRemoved:*",
    ObjectRemovedDelete                   : "s3:ObjectRemoved:Delete",
    ObjectRemovedDeleteMarkerCreated      : "s3:ObjectRemoved:DeleteMarkerCreated",
    ObjectReducedRedundancyLostObject     : "s3:ReducedRedundancyLostObject",
  }
}

