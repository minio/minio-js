/*
 * Minimal Object Storage Library, (C) 2015 Minio, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/*jshint sub: true */

var BlockStream2 = require('block-stream2')
var Concat = require('concat-stream')
var Crypto = require('crypto')
var ParseXml = require('xml-parser')
var Stream = require('stream')
var Through2 = require('through2')
var Xml = require('xml')

var signV4 = require('./signing.js')
var xmlParsers = require('./xml-parsers.js')

var initiateNewMultipartUpload = (transport, params, bucket, key, cb) => {
  var requestParams = {
    host: params.host,
    port: params.port,
    path: `/${bucket}/${key}?uploads`,
    method: 'POST'
  }

  signV4(requestParams, '', params.accessKey, params.secretKey)

  var request = transport.request(requestParams, (response) => {
    if (response.statusCode !== 200) {
      return xmlParsers.parseError(response, cb)
    }
    response.pipe(Concat(xml => {
      var parsedXml = ParseXml(xml.toString())
      var uploadId = null
      parsedXml.root.children.forEach(element => {
        if (element.name === 'UploadId') {
          uploadId = element.content
        }
      })

      if (uploadId) {
        return cb(null, uploadId)
      }
      cb('unable to get upload id')
    }))
  })
  request.end()
}

function streamUpload(transport, params, bucket, key, contentType, uploadId, partsArray, totalSize, r, cb) {
  var part = 1
  var errorred = null
  var etags = []
    // compute size
  var blockSize = calculateBlockSize(totalSize)
  var totalSeen = 0

  r.on('finish', () => {})
  r.pipe(BlockStream2({
    size: blockSize,
    zeroPadding: false
  })).pipe(Through2.obj(function(data, enc, done) {
      if (errorred) {
        return done()
      }

      totalSeen += data.length

      if(totalSeen > totalSize) {
        errorred = "actual size !== specified size"
        return done()
      }

      var curPart = part
      part = part + 1
      if (partsArray.length > 0) {
        var curJob = partsArray.shift()
        var hash = Crypto.createHash('md5')
        hash.update(data)
        var md5 = hash.digest('hex').toLowerCase()
        if (curJob.etag === md5) {
          etags.push({
            part: curPart,
            etag: md5
          })
          done()
          return
        }
      }

      var dataStream = new Stream.Readable()
      dataStream.push(data)
      dataStream.push(null)
      dataStream._read = () => {}
      doPutObject(transport, params, bucket, key, contentType, data.length, uploadId, curPart, dataStream, (e, etag) => {
        if (errorred) {
          return done()
        }
        if (e) {
          errorred = e
          return done()
        }
        etags.push({
          part: curPart,
          etag: etag
        })
        return done()
      })
    },
    function(done) {
      done()
      if (errorred) {
        return cb(errorred)
      }
      if(totalSeen !== totalSize) {
        return cb('actual size !== specified size', null)
      }
      return cb(null, etags)
    }))

  function calculateBlockSize(size) {
    var minimumPartSize = 5 * 1024 * 1024; // 5MB
    var partSize = Math.floor(size / 9999); // using 10000 may cause part size to become too small, and not fit the entire object in
    return Math.max(minimumPartSize, partSize);
  }
}

function doPutObject(transport, params, bucket, key, contentType, size, uploadId, part, r, cb) {
  var query = ''
  if (part) {
    query = `?partNumber=${part}&uploadId=${uploadId}`
  }
  if (contentType === null || contentType === '') {
    contentType = 'aplication/octet-stream'
  }

  r.pipe(Concat(data => {
    if(data.length !== size) {
      return cb('actual size !== specified size')
    }
    var hash256 = Crypto.createHash('sha256')
    var hashMD5 = Crypto.createHash('md5')
    hash256.update(data)
    hashMD5.update(data)

    var sha256 = hash256.digest('hex').toLowerCase()
    var md5 = hashMD5.digest('base64')

    var requestParams = {
      host: params.host,
      port: params.port,
      path: `/${bucket}/${key}${query}`,
      method: 'PUT',
      headers: {
        "Content-Length": size,
        "Content-Type": contentType,
        "Content-MD5": md5
      }
    }

    signV4(requestParams, sha256, params.accessKey, params.secretKey)

    var dataStream = new Stream.Readable()
    dataStream._read = () => {}
    dataStream.push(data)
    dataStream.push(null)

    var request = transport.request(requestParams, (response) => {
      if (response.statusCode !== 200) {
        return xmlParsers.parseError(response, cb)
      }
      var etag = response.headers['etag']
      cb(null, etag)
    })
    dataStream.pipe(request)
  }, function(done) {
    done()
  }))
  r.on('error', (e) => {
    cb(e)
  })
}

function completeMultipartUpload(transport, params, bucket, key, uploadId, etags, cb) {
  var requestParams = {
    host: params.host,
    port: params.port,
    path: `/${bucket}/${key}?uploadId=${uploadId}`,
    method: 'POST'
  }

  var parts = []

  etags.forEach(element => {
    parts.push({
      Part: [{
        PartNumber: element.part
      }, {
        ETag: element.etag
      }]
    })
  })

  var payloadObject = {
    CompleteMultipartUpload: parts
  }

  var payload = Xml(payloadObject)

  var hash = Crypto.createHash('sha256')
  hash.update(payload)
  var sha256 = hash.digest('hex').toLowerCase()

  var stream = new Stream.Readable()
  stream._read = () => {}
  stream.push(payload)
  stream.push(null)

  signV4(requestParams, sha256, params.accessKey, params.secretKey)

  var request = transport.request(requestParams, (response) => {
    if (response.statusCode !== 200) {
      return xmlParsers.parseError(response, cb)
    }
    cb()
  })
  stream.pipe(request)
}

module.exports = {
  doPutObject: doPutObject,
  initiateNewMultipartUpload: initiateNewMultipartUpload,
  completeMultipartUpload: completeMultipartUpload,
  streamUpload: streamUpload
}
