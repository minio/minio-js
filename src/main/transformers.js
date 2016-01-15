import * as xmlParsers from './xml-parsers.js'
import * as _ from 'lodash'
import Through2 from 'through2'
import Crypto from 'crypto';

import { isFunction } from './helpers.js'
import * as errors from './errors.js'

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

// dummy through stream
export function getDummyTransformer() {
  return Through2.obj((chunk, enc, cb) => cb(null, chunk))
}

// generates an Error object depending on statusCode and XML body
export function getErrorTransformer(response) {
  var e = new errors.S3Error()
  var statusCode = response.statusCode
  // A value created by S3 compatible server that uniquely identifies
  // the request.
  e.amzRequestId = response.headersSent ? response.getHeader('x-amz-request-id') : null
  // A special token that helps troubleshoot API replies and issues.
  e.amzId2 = response.headersSent ? response.getHeader('x-amz-id-2') : null
  // Region where the bucket is located. This header is returned only
  // in HEAD bucket and ListObjects response.
  e.amzBucketRegion = response.headersSent ? response.getHeader('x-amz-bucket-region') : null
  if (statusCode === 301) {
    e.name = 'MovedPermanently'
    e.message = 'Moved Permanently'
  } else if (statusCode === 307) {
    e.name = 'TemporaryRedirect'
    e.message = 'Are you using the correct endpoint URL?'
  } else if (statusCode === 403) {
    e.name = 'AccessDenied'
    e.message = 'Valid and authorized credentials required'
  } else if (statusCode === 404) {
    e.name = 'NotFound'
    e.message = 'Not Found'
  } else if (statusCode === 405) {
    e.name = 'MethodNotAllowed'
    e.message = 'Method Not Allowed'
  } else if (statusCode === 501) {
    e.name = 'MethodNotAllowed'
    e.message = 'Method Not Allowed'
  } else {
    e.name = 'UnknownError'
    e.message = `${statusCode}`
  }

  return getConcater(xmlString => {
    if (!xmlString) return e
    return _.merge(e, xmlParsers.parseError(xmlString))
  }, true)
}

// makes sure that only size number of bytes go through this stream
export function getSizeVerifierTransformer(size, stream, chunker) {
  var sizeRemaining = size
  return Through2.obj(function(chunk, enc, cb) {
    var length = Math.min(chunk.length, sizeRemaining)
    // we should read only till 'size'
    if (length < chunk.length) chunk = chunk.slice(0, length)
    this.push(chunk)
    sizeRemaining -= length
    if (sizeRemaining === 0) {
      // unpipe so that the streams do not send us more data
      stream.unpipe()
      chunker.unpipe()
      this.push(null)
    }
    cb()
  }, function(cb) {
    if (sizeRemaining !== 0) {
      return cb(new errors.IncorrectSizeError('size of the input stream is not equal to the expected size(${size})'))
    }
    this.push(null)
    cb()
  })
}

// a through stream that calculates md5sum and sha256sum
export function getHashSummer(anonymous) {
  var md5 = Crypto.createHash('md5')
  var sha256 = Crypto.createHash('sha256')

  return Through2.obj(function(chunk, enc, cb) {
    md5.update(chunk)
    if (!anonymous) sha256.update(chunk)
    cb()
  }, function(cb) {
    var md5sum = md5.digest('base64')
    var hashData = {md5sum}
    if (!anonymous) hashData.sha256sum = sha256.digest('hex')
    this.push(hashData)
    this.push(null)
  })
}

// following functions return a stream object that parses XML
// and emits suitable Javascript objects

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

export function getCompleteMultipartTransformer() {
  return getConcater(xmlParsers.parseCompleteMultipart)
}

export function getBucketRegionTransformer() {
  return getConcater(xmlParsers.parseBucketRegion)
}
