/*
 * Minio Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2015 Minio, Inc.
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

import Crypto from 'crypto';
import Http from 'http';
import Https from 'https';
import Stream from 'stream';
import Through2 from 'through2';
import Url from 'url';
import Xml from 'xml';
import Moment from 'moment';

import { validateBucketName, getRegion, getScope, uriEscape, uriResourceEscape } from './helpers.js';
import { listAllParts, listAllIncompleteUploads, removeUploads } from './multipart.js';
import { getObjectList } from './list-objects.js';
import { signV4, presignSignatureV4, postPresignSignatureV4 } from './signing.js';

import { bucketRequest, objectRequest } from './simple-requests.js';
import { initiateNewMultipartUpload, streamUpload, doPutObject, completeMultipartUpload } from './upload.js';
import { parseError, parseAcl, parseListBucketResult } from './xml-parsers.js';

var errors = require('./errors.js');
var Package = require('../../package.json');

class Client {
  constructor(params, transport) {
    var parsedUrl = Url.parse(params.url),
      port = +parsedUrl.port

    if (transport) {
      this.transport = transport
    } else {
      switch (parsedUrl.protocol) {
        case 'http:':
          {
            this.transport = Http
            this.scheme = 'http'
            if (port === 0) {
              port = 80
            }
            break
          }
        case 'https:':
          {
            this.transport = Https
            this.scheme = 'https'
            if (port === 0) {
              port = 443
            }
            break
          }
        default:
          {
            throw new errors.InvalidProtocolException('Unknown protocol: ' + parsedUrl.protocol)
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
      throw new errors.InternalClientException('user agent already set')
    }
    if (name && version) {
      this.params.userAgent = `${this.params.userAgent} ${name}/${version}${formattedComments}`
      this.params.userAgentSet = true
    } else {
      throw new errors.InvalidUserAgentException('Invalid user agent')
    }
  }

  // SERVICE LEVEL CALLS

  makeBucket(bucket, cb) {
    return this.makeBucketWithACL(bucket, 'private', cb)
  }

  makeBucketWithACL(bucket, acl, cb) {
    if (!validateBucketName(bucket)) {
      throw new errors.InvalidateBucketNameException('Invalid bucket name: ' + bucket)
    }

    var region = getRegion(this.params.host)
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
        LocationConstraint: getRegion(this.params.host)
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
        return parseError(response, cb)
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
        parseError(response, (error) => {
          if (error.code === 'TemporaryRedirect') {
            error.code = 'AccessDenied'
            error.message = 'Unauthenticated access prohibited'
          }
          cb(error)
        })
      } else {
        cb(null, stream)
        parseListBucketResult(response, stream)
      }
    })
    req.end()
  }

  listIncompleteUploads(bucket, prefix, recursive) {
    var delimiter = null
    if (!recursive) {
      delimiter = "/"
    }
    return listAllIncompleteUploads(this.transport, this.params, bucket, prefix, delimiter)
  }

  bucketExists(bucket, cb) {
    if (!validateBucketName(bucket)) {
      throw new errors.InvalidateBucketNameException('Invalid bucket name: ' + bucket)
    }
    bucketRequest(this, 'HEAD', bucket, cb)
  }

  removeBucket(bucket, cb) {
    if (!validateBucketName(bucket)) {
      throw new errors.InvalidateBucketNameException('Invalid bucket name: ' + bucket)
    }
    bucketRequest(this, 'DELETE', bucket, cb)
  }

  getBucketACL(bucket, cb) {
    if (!validateBucketName(bucket)) {
      throw new errors.InvalidateBucketNameException('Invalid bucket name: ' + bucket)
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
        return parseError(response, cb)
      }
      parseAcl(response, cb)
    })
    req.end()
  }

  setBucketACL(bucket, acl, cb) {
    if (!validateBucketName(bucket)) {
      throw new errors.InvalidateBucketNameException('Invalid bucket name: ' + bucket)
    }

    if (acl === null || acl.trim() === '') {
      throw new errors.InvalidEmptyACLException('Acl name cannot be empty')
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
        return parseError(response, cb)
      }
      cb()
    })
    req.end()
  }

  removeIncompleteUpload(bucket, key, cb) {
    if (!validateBucketName(bucket)) {
      throw new errors.InvalidateBucketNameException('Invalid bucket name: ' + bucket)
    }

    if (key === null || key.trim() === '') {
      throw new errors.InvalidObjectNameException('Object name cannot be empty')
    }

    removeUploads(this.transport, this.params, bucket, key, cb)
  }

  getObject(bucket, key, cb) {
    this.getPartialObject(bucket, key, 0, 0, cb)
  }

  getPartialObject(bucket, key, offset, length, cb) {
    if (!validateBucketName(bucket)) {
      throw new errors.InvalidateBucketNameException('Invalid bucket name: ' + bucket)
    }

    if (key === null || key.trim() === '') {
      throw new errors.InvalidObjectNameException('Object name cannot be empty')
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
      path: `/${bucket}/${uriResourceEscape(key)}`,
      method: 'GET',
      headers
    }

    signV4(requestParams, '', this.params.accessKey, this.params.secretKey)

    var req = this.transport.request(requestParams, (response) => {
      if (!(response.statusCode === 200 || response.statusCode === 206)) {
        return parseError(response, cb)
      }
      // wrap it in a new pipe to strip additional response data
      cb(null, response.pipe(Through2((data, enc, done) => {
        done(null, data)
      })))

    })
    req.end()
  }

  putObject(bucket, key, contentType, size, r, cb) {
    if (!validateBucketName(bucket)) {
      throw new errors.InvalidateBucketNameException('Invalid bucket name: ' + bucket)
    }

    if (key === null || key.trim() === '') {
      throw new errors.InvalidObjectNameException('Object name cannot be empty')
    }

    if (contentType === null || contentType.trim() === '') {
      contentType = 'application/octet-stream'
    }

    var self = this

    if (size > 5 * 1024 * 1024) {
      var stream = listAllIncompleteUploads(this.transport, this.params, bucket, key),
        uploadId = null
      stream.on('error', (e) => {
        cb(e)
      })
      stream.pipe(Through2.obj(function(upload, enc, done) {
        if (key === upload.key) {
          uploadId = upload.uploadId
        }
        done()
      }, function(done) {
        if (!uploadId) {
          initiateNewMultipartUpload(self.transport, self.params, bucket, key, contentType, (e, uploadId) => {
            if (e) {
              done(e)
              return
            }
            streamUpload(self.transport, self.params, bucket, key, contentType,
              uploadId, [], size, r, (e, etags) => {
                if (e) {
                  done()
                  cb(e)
                  return
                }
                return completeMultipartUpload(self.transport, self.params, bucket, key, uploadId, etags, (e) => {
                  done()
                  cb(e)
                })
              })
          })
        } else {
          var parts = listAllParts(self.transport, self.params, bucket, key, uploadId)
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
            streamUpload(self.transport, self.params, bucket, key, contentType,
              uploadId, partsArray, size, r, (e, etags) => {
                if (partsErrored) {
                  partDone()
                }
                if (e) {
                  partDone()
                  return cb(e)
                }
                completeMultipartUpload(self.transport, self.params, bucket, key, uploadId, etags, (e) => {
                  partDone()
                  return cb(e)
                })
              })
          }))
        }
      }))
    } else {
      doPutObject(this.transport, this.params, bucket, key, contentType, size, null, null, r, cb)
    }
  }

  listObjects(bucket, params) {
    if (!validateBucketName(bucket)) {
      throw new errors.InvalidateBucketNameException('Invalid bucket name: ' + bucket)
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
    }

    var queue = new Stream.Readable({
      objectMode: true
    })
    queue._read = function() {}
    var stream = queue.pipe(Through2.obj(function(currentRequest, enc, done) {
      getObjectList(self.transport, self.params, currentRequest.bucket, currentRequest.prefix, currentRequest.marker,
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
    if (!validateBucketName(bucket)) {
      throw new errors.InvalidateBucketNameException('Invalid bucket name: ' + bucket)
    }

    if (key === null || key.trim() === '') {
      throw new errors.InvalidObjectNameException('Object name cannot be empty')
    }

    var requestParams = {
      host: this.params.host,
      port: this.params.port,
      path: `/${bucket}/${uriResourceEscape(key)}`,
      method: 'HEAD'
    }

    signV4(requestParams, '', this.params.accessKey, this.params.secretKey)

    var req = this.transport.request(requestParams, (response) => {
      if (response.statusCode !== 200) {
        return parseError(response, cb)
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
    if (!validateBucketName(bucket)) {
      throw new errors.InvalidateBucketNameException('Invalid bucket name: ' + bucket)
    }

    if (key === null || key.trim() === '') {
      throw new errors.InvalidObjectNameException('Object name cannot be empty')
    }
    objectRequest(this, 'DELETE', bucket, key, cb)
  }

  presignedPutObject(bucket, key, expires) {
    if (!validateBucketName(bucket)) {
      throw new errors.InvalidateBucketNameException('Invalid bucket name: ' + bucket)
    }
    if (!key || key.trim() === '') {
      throw new errors.InvalidObjectNameException('Object name cannot be empty')
    }
    var requestParams = {
      host: this.params.host,
      port: this.params.port,
      path: `/${bucket}/${uriResourceEscape(key)}`,
      method: 'put',
      scheme: this.scheme,
      expires: expires
    }
    return presignSignatureV4(requestParams, this.params.accessKey, this.params.secretKey)
  }

  presignedGetObject(bucket, key, expires) {
    if (!validateBucketName(bucket)) {
      throw new errors.InvalidateBucketNameException('Invalid bucket name: ' + bucket)
    }
    if (!key || key.trim() === '') {
      throw new errors.InvalidObjectNameException('Object name cannot be empty')
    }
    var requestParams = {
      host: this.params.host,
      port: this.params.port,
      path: `/${bucket}/${uriResourceEscape(key)}`,
      method: 'get',
      scheme: this.scheme,
      expires: expires
    }
    return presignSignatureV4(requestParams, this.params.accessKey, this.params.secretKey)
  }

  newPostPolicy() {
    return new PostPolicy()
  }

  presignedPostPolicy(postPolicy) {
    var date = Moment.utc()
    var region = getRegion(this.params.host)
    var dateStr = date.format('YYYYMMDDTHHmmss') + 'Z'

    postPolicy.policy.conditions.push(['eq', '$x-amz-date', dateStr])
    postPolicy.formData['x-amz-date'] = dateStr

    postPolicy.policy.conditions.push(['eq', '$x-amz-algorithm', 'AWS4-HMAC-SHA256'])
    postPolicy.formData['x-amz-algorithm'] = 'AWS4-HMAC-SHA256'

    postPolicy.policy.conditions.push(["eq", "$x-amz-credential", this.params.accessKey + "/" + getScope(region, date)])
    postPolicy.formData['x-amz-credential'] = this.params.accessKey + "/" + getScope(region, date)

    var policyBase64 = new Buffer(JSON.stringify(postPolicy.policy)).toString('base64')

    postPolicy.formData.policy = policyBase64

    var signature = postPresignSignature(region, date, this.params.secretKey, policyBase64)

    postPolicy.formData['x-amz-signature'] = signature

    return postPolicy.formData
  }
}

class PostPolicy {
  constructor() {
    this.policy = {
      conditions: []
    }
    this.formData = {}
  }

  setExpires(nativedate) {
    var date = Moment(nativedate)
    if (!date) {
      throw new errors("date can not be null")
    }

    function getExpirationString(date) {
      return date.format('YYYY-MM-DDThh:mm:ss.SSS') + 'Z'
    }
    this.policy.expiration = getExpirationString(date)
  }

  setKey(key) {
    if (!key) {
      throw new errors("key can not be null")
    }
    this.policy.conditions.push(["eq", "$key", key])
    this.formData.key = key
  }

  setKeyStartsWith(prefix) {
    if (!prefix) {
      throw new errors("key prefix can not be null")
    }
    this.policy.conditions.push(["starts-with", "$key", keyStartsWith])
    this.formData.key = key
  }

  setBucket(bucket) {
    if (!bucket) {
      throw new errors("bucket can not be null")
    }
    this.policy.conditions.push(["eq", "$bucket", bucket])
    this.formData.bucket = bucket
  }

  setContentType(type) {
    if (!type) {
      throw new errors("content-type can not be null")
    }
    this.policy.conditions.push(["eq", "$Content-Type", type])
    this.formData["Content-Type"] = type
  }
}

module.exports = Client
