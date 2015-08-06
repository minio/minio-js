/*
 * Minio Javascript Library for Amazon S3 compatible cloud storage, (C) 2015 Minio, Inc.
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

var BlockStream2 = require('block-stream2'),
    Concat = require('concat-stream'),
    Crypto = require('crypto'),
    ParseXml = require('xml-parser'),
    Stream = require('stream'),
    Through2 = require('through2'),
    Xml = require('xml'),
    signV4 = require('./signing.js').signV4,
    xmlParsers = require('./xml-parsers.js'),
    helpers = require('./helpers.js'),
    initiateNewMultipartUpload = (transport, params, bucket, key, contentType, cb) => {
        var requestParams = {
            host: params.host,
            port: params.port,
            path: `/${bucket}/${helpers.uriResourceEscape(key)}?uploads`,
            method: 'POST',
            headers: {
                'Content-Type': contentType
            }
        }

        signV4(requestParams, '', params.accessKey, params.secretKey)

        var request = transport.request(requestParams, (response) => {
            if (response.statusCode !== 200) {
                return xmlParsers.parseError(response, cb)
            }
            response.pipe(Concat(xml => {
                var parsedXml = ParseXml(xml.toString()),
                uploadId = null
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
  var part = 1,
      errored = null,
      etags = [],
      // compute size
      blockSize = calculateBlockSize(totalSize),
      totalSeen = 0

  r.on('finish', function() {})
  r.pipe(BlockStream2({
    size: blockSize,
    zeroPadding: false
  })).pipe(Through2.obj(function(data, enc, done) {
      if (errored) {
        return done()
      }

      totalSeen += data.length
      if (totalSeen > totalSize) {
        errored = 'actual size does not match specified size'
        return done()
      }

      var curPart = part
      part = part + 1
      if (partsArray.length > 0) {
        var curJob = partsArray.shift(),
            hash = Crypto.createHash('md5')
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
      dataStream._read = function() {}
      doPutObject(transport, params, bucket, key, contentType, data.length,
                  uploadId, curPart, dataStream, (e, etag) => {
        if (errored) {
          return done()
        }
        if (e) {
          errored = e
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
      if (errored) {
        return cb(errored)
      }
      if (totalSeen !== totalSize) {
        return cb('actual size does not match specified size', null)
      }
      return cb(null, etags)
    }))

  function calculateBlockSize(size) {
    var minimumPartSize = 5 * 1024 * 1024, // 5MB
        maximumPartSize = 5 * 1025 * 1024 * 1024,
        // using 10000 may cause part size to become too small, and not fit the entire object in
        partSize = Math.floor(size / 9999)

    if (partSize > maximumPartSize) {
      return maximumPartSize
    }
    return Math.max(minimumPartSize, partSize)
  }
}

function doPutObject(transport, params, bucket, key, contentType, size, uploadId, part, r, cb) {
  var query = ''
  if (part) {
    query = `?partNumber=${part}&uploadId=${uploadId}`
  }
  if (contentType === null || contentType === '') {
    contentType = 'application/octet-stream'
  }

  r.pipe(Concat(data => {
    if (data.length !== size) {
      return cb('actual size !== specified size')
    }
    var hash256 = Crypto.createHash('sha256'),
        hashMD5 = Crypto.createHash('md5')
    hash256.update(data)
    hashMD5.update(data)

    var sha256 = hash256.digest('hex').toLowerCase(),
        md5 = hashMD5.digest('base64'),
        requestParams = {
          host: params.host,
          port: params.port,
          path: `/${bucket}/${helpers.uriResourceEscape(key)}${query}`,
          method: 'PUT',
          headers: {
            'Content-Length': size,
            'Content-Type': contentType,
            'Content-MD5': md5
          }
        }

    signV4(requestParams, sha256, params.accessKey, params.secretKey)

    var dataStream = new Stream.Readable()
    dataStream._read = function() {}
    dataStream.push(data)
    dataStream.push(null)

    var request = transport.request(requestParams, (response) => {
      if (response.statusCode !== 200) {
        return xmlParsers.parseError(response, cb)
      }
      var etag = response.headers.etag
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
    path: `/${bucket}/${helpers.uriResourceEscape(key)}?uploadId=${uploadId}`,
    method: 'POST'
  },
      parts = []

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
  },
      payload = Xml(payloadObject),
      hash = Crypto.createHash('sha256')

  hash.update(payload)

  var sha256 = hash.digest('hex').toLowerCase(),
      stream = new Stream.Readable()

  stream._read = function() {}
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
