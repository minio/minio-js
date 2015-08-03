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

require('source-map-support').install()

var Crypto = require('crypto'),
    Http = require('http'),
    Https = require('https'),
    Package = require('../../package.json'),
    Stream = require('stream'),
    Through2 = require('through2'),
    Url = require('url'),
    Xml = require('xml'),
    helpers = require('./helpers.js'),
    multipart = require('./multipart.js'),
    objectList = require('./list-objects.js'),
    signV4 = require('./signing.js'),
    simpleRequests = require('./simple-requests.js'),
    upload = require('./upload.js'),
    xmlParsers = require('./xml-parsers.js')

class Client {
  constructor(params, transport) {
    var parsedUrl = Url.parse(params.url),
        port = +parsedUrl.port

    if (transport) {
      this.transport = transport
    } else {
      switch (parsedUrl.protocol) {
      case 'http:': {
        this.transport = Http
        this.scheme = 'http'
        if (port === 0) {
          port = 80
        }
        break
      }
      case 'https:': {
        this.transport = Https
        this.scheme = 'https'
        if (port === 0) {
          port = 443
        }
        break
      }
      default: {
        throw new Error('Unknown protocol: ' + parsedUrl.protocol)
      }
      }
    }
    this.params = {
      host: parsedUrl.hostname,
      port: port,
      accessKey: params.accessKey,
      secretKey: params.secretKey,
      userAgent: `minio-js/${Package.version} (${process.platform}; ${process.arch})`,
      userAgentSet: false
    }
  }

  // CLIENT LEVEL CALLS

  setUserAgent(name, version, comments) {
    var formattedComments = ''
    if (comments && comments.length > 0) {
      var joinedComments = comments.join('; ')
      formattedComments = ` (${joinedComments})`
    }
    if (this.params.userAgentSet) {
      throw 'user agent already set'
    }
    if (name && version) {
      this.params.userAgent = `${this.params.userAgent} ${name}/${version}${formattedComments}`
      this.params.userAgentSet = true
    } else {
      throw 'Invalid user agent'
    }
  }

  // SERVICE LEVEL CALLS

  makeBucket(bucket, cb) {
    return this.makeBucketWithACL(bucket, 'private', cb)
  }

  makeBucketWithACL(bucket, acl, cb) {
    if (!helpers.validBucketName(bucket)) {
      return cb('invalid bucket name')
    }

    var region = helpers.getRegion(this.params.host)
    if (region === 'milkyway' || region === 'us-east-1') {
      region = null
    }
    var payload = ''
    if (region) {
      var createBucketConfiguration = []
      createBucketConfiguration.push({
        _attr: {
          xmlns: 'http://s3.amazonaws.com/doc/2006-03-01/'
        }
      })
      createBucketConfiguration.push({
        LocationConstraint: helpers.getRegion(this.params.host)
      })
      var payloadObject = {
        CreateBucketConfiguration: createBucketConfiguration
      }
      payload = Xml(payloadObject)
    }

    var stream = new Stream.Readable()
    stream._read = function() {}
    stream.push(payload.toString())
    stream.push(null)

    var hash = Crypto.createHash('sha256')
    hash.update(payload)
    var sha256 = hash.digest('hex').toLowerCase(),
        requestParams = {
          host: this.params.host,
          port: this.params.port,
          method: 'PUT',
          path: `/${bucket}`,
          headers: {
            'Content-Length': payload.length,
            'x-amz-acl': acl
          }
        }

    signV4(requestParams, sha256, this.params.accessKey, this.params.secretKey)

    var req = this.transport.request(requestParams, response => {
      if (response.statusCode !== 200) {
        return xmlParsers.parseError(response, cb)
      }
      cb()
    })
    stream.pipe(req)
  }

  listBuckets(cb) {
    var requestParams = {
      host: this.params.host,
      port: this.params.port,
      path: '/',
      method: 'GET'
    }

    signV4(requestParams, '', this.params.accessKey, this.params.secretKey)

    var stream = new Stream.Readable({
      objectMode: true
    })
    stream._read = function() {}

    var req = this.transport.request(requestParams, (response) => {
      if (response.statusCode !== 200) {
        // TODO work out how to handle errors with stream
        xmlParsers.parseError(response, (error) => {
          if (error.code === 'TemporaryRedirect') {
            error.code = 'AccessDenied'
            error.message = 'Unauthenticated access prohibited'
          }
          cb(error)
        })
      } else {
        cb(null, stream)
        xmlParsers.parseListBucketResult(response, stream)
      }
    })
    req.end()
  }

