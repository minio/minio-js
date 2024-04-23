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

import { XMLParser } from 'fast-xml-parser'

import * as errors from './errors.ts'
import { isObject, parseXml, sanitizeETag, sanitizeObjectKey, sanitizeSize, toArray } from './internal/helper.ts'

const fxpWithoutNumParser = new XMLParser({
  numberParseOptions: {
    skipLike: /./,
  },
})

// parse XML response for copy object
export function parseCopyObject(xml) {
  var result = {
    etag: '',
    lastModified: '',
  }

  var xmlobj = parseXml(xml)
  if (!xmlobj.CopyObjectResult) {
    throw new errors.InvalidXMLError('Missing tag: "CopyObjectResult"')
  }
  xmlobj = xmlobj.CopyObjectResult
  if (xmlobj.ETag) {
    result.etag = xmlobj.ETag.replace(/^"/g, '')
      .replace(/"$/g, '')
      .replace(/^&quot;/g, '')
      .replace(/&quot;$/g, '')
      .replace(/^&#34;/g, '')
      .replace(/&#34;$/g, '')
  }
  if (xmlobj.LastModified) {
    result.lastModified = new Date(xmlobj.LastModified)
  }

  return result
}

// parse XML response for bucket notification
export function parseBucketNotification(xml) {
  var result = {
    TopicConfiguration: [],
    QueueConfiguration: [],
    CloudFunctionConfiguration: [],
  }
  // Parse the events list
  var genEvents = function (events) {
    var result = []
    if (events) {
      toArray(events).forEach((s3event) => {
        result.push(s3event)
      })
    }
    return result
  }
  // Parse all filter rules
  var genFilterRules = function (filters) {
    var result = []
    if (filters) {
      filters = toArray(filters)
      if (filters[0].S3Key) {
        filters[0].S3Key = toArray(filters[0].S3Key)
        if (filters[0].S3Key[0].FilterRule) {
          toArray(filters[0].S3Key[0].FilterRule).forEach((rule) => {
            var Name = toArray(rule.Name)[0]
            var Value = toArray(rule.Value)[0]
            result.push({ Name, Value })
          })
        }
      }
    }
    return result
  }

  var xmlobj = parseXml(xml)
  xmlobj = xmlobj.NotificationConfiguration

  // Parse all topic configurations in the xml
  if (xmlobj.TopicConfiguration) {
    toArray(xmlobj.TopicConfiguration).forEach((config) => {
      var Id = toArray(config.Id)[0]
      var Topic = toArray(config.Topic)[0]
      var Event = genEvents(config.Event)
      var Filter = genFilterRules(config.Filter)
      result.TopicConfiguration.push({ Id, Topic, Event, Filter })
    })
  }
  // Parse all topic configurations in the xml
  if (xmlobj.QueueConfiguration) {
    toArray(xmlobj.QueueConfiguration).forEach((config) => {
      var Id = toArray(config.Id)[0]
      var Queue = toArray(config.Queue)[0]
      var Event = genEvents(config.Event)
      var Filter = genFilterRules(config.Filter)
      result.QueueConfiguration.push({ Id, Queue, Event, Filter })
    })
  }
  // Parse all QueueConfiguration arrays
  if (xmlobj.CloudFunctionConfiguration) {
    toArray(xmlobj.CloudFunctionConfiguration).forEach((config) => {
      var Id = toArray(config.Id)[0]
      var CloudFunction = toArray(config.CloudFunction)[0]
      var Event = genEvents(config.Event)
      var Filter = genFilterRules(config.Filter)
      result.CloudFunctionConfiguration.push({ Id, CloudFunction, Event, Filter })
    })
  }

  return result
}

const formatObjInfo = (content, opts = {}) => {
  let { Key, LastModified, ETag, Size, VersionId, IsLatest } = content

  if (!isObject(opts)) {
    opts = {}
  }

  const name = sanitizeObjectKey(toArray(Key)[0])
  const lastModified = new Date(toArray(LastModified)[0])
  const etag = sanitizeETag(toArray(ETag)[0])
  const size = sanitizeSize(Size)

  return {
    name,
    lastModified,
    etag,
    size,
    versionId: VersionId,
    isLatest: IsLatest,
    isDeleteMarker: opts.IsDeleteMarker ? opts.IsDeleteMarker : false,
  }
}

// parse XML response for list objects in a bucket
export function parseListObjects(xml) {
  var result = {
    objects: [],
    isTruncated: false,
  }
  let isTruncated = false
  let nextMarker, nextVersionKeyMarker
  const xmlobj = fxpWithoutNumParser.parse(xml)

  const parseCommonPrefixesEntity = (responseEntity) => {
    if (responseEntity) {
      toArray(responseEntity).forEach((commonPrefix) => {
        result.objects.push({ prefix: sanitizeObjectKey(toArray(commonPrefix.Prefix)[0]), size: 0 })
      })
    }
  }

  const listBucketResult = xmlobj.ListBucketResult
  const listVersionsResult = xmlobj.ListVersionsResult

  if (listBucketResult) {
    if (listBucketResult.IsTruncated) {
      isTruncated = listBucketResult.IsTruncated
    }
    if (listBucketResult.Contents) {
      toArray(listBucketResult.Contents).forEach((content) => {
        const name = sanitizeObjectKey(toArray(content.Key)[0])
        const lastModified = new Date(toArray(content.LastModified)[0])
        const etag = sanitizeETag(toArray(content.ETag)[0])
        const size = sanitizeSize(content.Size)
        result.objects.push({ name, lastModified, etag, size })
      })
    }

    if (listBucketResult.NextMarker) {
      nextMarker = listBucketResult.NextMarker
    } else if (isTruncated && result.objects.length > 0) {
      nextMarker = result.objects[result.objects.length - 1].name
    }
    parseCommonPrefixesEntity(listBucketResult.CommonPrefixes)
  }

  if (listVersionsResult) {
    if (listVersionsResult.IsTruncated) {
      isTruncated = listVersionsResult.IsTruncated
    }

    if (listVersionsResult.Version) {
      toArray(listVersionsResult.Version).forEach((content) => {
        result.objects.push(formatObjInfo(content))
      })
    }
    if (listVersionsResult.DeleteMarker) {
      toArray(listVersionsResult.DeleteMarker).forEach((content) => {
        result.objects.push(formatObjInfo(content, { IsDeleteMarker: true }))
      })
    }

    if (listVersionsResult.NextKeyMarker) {
      nextVersionKeyMarker = listVersionsResult.NextKeyMarker
    }
    if (listVersionsResult.NextVersionIdMarker) {
      result.versionIdMarker = listVersionsResult.NextVersionIdMarker
    }
    parseCommonPrefixesEntity(listVersionsResult.CommonPrefixes)
  }

  result.isTruncated = isTruncated
  if (isTruncated) {
    result.nextMarker = nextVersionKeyMarker || nextMarker
  }
  return result
}

// parse XML response for list objects v2 in a bucket
export function parseListObjectsV2(xml) {
  var result = {
    objects: [],
    isTruncated: false,
  }
  var xmlobj = parseXml(xml)
  if (!xmlobj.ListBucketResult) {
    throw new errors.InvalidXMLError('Missing tag: "ListBucketResult"')
  }
  xmlobj = xmlobj.ListBucketResult
  if (xmlobj.IsTruncated) {
    result.isTruncated = xmlobj.IsTruncated
  }
  if (xmlobj.NextContinuationToken) {
    result.nextContinuationToken = xmlobj.NextContinuationToken
  }
  if (xmlobj.Contents) {
    toArray(xmlobj.Contents).forEach((content) => {
      var name = sanitizeObjectKey(toArray(content.Key)[0])
      var lastModified = new Date(content.LastModified)
      var etag = sanitizeETag(content.ETag)
      var size = content.Size
      result.objects.push({ name, lastModified, etag, size })
    })
  }
  if (xmlobj.CommonPrefixes) {
    toArray(xmlobj.CommonPrefixes).forEach((commonPrefix) => {
      result.objects.push({ prefix: sanitizeObjectKey(toArray(commonPrefix.Prefix)[0]), size: 0 })
    })
  }
  return result
}

// parse XML response for list objects v2 with metadata in a bucket
export function parseListObjectsV2WithMetadata(xml) {
  var result = {
    objects: [],
    isTruncated: false,
  }
  var xmlobj = parseXml(xml)
  if (!xmlobj.ListBucketResult) {
    throw new errors.InvalidXMLError('Missing tag: "ListBucketResult"')
  }
  xmlobj = xmlobj.ListBucketResult
  if (xmlobj.IsTruncated) {
    result.isTruncated = xmlobj.IsTruncated
  }
  if (xmlobj.NextContinuationToken) {
    result.nextContinuationToken = xmlobj.NextContinuationToken
  }

  if (xmlobj.Contents) {
    toArray(xmlobj.Contents).forEach((content) => {
      var name = sanitizeObjectKey(content.Key)
      var lastModified = new Date(content.LastModified)
      var etag = sanitizeETag(content.ETag)
      var size = content.Size
      var metadata
      if (content.UserMetadata != null) {
        metadata = toArray(content.UserMetadata)[0]
      } else {
        metadata = null
      }
      result.objects.push({ name, lastModified, etag, size, metadata })
    })
  }

  if (xmlobj.CommonPrefixes) {
    toArray(xmlobj.CommonPrefixes).forEach((commonPrefix) => {
      result.objects.push({ prefix: sanitizeObjectKey(toArray(commonPrefix.Prefix)[0]), size: 0 })
    })
  }
  return result
}

export function parseObjectRetentionConfig(xml) {
  const xmlObj = parseXml(xml)
  const retentionConfig = xmlObj.Retention

  return {
    mode: retentionConfig.Mode,
    retainUntilDate: retentionConfig.RetainUntilDate,
  }
}

export function parseObjectLegalHoldConfig(xml) {
  const xmlObj = parseXml(xml)
  return xmlObj.LegalHold
}

export function uploadPartParser(xml) {
  const xmlObj = parseXml(xml)
  const respEl = xmlObj.CopyPartResult
  return respEl
}

export function removeObjectsParser(xml) {
  const xmlObj = parseXml(xml)
  if (xmlObj.DeleteResult && xmlObj.DeleteResult.Error) {
    // return errors as array always. as the response is object in case of single object passed in removeObjects
    return toArray(xmlObj.DeleteResult.Error)
  }
  return []
}
