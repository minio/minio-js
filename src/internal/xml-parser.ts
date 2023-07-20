import type * as http from 'node:http'

import { XMLParser } from 'fast-xml-parser'

import * as errors from '../errors.ts'
import { parseXml, sanitizeETag, sanitizeObjectKey, toArray } from './helper.ts'
import { readAsString } from './response.ts'
import type { BucketItemFromList, BucketItemWithMetadata, ReplicationConfig } from './type.ts'

// parse XML response for bucket region
export function parseBucketRegion(xml: string): string {
  // return region information
  return parseXml(xml).LocationConstraint
}

const fxp = new XMLParser()

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
export async function parseResponseError(response: http.IncomingMessage) {
  const statusCode = response.statusCode
  let code: string, message: string
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
  } else {
    code = 'UnknownError'
    message = `${statusCode}`
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

export type Multipart = {
  uploads: Array<{
    key: string
    uploadId: string
    initiator: unknown
    owner: unknown
    storageClass: unknown
    initiated: unknown
  }>
  prefixes: { prefix: string }[]
  isTruncated: boolean
  nextKeyMarker: undefined
  nextUploadIdMarker: undefined
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
  const result: { isTruncated: boolean; marker: number; parts: UploadedPart[] } = {
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

export function parseListBucket(xml: string) {
  let result: BucketItemFromList[] = []
  const parsedXmlRes = parseXml(xml)

  if (!parsedXmlRes.ListAllMyBucketsResult) {
    throw new errors.InvalidXMLError('Missing tag: "ListAllMyBucketsResult"')
  }
  const { ListAllMyBucketsResult: { Buckets = {} } = {} } = parsedXmlRes

  if (Buckets.Bucket) {
    result = toArray(Buckets.Bucket).map((bucket = {}) => {
      const { Name: bucketName, CreationDate } = bucket
      const creationDate = new Date(CreationDate)

      return { name: bucketName, creationDate: creationDate }
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
