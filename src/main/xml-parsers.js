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

import xml2js from 'xml2js'
import transform from 'camaro'
import _ from 'lodash'
import * as errors from './errors.js'

var options = {  // options passed to xml2js parser
  explicitRoot: false,    // return the root node in the resulting object?
  ignoreAttrs: true,     // ignore attributes, only create text nodes
}

var parseXml = (xml) => {
  var result = null
  var error = null

  var parser = new xml2js.Parser(options)
  parser.parseString(xml, function (e, r) {
    error = e
    result = r
  })

  if (error) {
    throw new Error('XML parse error')
  }
  return result
}

// Parse XML and return information as Javascript types

// parse error XML response
export function parseError(xml, headerInfo) {
  var template = {
    code: "Error/Code",
    message: "Error/Message",
    key: "Error/Key",
    bucketname: "Error/BucketName",
    resource: "Error/Resource",
    region: "Error/Region",
    requestid: "Error/RequestId",
    hostid: "Error/HostId"
  }
  var xmlError = transform(xml, template)
  var e = new errors.S3Error(xmlError.message)
  _.each(xmlError, (value, key) => {
    e[key] = value
  })
  _.each(headerInfo, (value, key) => {
    e[key] = value
  })
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
  var result = {
    uploads: [],
    prefixes: [],
    isTruncated: false
  }
  var xmlobj =  parseXml(xml)
  if (xmlobj.IsTruncated && xmlobj.IsTruncated[0] === 'true') result.isTruncated = true
  if (xmlobj.NextKeyMarker) result.nextKeyMarker =  xmlobj.NextKeyMarker[0]
  if (xmlobj.NextUploadIdMarker) result.nextUploadIdMarker = xmlobj.NextUploadIdMarker[0]
  if (xmlobj.CommonPrefixes) xmlobj.CommonPrefixes.forEach(prefix => {
    result.prefixes.push({prefix: prefix[0]})
  })
  if (xmlobj.Upload) xmlobj.Upload.forEach(upload => {
    result.uploads.push({
      key: upload.Key[0],
      uploadId: upload.UploadId[0],
      initiated: new Date(upload.Initiated[0])
    })
  })
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
  return parseXml(xml)
}

// parse XML response for list parts of an in progress multipart upload
export function parseListParts(xml) {
  var xmlobj = parseXml(xml)
  var result = {
    isTruncated: false,
    parts: [],
    marker: undefined
  }
  if (xmlobj.IsTruncated && xmlobj.IsTruncated[0] === 'true') result.isTruncated = true
  if (xmlobj.NextPartNumberMarker) result.marker = +xmlobj.NextPartNumberMarker[0]
  if (xmlobj.Part) {
    xmlobj.Part.forEach(p => {
      var part = +p.PartNumber[0]
      var lastModified = new Date(p.LastModified[0])
      var etag = p.ETag[0].replace(/^"/g, '').replace(/"$/g, '')
        .replace(/^&quot;/g, '').replace(/&quot;$/g, '')
        .replace(/^&#34;/g, '').replace(/^&#34;$/g, '')
      result.parts.push({part, lastModified, etag})
    })
  }
  return result
}

// parse XML response when a new multipart upload is initiated
export function parseInitiateMultipart(xml) {  
  var xmlobj = parseXml(xml)
  if (xmlobj.UploadId) return xmlobj.UploadId[0]
  throw new errors.InvalidXMLError('UploadId missing in XML')
}

// parse XML response when a multipart upload is completed
export function parseCompleteMultipart(xml) {
  // var template = {
  //   location: '',
  //   bucket: '',
  //   key: '',
  //   etag: ''
  // }

  // var result = transform(xml, template)
  // return result 

  var xmlobj = parseXml(xml)
  if (xmlobj.Location) {
    var location = xmlobj.Location[0]
    var bucket = xmlobj.Bucket[0]
    var key = xmlobj.Key[0]
    var etag = xmlobj.ETag[0].replace(/^"/g, '').replace(/"$/g, '')
      .replace(/^&quot;/g, '').replace(/&quot;$/g, '')
      .replace(/^&#34;/g, '').replace(/^&#34;$/g, '')

    return {location, bucket, key, etag}
  }
  // Complete Multipart can return XML Error after a 200 OK response
  if (xmlobj.Code && xmlobj.Message) {
    var errCode = xmlobj.Code[0]
    var errMessage = xmlobj.Message[0]
    return {errCode, errMessage}
  }
}

// parse XML response for list objects in a bucket
export function parseListObjects(xml) {
  var template = {
    objects: ['ListBucketResult/Contents', {
      name: "Key",
      lastModified: "LastModified",
      etag: "translate(ETag, '\"', '')",
      size: "number(Size)"
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
      name: "Key",
      lastModified: "LastModified",
      etag: "translate(ETag, '\"', '')",
      size: "number(Size)"
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
