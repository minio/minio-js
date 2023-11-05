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

import * as crc32 from 'crc-32'
import { XMLParser } from 'fast-xml-parser'

import * as errors from './errors.ts'
import type { RETENTION_MODES } from './helpers.ts'
import { SelectResults } from './helpers.ts'
import { isObject, parseXml, sanitizeETag, sanitizeObjectKey, sanitizeSize, toArray } from './internal/helper.ts'
import type { BucketItemCopy, BucketItemFromList, ObjectMetaData, Retention, UploadID } from './internal/type.ts'
import { RETENTION_VALIDITY_UNITS } from './internal/type.ts'

const fxp = new XMLParser()

// Parse XML and return information as Javascript types
// parse error XML response
export function parseError(xml: string, headerInfo: Record<string, any>) {
  let xmlErr = {}
  const xmlObj = fxp.parse(xml)
  if (xmlObj.Error) {
    xmlErr = xmlObj.Error
  }

  const e = new errors.S3Error() as unknown as Record<string, any>
  Object.entries(xmlErr).forEach(([key, value]) => {
    e[key.toLowerCase()] = value
  })

  Object.entries(headerInfo).forEach(([key, value]) => {
    e[key] = value
  })

  return e
}

// parse XML response for copy object
export function parseCopyObject(xml: string): BucketItemCopy {
  const result: { etag: string; lastModified?: Date } = {
    etag: '',
  }

  let xmlobj = parseXml(xml)
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

  // @ts-ignore
  return result
}

// parse XML response for listing in-progress multipart uploads
export function parseListMultipart(xml: string) {
  const result = {
    uploads: [] as {
      key: string
      uploadId: UploadID
      initiator: unknown
      owner: unknown
      storageClass: unknown
      initiated: unknown
    }[],
    prefixes: [] as { prefix: string }[],
    isTruncated: false,
    nextKeyMarker: undefined,
    nextUploadIdMarker: undefined,
  }

  let xmlobj = parseXml(xml)

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
      // @ts-expect-error index check
      result.prefixes.push({ prefix: sanitizeObjectKey(toArray<string>(prefix.Prefix)[0]) })
    })
  }

  if (xmlobj.Upload) {
    toArray(xmlobj.Upload).forEach((upload) => {
      const key = upload.Key
      const uploadId = upload.UploadId
      const initiator = { id: upload.Initiator.ID, displayName: upload.Initiator.DisplayName }
      const owner = { id: upload.Owner.ID, displayName: upload.Owner.DisplayName }
      const storageClass = upload.StorageClass
      const initiated = new Date(upload.Initiated)
      result.uploads.push({ key, uploadId, initiator, owner, storageClass, initiated })
    })
  }
  return result
}

// parse XML response to list all the owned buckets
export function parseListBucket(xml: string): BucketItemFromList[] {
  const result: BucketItemFromList[] = []
  let xmlobj = parseXml(xml)

  if (!xmlobj.ListAllMyBucketsResult) {
    throw new errors.InvalidXMLError('Missing tag: "ListAllMyBucketsResult"')
  }
  xmlobj = xmlobj.ListAllMyBucketsResult

  if (xmlobj.Buckets) {
    if (xmlobj.Buckets.Bucket) {
      toArray(xmlobj.Buckets.Bucket).forEach((bucket) => {
        const name = bucket.Name
        const creationDate = new Date(bucket.CreationDate)
        result.push({ name, creationDate })
      })
    }
  }
  return result
}

