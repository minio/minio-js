import * as xmlParsers from './xml-parsers.js'
import * as _ from 'lodash'
import Through2 from 'through2'

import { isFunction } from './helpers.js'

// returns a stream that concatenates the input and emits the
// concatenated output when 'End' is reached.
// If an optional parser function is passed, on reaching the
// 'End' of the stream, parser(concatenated_data) will be
// emitted
export function getConcater(parser, emitError) {
  var objectMode = false
  var bufs = []

  if (parser && !isFunction(parser)) {
    throw new TypeError('parser should be of type "function"')
  }

  if (parser) {
    objectMode = true
  }

  return Through2({objectMode},
  function (chunk, enc, cb) {
    bufs.push(chunk)
    cb()
  }, function (cb) {
    if (emitError) {
      cb(parser(Buffer.concat(bufs).toString()))
      // cb(e) would mean we have to emit 'End' by explicitly calling this.push(null)
      this.push(null)
      return
    }
    if (bufs.length) {
      if (parser) {
        this.push(parser(Buffer.concat(bufs).toString()))
      } else {
        this.push(Buffer.concat(bufs))
      }
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

  return getConcater(xmlString => {
    if (!xmlString) return e
    return _.merge(e, xmlParsers.parseError(xmlString))
  }, true)
}

export function getListBucketTransformer() {
  return getConcater(xmlParsers.parseListBucket)
}

export function getListMultipartTransformer() {
  return getConcater(xmlParsers.parseListMultipart)
}

export function getListPartsTransformer() {
  return getConcater(xmlParsers.parseListParts)
}

export function getAclTransformer() {
  return getConcater(xmlParsers.parseAcl)
}

export function getInitiateMultipartTransformer() {
  return getConcater(xmlParsers.parseInitiateMultipart)
}

export function getListObjectsTransformer() {
  return getConcater(xmlParsers.parseListObjects)
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
  return getConcater(xmlParsers.parseCompleteMultipart)
}

export function getBucketRegionTransformer() {
  return getConcater(xmlParsers.parseBucketRegion)
}
