import * as xmlParsers from './xml-parsers.js'
import * as _ from 'lodash'
import Through2 from 'through2'

export function getConcater() {
  var bufs = []
  return Through2(function (chunk, enc, cb) {
    bufs.push(chunk)
    cb()
  }, function (cb) {
    if (bufs.length) {
      this.push(Buffer.concat(bufs))
    }
    this.push(null)
    cb()
  })
}

export function getDummyTransformer() {
  return Through2.obj(function(chunk, enc, cb) {
    cb(null, chunk)
  }, function(cb) {
    // this.push(null)
    cb()
  })
}

export function getErrorTransformer(response) {
  var requestid = response.headersSent ? response.getHeader('x-amz-request-id') : null
  var statusCode = response.statusCode
  var e = {}
  e.requestid = requestid
  if (statusCode === 301) {
    e.code = 'MovedPermanently'
    e.message = 'Moved Permanently'
  } else if (statusCode === 307) {
    e.code = 'TemporaryRedirect'
    e.message = 'Are you using the correct endpoint URL?'
  } else if (statusCode === 403) {
    e.code = 'AccessDenied'
    e.message = 'Valid and authorized credentials required'
  } else if (statusCode === 404) {
    e.code = 'NotFound'
    e.message = 'Not Found'
  } else if (statusCode === 405) {
    e.code = 'MethodNotAllowed'
    e.message = 'Method Not Allowed'
  } else if (statusCode === 501) {
    e.code = 'MethodNotAllowed'
    e.message = 'Method Not Allowed'
  } else {
    e.code = 'UnknownError'
    e.message = `${statusCode}`
  }

  return Through2.obj(function(xmlbytes, enc, cb) {
    e = _.merge(e, xmlParsers.parseError(xmlbytes.toString()))
    cb()
  }, function(cb) {
    cb(e)
    this.push(null)
  })
}

export function getListBucketTransformer() {
  return Through2.obj(function(xmlbytes, enc, cb) {
    var buckets = xmlParsers.parseListBucket(xmlbytes.toString())
    buckets.forEach((bucket) => this.push(bucket))
    cb()
  }, function(cb) {
    this.push(null)
    cb()
  })
}

export function getListMultipartTransformer() {
  return Through2.obj(function(xmlbytes, enc, cb) {
    this.push(xmlParsers.parseListMultipart(xmlbytes.toString()))
    cb()
  }, function(cb) {
    this.push(null)
    cb()
  })
}

export function getListPartsTransformer() {
  return Through2.obj(function(xmlbytes, enc, cb) {
    this.push(xmlParsers.parseListParts(xmlbytes.toString()))
    cb()
  }, function(cb) {
    this.push(null)
    cb()
  })
}

export function getAclTransformer() {
  return Through2.obj(function(xmlbytes, enc, cb) {
    this.push(xmlParsers.parseAcl(xmlbytes.toString()))
    cb()
  }, function(cb) {
    this.push(null)
    cb()
  })
}

export function getInitiateMultipartTransformer() {
  return Through2.obj(function(xmlbytes, enc, cb) {
    this.push(xmlParsers.parseInitiateMultipart(xmlbytes.toString()))
    cb()
  }, function(cb) {
    this.push(null)
    cb()
  })
}

export function getListObjectsTransformer() {
  return Through2.obj(function(xmlbytes, enc, cb) {
    this.push(xmlParsers.parseListObjects(xmlbytes.toString()))
    cb()
  }, function(cb) {
    this.push(null)
    cb()
  })
}

export function getSizeVerifierTransformer(size) {
  var totalSize = 0
  // FIXME: cb should provide proper error object instead of string
  // string is being passed here to satisfy test cases for now
  return Through2.obj(function(chunk, enc, cb) {
    totalSize += chunk.length
    if (totalSize > size) {
      return cb('actual size does not match specified size')
    }
    this.push(chunk)
    cb()
  }, function(cb) {
    if (totalSize != size) {
      return cb('actual size does not match specified size')
    }
    this.push(null)
    cb()
  })
}

export function getCompleteMultipartTransformer() {
  return Through2.obj(function(xmlbytes, enc, cb) {
    this.push(xmlParsers.parseCompleteMultipart(xmlbytes.toString()))
    cb()
  }, function(cb) {
    this.push(null)
    cb()
  })
}

export function getBucketRegionTransformer() {
  return through2.obj((xmlbytes, enc, cb) => cb(null, xmlParsers.parseCompleteMultipart(xmlbytes.toString())))
}
