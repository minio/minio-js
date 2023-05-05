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
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as stream from 'node:stream'

import { isBrowser } from 'browser-or-node'
import { XMLParser } from 'fast-xml-parser'
import ipaddr from 'ipaddr.js'
import _ from 'lodash'
import mime from 'mime-types'
import querystring from 'query-string'

import * as errors from './errors.ts'
import type { Binary, Header, MetaData, Mode, ResponseHeader } from './type.ts'

/**
 * All characters in string which are NOT unreserved should be percent encoded.
 * Unreserved characters are : ALPHA / DIGIT / "-" / "." / "_" / "~"
 * Reference https://tools.ietf.org/html/rfc3986#section-2.2
 */
export function uriEscape(string: string) {
  return string.split('').reduce((acc: string, elem: string) => {
    const buf = Buffer.from(elem)
    if (buf.length === 1) {
      // length 1 indicates that elem is not a unicode character.
      // Check if it is an unreserved characer.
      if (
        ('A' <= elem && elem <= 'Z') ||
        ('a' <= elem && elem <= 'z') ||
        ('0' <= elem && elem <= '9') ||
        elem === '_' ||
        elem === '.' ||
        elem === '~' ||
        elem === '-'
      ) {
        // Unreserved characer should not be encoded.
        acc = acc + elem
        return acc
      }
    }
    // elem needs encoding - i.e elem should be encoded if it's not unreserved
    // character or if it's a unicode character.
    for (const char of buf) {
      acc = acc + '%' + char.toString(16).toUpperCase()
    }
    return acc
  }, '')
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
  const alphaNumerics = '`~!@#$%^&*()+={}[]|\\"\';:><?/'.split('')
  // All non alphanumeric characters are invalid.
  for (const char of alphaNumerics) {
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
  // verify if port is a number.
  if (!isNumber(port)) {
    return false
  }

  // port `0` is valid and special case
  return 0 <= port && port <= 65535
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
export function pipesetup(...streams: [stream.Writable, ...stream.Duplex[], stream.Readable]) {
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
export function insertContentType(metaData: MetaData, filePath: string) {
  // check if content-type attribute present in metaData
  for (const key in metaData) {
    if (key.toLowerCase() === 'content-type') {
      return metaData
    }
  }
  // if `content-type` attribute is not present in metadata,
  // then infer it from the extension in filePath
  const newMetadata = Object.assign({}, metaData)
  newMetadata['content-type'] = probeContentType(filePath)
  return newMetadata
}

/**
 * Function prepends metadata with the appropriate prefix if it is not already on
 */
export function prependXAMZMeta(metaData?: MetaData) {
  if (!metaData) {
    return {}
  }

  const newMetadata = Object.assign({}, metaData)
  for (const [key, value] of _.entries(metaData)) {
    if (!isAmzHeader(key) && !isSupportedHeader(key) && !isStorageClassHeader(key)) {
      newMetadata['X-Amz-Meta-' + key] = value
      delete newMetadata[key]
    }
  }
  return newMetadata
}

/**
 * Checks if it is a valid header according to the AmazonS3 API
 */
export function isAmzHeader(key: string) {
  const temp = key.toLowerCase()
  return (
    temp.startsWith('x-amz-meta-') ||
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
  const newMetadata: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (isSupportedHeader(key) || isStorageClassHeader(key) || isAmzHeader(key)) {
      if (key.toLowerCase().startsWith('x-amz-meta-')) {
        newMetadata[key.slice(11, key.length)] = value
      } else {
        newMetadata[key] = value
      }
    }
  }
  return newMetadata
}

export function getVersionId(headers: ResponseHeader = {}) {
  const versionIdValue = headers['x-amz-version-id'] as string
  return versionIdValue || null
}

export function getSourceVersionId(headers: ResponseHeader = {}) {
  const sourceVersionId = headers['x-amz-copy-source-version-id']
  return sourceVersionId || null
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

export const RETENTION_MODES = {
  GOVERNANCE: 'GOVERNANCE',
  COMPLIANCE: 'COMPLIANCE',
} as const

export const RETENTION_VALIDITY_UNITS = {
  DAYS: 'Days',
  YEARS: 'Years',
} as const

export const LEGAL_HOLD_STATUS = {
  ENABLED: 'ON',
  DISABLED: 'OFF',
} as const

function objectToBuffer(payload: Binary): Buffer {
  // don't know how to write this...
  return Buffer.from(payload)
}

export function toMd5(payload: Binary): string {
  let payLoadBuf: Binary = objectToBuffer(payload)
  // use string from browser and buffer from nodejs
  // browser support is tested only against minio server
  payLoadBuf = isBrowser ? payLoadBuf.toString() : payLoadBuf
  return crypto.createHash('md5').update(payLoadBuf).digest().toString('base64')
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

export const ENCRYPTION_TYPES = {
  // SSEC represents server-side-encryption with customer provided keys
  SSEC: 'SSE-C',
  // KMS represents server-side-encryption with managed keys
  KMS: 'KMS',
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
function getEncryptionHeaders(encConfig: Encryption): Record<string, string> {
  const encType = encConfig.type
  const encHeaders = {}
  if (!isEmpty(encType)) {
    if (encType === ENCRYPTION_TYPES.SSEC) {
      return {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        [encHeaders[ENCRYPTION_HEADERS.sseGenericHeader]]: 'AES256',
      }
    } else if (encType === ENCRYPTION_TYPES.KMS) {
      return {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        [ENCRYPTION_HEADERS.sseGenericHeader]: encConfig.SSEAlgorithm,
        [ENCRYPTION_HEADERS.sseKmsKeyID]: encConfig.KMSMasterKeyID,
      }
    }
  }

  return encHeaders
}

export class CopySourceOptions {
  public readonly Bucket: string
  public readonly Object: string
  public readonly VersionID: string
  public MatchETag: string
  private readonly NoMatchETag: string
  private readonly MatchModifiedSince: string | null
  private readonly MatchUnmodifiedSince: string | null
  public readonly MatchRange: boolean
  public readonly Start: number
  public readonly End: number
  private readonly Encryption?: Encryption

  /**
   *
   * @param Bucket - Bucket Name
   * @param Object - Object Name
   * @param VersionID - Valid versionId
   * @param MatchETag - Etag to match
   * @param NoMatchETag - Etag to exclude
   * @param MatchModifiedSince - Modified Date of the object/part.  UTC Date in string format
   * @param MatchUnmodifiedSince - Modified Date of the object/part to exclude UTC Date in string format
   * @param MatchRange - true or false Object range to match
   * @param Start
   * @param End
   * @param Encryption
   */
  constructor({
    Bucket = '',
    Object = '',
    VersionID = '',
    MatchETag = '',
    NoMatchETag = '',
    MatchModifiedSince = null,
    MatchUnmodifiedSince = null,
    MatchRange = false,
    Start = 0,
    End = 0,
    Encryption = undefined,
  }: {
    Bucket?: string
    Object?: string
    VersionID?: string
    MatchETag?: string
    NoMatchETag?: string
    MatchModifiedSince?: string | null
    MatchUnmodifiedSince?: string | null
    MatchRange?: boolean
    Start?: number
    End?: number
    Encryption?: Encryption
  } = {}) {
    this.Bucket = Bucket
    this.Object = Object
    this.VersionID = VersionID
    this.MatchETag = MatchETag
    this.NoMatchETag = NoMatchETag
    this.MatchModifiedSince = MatchModifiedSince
    this.MatchUnmodifiedSince = MatchUnmodifiedSince
    this.MatchRange = MatchRange
    this.Start = Start
    this.End = End
    this.Encryption = Encryption
  }

  validate() {
    if (!isValidBucketName(this.Bucket)) {
      throw new errors.InvalidBucketNameError('Invalid Source bucket name: ' + this.Bucket)
    }
    if (!isValidObjectName(this.Object)) {
      throw new errors.InvalidObjectNameError(`Invalid Source object name: ${this.Object}`)
    }
    if ((this.MatchRange && this.Start !== -1 && this.End !== -1 && this.Start > this.End) || this.Start < 0) {
      throw new errors.InvalidObjectNameError('Source start must be non-negative, and start must be at most end.')
    } else if ((this.MatchRange && !isNumber(this.Start)) || !isNumber(this.End)) {
      throw new errors.InvalidObjectNameError(
        'MatchRange is specified. But  Invalid Start and End values are specified. ',
      )
    }

    return true
  }

  getHeaders() {
    const headerOptions: Header = {}
    headerOptions['x-amz-copy-source'] = encodeURI(this.Bucket + '/' + this.Object)

    if (!isEmpty(this.VersionID)) {
      headerOptions['x-amz-copy-source'] = encodeURI(this.Bucket + '/' + this.Object) + '?versionId=' + this.VersionID
    }

    if (!isEmpty(this.MatchETag)) {
      headerOptions['x-amz-copy-source-if-match'] = this.MatchETag
    }
    if (!isEmpty(this.NoMatchETag)) {
      headerOptions['x-amz-copy-source-if-none-match'] = this.NoMatchETag
    }

    if (!isEmpty(this.MatchModifiedSince)) {
      headerOptions['x-amz-copy-source-if-modified-since'] = this.MatchModifiedSince
    }
    if (!isEmpty(this.MatchUnmodifiedSince)) {
      headerOptions['x-amz-copy-source-if-unmodified-since'] = this.MatchUnmodifiedSince
    }

    return headerOptions
  }
}

export type Encryption = {
  type: string
  SSEAlgorithm?: string
  KMSMasterKeyID?: string
}

export class CopyDestinationOptions {
  public readonly Bucket: string
  public readonly Object: string
  private readonly Encryption?: Encryption
  private readonly UserMetadata?: MetaData
  private readonly UserTags?: Record<string, string> | string
  private readonly LegalHold?: 'on' | 'off'
  private readonly RetainUntilDate?: string
  private readonly Mode?: Mode

  /**
   * @param Bucket - Bucket name
   * @param Object - Object Name for the destination (composed/copied) object defaults
   * @param Encryption - Encryption configuration defaults to {}
   * @param UserMetadata -
   * @param UserTags - query-string escaped string or Record<string, string>
   * @param LegalHold -
   * @param RetainUntilDate - UTC Date String
   * @param Mode
   */
  constructor({
    Bucket,
    Object,
    Encryption,
    UserMetadata,
    UserTags,
    LegalHold,
    RetainUntilDate,
    Mode,
  }: {
    Bucket: string
    Object: string
    Encryption?: Encryption
    UserMetadata?: MetaData
    UserTags?: Record<string, string> | string
    LegalHold?: 'on' | 'off'
    RetainUntilDate?: string
    Mode?: Mode
  }) {
    this.Bucket = Bucket
    this.Object = Object
    this.Encryption = Encryption ?? undefined // null input will become undefined, easy for runtime assert
    this.UserMetadata = UserMetadata
    this.UserTags = UserTags
    this.LegalHold = LegalHold
    this.Mode = Mode // retention mode
    this.RetainUntilDate = RetainUntilDate
  }

  getHeaders(): Record<string, string> {
    const replaceDirective = 'REPLACE'
    const headerOptions: Record<string, string> = {}

    const userTags = this.UserTags
    if (!isEmpty(userTags)) {
      headerOptions['X-Amz-Tagging-Directive'] = replaceDirective
      headerOptions['X-Amz-Tagging'] = isObject(userTags)
        ? querystring.stringify(userTags)
        : isString(userTags)
        ? userTags
        : ''
    }

    if (this.Mode) {
      headerOptions['X-Amz-Object-Lock-Mode'] = this.Mode // GOVERNANCE or COMPLIANCE
    }

    if (this.RetainUntilDate) {
      headerOptions['X-Amz-Object-Lock-Retain-Until-Date'] = this.RetainUntilDate // needs to be UTC.
    }

    if (this.LegalHold) {
      headerOptions['X-Amz-Object-Lock-Legal-Hold'] = this.LegalHold // ON or OFF
    }

    if (this.UserMetadata) {
      for (const [key, value] of Object.entries(this.UserMetadata)) {
        headerOptions[`X-Amz-Meta-${key}`] = value.toString()
      }
    }

    if (this.Encryption) {
      const encryptionHeaders = getEncryptionHeaders(this.Encryption)
      for (const [key, value] of Object.entries(encryptionHeaders)) {
        headerOptions[key] = value
      }
    }
    return headerOptions
  }

  validate() {
    if (!isValidBucketName(this.Bucket)) {
      throw new errors.InvalidBucketNameError('Invalid Destination bucket name: ' + this.Bucket)
    }
    if (!isValidObjectName(this.Object)) {
      throw new errors.InvalidObjectNameError(`Invalid Destination object name: ${this.Object}`)
    }
    if (!isEmpty(this.UserMetadata) && !isObject(this.UserMetadata)) {
      throw new errors.InvalidObjectNameError(`Destination UserMetadata should be an object with key value pairs`)
    }

    if (!isEmpty(this.Mode) && ![RETENTION_MODES.GOVERNANCE, RETENTION_MODES.COMPLIANCE].includes(this.Mode)) {
      throw new errors.InvalidObjectNameError(
        `Invalid Mode specified for destination object it should be one of [GOVERNANCE,COMPLIANCE]`,
      )
    }

    if (this.Encryption !== undefined && isEmptyObject(this.Encryption)) {
      throw new errors.InvalidObjectNameError(`Invalid Encryption configuration for destination object `)
    }
    return true
  }
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
export function calculateEvenSplits(size: number, objInfo: { Start?: number; Bucket: string; Object: string }) {
  if (size === 0) {
    return null
  }
  const reqParts = partsRequired(size)
  const startIndexParts = new Array(reqParts)
  const endIndexParts = new Array(reqParts)

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

    startIndexParts[i] = currentStart
    endIndexParts[i] = currentEnd
  }

  return { startIndex: startIndexParts, endIndex: endIndexParts, objInfo: objInfo }
}

export function removeDirAndFiles(dirPath: string, removeSelf = true) {
  let files
  try {
    files = fs.readdirSync(dirPath)
  } catch (e) {
    return
  }

  for (const item of files) {
    const filePath = path.join(dirPath, item)
    if (fs.statSync(filePath).isFile()) {
      fs.unlinkSync(filePath)
    } else {
      removeDirAndFiles(filePath, true)
    }
  }

  if (removeSelf) {
    fs.rmdirSync(dirPath)
  }
}

const fxp = new XMLParser()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseXml(xml: string): any {
  let result = fxp.parse(xml)
  if (result.Error) {
    throw result.Error
  }

  return result
}

/**
 * maybe this should be a generic type for Records, leave it for later refactor
 */
export class SelectResults {
  private records?: unknown
  private response?: unknown
  private stats?: string
  private progress?: unknown

  constructor({
    records, // parsed data as stream
    response, // original response stream
    stats, // stats as xml
    progress, // stats as xml
  }: {
    records?: unknown
    response?: unknown
    stats?: string
    progress?: unknown
  }) {
    this.records = records
    this.response = response
    this.stats = stats
    this.progress = progress
  }

  setStats(stats: string) {
    this.stats = stats
  }

  getStats() {
    return this.stats
  }

  setProgress(progress: unknown) {
    this.progress = progress
  }

  getProgress() {
    return this.progress
  }

  setResponse(response: unknown) {
    this.response = response
  }

  getResponse() {
    return this.response
  }

  setRecords(records: unknown) {
    this.records = records
  }

  getRecords(): unknown {
    return this.records
  }
}

export const DEFAULT_REGION = 'us-east-1'
