import * as errors from './errors.ts'
import { isEmpty, isNumber, isValidBucketName, isValidObjectName } from './internal/helper.ts'
import type { Encryption, Header } from './internal/type.ts'

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
