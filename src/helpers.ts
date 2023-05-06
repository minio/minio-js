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
import type { Encryption, ObjectMetaData, RequestHeaders, RequestHeaders } from './internal/type.ts'
import { RETENTION_MODES } from './internal/type.ts'

export { ENCRYPTION_TYPES, LEGAL_HOLD_STATUS, RETENTION_MODES, RETENTION_VALIDITY_UNITS } from './internal/type.ts'

export const DEFAULT_REGION = 'us-east-1'

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
  }: {
    Bucket: string
    Object: string
    VersionID?: string
    MatchETag?: string
    NoMatchETag?: string
    MatchModifiedSince?: string | null
    MatchUnmodifiedSince?: string | null
    MatchRange?: boolean
    Start?: number
    End?: number
    Encryption?: Encryption
  }) {
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

export class CopyDestinationOptions {
  public readonly Bucket: string
  public readonly Object: string
  private readonly Encryption?: Encryption
  private readonly UserMetadata?: ObjectMetaData
  private readonly UserTags?: Record<string, string> | string
  private readonly LegalHold?: 'on' | 'off'
  private readonly RetainUntilDate?: string
  private readonly Mode?: RETENTION_MODES

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
    UserMetadata?: ObjectMetaData
    UserTags?: Record<string, string> | string
    LegalHold?: 'on' | 'off'
    RetainUntilDate?: string
    Mode?: RETENTION_MODES
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

    if (this.Encryption) {
      const encryptionHeaders = getEncryptionHeaders(this.Encryption)
      for (const [key, value] of Object.entries(encryptionHeaders)) {
        if (value) {
          headerOptions[key] = value
        }
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