// parse XML response for bucket notification
export function parseBucketNotification(xml: string): any {
  const result = {
    TopicConfiguration: [] as unknown[],
    QueueConfiguration: [] as unknown[],
    CloudFunctionConfiguration: [] as unknown[],
  }
  // Parse the events list
  const genEvents = function (events: any) {
    const result = []
    if (events) {
      result.push(...toArray(events))
    }
    return result
  }
  // Parse all filter rules
  const genFilterRules = function (filters: any) {
    const result: { Name: string; Value: string }[] = []
    if (filters) {
      filters = toArray(filters)
      if (filters[0].S3Key) {
        filters[0].S3Key = toArray(filters[0].S3Key)
        if (filters[0].S3Key[0].FilterRule) {
          toArray(filters[0].S3Key[0].FilterRule).forEach((rule) => {
            const Name = toArray(rule.Name)[0]
            const Value = toArray(rule.Value)[0]
            result.push({ Name, Value })
          })
        }
      }
    }
    return result
  }

  let xmlobj = parseXml(xml)
  xmlobj = xmlobj.NotificationConfiguration

  // Parse all topic configurations in the xml
  if (xmlobj.TopicConfiguration) {
    toArray(xmlobj.TopicConfiguration).forEach((config) => {
      const Id = toArray(config.Id)[0]
      const Topic = toArray(config.Topic)[0]
      const Event = genEvents(config.Event)
      const Filter = genFilterRules(config.Filter)
      result.TopicConfiguration.push({ Id, Topic, Event, Filter })
    })
  }
  // Parse all topic configurations in the xml
  if (xmlobj.QueueConfiguration) {
    toArray(xmlobj.QueueConfiguration).forEach((config) => {
      const Id = toArray(config.Id)[0]
      const Queue = toArray(config.Queue)[0]
      const Event = genEvents(config.Event)
      const Filter = genFilterRules(config.Filter)
      result.QueueConfiguration.push({ Id, Queue, Event, Filter })
    })
  }
  // Parse all QueueConfiguration arrays
  if (xmlobj.CloudFunctionConfiguration) {
    toArray(xmlobj.CloudFunctionConfiguration).forEach((config) => {
      const Id = toArray(config.Id)[0]
      const CloudFunction = toArray(config.CloudFunction)[0]
      const Event = genEvents(config.Event)
      const Filter = genFilterRules(config.Filter)
      result.CloudFunctionConfiguration.push({ Id, CloudFunction, Event, Filter })
    })
  }

  return result
}

// parse XML response for bucket region
export function parseBucketRegion(xml: string) {
  // return region information
  return parseXml(xml).LocationConstraint
}

export type Part = {
  part: number
  lastModified?: Date
  etag: string
}

