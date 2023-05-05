import * as fs from 'node:fs'
import * as path from 'node:path'

import querystring from 'query-string'

import * as errors from './errors.ts'
import {
  getEncryptionHeaders,
  isEmpty,
  isEmptyObject,
  isObject,
  isString,
  isValidBucketName,
  isValidObjectName,
} from './internal/helper.ts'
import type { Encryption, MetaData } from './internal/type.ts'
import { RETENTION_MODES } from './internal/type.ts'

export { CopySourceOptions } from './copy-source-options.ts'
export { ENCRYPTION_TYPES, LEGAL_HOLD_STATUS, RETENTION_MODES, RETENTION_VALIDITY_UNITS } from './internal/type.ts'
export { SelectResults } from './select-results.ts'

export const DEFAULT_REGION = 'us-east-1'

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
  private readonly UserMetadata?: MetaData
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
    UserMetadata?: MetaData
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
