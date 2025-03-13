import type * as http from 'node:http'
import type stream from 'node:stream'

import crc32 from 'buffer-crc32'
import { XMLParser } from 'fast-xml-parser'

import * as errors from '../errors.ts'
import { SelectResults } from '../helpers.ts'
import { isObject, parseXml, readableStream, sanitizeETag, sanitizeObjectKey, sanitizeSize, toArray } from './helper.ts'
import { readAsString } from './response.ts'
import type {
  BucketItemFromList,
  BucketItemWithMetadata,
  CommonPrefix,
  CopyObjectResultV1,
  ListBucketResultV1,
  ObjectInfo,
  ObjectLockInfo,
  ObjectRowEntry,
  ReplicationConfig,
  Tags,
} from './type.ts'
import { RETENTION_VALIDITY_UNITS } from './type.ts'

// parse XML response for bucket region
export function parseBucketRegion(xml: string): string {
  // return region information
  return parseXml(xml).LocationConstraint
}

const fxp = new XMLParser()

const fxpWithoutNumParser = new XMLParser({
  // @ts-ignore
  numberParseOptions: {
    skipLike: /./,
  },
})

// Parse XML and return information as Javascript types
// parse error XML response
export function parseError(xml: string, headerInfo: Record<string, unknown>) {
  let xmlErr = {}
  const xmlObj = fxp.parse(xml)
  if (xmlObj.Error) {
    xmlErr = xmlObj.Error
  }
  const e = new errors.S3Error() as unknown as Record<string, unknown>
  Object.entries(xmlErr).forEach(([key, value]) => {
    e[key.toLowerCase()] = value
  })
  Object.entries(headerInfo).forEach(([key, value]) => {
    e[key] = value
  })
  return e
}

// Generates an Error object depending on http statusCode and XML body
export async function parseResponseError(response: http.IncomingMessage): Promise<Record<string, string>> {
  const statusCode = response.statusCode
  let code = '',
    message = ''
  if (statusCode === 301) {
    code = 'MovedPermanently'
    message = 'Moved Permanently'
  } else if (statusCode === 307) {
    code = 'TemporaryRedirect'
    message = 'Are you using the correct endpoint URL?'
  } else if (statusCode === 403) {
    code = 'AccessDenied'
    message = 'Valid and authorized credentials required'
  } else if (statusCode === 404) {
    code = 'NotFound'
    message = 'Not Found'
  } else if (statusCode === 405) {
    code = 'MethodNotAllowed'
    message = 'Method Not Allowed'
  } else if (statusCode === 501) {
    code = 'MethodNotAllowed'
    message = 'Method Not Allowed'
  } else if (statusCode === 503) {
    code = 'SlowDown'
    message = 'Please reduce your request rate.'
  } else {
    const hErrCode = response.headers['x-minio-error-code'] as string
    const hErrDesc = response.headers['x-minio-error-desc'] as string

    if (hErrCode && hErrDesc) {
      code = hErrCode
      message = hErrDesc
    }
  }
  const headerInfo: Record<string, string | undefined | null> = {}
  // A value created by S3 compatible server that uniquely identifies the request.
  headerInfo.amzRequestid = response.headers['x-amz-request-id'] as string | undefined
  // A special token that helps troubleshoot API replies and issues.
  headerInfo.amzId2 = response.headers['x-amz-id-2'] as string | undefined

  // Region where the bucket is located. This header is returned only
  // in HEAD bucket and ListObjects response.
  headerInfo.amzBucketRegion = response.headers['x-amz-bucket-region'] as string | undefined

  const xmlString = await readAsString(response)

  if (xmlString) {
    throw parseError(xmlString, headerInfo)
  }

  // Message should be instantiated for each S3Errors.
  const e = new errors.S3Error(message, { cause: headerInfo })
  // S3 Error code.
  e.code = code
  Object.entries(headerInfo).forEach(([key, value]) => {
    // @ts-expect-error force set error properties
    e[key] = value
  })

  throw e
}

/**
 * parse XML response for list objects v2 with metadata in a bucket
 */
