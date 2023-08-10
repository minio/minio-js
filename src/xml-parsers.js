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

import crc32 from 'buffer-crc32'
import { XMLParser } from 'fast-xml-parser'

import * as errors from './errors.ts'
import { SelectResults } from './helpers.ts'
import {
  isObject,
  parseXml,
  readableStream,
  sanitizeETag,
  sanitizeObjectKey,
  sanitizeSize,
  toArray,
} from './internal/helper.ts'
import { RETENTION_VALIDITY_UNITS } from './internal/type.ts'

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

// parse XML response for listing in-progress multipart uploads
export function parseListMultipart(xml) {
  var result = {
    uploads: [],
    prefixes: [],
    isTruncated: false,
  }

  var xmlobj = parseXml(xml)

  if (!xmlobj.ListMultipartUploadsResult) {
    throw new errors.InvalidXMLError('Missing tag: "ListMultipartUploadsResult"')
  }
  xmlobj = xmlobj.ListMultipartUploadsResult
  if (xmlobj.IsTruncated) {
    result.isTruncated = xmlobj.IsTruncated
  }
  if (xmlobj.NextKeyMarker) {
    result.nextKeyMarker = xmlobj.NextKeyMarker
  }
  if (xmlobj.NextUploadIdMarker) {
    result.nextUploadIdMarker = xmlobj.nextUploadIdMarker || ''
  }

  if (xmlobj.CommonPrefixes) {
    toArray(xmlobj.CommonPrefixes).forEach((prefix) => {
      result.prefixes.push({ prefix: sanitizeObjectKey(toArray(prefix.Prefix)[0]) })
    })
  }

  if (xmlobj.Upload) {
    toArray(xmlobj.Upload).forEach((upload) => {
      var key = upload.Key
      var uploadId = upload.UploadId
      var initiator = { id: upload.Initiator.ID, displayName: upload.Initiator.DisplayName }
      var owner = { id: upload.Owner.ID, displayName: upload.Owner.DisplayName }
      var storageClass = upload.StorageClass
      var initiated = new Date(upload.Initiated)
      result.uploads.push({ key, uploadId, initiator, owner, storageClass, initiated })
    })
  }
  return result
}

// parse XML response to list all the owned buckets

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

