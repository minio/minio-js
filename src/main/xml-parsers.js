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
  var xmlError = {}
  var xmlobj = parseXml(xml)
  var message
  _.each(xmlobj, (n, key) => {
    if (key === 'Message') {
      message = xmlobj[key][0]
      return
    }
    xmlError[key.toLowerCase()] = xmlobj[key][0]
  })
  var e = new errors.S3Error(message)
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
  var result = {
    etag: "",
    lastModified: ""
  }
  var xmlobj = parseXml(xml)
  if (xmlobj.ETag) result.etag = xmlobj.ETag[0].replace(/^"/g, '').replace(/"$/g, '')
    .replace(/^&quot;/g, '').replace(/&quot;$/g, '')
    .replace(/^&#34;/g, '').replace(/^&#34;$/g, '')
  if (xmlobj.LastModified) result.lastModified = new Date(xmlobj.LastModified[0])

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
  var result = []
  var xmlobj = parseXml(xml)
  if (xmlobj.Buckets) {
    if (xmlobj.Buckets[0].Bucket) {
      xmlobj.Buckets[0].Bucket.forEach(bucket => {
        var name = bucket.Name[0]
        var creationDate = new Date(bucket.CreationDate[0])
        result.push({name, creationDate})
      })
    }
  }
  return result
}

// parse XML response for bucket notification
export function parseBucketNotification(xml) {
  var result = {
    TopicConfiguration  : [],
    QueueConfiguration  : [],
    CloudFunctionConfiguration : [],
  }
  // Parse the events list
  var genEvents = function(events) {
    var result = []
    if (events) {
      events.forEach(s3event => {
        result.push(s3event)
      })
    }
    return result
  }
  // Parse all filter rules
  var genFilterRules = function(filters) {
    var result = []
    if (filters && filters[0].S3Key && filters[0].S3Key[0].FilterRule) {
      filters[0].S3Key[0].FilterRule.forEach(rule => {
        var Name = rule.Name[0]
        var Value = rule.Value[0]
        result.push({Name, Value})
      })
    }
    return result
  }

  var xmlobj = parseXml(xml)

  // Parse all topic configurations in the xml
  if (xmlobj.TopicConfiguration) {
    xmlobj.TopicConfiguration.forEach(config => {
      var Id = config.Id[0]
      var Topic = config.Topic[0]
      var Event = genEvents(config.Event)
      var Filter = genFilterRules(config.Filter)
      result.TopicConfiguration.push({ Id, Topic, Event, Filter})
    })
  }
  // Parse all topic configurations in the xml
  if (xmlobj.QueueConfiguration) {
    xmlobj.QueueConfiguration.forEach(config => {
      var Id = config.Id[0]
      var Queue = config.Queue[0]
      var Event = genEvents(config.Event)
      var Filter = genFilterRules(config.Filter)
      result.QueueConfiguration.push({ Id, Queue, Event, Filter})
    })
  }
  // Parse all QueueConfiguration arrays
  if (xmlobj.CloudFunctionConfiguration) {
    xmlobj.CloudFunctionConfiguration.forEach(config => {
      var Id = config.Id[0]
      var CloudFunction = config.CloudFunction[0]
      var Event = genEvents(config.Event)
      var Filter = genFilterRules(config.Filter)
      result.CloudFunctionConfiguration.push({ Id, CloudFunction, Event, Filter})
    })
  }

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
  var result = {
    objects: [],
    isTruncated: false
  }
  var nextMarker
  var xmlobj = parseXml(xml)
  if (xmlobj.IsTruncated && xmlobj.IsTruncated[0] === 'true') result.isTruncated = true
  if (xmlobj.Contents) {
    xmlobj.Contents.forEach(content => {
      var name = content.Key[0]
      var lastModified = new Date(content.LastModified[0])
      var etag = content.ETag[0].replace(/^"/g, '').replace(/"$/g, '')
        .replace(/^&quot;/g, '').replace(/&quot;$/g, '')
        .replace(/^&#34;/g, '').replace(/^&#34;$/g, '')
      var size = +content.Size[0]
      result.objects.push({name, lastModified, etag, size})
      nextMarker = name
    })
  }
  if (xmlobj.CommonPrefixes) {
    xmlobj.CommonPrefixes.forEach(commonPrefix => {
      var prefix = commonPrefix.Prefix[0]
      var size = 0
      result.objects.push({prefix, size})
    })
  }
  if (result.isTruncated) {
    result.nextMarker = xmlobj.NextMarker ? xmlobj.NextMarker[0]: nextMarker
  }
  return result
}

// parse XML response for list objects v2 in a bucket
export function parseListObjectsV2(xml) {
  var result = {
    objects: [],
    isTruncated: false
  }
  var xmlobj = parseXml(xml)
  if (xmlobj.IsTruncated && xmlobj.IsTruncated[0] === 'true') result.isTruncated = true
  if (xmlobj.NextContinuationToken) result.nextContinuationToken = xmlobj.NextContinuationToken[0]

  if (xmlobj.Contents) {
    xmlobj.Contents.forEach(content => {
      var name = content.Key[0]
      var lastModified = new Date(content.LastModified[0])
      var etag = content.ETag[0].replace(/^"/g, '').replace(/"$/g, '')
        .replace(/^&quot;/g, '').replace(/&quot;$/g, '')
        .replace(/^&#34;/g, '').replace(/^&#34;$/g, '')
      var size = +content.Size[0]
      result.objects.push({name, lastModified, etag, size})
    })
  }
  if (xmlobj.CommonPrefixes) {
    xmlobj.CommonPrefixes.forEach(commonPrefix => {
      var prefix = commonPrefix.Prefix[0]
      var size = 0
      result.objects.push({prefix, size})
    })
  }
  return result
}

// parse XML response for list objects v2 with metadata in a bucket
export function parseListObjectsV2WithMetadata(xml) {
  var result = {
    objects: [],
    isTruncated: false
  }
  var xmlobj = parseXml(xml)
  if (xmlobj.IsTruncated && xmlobj.IsTruncated[0] === 'true') result.isTruncated = true
  if (xmlobj.NextContinuationToken) result.nextContinuationToken = xmlobj.NextContinuationToken[0]

  if (xmlobj.Contents) {
    xmlobj.Contents.forEach(content => {
      var name = content.Key[0]
      var lastModified = new Date(content.LastModified[0])
      var etag = content.ETag[0].replace(/^"/g, '').replace(/"$/g, '')
        .replace(/^&quot;/g, '').replace(/&quot;$/g, '')
        .replace(/^&#34;/g, '').replace(/^&#34;$/g, '')
      var size = +content.Size[0]
      var metadata
      if (content.UserMetadata != null) {
        metadata = content.UserMetadata[0]
      } else {
        metadata = null
      }
      result.objects.push({name, lastModified, etag, size, metadata})
    })
  }
  if (xmlobj.CommonPrefixes) {
    xmlobj.CommonPrefixes.forEach(commonPrefix => {
      var prefix = commonPrefix.Prefix[0]
      var size = 0
      result.objects.push({prefix, size})
    })
  }
  return result
}

