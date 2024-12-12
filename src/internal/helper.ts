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

import * as crypto from 'node:crypto'
import * as stream from 'node:stream'

import { XMLParser } from 'fast-xml-parser'
import ipaddr from 'ipaddr.js'
import _ from 'lodash'
import * as mime from 'mime-types'

import { fsp, fstat } from './async.ts'
import type { Binary, Encryption, ObjectMetaData, RequestHeaders, ResponseHeader } from './type.ts'
import { ENCRYPTION_TYPES } from './type.ts'

const MetaDataHeaderPrefix = 'x-amz-meta-'

export function hashBinary(buf: Buffer, enableSHA256: boolean) {
  let sha256sum = ''
  if (enableSHA256) {
    sha256sum = crypto.createHash('sha256').update(buf).digest('hex')
  }
  const md5sum = crypto.createHash('md5').update(buf).digest('base64')

  return { md5sum, sha256sum }
}

// S3 percent-encodes some extra non-standard characters in a URI . So comply with S3.
const encodeAsHex = (c: string) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
export function uriEscape(uriStr: string): string {
  return encodeURIComponent(uriStr).replace(/[!'()*]/g, encodeAsHex)
}

export function uriResourceEscape(string: string) {
  return uriEscape(string).replace(/%2F/g, '/')
}

export function getScope(region: string, date: Date, serviceName = 's3') {
  return `${makeDateShort(date)}/${region}/${serviceName}/aws4_request`
}

/**
 * isAmazonEndpoint - true if endpoint is 's3.amazonaws.com' or 's3.cn-north-1.amazonaws.com.cn'
 */
export function isAmazonEndpoint(endpoint: string) {
  return endpoint === 's3.amazonaws.com' || endpoint === 's3.cn-north-1.amazonaws.com.cn'
}

/**
 * isVirtualHostStyle - verify if bucket name is support with virtual
 * hosts. bucketNames with periods should be always treated as path
 * style if the protocol is 'https:', this is due to SSL wildcard
 * limitation. For all other buckets and Amazon S3 endpoint we will
 * default to virtual host style.
 */
export function isVirtualHostStyle(endpoint: string, protocol: string, bucket: string, pathStyle: boolean) {
  if (protocol === 'https:' && bucket.includes('.')) {
    return false
  }
  return isAmazonEndpoint(endpoint) || !pathStyle
}

export function isValidIP(ip: string) {
  return ipaddr.isValid(ip)
}

/**
 * @returns if endpoint is valid domain.
 */
export function isValidEndpoint(endpoint: string) {
  return isValidDomain(endpoint) || isValidIP(endpoint)
}

/**
 * @returns if input host is a valid domain.
 */
export function isValidDomain(host: string) {
  if (!isString(host)) {
    return false
  }
  // See RFC 1035, RFC 3696.
  if (host.length === 0 || host.length > 255) {
    return false
  }
  // Host cannot start or end with a '-'
  if (host[0] === '-' || host.slice(-1) === '-') {
    return false
  }
  // Host cannot start or end with a '_'
  if (host[0] === '_' || host.slice(-1) === '_') {
    return false
  }
  // Host cannot start with a '.'
  if (host[0] === '.') {
    return false
  }

  const nonAlphaNumerics = '`~!@#$%^&*()+={}[]|\\"\';:><?/'
  // All non alphanumeric characters are invalid.
  for (const char of nonAlphaNumerics) {
    if (host.includes(char)) {
      return false
    }
  }
  // No need to regexp match, since the list is non-exhaustive.
  // We let it be valid and fail later.
  return true
}

/**
 * Probes contentType using file extensions.
 *
 * @example
 * ```
 * // return 'image/png'
 * probeContentType('file.png')
 * ```
 */
export function probeContentType(path: string) {
  let contentType = mime.lookup(path)
  if (!contentType) {
    contentType = 'application/octet-stream'
  }
  return contentType
}

/**
 * is input port valid.
 */
export function isValidPort(port: unknown): port is number {
  // Convert string port to number if needed
  const portNum = typeof port === 'string' ? parseInt(port, 10) : port

  // verify if port is a valid number
  if (!isNumber(portNum) || isNaN(portNum)) {
    return false
  }

  // port `0` is valid and special case
  return 0 <= portNum && portNum <= 65535
}

export function isValidBucketName(bucket: unknown) {
  if (!isString(bucket)) {
    return false
  }

  // bucket length should be less than and no more than 63
  // characters long.
  if (bucket.length < 3 || bucket.length > 63) {
    return false
  }
  // bucket with successive periods is invalid.
  if (bucket.includes('..')) {
    return false
  }
  // bucket cannot have ip address style.
  if (/[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/.test(bucket)) {
    return false
  }
  // bucket should begin with alphabet/number and end with alphabet/number,
  // with alphabet/number/.- in the middle.
  if (/^[a-z0-9][a-z0-9.-]+[a-z0-9]$/.test(bucket)) {
    return true
  }
  return false
}

/**
 * check if objectName is a valid object name
 */
export function isValidObjectName(objectName: unknown) {
  if (!isValidPrefix(objectName)) {
    return false
  }

  return objectName.length !== 0
}

/**
 * check if prefix is valid
 */
export function isValidPrefix(prefix: unknown): prefix is string {
  if (!isString(prefix)) {
    return false
  }
  if (prefix.length > 1024) {
    return false
  }
  return true
}

/**
 * check if typeof arg number
 */
export function isNumber(arg: unknown): arg is number {
  return typeof arg === 'number'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyFunction = (...args: any[]) => any

/**
 * check if typeof arg function
 */
export function isFunction(arg: unknown): arg is AnyFunction {
  return typeof arg === 'function'
}

/**
 * check if typeof arg string
 */
export function isString(arg: unknown): arg is string {
  return typeof arg === 'string'
}

/**
 * check if typeof arg object
 */
export function isObject(arg: unknown): arg is object {
  return typeof arg === 'object' && arg !== null
}

/**
 * check if object is readable stream
 */
export function isReadableStream(arg: unknown): arg is stream.Readable {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  return isObject(arg) && isFunction((arg as stream.Readable)._read)
}

/**
 * check if arg is boolean
 */
export function isBoolean(arg: unknown): arg is boolean {
  return typeof arg === 'boolean'
}

export function isEmpty(o: unknown): o is null | undefined {
  return _.isEmpty(o)
}

export function isEmptyObject(o: Record<string, unknown>): boolean {
  return Object.values(o).filter((x) => x !== undefined).length !== 0
}

export function isDefined<T>(o: T): o is Exclude<T, null | undefined> {
  return o !== null && o !== undefined
}

/**
 * check if arg is a valid date
 */
export function isValidDate(arg: unknown): arg is Date {
  // @ts-expect-error checknew Date(Math.NaN)
  return arg instanceof Date && !isNaN(arg)
}

/**
 * Create a Date string with format: 'YYYYMMDDTHHmmss' + Z
 */
export function makeDateLong(date?: Date): string {
  date = date || new Date()

  // Gives format like: '2017-08-07T16:28:59.889Z'
  const s = date.toISOString()

  return s.slice(0, 4) + s.slice(5, 7) + s.slice(8, 13) + s.slice(14, 16) + s.slice(17, 19) + 'Z'
}

/**
 * Create a Date string with format: 'YYYYMMDD'
 */
export function makeDateShort(date?: Date) {
  date = date || new Date()

  // Gives format like: '2017-08-07T16:28:59.889Z'
  const s = date.toISOString()

  return s.slice(0, 4) + s.slice(5, 7) + s.slice(8, 10)
}

/**
 * pipesetup sets up pipe() from left to right os streams array
 * pipesetup will also make sure that error emitted at any of the upstream Stream
 * will be emitted at the last stream. This makes error handling simple
 */
export function pipesetup(...streams: [stream.Readable, ...stream.Duplex[], stream.Writable]) {
  // @ts-expect-error ts can't narrow this
  return streams.reduce((src: stream.Readable, dst: stream.Writable) => {
    src.on('error', (err) => dst.emit('error', err))
    return src.pipe(dst)
  })
}

/**
 * return a Readable stream that emits data
 */
export function readableStream(data: unknown): stream.Readable {
  const s = new stream.Readable()
  s._read = () => {}
  s.push(data)
  s.push(null)
  return s
}

/**
 * Process metadata to insert appropriate value to `content-type` attribute
 */
export function insertContentType(metaData: ObjectMetaData, filePath: string): ObjectMetaData {
  // check if content-type attribute present in metaData
  for (const key in metaData) {
    if (key.toLowerCase() === 'content-type') {
      return metaData
    }
  }

  // if `content-type` attribute is not present in metadata, then infer it from the extension in filePath
  return {
    ...metaData,
    'content-type': probeContentType(filePath),
  }
}

/**
 * Function prepends metadata with the appropriate prefix if it is not already on
 */
export function prependXAMZMeta(metaData?: ObjectMetaData): RequestHeaders {
  if (!metaData) {
    return {}
  }

  return _.mapKeys(metaData, (value, key) => {
    if (isAmzHeader(key) || isSupportedHeader(key) || isStorageClassHeader(key)) {
      return key
    }

    return MetaDataHeaderPrefix + key
  })
}

/**
 * Checks if it is a valid header according to the AmazonS3 API
 */
export function isAmzHeader(key: string) {
  const temp = key.toLowerCase()
  return (
    temp.startsWith(MetaDataHeaderPrefix) ||
    temp === 'x-amz-acl' ||
    temp.startsWith('x-amz-server-side-encryption-') ||
    temp === 'x-amz-server-side-encryption'
  )
}

/**
 * Checks if it is a supported Header
 */
export function isSupportedHeader(key: string) {
  const supported_headers = [
    'content-type',
    'cache-control',
    'content-encoding',
    'content-disposition',
    'content-language',
    'x-amz-website-redirect-location',
    'if-none-match',
    'if-match',
  ]
  return supported_headers.includes(key.toLowerCase())
}

/**
 * Checks if it is a storage header
 */
export function isStorageClassHeader(key: string) {
  return key.toLowerCase() === 'x-amz-storage-class'
}

export function extractMetadata(headers: ResponseHeader) {
  return _.mapKeys(
    _.pickBy(headers, (value, key) => isSupportedHeader(key) || isStorageClassHeader(key) || isAmzHeader(key)),
    (value, key) => {
      const lower = key.toLowerCase()
      if (lower.startsWith(MetaDataHeaderPrefix)) {
        return lower.slice(MetaDataHeaderPrefix.length)
      }

      return key
    },
  )
}

export function getVersionId(headers: ResponseHeader = {}) {
  return headers['x-amz-version-id'] || null
}

export function getSourceVersionId(headers: ResponseHeader = {}) {
  return headers['x-amz-copy-source-version-id'] || null
}

export function sanitizeETag(etag = ''): string {
  const replaceChars: Record<string, string> = {
    '"': '',
    '&quot;': '',
    '&#34;': '',
    '&QUOT;': '',
    '&#x00022': '',
  }
  return etag.replace(/^("|&quot;|&#34;)|("|&quot;|&#34;)$/g, (m) => replaceChars[m] as string)
}

export function toMd5(payload: Binary): string {
  // use string from browser and buffer from nodejs
  // browser support is tested only against minio server
  return crypto.createHash('md5').update(Buffer.from(payload)).digest().toString('base64')
}

export function toSha256(payload: Binary): string {
  return crypto.createHash('sha256').update(payload).digest('hex')
}

/**
 * toArray returns a single element array with param being the element,
 * if param is just a string, and returns 'param' back if it is an array
 * So, it makes sure param is always an array
 */
export function toArray<T = unknown>(param: T | T[]): Array<T> {
  if (!Array.isArray(param)) {
    return [param] as T[]
  }
  return param
}

export function sanitizeObjectKey(objectName: string): string {
  // + symbol characters are not decoded as spaces in JS. so replace them first and decode to get the correct result.
  const asStrName = (objectName ? objectName.toString() : '').replace(/\+/g, ' ')
  return decodeURIComponent(asStrName)
}

export function sanitizeSize(size?: string): number | undefined {
  return size ? Number.parseInt(size) : undefined
}

export const PART_CONSTRAINTS = {
  // absMinPartSize - absolute minimum part size (5 MiB)
  ABS_MIN_PART_SIZE: 1024 * 1024 * 5,
  // MIN_PART_SIZE - minimum part size 16MiB per object after which
  MIN_PART_SIZE: 1024 * 1024 * 16,
  // MAX_PARTS_COUNT - maximum number of parts for a single multipart session.
  MAX_PARTS_COUNT: 10000,
  // MAX_PART_SIZE - maximum part size 5GiB for a single multipart upload
  // operation.
  MAX_PART_SIZE: 1024 * 1024 * 1024 * 5,
  // MAX_SINGLE_PUT_OBJECT_SIZE - maximum size 5GiB of object per PUT
  // operation.
  MAX_SINGLE_PUT_OBJECT_SIZE: 1024 * 1024 * 1024 * 5,
  // MAX_MULTIPART_PUT_OBJECT_SIZE - maximum size 5TiB of object for
  // Multipart operation.
  MAX_MULTIPART_PUT_OBJECT_SIZE: 1024 * 1024 * 1024 * 1024 * 5,
}

const GENERIC_SSE_HEADER = 'X-Amz-Server-Side-Encryption'

const ENCRYPTION_HEADERS = {
  // sseGenericHeader is the AWS SSE header used for SSE-S3 and SSE-KMS.
  sseGenericHeader: GENERIC_SSE_HEADER,
  // sseKmsKeyID is the AWS SSE-KMS key id.
  sseKmsKeyID: GENERIC_SSE_HEADER + '-Aws-Kms-Key-Id',
} as const

/**
 * Return Encryption headers
 * @param encConfig
 * @returns an object with key value pairs that can be used in headers.
 */
export function getEncryptionHeaders(encConfig: Encryption): RequestHeaders {
  const encType = encConfig.type

  if (!isEmpty(encType)) {
    if (encType === ENCRYPTION_TYPES.SSEC) {
      return {
        [ENCRYPTION_HEADERS.sseGenericHeader]: 'AES256',
      }
    } else if (encType === ENCRYPTION_TYPES.KMS) {
      return {
        [ENCRYPTION_HEADERS.sseGenericHeader]: encConfig.SSEAlgorithm,
        [ENCRYPTION_HEADERS.sseKmsKeyID]: encConfig.KMSMasterKeyID,
      }
    }
  }

  return {}
}

export function partsRequired(size: number): number {
  const maxPartSize = PART_CONSTRAINTS.MAX_MULTIPART_PUT_OBJECT_SIZE / (PART_CONSTRAINTS.MAX_PARTS_COUNT - 1)
  let requiredPartSize = size / maxPartSize
  if (size % maxPartSize > 0) {
    requiredPartSize++
  }
  requiredPartSize = Math.trunc(requiredPartSize)
  return requiredPartSize
}

/**
 * calculateEvenSplits - computes splits for a source and returns
 * start and end index slices. Splits happen evenly to be sure that no
 * part is less than 5MiB, as that could fail the multipart request if
 * it is not the last part.
 */
export function calculateEvenSplits<T extends { Start?: number }>(
  size: number,
  objInfo: T,
): {
  startIndex: number[]
  objInfo: T
  endIndex: number[]
} | null {
  if (size === 0) {
    return null
  }
  const reqParts = partsRequired(size)
  const startIndexParts: number[] = []
  const endIndexParts: number[] = []

  let start = objInfo.Start
  if (isEmpty(start) || start === -1) {
    start = 0
  }
  const divisorValue = Math.trunc(size / reqParts)

  const reminderValue = size % reqParts

  let nextStart = start

  for (let i = 0; i < reqParts; i++) {
    let curPartSize = divisorValue
    if (i < reminderValue) {
      curPartSize++
    }

    const currentStart = nextStart
    const currentEnd = currentStart + curPartSize - 1
    nextStart = currentEnd + 1

    startIndexParts.push(currentStart)
    endIndexParts.push(currentEnd)
  }

  return { startIndex: startIndexParts, endIndex: endIndexParts, objInfo: objInfo }
}

const fxp = new XMLParser()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseXml(xml: string): any {
  const result = fxp.parse(xml)
  if (result.Error) {
    throw result.Error
  }

  return result
}

/**
 * get content size of object content to upload
 */
export async function getContentLength(s: stream.Readable | Buffer | string): Promise<number | null> {
  // use length property of string | Buffer
  if (typeof s === 'string' || Buffer.isBuffer(s)) {
    return s.length
  }

  // property of `fs.ReadStream`
  const filePath = (s as unknown as Record<string, unknown>).path as string | undefined
  if (filePath && typeof filePath === 'string') {
    const stat = await fsp.lstat(filePath)
    return stat.size
  }

  // property of `fs.ReadStream`
  const fd = (s as unknown as Record<string, unknown>).fd as number | null | undefined
  if (fd && typeof fd === 'number') {
    const stat = await fstat(fd)
    return stat.size
  }

  return null
}