// parse XML response when a multipart upload is completed
export function parseCompleteMultipart(xml) {
  var xmlobj = parseXml(xml).CompleteMultipartUploadResult
  if (xmlobj.Location) {
    var location = toArray(xmlobj.Location)[0]
    var bucket = toArray(xmlobj.Bucket)[0]
    var key = xmlobj.Key
    var etag = xmlobj.ETag.replace(/^"/g, '')
      .replace(/"$/g, '')
      .replace(/^&quot;/g, '')
      .replace(/&quot;$/g, '')
      .replace(/^&#34;/g, '')
      .replace(/&#34;$/g, '')

    return { location, bucket, key, etag }
  }
  // Complete Multipart can return XML Error after a 200 OK response
  if (xmlobj.Code && xmlobj.Message) {
    var errCode = toArray(xmlobj.Code)[0]
    var errMessage = toArray(xmlobj.Message)[0]
    return { errCode, errMessage }
  }
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

export function parseBucketVersioningConfig(xml) {
  var xmlObj = parseXml(xml)
  return xmlObj.VersioningConfiguration
}

export function parseTagging(xml) {
  const xmlObj = parseXml(xml)
  let result = []
  if (xmlObj.Tagging && xmlObj.Tagging.TagSet && xmlObj.Tagging.TagSet.Tag) {
    const tagResult = xmlObj.Tagging.TagSet.Tag
    // if it is a single tag convert into an array so that the return value is always an array.
    if (isObject(tagResult)) {
      result.push(tagResult)
    } else {
      result = tagResult
    }
  }
  return result
}

export function parseLifecycleConfig(xml) {
  const xmlObj = parseXml(xml)
  return xmlObj.LifecycleConfiguration
}

export function parseObjectLockConfig(xml) {
  const xmlObj = parseXml(xml)
  let lockConfigResult = {}
  if (xmlObj.ObjectLockConfiguration) {
    lockConfigResult = {
      objectLockEnabled: xmlObj.ObjectLockConfiguration.ObjectLockEnabled,
    }
    let retentionResp
    if (
      xmlObj.ObjectLockConfiguration &&
      xmlObj.ObjectLockConfiguration.Rule &&
      xmlObj.ObjectLockConfiguration.Rule.DefaultRetention
    ) {
      retentionResp = xmlObj.ObjectLockConfiguration.Rule.DefaultRetention || {}
      lockConfigResult.mode = retentionResp.Mode
    }
    if (retentionResp) {
      const isUnitYears = retentionResp.Years
      if (isUnitYears) {
        lockConfigResult.validity = isUnitYears
        lockConfigResult.unit = RETENTION_VALIDITY_UNITS.YEARS
      } else {
        lockConfigResult.validity = retentionResp.Days
        lockConfigResult.unit = RETENTION_VALIDITY_UNITS.DAYS
      }
    }
    return lockConfigResult
  }
}

export function parseObjectRetentionConfig(xml) {
  const xmlObj = parseXml(xml)
  const retentionConfig = xmlObj.Retention

  return {
    mode: retentionConfig.Mode,
    retainUntilDate: retentionConfig.RetainUntilDate,
  }
}

export function parseBucketEncryptionConfig(xml) {
  let encConfig = parseXml(xml)
  return encConfig
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

export function parseSelectObjectContentResponse(res) {
  // extractHeaderType extracts the first half of the header message, the header type.
  function extractHeaderType(stream) {
    const headerNameLen = Buffer.from(stream.read(1)).readUInt8()
    const headerNameWithSeparator = Buffer.from(stream.read(headerNameLen)).toString()
    const splitBySeparator = (headerNameWithSeparator || '').split(':')
    const headerName = splitBySeparator.length >= 1 ? splitBySeparator[1] : ''
    return headerName
  }

  function extractHeaderValue(stream) {
    const bodyLen = Buffer.from(stream.read(2)).readUInt16BE()
    const bodyName = Buffer.from(stream.read(bodyLen)).toString()
    return bodyName
  }

  const selectResults = new SelectResults({}) // will be returned

  const responseStream = readableStream(res) // convert byte array to a readable responseStream
  while (responseStream._readableState.length) {
    // Top level responseStream read tracker.
    let msgCrcAccumulator // accumulate from start of the message till the message crc start.

    const totalByteLengthBuffer = Buffer.from(responseStream.read(4))
    msgCrcAccumulator = crc32(totalByteLengthBuffer)

    const headerBytesBuffer = Buffer.from(responseStream.read(4))
    msgCrcAccumulator = crc32(headerBytesBuffer, msgCrcAccumulator)

    const calculatedPreludeCrc = msgCrcAccumulator.readInt32BE() // use it to check if any CRC mismatch in header itself.

    const preludeCrcBuffer = Buffer.from(responseStream.read(4)) // read 4 bytes    i.e 4+4 =8 + 4 = 12 ( prelude + prelude crc)
    msgCrcAccumulator = crc32(preludeCrcBuffer, msgCrcAccumulator)

    const totalMsgLength = totalByteLengthBuffer.readInt32BE()
    const headerLength = headerBytesBuffer.readInt32BE()
    const preludeCrcByteValue = preludeCrcBuffer.readInt32BE()

    if (preludeCrcByteValue !== calculatedPreludeCrc) {
      // Handle Header CRC mismatch Error
      throw new Error(
        `Header Checksum Mismatch, Prelude CRC of ${preludeCrcByteValue} does not equal expected CRC of ${calculatedPreludeCrc}`,
      )
    }

    const headers = {}
    if (headerLength > 0) {
      const headerBytes = Buffer.from(responseStream.read(headerLength))
      msgCrcAccumulator = crc32(headerBytes, msgCrcAccumulator)
      const headerReaderStream = readableStream(headerBytes)
      while (headerReaderStream._readableState.length) {
        let headerTypeName = extractHeaderType(headerReaderStream)
        headerReaderStream.read(1) // just read and ignore it.
        headers[headerTypeName] = extractHeaderValue(headerReaderStream)
      }
    }

    let payloadStream
    const payLoadLength = totalMsgLength - headerLength - 16
    if (payLoadLength > 0) {
      const payLoadBuffer = Buffer.from(responseStream.read(payLoadLength))
      msgCrcAccumulator = crc32(payLoadBuffer, msgCrcAccumulator)
      // read the checksum early and detect any mismatch so we can avoid unnecessary further processing.
      const messageCrcByteValue = Buffer.from(responseStream.read(4)).readInt32BE()
      const calculatedCrc = msgCrcAccumulator.readInt32BE()
      // Handle message CRC Error
      if (messageCrcByteValue !== calculatedCrc) {
        throw new Error(
          `Message Checksum Mismatch, Message CRC of ${messageCrcByteValue} does not equal expected CRC of ${calculatedCrc}`,
        )
      }
      payloadStream = readableStream(payLoadBuffer)
    }

    const messageType = headers['message-type']

    switch (messageType) {
      case 'error': {
        const errorMessage = headers['error-code'] + ':"' + headers['error-message'] + '"'
        throw new Error(errorMessage)
      }
      case 'event': {
        const contentType = headers['content-type']
        const eventType = headers['event-type']

        switch (eventType) {
          case 'End': {
            selectResults.setResponse(res)
            return selectResults
          }

          case 'Records': {
            const readData = payloadStream.read(payLoadLength)
            selectResults.setRecords(readData)
            break
          }

          case 'Progress':
            {
              switch (contentType) {
                case 'text/xml': {
                  const progressData = payloadStream.read(payLoadLength)
                  selectResults.setProgress(progressData.toString())
                  break
                }
                default: {
                  const errorMessage = `Unexpected content-type ${contentType} sent for event-type Progress`
                  throw new Error(errorMessage)
                }
              }
            }
            break
          case 'Stats':
            {
              switch (contentType) {
                case 'text/xml': {
                  const statsData = payloadStream.read(payLoadLength)
                  selectResults.setStats(statsData.toString())
                  break
                }
                default: {
                  const errorMessage = `Unexpected content-type ${contentType} sent for event-type Stats`
                  throw new Error(errorMessage)
                }
              }
            }
            break
          default: {
            // Continuation message: Not sure if it is supported. did not find a reference or any message in response.
            // It does not have a payload.
            const warningMessage = `Un implemented event detected  ${messageType}.`
            // eslint-disable-next-line no-console
            console.warn(warningMessage)
          }
        } // eventType End
      } // Event End
    } // messageType End
  } // Top Level Stream End
}
