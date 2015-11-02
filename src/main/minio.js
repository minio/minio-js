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
import BlockStream2 from 'block-stream2';
import Url from 'url';
import Xml from 'xml';
import Moment from 'moment';
import async from 'async';

import { validateBucketName, getRegion, getScope, uriEscape, uriResourceEscape, pipesetup } from './helpers.js';
import Multipart from './multipart.js';
import { signV4, presignSignatureV4, postPresignSignatureV4 } from './signing.js';

import * as transformers from './transformers'

import errors from './errors.js';

var Package = require('../../package.json');

export default class Client extends Multipart {
  constructor(params, transport) {
    var namespace = 'Minio'
    var parsedUrl = Url.parse(params.url),
      port = +parsedUrl.port

    var host = parsedUrl.hostname
    var protocol = ''

    if (!transport) {
      switch (parsedUrl.protocol) {
        case 'http:':
          {
            transport = Http
            protocol = 'http:'
            if (port === 0) {
              port = 80
            }
            break
          }
        case 'https:':
          {
            transport = Https
            protocol = 'https:'
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
    var newParams = {
      host: host,
      port: port,
      protocol: protocol,
      accessKey: params.accessKey,
      secretKey: params.secretKey,
      userAgent: `minio-js/${Package.version} (${process.platform}; ${process.arch})`,
      userAgentSet: false
    }
    super(newParams, transport)
    this.params = newParams
    this.transport = transport
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

  bucketRequest(method, bucket, cb) {
    var path = `/${bucket}`
    this.request(method, path, cb)
  }

  objectRequest(method, bucket, object, cb) {
    var path = `/${bucket}/${uriResourceEscape(object)}`
    this.request(method, path, cb)
  }

  request(method, path, cb) {
    var requestParams = {
      host: this.params.host,
      port: this.params.port,
      protocol: this.params.protocol,
      method: method,
      path: path
    }

    signV4(requestParams, '', this.params.accessKey, this.params.secretKey)

    var req = this.transport.request(requestParams, response => {
      if (response.statusCode >= 300) {
        var concater = transformers.getConcater()
        var errorTransformer = transformers.getErrorTransformer(response)
        pipesetup([response, concater, errorTransformer])
          .on('error', e => cb(e))
        return
      }
      // no data expected
      cb()
    })
    req.on('error', e => cb(e))
    req.end()
  }

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
        LocationConstraint: region
      })
      var payloadObject = {
        CreateBucketConfiguration: createBucketConfiguration
      }
      payload = Xml(payloadObject)
    }

    var hash = Crypto.createHash('sha256')
    hash.update(payload)
    var sha256 = hash.digest('hex').toLowerCase(),
      requestParams = {
        host: this.params.host,
        port: this.params.port,
        protocol: this.params.protocol,
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
        var errorTransformer = transformers.getErrorTransformer(response, true)
        var concater = transformers.getConcater()
        pipesetup([response, concater, errorTransformer])
          .on('error', e => cb(e))
        return
      }
      cb()
    })
    req.write(payload)
    req.end()
  }

  listBuckets(cb) {
    var requestParams = {
      host: this.params.host,
      port: this.params.port,
      protocol: this.params.protocol,
      path: '/',
      method: 'GET'
    }

    signV4(requestParams, '', this.params.accessKey, this.params.secretKey)

    var concater = transformers.getConcater()

    var req = this.transport.request(requestParams, (response) => {
      if (response.statusCode !== 200) {
        var errorTransformer = transformers.getErrorTransformer(response, true)
        pipesetup([response, concater,  errorTransformer])
          .on('error', e => cb(e))
        return
      }
      var transformer = transformers.getListBucketTransformer();
      pipesetup([response, concater, transformer])
      cb(null, transformer)
    })
    req.on('error', e => cb(e))
    req.end()
  }

  listIncompleteUploads(bucket, prefix, recursive) {
    var delimiter = recursive ? null : "/"
    var dummyTransformer = transformers.getDummyTransformer()
    var self = this
    function listNext(keyMarker, uploadIdMarker) {
      self.listIncompleteUploadsOnce(bucket, prefix, keyMarker, uploadIdMarker, delimiter)
        .on('error', e => dummyTransformer.emit('error', e))
        .on('data', result => {
          result.uploads.forEach(upload => {
            dummyTransformer.push(upload)
          })
          result.prefixes.forEach(prefix => {
            dummyTransformer.push(prefix)
          })
          if (result.isTruncated) {
            listNext(result.nextKeyMarker, result.nextUploadIdMarker)
            return
          }
          dummyTransformer.push(null) // signal 'end'
        })
    }
    listNext()
    return dummyTransformer
  }

  bucketExists(bucket, cb) {
    if (!validateBucketName(bucket)) {
      throw new errors.InvalidateBucketNameException('Invalid bucket name: ' + bucket)
    }
    this.bucketRequest('HEAD', bucket, cb)
  }

  removeBucket(bucket, cb) {
    if (!validateBucketName(bucket)) {
      throw new errors.InvalidateBucketNameException('Invalid bucket name: ' + bucket)
    }
    this.bucketRequest('DELETE', bucket, cb)
  }

  getBucketACL(bucket, cb) {
    if (!validateBucketName(bucket)) {
      throw new errors.InvalidateBucketNameException('Invalid bucket name: ' + bucket)
    }

    var query = `?acl`,
      requestParams = {
        host: this.params.host,
        port: this.params.port,
        protocol: this.params.protocol,
        method: 'GET',
        path: `/${bucket}${query}`
      }

    signV4(requestParams, '', this.params.accessKey, this.params.secretKey)
    var req = this.transport.request(requestParams, response => {
      var concater = transformers.getConcater()
      var errorTransformer = transformers.getErrorTransformer(response)
      var transformer = transformers.getAclTransformer()
      if (response.statusCode !== 200) {
        pipesetup([response, concater, errorTransformer])
          .on('error', e => cb(e))
        return
      }
      pipesetup([response, concater, transformer])
        .on('error', e => cb(e))
        .on('data', data => {
          var perm = data.acl.reduce(function(acc, grant) {
            if (grant.grantee.uri === 'http://acs.amazonaws.com/groups/global/AllUsers') {
              if (grant.permission === 'READ') {
                acc.publicRead = true
              } else if (grant.permission === 'WRITE') {
                acc.publicWrite = true
              }
            } else if (grant.grantee.uri === 'http://acs.amazonaws.com/groups/global/AuthenticatedUsers') {
              if (grant.permission === 'READ') {
                acc.authenticatedRead = true
              } else if (grant.permission === 'WRITE') {
                acc.authenticatedWrite = true
              }
            }
            return acc
          }, {})
          var cannedACL = 'unsupported-acl'
          if (perm.publicRead && perm.publicWrite && !perm.authenticatedRead && !perm.authenticatedWrite) {
            cannedACL = 'public-read-write'
          } else if (perm.publicRead && !perm.publicWrite && !perm.authenticatedRead && !perm.authenticatedWrite) {
            cannedACL = 'public-read'
          } else if (!perm.publicRead && !perm.publicWrite && perm.authenticatedRead && !perm.authenticatedWrite) {
            cannedACL = 'authenticated-read'
          } else if (!perm.publicRead && !perm.publicWrite && !perm.authenticatedRead && !perm.authenticatedWrite) {
            cannedACL = 'private'
          }
          cb(null, cannedACL)
        })
    })
    req.on('error', e => cb(e))
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
        protocol: this.params.protocol,
        method: 'PUT',
        path: `/${bucket}${query}`,
        headers: {
          'x-amz-acl': acl
        }
      }

    signV4(requestParams, '', this.params.accessKey, this.params.secretKey)

    var req = this.transport.request(requestParams, response => {
      var concater = transformers.getConcater()
      var errorTransformer = transformers.getErrorTransformer(response)
      if (response.statusCode !== 200) {
        pipesetup([response, concater, errorTransformer])
          .on('error', e => cb(e))
        return
      }
      cb()
    })
    // FIXME: the below line causes weird failure in 'gulp test'
    // req.on('error', e => cb(e))
    req.end()
  }

  removeIncompleteUpload(bucket, key, cb) {
    if (!validateBucketName(bucket)) {
      throw new errors.InvalidateBucketNameException('Invalid bucket name: ' + bucket)
    }

    if (key === null || key.trim() === '') {
      throw new errors.InvalidObjectNameException('Object name cannot be empty')
    }

    var self = this
    this.findUploadId(bucket, key, (err, uploadId) => {
      if (err || !uploadId) {
        return cb(err)
      }
      var requestParams = {
        host: self.params.host,
        port: self.params.port,
        protocol: self.params.protocol,
        path: `/${bucket}/${key}?uploadId=${uploadId}`,
        method: 'DELETE'
      }

      signV4(requestParams, '', self.params.accessKey, self.params.secretKey)

      var req = self.transport.request(requestParams, (response) => {
        if (response.statusCode !== 204) {
          var concater = transformers.getConcater()
          var errorTransformer = transformers.getErrorTransformer(response)
          pipesetup([response, concater, errorTransformer])
            .on('error', e => cb(e))
          return
        }
        cb()
      })
      req.on('error', e => cb(e))
      req.end()
    })
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
      protocol: this.params.protocol,
      path: `/${bucket}/${uriResourceEscape(key)}`,
      method: 'GET',
      headers
    }

    signV4(requestParams, '', this.params.accessKey, this.params.secretKey)

    var req = this.transport.request(requestParams, (response) => {
      if (!(response.statusCode === 200 || response.statusCode === 206)) {
        var concater = transformers.getConcater()
        var errorTransformer = transformers.getErrorTransformer(response)
        pipesetup([response, concater, errorTransformer])
          .on('error', e => cb(e))
        return
      }
      var dummyTransformer = transformers.getDummyTransformer()
      pipesetup([response, dummyTransformer])
      cb(null, dummyTransformer)
      return
    })
    req.on('error', e => cb(e))
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

    function calculatePartSize(size) {
      var minimumPartSize = 5 * 1024 * 1024, // 5MB
        maximumPartSize = 5 * 1025 * 1024 * 1024,
        // using 10000 may cause part size to become too small, and not fit the entire object in
        partSize = Math.floor(size / 9999)

      if (partSize > maximumPartSize) {
        return maximumPartSize
      }
      return Math.max(minimumPartSize, partSize)
    }

    var self = this

    if (size <= 5*1024*1024) {
      var concater = transformers.getConcater()
      pipesetup([r, concater])
        .on('error', e => cb(e))
        .on('data', chunk => self.doPutObject(bucket, key, contentType, null, null, chunk, cb))
      return
    }
    async.waterfall([
      function(cb) {
        self.findUploadId(bucket, key, cb)
      },
      function(uploadId, cb) {
        if (uploadId) {
          self.listAllParts(bucket, key, uploadId,  (e, etags) => {
            return cb(e, uploadId, etags)
          })
          return
        }
        self.initiateNewMultipartUpload(bucket, key, contentType, (e, uploadId) => {
          return cb(e, uploadId, [])
        })
      },
      function(uploadId, etags, cb) {
        var partSize = calculatePartSize(size)
        var sizeVerifier = transformers.getSizeVerifierTransformer(size)
        var chunker = BlockStream2({size: partSize, zeroPadding: false})
        var chunkUploader = self.chunkUploader(bucket, key, contentType, uploadId, etags)
        pipesetup([r, chunker, sizeVerifier, chunkUploader])
          .on('error', e => cb(e))
          .on('data', etags => cb(null, etags, uploadId))
      },
      function(etags, uploadId, cb) {
        self.completeMultipartUpload(bucket, key, uploadId, etags, cb)
      }
    ], function(err, etag) {
      if (err) {
        return cb(err)
      }
      cb(null, etag)
    })
  }

  listObjectsOnce(bucket, prefix, marker, delimiter, maxKeys) {
    var queries = []
      // escape every value in query string, except maxKeys
    if (prefix) {
      prefix = uriEscape(prefix)
      queries.push(`prefix=${prefix}`)
    }
    if (marker) {
      marker = uriEscape(marker)
      queries.push(`marker=${marker}`)
    }
    if (delimiter) {
      delimiter = uriEscape(delimiter)
      queries.push(`delimiter=${delimiter}`)
    }
    // no need to escape maxKeys
    if (maxKeys) {
      if (maxKeys >= 1000) {
        maxKeys = 1000
      }
      queries.push(`max-keys=${maxKeys}`)
    }
    queries.sort()
    var query = ''
    if (queries.length > 0) {
      query = `?${queries.join('&')}`
    }
    var requestParams = {
      host: this.params.host,
      port: this.params.port,
      protocol: this.params.protocol,
      path: `/${bucket}${query}`,
      method: 'GET'
    }

    var dummyTransformer = transformers.getDummyTransformer()
    signV4(requestParams, '', this.params.accessKey, this.params.secretKey)

    var req = this.transport.request(requestParams, (response) => {
      var errorTransformer = transformers.getErrorTransformer(response)
      var concater = transformers.getConcater()
      var transformer = transformers.getListObjectsTransformer()
      if (response.statusCode !== 200) {
        pipesetup([response, concater, errorTransformer, dummyTransformer])
        return
      }
      pipesetup([response, concater, transformer, dummyTransformer])
    })
    req.end()
    return dummyTransformer
  }

  listObjects(bucket, params) {
    if (!validateBucketName(bucket)) {
      throw new errors.InvalidateBucketNameException('Invalid bucket name: ' + bucket)
    }
    var self = this,
      prefix = null,
      delimiter = '/'
      // we delimit by default, turn off recursive if True

    if (params) {
      if (params.prefix) {
        prefix = params.prefix
      }
      if (params.recursive === true) {
        delimiter = null
      }
    }

    var dummyTransformer = transformers.getDummyTransformer()

    function listNext(marker) {
      self.listObjectsOnce(bucket, prefix, marker, delimiter, 1000)
        .on('error', e => dummyTransformer.emit('error', e))
        .on('data', result => {
          result.objects.forEach(object => {
            dummyTransformer.push(object)
          })
          if (result.isTruncated) {
            listNext(result.nextMarker)
            return
          }
          dummyTransformer.push(null) // signal 'end'
        })
    }
    listNext()
    return dummyTransformer
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
      protocol: this.params.protocol,
      path: `/${bucket}/${uriResourceEscape(key)}`,
      method: 'HEAD'
    }

    signV4(requestParams, '', this.params.accessKey, this.params.secretKey)

    var req = this.transport.request(requestParams, (response) => {
      var errorTransformer = transformers.getErrorTransformer(response)
      var concater = transformers.getConcater()
      if (response.statusCode !== 200) {
        pipesetup([response, concater, errorTransformer])
          .on('error', e => cb(e))
          return
      }
      var result = {
        size: +response.headers['content-length'],
        etag: response.headers.etag.replace(/"/g, ''),
        contentType: response.headers['content-type'],
        lastModified: response.headers['last-modified']
      }
      cb(null, result)
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
    this.objectRequest('DELETE', bucket, key, cb)
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
      protocol: this.params.protocol,
      path: `/${bucket}/${uriResourceEscape(key)}`,
      method: 'PUT',
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
      protocol: this.params.protocol,
      path: `/${bucket}/${uriResourceEscape(key)}`,
      method: 'GET',
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
