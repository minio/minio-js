export class CopyConditions {
  public modified: string
  public unmodified: string
  public matchETag: string
  public matchETagExcept: string

  constructor() {
    this.modified = ''
    this.unmodified = ''
    this.matchETag = ''
    this.matchETagExcept = ''
  }
  
  setModified(date: { toUTCString: () => string }) {
    if (!(date instanceof Date))
      throw new TypeError('date must be of type Date')
  
    this.modified = date.toUTCString()
  }
  
  setUnmodified(date: { toUTCString: () => string }) {
    if (!(date instanceof Date))
      throw new TypeError('date must be of type Date')
  
    this.unmodified = date.toUTCString()
  }
  
  setMatchETag(etag: string) {
    this.matchETag = etag
  }
  
  setMatchETagExcept(etag: string) {
    this.matchETagExcept = etag
  }
}