// parse XML response for list parts of an in progress multipart upload
export function parseListParts(xml: string): { isTruncated: boolean; marker: number | undefined; parts: Part[] } {
  let xmlobj = parseXml(xml)
  const result: { isTruncated: boolean; marker: number | undefined; parts: Part[] } = {
    isTruncated: false,
    parts: [],
    marker: undefined as number | undefined,
  }
  if (!xmlobj.ListPartsResult) {
    throw new errors.InvalidXMLError('Missing tag: "ListPartsResult"')
  }
  xmlobj = xmlobj.ListPartsResult
  if (xmlobj.IsTruncated) {
    result.isTruncated = xmlobj.IsTruncated
  }
  if (xmlobj.NextPartNumberMarker) {
    result.marker = toArray(xmlobj.NextPartNumberMarker)[0]
  }
  if (xmlobj.Part) {
    toArray(xmlobj.Part).forEach((p) => {
      const part = +toArray(p.PartNumber)[0]
      const lastModified = new Date(p.LastModified)
      const etag = p.ETag.replace(/^"/g, '')
        .replace(/"$/g, '')
        .replace(/^&quot;/g, '')
        .replace(/&quot;$/g, '')
        .replace(/^&#34;/g, '')
        .replace(/&#34;$/g, '')
      result.parts.push({ part, lastModified, etag })
    })
  }
  return result
}

// parse XML response when a new multipart upload is initiated
export function parseInitiateMultipart(xml: string) {
  let xmlobj = parseXml(xml)

  if (!xmlobj.InitiateMultipartUploadResult) {
    throw new errors.InvalidXMLError('Missing tag: "InitiateMultipartUploadResult"')
  }
  xmlobj = xmlobj.InitiateMultipartUploadResult

  if (xmlobj.UploadId) {
    return xmlobj.UploadId
  }
  throw new errors.InvalidXMLError('Missing tag: "UploadId"')
}

export type MultipartResult =
  | { errCode: string; errMessage: string }
  | {
      errCode?: undefined // this help TS to narrow type
      etag: string
      key: string
      bucket: string
      location: string
    }

// parse XML response when a multipart upload is completed
export function parseCompleteMultipart(xml: string) {
  const xmlobj = parseXml(xml).CompleteMultipartUploadResult
  if (xmlobj.Location) {
    const location = toArray(xmlobj.Location)[0]
    const bucket = toArray(xmlobj.Bucket)[0]
    const key = xmlobj.Key
    const etag = xmlobj.ETag.replace(/^"/g, '')
      .replace(/"$/g, '')
      .replace(/^&quot;/g, '')
      .replace(/&quot;$/g, '')
      .replace(/^&#34;/g, '')
      .replace(/&#34;$/g, '')

    return { location, bucket, key, etag }
  }
  // Complete Multipart can return XML Error after a 200 OK response
  if (xmlobj.Code && xmlobj.Message) {
    const errCode = toArray(xmlobj.Code)[0]
    const errMessage = toArray(xmlobj.Message)[0]
    return { errCode, errMessage }
  }
}

type ListedObject = {
  Key: string
  LastModified: string
  ETag: string
  Size: number
  VersionId?: string
  IsLatest?: boolean
}

const formatObjInfo = (content: ListedObject, opts: { IsDeleteMarker?: boolean } = {}) => {
  const { Key, LastModified, ETag, Size, VersionId, IsLatest } = content

  if (!isObject(opts)) {
    opts = {}
  }

  // @ts-expect-error index check
  const name = sanitizeObjectKey(toArray(Key)[0])
  // @ts-expect-error index check
  const lastModified = new Date(toArray(LastModified)[0])
  const etag = sanitizeETag(toArray(ETag)[0])
  // @ts-ignore
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

export type S3ListObject =
  | { prefix: string; size: number }
  | { name: string; size: number } // sometime api return this, not sure if it's valid
  | {
      name: string
      lastModified: Date
      etag: string
      size: number
      isDeleteMarker?: boolean
      isLatest?: boolean
    }

type ListObjectResponse = {
  nextMarker?: string
  versionIdMarker?: string
  objects: S3ListObject[]
  isTruncated: boolean
  nextContinuationToken?: string
}

// parse XML response for list objects in a bucket
export function parseListObjects(xml: string) {
  const result: ListObjectResponse = {
    objects: [],
    isTruncated: false,
  }
  let isTruncated = false
  let nextMarker, nextVersionKeyMarker
  const xmlobj = parseXml(xml) as {
    ListBucketResult?: {
      CommonPrefixes: { Prefix: string }
      IsTruncated: boolean
      NextMarker?: string
      Contents: Array<{ Key: string; LastModified: string; ETag: string; Size: number }>
    }
    ListVersionsResult?: {
      CommonPrefixes: unknown
      NextKeyMarker?: string
      NextVersionIdMarker?: string
      Version: Array<ListedObject>
      DeleteMarker?: Array<ListedObject>
      IsTruncated: boolean
    }
  }

  const parseCommonPrefixesEntity = (responseEntity: any) => {
    if (responseEntity) {
      toArray(responseEntity).forEach((commonPrefix) => {
        result.objects.push({ prefix: sanitizeObjectKey(toArray(commonPrefix.Prefix)[0]), size: 0 })
      })
    }
  }

  // https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjects.html
  const listBucketResult = xmlobj.ListBucketResult
  // https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectVersions.html
  const listVersionsResult = xmlobj.ListVersionsResult

  if (listBucketResult) {
    if (listBucketResult.IsTruncated) {
      isTruncated = listBucketResult.IsTruncated
    }
    if (listBucketResult.Contents) {
      toArray(listBucketResult.Contents).forEach((content) => {
        const name = sanitizeObjectKey(content.Key)
        const lastModified = new Date(content.LastModified)
        const etag = sanitizeETag(content.ETag)
        const size = content.Size
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
        // @ts-ignore
        result.objects.push(formatObjInfo(content))
      })
    }
    if (listVersionsResult.DeleteMarker) {
      toArray(listVersionsResult.DeleteMarker).forEach((content) => {
        // @ts-ignore
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
export function parseListObjectsV2(xml: string) {
  const result: {
    objects: (
      | { prefix: string; size: number }
      | {
          name: string
          lastModified: Date
          etag: string
          size: number
        }
    )[]
    isTruncated: boolean
    nextContinuationToken?: string
  } = {
    objects: [],
    isTruncated: false,
  }

  let xmlobj = parseXml(xml)
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
      const name = sanitizeObjectKey(toArray(content.Key)[0])
      const lastModified = new Date(content.LastModified)
      const etag = sanitizeETag(content.ETag)
      const size = content.Size
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

export function parseListObjectsV2WithMetadata(xml: string) {
  const result: {
    objects: (
      | { prefix: string; size: number }
      | {
          name: string
          lastModified: Date
          etag: string
          size: number
          metadata: ObjectMetaData | null
        }
    )[]
    isTruncated: boolean
    nextContinuationToken?: string
  } = {
    objects: [],
    isTruncated: false,
  }

  let xmlobj = parseXml(xml)
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
      const name = sanitizeObjectKey(content.Key)
      const lastModified = new Date(content.LastModified)
      const etag = sanitizeETag(content.ETag)
      const size = content.Size
      let metadata
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

export function parseBucketVersioningConfig(xml: string) {
  const xmlObj = parseXml(xml)
  return xmlObj.VersioningConfiguration
}

export function parseTagging(xml: string) {
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

export function parseLifecycleConfig(xml: string) {
  const xmlObj = parseXml(xml)
  return xmlObj.LifecycleConfiguration
}

export type ObjectLockConfig = {
  mode?: RETENTION_MODES
  objectLockEnabled?: 'Enabled'
  unit?: RETENTION_VALIDITY_UNITS
  validity?: number
}

export function parseObjectLockConfig(xml: string): ObjectLockConfig | undefined {
  const xmlObj = parseXml(xml)
  let lockConfigResult: ObjectLockConfig = {}
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

export function parseObjectRetentionConfig(xml: string) {
  const xmlObj = parseXml(xml)
  const retentionConfig = xmlObj.Retention

  return {
    mode: retentionConfig.Mode,
    retainUntilDate: retentionConfig.RetainUntilDate,
  } as Retention
}

export function parseBucketEncryptionConfig(xml: string) {
  return parseXml(xml)
}

export function parseReplicationConfig(xml: string) {
  const xmlObj = parseXml(xml)

  const replicationConfig = {
    ReplicationConfiguration: {
      role: xmlObj.ReplicationConfiguration.Role,
      rules: toArray(xmlObj.ReplicationConfiguration.Rule),
    },
  }

  return replicationConfig
}

export function parseObjectLegalHoldConfig(xml: string) {
  const xmlObj = parseXml(xml)
  return xmlObj.LegalHold
}

export function uploadPartParser(xml: string) {
  const xmlObj = parseXml(xml)
  const respEl = xmlObj.CopyPartResult
  return respEl
}

export function removeObjectsParser(xml: string) {
  const xmlObj = parseXml(xml)
  if (xmlObj.DeleteResult && xmlObj.DeleteResult.Error) {
    // return errors as array always. as the response is object in case of single object passed in removeObjects
    return toArray(xmlObj.DeleteResult.Error)
  }
  return []
}

class ReadableBuffer {
  private buf: Buffer

  public readLoc: number

  constructor(buf: Buffer) {
    this.buf = buf
    this.readLoc = 0
  }

  read(size: number): Buffer {
    const sub = this.buf.subarray(this.readLoc, this.readLoc + size)
    this.readLoc += size
    return sub
  }

  notEnd(): boolean {
    return this.readLoc < this.buf.length
  }
}

export function parseSelectObjectContentResponse(res: Buffer): SelectResults {
  // extractHeaderType extracts the first half of the header message, the header type.
  function extractHeaderType(stream: ReadableBuffer): string {
    const headerNameLen = stream.read(1).readUInt8()
    const headerNameWithSeparator = stream.read(headerNameLen).toString()

    const [_, name] = headerNameWithSeparator.split(':')
    return name || ''
  }

  function extractHeaderValue(stream: ReadableBuffer) {
    const bodyLen = stream.read(2).readUInt16BE()
    return stream.read(bodyLen).toString()
  }

  const selectResults = new SelectResults({}) // will be returned

  const responseStream = new ReadableBuffer(res) // convert byte array to a readable responseStream
  while (responseStream.notEnd()) {
    const totalByteLengthBuffer = responseStream.read(4)
    let msgCrcAccumulator = crc32.buf(totalByteLengthBuffer)

    const headerBytesBuffer = responseStream.read(4)
    msgCrcAccumulator = crc32.buf(headerBytesBuffer, msgCrcAccumulator)

    const calculatedPreludeCrc = msgCrcAccumulator // use it to check if any CRC mismatch in header itself.

    const preludeCrcBuffer = responseStream.read(4) // read 4 bytes    i.e 4+4 =8 + 4 = 12 ( prelude + prelude crc)
    msgCrcAccumulator = crc32.buf(preludeCrcBuffer, msgCrcAccumulator)

    const totalMsgLength = totalByteLengthBuffer.readInt32BE()
    const headerLength = headerBytesBuffer.readInt32BE()
    const preludeCrcByteValue = preludeCrcBuffer.readInt32BE()

    if (preludeCrcByteValue !== calculatedPreludeCrc) {
      // Handle Header CRC mismatch Error
      throw new Error(
        `Header Checksum Mismatch, Prelude CRC of ${preludeCrcByteValue} does not equal expected CRC of ${calculatedPreludeCrc}`,
      )
    }

    const headers: Record<string, string> = {}

    if (headerLength > 0) {
      const headerBytes = responseStream.read(headerLength)
      msgCrcAccumulator = crc32.buf(headerBytes, msgCrcAccumulator)
      const headerReaderStream = new ReadableBuffer(headerBytes)
      while (headerReaderStream.notEnd()) {
        const headerTypeName = extractHeaderType(headerReaderStream)
        headerReaderStream.read(1) // just read and ignore it.
        headers[headerTypeName] = extractHeaderValue(headerReaderStream)
      }
    }

    let payloadStream: ReadableBuffer
    const payLoadLength = totalMsgLength - headerLength - 16
    if (payLoadLength > 0) {
      const payLoadBuffer = responseStream.read(payLoadLength)
      msgCrcAccumulator = crc32.buf(payLoadBuffer, msgCrcAccumulator)
      // read the checksum early and detect any mismatch so we can avoid unnecessary further processing.
      const messageCrcByteValue = responseStream.read(4).readInt32BE()
      const calculatedCrc = msgCrcAccumulator
      // Handle message CRC Error
      if (messageCrcByteValue !== calculatedCrc) {
        throw new Error(
          `Message Checksum Mismatch, Message CRC of ${messageCrcByteValue} does not equal expected CRC of ${calculatedCrc}`,
        )
      }
      payloadStream = new ReadableBuffer(payLoadBuffer)
    }

    const messageType = headers['message-type']

    switch (messageType) {
      case 'error': {
        const errorMessage = `${headers['error-code']}:"${headers['error-message']}"`
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
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            const readData = payloadStream.read(payLoadLength)
            selectResults.setRecords(readData)
            break
          }

          case 'Progress':
            {
              switch (contentType) {
                case 'text/xml': {
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-ignore
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
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-ignore
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

  throw new Error('unexpected end of stream')
}