export function parseListObjectsV2WithMetadata(xml: string) {
  const result: {
    objects: Array<BucketItemWithMetadata>
    isTruncated: boolean
    nextContinuationToken: string
  } = {
    objects: [],
    isTruncated: false,
    nextContinuationToken: '',
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

      let tags: Tags = {}
      if (content.UserTags != null) {
        toArray(content.UserTags.split('&')).forEach((tag) => {
          const [key, value] = tag.split('=')
          tags[key] = value
        })
      } else {
        tags = {}
      }

      let metadata
      if (content.UserMetadata != null) {
        metadata = toArray(content.UserMetadata)[0]
      } else {
        metadata = null
      }
      result.objects.push({ name, lastModified, etag, size, metadata, tags })
    })
  }

  if (xmlobj.CommonPrefixes) {
    toArray(xmlobj.CommonPrefixes).forEach((commonPrefix) => {
      result.objects.push({ prefix: sanitizeObjectKey(toArray(commonPrefix.Prefix)[0]), size: 0 })
    })
  }
  return result
}

export type UploadedPart = {
  part: number
  lastModified?: Date
  etag: string
  size: number
}

// parse XML response for list parts of an in progress multipart upload
export function parseListParts(xml: string): {
  isTruncated: boolean
  marker: number
  parts: UploadedPart[]
} {
  let xmlobj = parseXml(xml)
  const result: {
    isTruncated: boolean
    marker: number
    parts: UploadedPart[]
  } = {
    isTruncated: false,
    parts: [],
    marker: 0,
  }
  if (!xmlobj.ListPartsResult) {
    throw new errors.InvalidXMLError('Missing tag: "ListPartsResult"')
  }
  xmlobj = xmlobj.ListPartsResult
  if (xmlobj.IsTruncated) {
    result.isTruncated = xmlobj.IsTruncated
  }
  if (xmlobj.NextPartNumberMarker) {
    result.marker = toArray(xmlobj.NextPartNumberMarker)[0] || ''
  }
  if (xmlobj.Part) {
    toArray(xmlobj.Part).forEach((p) => {
      const part = parseInt(toArray(p.PartNumber)[0], 10)
      const lastModified = new Date(p.LastModified)
      const etag = p.ETag.replace(/^"/g, '')
        .replace(/"$/g, '')
        .replace(/^&quot;/g, '')
        .replace(/&quot;$/g, '')
        .replace(/^&#34;/g, '')
        .replace(/&#34;$/g, '')
      result.parts.push({ part, lastModified, etag, size: parseInt(p.Size, 10) })
    })
  }
  return result
}

export function parseListBucket(xml: string): BucketItemFromList[] {
  let result: BucketItemFromList[] = []
  const listBucketResultParser = new XMLParser({
    parseTagValue: true, // Enable parsing of values
    numberParseOptions: {
      leadingZeros: false, // Disable number parsing for values with leading zeros
      hex: false, // Disable hex number parsing - Invalid bucket name
      skipLike: /^[0-9]+$/, // Skip number parsing if the value consists entirely of digits
    },
    tagValueProcessor: (tagName, tagValue = '') => {
      // Ensure that the Name tag is always treated as a string
      if (tagName === 'Name') {
        return tagValue.toString()
      }
      return tagValue
    },
    ignoreAttributes: false, // Ensure that all attributes are parsed
  })

  const parsedXmlRes = listBucketResultParser.parse(xml)

  if (!parsedXmlRes.ListAllMyBucketsResult) {
    throw new errors.InvalidXMLError('Missing tag: "ListAllMyBucketsResult"')
  }

  const { ListAllMyBucketsResult: { Buckets = {} } = {} } = parsedXmlRes

  if (Buckets.Bucket) {
    result = toArray(Buckets.Bucket).map((bucket = {}) => {
      const { Name: bucketName, CreationDate } = bucket
      const creationDate = new Date(CreationDate)

      return { name: bucketName, creationDate }
    })
  }

  return result
}

export function parseInitiateMultipart(xml: string): string {
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

export function parseReplicationConfig(xml: string): ReplicationConfig {
  const xmlObj = parseXml(xml)
  const { Role, Rule } = xmlObj.ReplicationConfiguration
  return {
    ReplicationConfiguration: {
      role: Role,
      rules: toArray(Rule),
    },
  }
}

export function parseObjectLegalHoldConfig(xml: string) {
  const xmlObj = parseXml(xml)
  return xmlObj.LegalHold
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

type UploadID = string

export type ListMultipartResult = {
  uploads: {
    key: string
    uploadId: UploadID
    initiator?: { id: string; displayName: string }
    owner?: { id: string; displayName: string }
    storageClass: unknown
    initiated: Date
  }[]
  prefixes: {
    prefix: string
  }[]
  isTruncated: boolean
  nextKeyMarker: string
  nextUploadIdMarker: string
}

// parse XML response for listing in-progress multipart uploads
export function parseListMultipart(xml: string): ListMultipartResult {
  const result: ListMultipartResult = {
    prefixes: [],
    uploads: [],
    isTruncated: false,
    nextKeyMarker: '',
    nextUploadIdMarker: '',
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
      const uploadItem: ListMultipartResult['uploads'][number] = {
        key: upload.Key,
        uploadId: upload.UploadId,
        storageClass: upload.StorageClass,
        initiated: new Date(upload.Initiated),
      }
      if (upload.Initiator) {
        uploadItem.initiator = { id: upload.Initiator.ID, displayName: upload.Initiator.DisplayName }
      }
      if (upload.Owner) {
        uploadItem.owner = { id: upload.Owner.ID, displayName: upload.Owner.DisplayName }
      }
      result.uploads.push(uploadItem)
    })
  }
  return result
}

export function parseObjectLockConfig(xml: string): ObjectLockInfo {
  const xmlObj = parseXml(xml)
  let lockConfigResult = {} as ObjectLockInfo
  if (xmlObj.ObjectLockConfiguration) {
    lockConfigResult = {
      objectLockEnabled: xmlObj.ObjectLockConfiguration.ObjectLockEnabled,
    } as ObjectLockInfo
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
  }

  return lockConfigResult
}

export function parseBucketVersioningConfig(xml: string) {
  const xmlObj = parseXml(xml)
  return xmlObj.VersioningConfiguration
}

// Used only in selectObjectContent API.
// extractHeaderType extracts the first half of the header message, the header type.
function extractHeaderType(stream: stream.Readable): string | undefined {
  const headerNameLen = Buffer.from(stream.read(1)).readUInt8()
  const headerNameWithSeparator = Buffer.from(stream.read(headerNameLen)).toString()
  const splitBySeparator = (headerNameWithSeparator || '').split(':')
  return splitBySeparator.length >= 1 ? splitBySeparator[1] : ''
}

function extractHeaderValue(stream: stream.Readable) {
  const bodyLen = Buffer.from(stream.read(2)).readUInt16BE()
  return Buffer.from(stream.read(bodyLen)).toString()
}

export function parseSelectObjectContentResponse(res: Buffer) {
  const selectResults = new SelectResults({}) // will be returned

  const responseStream = readableStream(res) // convert byte array to a readable responseStream
  // @ts-ignore
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

    const headers: Record<string, unknown> = {}
    if (headerLength > 0) {
      const headerBytes = Buffer.from(responseStream.read(headerLength))
      msgCrcAccumulator = crc32(headerBytes, msgCrcAccumulator)
      const headerReaderStream = readableStream(headerBytes)
      // @ts-ignore
      while (headerReaderStream._readableState.length) {
        const headerTypeName = extractHeaderType(headerReaderStream)
        headerReaderStream.read(1) // just read and ignore it.
        if (headerTypeName) {
          headers[headerTypeName] = extractHeaderValue(headerReaderStream)
        }
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
            const readData = payloadStream?.read(payLoadLength)
            selectResults.setRecords(readData)
            break
          }

          case 'Progress':
            {
              switch (contentType) {
                case 'text/xml': {
                  const progressData = payloadStream?.read(payLoadLength)
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
                  const statsData = payloadStream?.read(payLoadLength)
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
        }
      }
    }
  }
}

export function parseLifecycleConfig(xml: string) {
  const xmlObj = parseXml(xml)
  return xmlObj.LifecycleConfiguration
}

export function parseBucketEncryptionConfig(xml: string) {
  return parseXml(xml)
}

export function parseObjectRetentionConfig(xml: string) {
  const xmlObj = parseXml(xml)
  const retentionConfig = xmlObj.Retention
  return {
    mode: retentionConfig.Mode,
    retainUntilDate: retentionConfig.RetainUntilDate,
  }
}

export function removeObjectsParser(xml: string) {
  const xmlObj = parseXml(xml)
  if (xmlObj.DeleteResult && xmlObj.DeleteResult.Error) {
    // return errors as array always. as the response is object in case of single object passed in removeObjects
    return toArray(xmlObj.DeleteResult.Error)
  }
  return []
}

// parse XML response for copy object
export function parseCopyObject(xml: string): CopyObjectResultV1 {
  const result: CopyObjectResultV1 = {
    etag: '',
    lastModified: '',
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

  return result
}

const formatObjInfo = (content: ObjectRowEntry, opts: { IsDeleteMarker?: boolean } = {}) => {
  const { Key, LastModified, ETag, Size, VersionId, IsLatest } = content

  if (!isObject(opts)) {
    opts = {}
  }

  const name = sanitizeObjectKey(toArray(Key)[0] || '')
  const lastModified = LastModified ? new Date(toArray(LastModified)[0] || '') : undefined
  const etag = sanitizeETag(toArray(ETag)[0] || '')
  const size = sanitizeSize(Size || '')

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
export function parseListObjects(xml: string) {
  const result: { objects: ObjectInfo[]; isTruncated?: boolean; nextMarker?: string; versionIdMarker?: string } = {
    objects: [],
    isTruncated: false,
    nextMarker: undefined,
    versionIdMarker: undefined,
  }
  let isTruncated = false
  let nextMarker, nextVersionKeyMarker
  const xmlobj = fxpWithoutNumParser.parse(xml)

  const parseCommonPrefixesEntity = (commonPrefixEntry: CommonPrefix[]) => {
    if (commonPrefixEntry) {
      toArray(commonPrefixEntry).forEach((commonPrefix) => {
        result.objects.push({ prefix: sanitizeObjectKey(toArray(commonPrefix.Prefix)[0] || ''), size: 0 })
      })
    }
  }

  const listBucketResult: ListBucketResultV1 = xmlobj.ListBucketResult
  const listVersionsResult: ListBucketResultV1 = xmlobj.ListVersionsResult

  if (listBucketResult) {
    if (listBucketResult.IsTruncated) {
      isTruncated = listBucketResult.IsTruncated
    }
    if (listBucketResult.Contents) {
      toArray(listBucketResult.Contents).forEach((content) => {
        const name = sanitizeObjectKey(toArray(content.Key)[0] || '')
        const lastModified = new Date(toArray(content.LastModified)[0] || '')
        const etag = sanitizeETag(toArray(content.ETag)[0] || '')
        const size = sanitizeSize(content.Size || '')
        result.objects.push({ name, lastModified, etag, size })
      })
    }

    if (listBucketResult.Marker) {
      nextMarker = listBucketResult.Marker
    } else if (isTruncated && result.objects.length > 0) {
      nextMarker = result.objects[result.objects.length - 1]?.name
    }
    if (listBucketResult.CommonPrefixes) {
      parseCommonPrefixesEntity(listBucketResult.CommonPrefixes)
    }
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
    if (listVersionsResult.CommonPrefixes) {
      parseCommonPrefixesEntity(listVersionsResult.CommonPrefixes)
    }
  }

  result.isTruncated = isTruncated
  if (isTruncated) {
    result.nextMarker = nextVersionKeyMarker || nextMarker
  }
  return result
}

export function uploadPartParser(xml: string) {
  const xmlObj = parseXml(xml)
  const respEl = xmlObj.CopyPartResult
  return respEl
}
