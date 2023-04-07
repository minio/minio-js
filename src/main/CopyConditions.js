class CopyConditions {
  constructor() {
    this.modified = ""
    this.unmodified = ""
    this.matchETag = ""
    this.matchETagExcept = ""
  }

  setModified(date) {
    if (!(date instanceof Date))
      throw new TypeError('date must be of type Date')

    this.modified = date.toUTCString()
  }

  setUnmodified(date) {
    if (!(date instanceof Date))
      throw new TypeError('date must be of type Date')

    this.unmodified = date.toUTCString()
  }

  setMatchETag(etag) {
    this.matchETag = etag
  }

  setMatchETagExcept(etag) {
    this.matchETagExcept = etag
  }
}

export default CopyConditions
