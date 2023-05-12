export class CopyConditions {
  public modified = ''
  public unmodified = ''
  public matchETag = ''
  public matchETagExcept = ''

  setModified(date: Date): void {
    if (!(date instanceof Date)) {
      throw new TypeError('date must be of type Date')
    }

    this.modified = date.toUTCString()
  }

  setUnmodified(date: Date): void {
    if (!(date instanceof Date)) {
      throw new TypeError('date must be of type Date')
    }

    this.unmodified = date.toUTCString()
  }

  setMatchETag(etag: string): void {
    this.matchETag = etag
  }

  setMatchETagExcept(etag: string): void {
    this.matchETagExcept = etag
  }
}
