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
    cb()
  })
}

export function getDummyTransformer() {
  return Through2.obj((chunk, enc, cb) => cb(null, chunk))
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
    // cb(e) would mean we have to emit 'End' by explicitly calling this.push(null)
    this.push(null)
  })
}

export function getListBucketTransformer() {
  return Through2.obj(function(xmlbytes, enc, cb) {
    var buckets = xmlParsers.parseListBucket(xmlbytes.toString())
    buckets.forEach((bucket) => this.push(bucket))
    cb()
  })
}

export function getListMultipartTransformer() {
  return Through2.obj((xmlbytes, enc, cb) => cb(null, xmlParsers.parseListMultipart(xmlbytes.toString())))
}

export function getListPartsTransformer() {
  return Through2.obj((xmlbytes, enc, cb) => cb(null, xmlParsers.parseListParts(xmlbytes.toString())))
}

export function getAclTransformer() {
  return Through2.obj((xmlbytes, enc, cb) => cb(null, xmlParsers.parseAcl(xmlbytes.toString())))
}

export function getInitiateMultipartTransformer() {
  return Through2.obj((xmlbytes, enc, cb) => cb(null, xmlParsers.parseInitiateMultipart(xmlbytes.toString())))
}

export function getListObjectsTransformer() {
  return Through2.obj((xmlbytes, enc, cb) => cb(null, xmlParsers.parseListObjects(xmlbytes.toString())))
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
  return Through2.obj((xmlbytes, enc, cb) => cb(null, xmlParsers.parseCompleteMultipart(xmlbytes.toString())))
}

export function getBucketRegionTransformer() {
  return Through2.obj((xmlbytes, enc, cb) => cb(null, xmlParsers.parseBucketRegion(xmlbytes.toString())))
}