  bucketExists(bucket, cb) {
    if (!helpers.validBucketName(bucket)) {
      return cb('invalid bucket name')
    }
    simpleRequests.bucketRequest(this, 'HEAD', bucket, cb)
  }

  removeBucket(bucket, cb) {
    if (!helpers.validBucketName(bucket)) {
      return cb('invalid bucket name')
    }
    simpleRequests.bucketRequest(this, 'DELETE', bucket, cb)
  }

  getBucketACL(bucket, cb) {
    if (!helpers.validBucketName(bucket)) {
      return cb('invalid bucket name')
    }

    var query = `?acl`,
        requestParams = {
          host: this.params.host,
          port: this.params.port,
          method: 'GET',
          path: `/${bucket}${query}`
        }

    signV4(requestParams, '', this.params.accessKey, this.params.secretKey)

    var req = this.transport.request(requestParams, response => {
      if (response.statusCode !== 200) {
        return xmlParsers.parseError(response, cb)
      }
      xmlParsers.parseAcl(response, cb)
    })
    req.end()
  }

  setBucketACL(bucket, acl, cb) {
    if (!helpers.validBucketName(bucket)) {
      return cb('invalid bucket name')
    }

    if (acl === null || acl.trim() === '') {
      return cb('acl name cannot be empty')
    }

    // we should make sure to set this query parameter, but on the other hand
    // the call apparently succeeds without it to s3.  For clarity lets do it anyways
    var query = `?acl`,
        requestParams = {
          host: this.params.host,
          port: this.params.port,
          method: 'PUT',
          path: `/${bucket}${query}`,
          headers: {
            'x-amz-acl': acl
          }
        }

    signV4(requestParams, '', this.params.accessKey, this.params.secretKey)

    var req = this.transport.request(requestParams, response => {
      if (response.statusCode !== 200) {
        return xmlParsers.parseError(response, cb)
      }
      cb()
    })
    req.end()
  }

  dropAllIncompleteUploads(bucket, cb) {
    if (!helpers.validBucketName(bucket)) {
      return cb('invalid bucket name')
    }

    multipart.dropUploads(this.transport, this.params, bucket, null, cb)
  }

  dropIncompleteUpload(bucket, key, cb) {
    if (!helpers.validBucketName(bucket)) {
      return cb('invalid bucket name')
    }

    if (key === null || key.trim() === '') {
      return cb('object key cannot be empty')
    }

    multipart.dropUploads(this.transport, this.params, bucket, key, cb)
  }

  getObject(bucket, key, cb) {
    this.getPartialObject(bucket, key, 0, 0, cb)
  }

  getPartialObject(bucket, key, offset, length, cb) {
    if (!helpers.validBucketName(bucket)) {
      return cb('invalid bucket name')
    }

    if (key === null || key.trim() === '') {
      return cb('object key cannot be empty')
    }

    var range = ''

    if (offset || length) {
      if (offset) {
        range = `bytes=${+offset}-`
      } else {
        range = 'bytes=0-'
        offset = 0
      }
      if (length) {
        range += `${(+length + offset) - 1}`
      }
    }

    var headers = {}
    if (range !== '') {
      headers.Range = range
    }

    var requestParams = {
      host: this.params.host,
      port: this.params.port,
      path: `/${bucket}/${helpers.uriResourceEscape(key)}`,
      method: 'GET',
      headers
    }

    signV4(requestParams, '', this.params.accessKey, this.params.secretKey)

    var req = this.transport.request(requestParams, (response) => {
      if (!(response.statusCode === 200 || response.statusCode === 206)) {
        return xmlParsers.parseError(response, cb)
      }
      // wrap it in a new pipe to strip additional response data
      cb(null, response.pipe(Through2((data, enc, done) => {
        done(null, data)
      })))

    })
    req.end()
  }

