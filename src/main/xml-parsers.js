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

import transform from 'camaro'
import _ from 'lodash'
import * as errors from './errors.js'

// Parse XML and return information as Javascript types

// parse error XML response
export function parseError(xml, headerInfo) {
  var template = {
    code: 'Error/Code',
    message: 'Error/Message',
    key: 'Error/Key',
    bucketname: 'Error/BucketName',
    resource: 'Error/Resource',
    region: 'Error/Region',
    requestid: 'Error/RequestId',
    hostid: 'Error/HostId'
  }
  var xmlError = transform(xml, template)
  var e = new errors.S3Error(xmlError.message)
  Object.assign(e, xmlError, headerInfo)
  return e
}

// parse XML response for copy object
export function parseCopyObject(xml) {
  var template = {
    etag: "translate(CopyObjectResult/ETag, '\"', '')",
    lastModified: 'CopyObjectResult/LastModified'
  }
  var result = transform(xml, template)
  if (result.lastModified) {
    result.lastModified = new Date(result.lastModified)
  }
  return result
}

// parse XML response for listing in-progress multipart uploads
export function parseListMultipart(xml) {
  var template = {
    uploads: ['ListMultipartUploadsOutput/Upload', {
      key: 'Key',
      uploadId: 'UploadId',
      initiated: 'Initiated',
    }],
    prefixes: ['ListMultipartUploadsOutput/CommonPrefixes/Prefix', {
      prefix: '.'
    }],
    isTruncated: 'boolean(ListMultipartUploadsOutput/IsTruncated = "true")',
    nextKeyMarker: 'ListMultipartUploadsOutput/NextKeyMarker',
    nextUploadIdMarker: 'ListMultipartUploadsOutput/NextUploadIdMarker',
  }
  var result = transform(xml, template)
  // backward compat
  if (!result.nextKeyMarker) delete result.nextKeyMarker
  if (!result.nextUploadIdMarker) delete result.nextUploadIdMarker
  return result
}

// parse XML response to list all the owned buckets
export function parseListBucket(xml) {
  var template = {
    buckets: ['ListAllMyBucketsResult/Buckets/Bucket', {
      name: 'Name',
      creationDate: 'CreationDate'
    }]
  }
  var result = transform(xml, template)
  _.forEach(result.buckets, (b) => {
    if (b.creationDate) {
      b.creationDate = new Date(b.creationDate)
    }
  })
  return result.buckets
}

// parse XML response for bucket notification
export function parseBucketNotification(xml) {
  const filterRuleTemplate = ['S3Key/FilterRule', {
    Name: 'Name',
    Value: 'Value'
  }]
  var template = {
    TopicConfiguration  : ['NotificationConfiguration/TopicConfiguration', {
      Id: 'Id',
      Topic: 'Topic',
      Event: 'Event',
      Filter: filterRuleTemplate
    }],
    QueueConfiguration  : ['NotificationConfiguration/QueueConfiguration', {
      Id: 'Id',
      Queue: 'Queue',
      Event: 'Event',
      Filter: filterRuleTemplate
    }],
    CloudFunctionConfiguration : ['NotificationConfiguration/CloudFunctionConfiguration', {
      Id: 'Id',
      CloudFunction: 'CloudFunction',
      Event: 'Event',
      Filter: filterRuleTemplate
    }]
  }
  var result = transform(xml, template)
  return result
}

// parse XML response for bucket region
export function parseBucketRegion(xml) {
  var result = transform(xml, { region: 'LocationConstraint'})
  return result.region
}

// parse XML response for list parts of an in progress multipart upload
export function parseListParts(xml) {
  var template = {
    isTruncated: 'boolean(ListPartsOutput/IsTruncated = "true")',
    parts: ['ListPartsOutput/Part', {
      part: 'PartNumber',
      lastModified: 'LastModified',
      etag: "translate(ETag, '\"', '')"
    }],
    marker: 'ListPartsOutput/NextPartNumberMarker'
  }
  var result = transform(xml, template)
  if (!result.marker) delete result.marker
  _.forEach(result.parts, p => {
    if (p.lastModified) p.lastModified = new Date(p.lastModified)
  })
  return result
}

// parse XML response when a new multipart upload is initiated
export function parseInitiateMultipart(xml) {
  var result = transform(xml, {
    uploadId: 'InitiateMultipartUploadResult/UploadId'
  })
  if (result.uploadId) return result.uploadId
  throw new errors.InvalidXMLError('UploadId missing in XML')
}

// parse XML response when a multipart upload is completed
export function parseCompleteMultipart(xml) {
  var template = {
    errCode: 'Error/Code',
    errMessage: 'Error/Message',
    location: 'CompleteMultipartUploadOutput/Location',
    bucket: 'CompleteMultipartUploadOutput/Bucket',
    key: 'CompleteMultipartUploadOutput/Key',
    etag: "translate(CompleteMultipartUploadOutput/ETag, '\"', '')"
  }

  var result = transform(xml, template)
  if (result.errCode && result.errMessage) {
    return _.pick(result, ['errCode', 'errMessage'])
  }
  return result 
}

// parse XML response for list objects in a bucket
export function parseListObjects(xml) {
  var template = {
    objects: ['ListBucketResult/Contents', {
      name: 'Key',
      lastModified: 'LastModified',
      etag: "translate(ETag, '\"', '')",
      size: 'number(Size)'
    }],
    isTruncated: 'boolean(ListBucketResult/IsTruncated = "true")',
    nextMarker: 'ListBucketResult/NextMarker'
  }
  var result = transform(xml, template)
  // backward compatible: only add nextMarker prop if exists
  if (!result.isTruncated) {
    delete result.nextMarker
  }
  _.forEach(result.objects, o => {
    if (o.lastModified) {
      o.lastModified = new Date(o.lastModified)
    }
  })
  // TODO(Anh): implement common prefix
  return result
}

// parse XML response for list objects v2 in a bucket
export function parseListObjectsV2(xml) {
  var template = {
    objects: ['ListBucketResult/Contents', {
      name: 'Key',
      lastModified: 'LastModified',
      etag: "translate(ETag, '\"', '')",
      size: 'number(Size)'
    }],
    isTruncated: 'boolean(ListBucketResult/IsTruncated = "true")',
    nextContinuationToken: 'ListBucketResult/nextContinuationToken'
  }

  var result = transform(xml, template)
  // backward compatible: only add nextContinuationToken if exists
  if (!result.nextContinuationToken) {
    delete result.nextContinuationToken
  }
  _.forEach(result.objects, o => {
    if (o.lastModified) {
      o.lastModified = new Date(o.lastModified)
    }
  })
  // TODO(Anh): implement commonPrefix parsing  
  return result
}
