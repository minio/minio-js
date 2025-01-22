import * as fs from 'node:fs'
import * as path from 'node:path'

import * as querystring from 'query-string'

import * as errors from './errors.ts'
import {
  getEncryptionHeaders,
  isEmpty,
  isEmptyObject,
  isNumber,
  isObject,
  isString,
  isValidBucketName,
  isValidObjectName,
} from './internal/helper.ts'
import type { Encryption, ObjectMetaData, RequestHeaders } from './internal/type.ts'
import { RETENTION_MODES } from './internal/type.ts'

export { ENCRYPTION_TYPES, LEGAL_HOLD_STATUS, RETENTION_MODES, RETENTION_VALIDITY_UNITS } from './internal/type.ts'

export const DEFAULT_REGION = 'us-east-1'

export const PRESIGN_EXPIRY_DAYS_MAX = 24 * 60 * 60 * 7 // 7 days in seconds

export interface ICopySourceOptions {
  Bucket: string
  Object: string
  /**
   * Valid versionId
   */
  VersionID?: string
  /**
   * Etag to match
   */
  MatchETag?: string
  /**
   * Etag to exclude
   */
  NoMatchETag?: string
  /**
   * Modified Date of the object/part.  UTC Date in string format
   */
  MatchModifiedSince?: string | null
  /**
   * Modified Date of the object/part to exclude UTC Date in string format
   */
  MatchUnmodifiedSince?: string | null
  /**
   * true or false Object range to match
   */
  MatchRange?: boolean
  Start?: number
  End?: number
  Encryption?: Encryption
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

  constructor({
    Bucket,
    Object,
    VersionID = '',
    MatchETag = '',
    NoMatchETag = '',
    MatchModifiedSince = null,
    MatchUnmodifiedSince = null,
    MatchRange = false,
    Start = 0,
    End = 0,
    Encryption = undefined,
  }: ICopySourceOptions) {
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
        'MatchRange is specified. But Invalid Start and End values are specified.',
      )
    }

    return true
  }

  getHeaders(): RequestHeaders {
    const headerOptions: RequestHeaders = {}
    headerOptions['x-amz-copy-source'] = encodeURI(this.Bucket + '/' + this.Object)

    if (!isEmpty(this.VersionID)) {
      headerOptions['x-amz-copy-source'] = `${encodeURI(this.Bucket + '/' + this.Object)}?versionId=${this.VersionID}`
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

/**
 * @deprecated use nodejs fs module
 */
export function removeDirAndFiles(dirPath: string, removeSelf = true) {
  if (removeSelf) {
    return fs.rmSync(dirPath, { recursive: true, force: true })
  }

  fs.readdirSync(dirPath).forEach((item) => {
    fs.rmSync(path.join(dirPath, item), { recursive: true, force: true })
  })
}

export interface ICopyDestinationOptions {
  /**
   * Bucket name
   */
  Bucket: string
  /**
   * Object Name for the destination (composed/copied) object defaults
   */
  Object: string
  /**
   * Encryption configuration defaults to {}
   * @default {}
   */
  Encryption?: Encryption
  UserMetadata?: ObjectMetaData
  /**
   * query-string encoded string or Record<string, string> Object
   */
  UserTags?: Record<string, string> | string
  LegalHold?: 'on' | 'off'
  /**
   * UTC Date String
   */
  RetainUntilDate?: string
  Mode?: RETENTION_MODES
  MetadataDirective?: 'COPY' | 'REPLACE'
  /**
   * Extra headers for the target object
   */
  Headers?: Record<string, string>
}

export class CopyDestinationOptions {
  public readonly Bucket: string
  public readonly Object: string
  private readonly Encryption?: Encryption
  private readonly UserMetadata?: ObjectMetaData
  private readonly UserTags?: Record<string, string> | string
  private readonly LegalHold?: 'on' | 'off'
  private readonly RetainUntilDate?: string
  private readonly Mode?: RETENTION_MODES
  private readonly MetadataDirective?: string
  private readonly Headers?: Record<string, string>

  constructor({
    Bucket,
    Object,
    Encryption,
    UserMetadata,
    UserTags,
    LegalHold,
    RetainUntilDate,
    Mode,
    MetadataDirective,
    Headers,
  }: ICopyDestinationOptions) {
    this.Bucket = Bucket
    this.Object = Object
    this.Encryption = Encryption ?? undefined // null input will become undefined, easy for runtime assert
    this.UserMetadata = UserMetadata
    this.UserTags = UserTags
    this.LegalHold = LegalHold
    this.Mode = Mode // retention mode
    this.RetainUntilDate = RetainUntilDate
    this.MetadataDirective = MetadataDirective
    this.Headers = Headers
  }

  getHeaders(): RequestHeaders {
    const replaceDirective = 'REPLACE'
    const headerOptions: RequestHeaders = {}

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

    if (this.MetadataDirective) {
      headerOptions[`X-Amz-Metadata-Directive`] = this.MetadataDirective
    }

    if (this.Encryption) {
      const encryptionHeaders = getEncryptionHeaders(this.Encryption)
      for (const [key, value] of Object.entries(encryptionHeaders)) {
        headerOptions[key] = value
      }
    }
    if (this.Headers) {
      for (const [key, value] of Object.entries(this.Headers)) {
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