  putObject(bucket, key, contentType, size, r, cb) {
    if (!helpers.validBucketName(bucket)) {
      return cb('invalid bucket name')
    }

    if (key === null || key.trim() === '') {
      return cb('object key cannot be empty')
    }

    if (contentType === null || contentType.trim() === '') {
      contentType = 'application/octet-stream'
    }

    var self = this

    if (size > 5 * 1024 * 1024) {
      var stream = multipart.listAllIncompleteUploads(this.transport, this.params, bucket, key),
          uploadId = null
      stream.on('error', (e) => {
        cb(e)
      })
      stream.pipe(Through2.obj(function(upload, enc, done) {
        uploadId = upload.uploadId
        done()
      }, function(done) {
        if (!uploadId) {
          upload.initiateNewMultipartUpload(self.transport, self.params, bucket, key, contentType, (e, uploadId) => {
            if (e) {
              done(e)
              return
            }
            upload.streamUpload(self.transport, self.params, bucket, key, contentType,
                                uploadId, [], size, r, (e, etags) => {
              if (e) {
                done()
                cb(e)
                return
              }
              return upload.completeMultipartUpload(self.transport, self.params, bucket, key, uploadId, etags, (e) => {
                done()
                cb(e)
              })
            })
          })
        } else {
          var parts = multipart.listAllParts(self.transport, self.params, bucket, key, uploadId)
          parts.on('error', (e) => {
            cb(e)
          })
          var partsErrored = null,
              partsArray = []
          parts.pipe(Through2.obj(function(part, enc, partDone) {
            partsArray.push(part)
            partDone()
          }, function(partDone) {
            if (partsErrored) {
              return partDone(partsErrored)
            }
            upload.streamUpload(self.transport, self.params, bucket, key, contentType,
                                uploadId, partsArray, size, r, (e, etags) => {
              if (partsErrored) {
                partDone()
              }
              if (e) {
                partDone()
                return cb(e)
              }
              upload.completeMultipartUpload(self.transport, self.params, bucket, key, uploadId, etags, (e) => {
                partDone()
                return cb(e)
              })
            })
          }))
        }
      }))
    } else {
      upload.doPutObject(this.transport, this.params, bucket, key, contentType, size, null, null, r, cb)
    }
  }

  listObjects(bucket, params) {
    var bucketNameError = false
    if (!helpers.validBucketName(bucket)) {
      bucketNameError = true
    }
    var self = this,
        prefix = null,
        delimiter = null
    if (params) {
      if (params.prefix) {
        prefix = params.prefix
      }
      // we delimit by default, turn off recursive if True
      delimiter = '/'
      if (params.recursive === true) {
        delimiter = null
      }
      console.log(delimiter, params.recursive)
    }

    var queue = new Stream.Readable({
      objectMode: true
    })
    queue._read = function() {}
    var stream = queue.pipe(Through2.obj(function(currentRequest, enc, done) {
      if (bucketNameError) {
        return done('bucket name invalid')
      }
      objectList.list(self.transport, self.params, currentRequest.bucket, currentRequest.prefix, currentRequest.marker,
                      currentRequest.delimiter, currentRequest.maxKeys, (e, r) => {
        if (e) {
          return done(e)
        }
        var marker = null
        r.objects.forEach(object => {
          marker = object.name
          this.push(object)
        })
        if (r.isTruncated) {
          if (delimiter) {
            marker = r.nextMarker
          }
          queue.push({
            bucket: currentRequest.bucket,
            prefix: currentRequest.prefix,
            marker: marker,
            delimiter: currentRequest.delimiter,
            maxKeys: currentRequest.maxKeys
          })
        } else {
          queue.push(null)
        }
        done()
      })
    }))
    queue.push({
      bucket: bucket,
      prefix: prefix,
      marker: null,
      delimiter: delimiter,
      maxKeys: 1000
    })
    return stream
  }

  statObject(bucket, key, cb) {
    if (!helpers.validBucketName(bucket)) {
      return cb('invalid bucket name')
    }

    if (key === null || key.trim() === '') {
      return cb('object key cannot be empty')
    }

    var requestParams = {
      host: this.params.host,
      port: this.params.port,
      path: `/${bucket}/${helpers.uriResourceEscape(key)}`,
      method: 'HEAD'
    }

    signV4(requestParams, '', this.params.accessKey, this.params.secretKey)

    var req = this.transport.request(requestParams, (response) => {
      if (response.statusCode !== 200) {
        return xmlParsers.parseError(response, cb)
      } else {
        var result = {
          size: +response.headers['content-length'],
          etag: response.headers.etag.replace(/"/g, ''),
          contentType: response.headers['content-type'],
          lastModified: response.headers['last-modified']
        }
        cb(null, result)
      }
    })
    req.end()
  }

  removeObject(bucket, key, cb) {
    if (!helpers.validBucketName(bucket)) {
      return cb('invalid bucket name')
    }

    if (key === null || key.trim() === '') {
      return cb('object key cannot be empty')
    }
    simpleRequests.objectRequest(this, 'DELETE', bucket, key, cb)
  }
}

module.exports = Client
