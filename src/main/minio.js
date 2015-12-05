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

import { isValidBucketName, isValidObjectName, getRegion, getScope, uriEscape, uriResourceEscape, isBoolean, isFunction, isNumber, isString, isObject, isNullOrUndefined, pipesetup } from './helpers.js';
import Multipart from './multipart.js';
import { signV4, presignSignatureV4, postPresignSignatureV4 } from './signing.js';

import * as transformers from './transformers'

import errors from './errors.js';

var Package = require('../../package.json');

export default class Client extends Multipart {
  constructor(params, transport) {
    var namespace = 'Minio'
    var parsedUrl = Url.parse(params.endPoint),
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

    // User Agent should always following the below style.
    // Please open an issue to discuss any new changes here.
    //
    //       Minio (OS; ARCH) LIB/VER APP/VER
    //
    var libraryComments = `(${process.platform}; ${process.arch})`
    var libraryAgent = `Minio ${libraryComments} minio-js/${Package.version}`
    // User agent block ends.

    var newParams = {
      host: host,
      port: port,
      protocol: protocol,
      accessKey: params.accessKey,
      secretKey: params.secretKey,
      userAgent: `${libraryAgent}`,
    }
    super(newParams, transport)
    this.params = newParams
    this.transport = transport
  }

  // CLIENT LEVEL CALLS

  // Set application specific information.
  //
  // Generates User-Agent in the following style.
  //
  //       Minio (OS; ARCH) LIB/VER APP/VER
  //
  // __Arguments__
  // * `appName` _string_ - Application name.
  // * `appVersion` _string_ - Application version.
  setAppInfo(appName, appVersion) {
    if (!isString(appName)) {
      throw new TypeError(`Invalid appName: ${appName}`)
    }
    if (appName.trim() === '') {
      throw new errors.InvalidArgumentException('Input appName cannot be empty.')
    }
    if (!isString(appVersion)) {
      throw new TypeError(`Invalid appName: ${appVersion}`)
    }
    if (appVersion.trim() === '') {
      throw new errors.InvalidArgumentException('Input appVersion cannot be empty.')
    }
    this.params.userAgent = `${this.params.userAgent} ${appName}/${appVersion}`
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
        pipesetup(response, concater, errorTransformer)
          .on('error', e => cb(e))
        return
      }
      // no data expected
      cb()
    })
    req.on('error', e => cb(e))
    req.end()
  }

  // Creates the bucket `bucketName`.
  //
  // __Arguments__
  // * `bucketName` _string_ - Name of the bucket
  // * `callback(err)` _function_ - callback function with `err` as the error argument. `err` is null if the bucket is successfully created.
  makeBucket(bucket, cb) {
    return this.makeBucketWithACL(bucket, 'private', cb)
  }

  makeBucketWithACL(bucket, acl, cb) {
    if (!isValidBucketName(bucket)) {
      throw new errors.InvalidBucketNameException('Invalid bucket name: ' + bucket)
    }
    if (!isString(acl)) {
      throw new TypeError('acl should be of type "string"')
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    var region = getRegion(this.params.host)
    if (region === 'us-east-1') {
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
        pipesetup(response, concater, errorTransformer)
          .on('error', e => cb(e))
        return
      }
      cb()
    })
    req.write(payload)
    req.end()
  }

  // List of buckets created.
  //
  // __Arguments__
  // * `callback(err, bucketStream)` _function_ - callback function with error as the first argument. `bucketStream` is the stream emitting bucket information.
  //
  // `bucketStream` emits Object with the format:
  // * `obj.name` _string_ : bucket name
  // * `obj.creationDate` _string_: date when bucket was created
  listBuckets(cb) {
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

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
        pipesetup(response, concater,  errorTransformer)
          .on('error', e => cb(e))
        return
      }
      var transformer = transformers.getListBucketTransformer();
      pipesetup(response, concater, transformer)
      cb(null, transformer)
    })
    req.on('error', e => cb(e))
    req.end()
  }

  // Returns a stream that emits objects that are partially uploaded.
  //
  // __Arguments__
  // * `bucketname` _string_: name of the bucket
  // * `prefix` _string_: prefix of the object names that are partially uploaded
  // * `recursive` bool: directory style listing when false, recursive listing when true
  //
  // __Return Value__
  // * `stream` _Stream_ : emits objects of the format:
  //   * `object.key` _string_: name of the object
  //   * `object.uploadId` _string_: upload ID of the object
  //   * `object.size` _Integer_: size of the partially uploaded object
  listIncompleteUploads(bucket, prefix, recursive) {
    if (!isValidBucketName(bucket)) {
      throw new errors.InvalidBucketNameException('Invalid bucket name: ' + bucket)
    }
    if (prefix && !isString(prefix)) {
      throw new TypeError('prefix should be of type "string"')
    }
    if (recursive && !isBoolean(recursive)) {
      throw new TypeError('recursive should be of type "boolean"')
    }
    var delimiter = recursive ? null : "/"
    var dummyTransformer = transformers.getDummyTransformer()
    var self = this
    function listNext(keyMarker, uploadIdMarker) {
      self.listIncompleteUploadsOnce(bucket, prefix, keyMarker, uploadIdMarker, delimiter)
        .on('error', e => dummyTransformer.emit('error', e))
        .on('data', result => {
          result.prefixes.forEach(prefix => dummyTransformer.write(prefix))
          async.eachSeries(result.uploads, (upload, cb) => {
            self.listAllParts(bucket, upload.key, upload.uploadId, (err, parts) => {
              if (err) return cb(err)
              upload.size = parts.reduce((acc, item) => acc + item.size, 0)
              dummyTransformer.write(upload)
              cb()
            })
          }, err => {
            if (err) {
              dummyTransformer.emit('error', e)
              dummyTransformer.end()
              return
            }
            if (result.isTruncated) {
              listNext(result.nextKeyMarker, result.nextUploadIdMarker)
              return
            }
            dummyTransformer.end() // signal 'end'
          })
        })
    }
    listNext()
    return dummyTransformer
  }

  // To check if a bucket already exists.
  //
  // __Arguments__
  // * `bucketName` _string_ : name of the bucket
  // * `callback(err)` _function_ : `err` is `null` if the bucket exists
  bucketExists(bucket, cb) {
    if (!isValidBucketName(bucket)) {
      throw new errors.InvalidBucketNameException('Invalid bucket name: ' + bucket)
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    this.bucketRequest('HEAD', bucket, cb)
  }

  // Remove a bucket.
  //
  // __Arguments__
  // * `bucketName` _string_ : name of the bucket
  // * `callback(err)` _function_ : `err` is `null` if the bucket is removed successfully.
  removeBucket(bucket, cb) {
    if (!isValidBucketName(bucket)) {
      throw new errors.InvalidBucketNameException('Invalid bucket name: ' + bucket)
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    this.bucketRequest('DELETE', bucket, cb)
  }

  // get a bucket's ACL.
  //
  // __Arguments__
  // * `bucketName` _string_ : name of the bucket
  // * `callback(err, acl)` _function_ : `err` is not `null` in case of error. `acl` _string_ is the cannedACL which can have the values _private_, _public-read_, _public-read-write_.
  getBucketACL(bucket, cb) {
    if (!isValidBucketName(bucket)) {
      throw new errors.InvalidBucketNameException('Invalid bucket name: ' + bucket)
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
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
        pipesetup(response, concater, errorTransformer)
          .on('error', e => cb(e))
        return
      }
      pipesetup(response, concater, transformer)
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

  // set a bucket's ACL.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `acl` _string_: acl can be _private_, _public-read_, _public-read-write_
  // * `callback(err)` _function_: callback is called with error or `null`
  setBucketACL(bucket, acl, cb) {
    if (!isValidBucketName(bucket)) {
      throw new errors.InvalidBucketNameException('Invalid bucket name: ' + bucket)
    }
    if (!isString(acl)) {
      throw new TypeError('acl should be of type "string"')
    }
    if (acl.trim() === '') {
      throw new errors.InvalidEmptyACLException('Acl name cannot be empty')
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
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
        pipesetup(response, concater, errorTransformer)
          .on('error', e => cb(e))
        return
      }
      cb()
    })
    // FIXME: the below line causes weird failure in 'gulp test'
    // req.on('error', e => cb(e))
    req.end()
  }

  // Remove the partially uploaded object.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `callback(err)` _function_: callback function is called with non `null` value in case of error
  removeIncompleteUpload(bucketName, objectName, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.isValidBucketNameException('Invalid bucket name: ' + bucket)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameException(`Invalid object name: ${objectName}`)
    }
    if (objectName.trim() === '') {
      throw new errors.InvalidObjectNameException('Object name cannot be empty')
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    var self = this
    this.findUploadId(bucketName, objectName, (err, uploadId) => {
      if (err || !uploadId) {
        return cb(err)
      }
      var requestParams = {
        host: self.params.host,
        port: self.params.port,
        protocol: self.params.protocol,
        path: `/${bucketName}/${objectName}?uploadId=${uploadId}`,
        method: 'DELETE'
      }

      signV4(requestParams, '', self.params.accessKey, self.params.secretKey)

      var req = self.transport.request(requestParams, (response) => {
        if (response.statusCode !== 204) {
          var concater = transformers.getConcater()
          var errorTransformer = transformers.getErrorTransformer(response)
          pipesetup(response, concater, errorTransformer)
            .on('error', e => cb(e))
          return
        }
        cb()
      })
      req.on('error', e => cb(e))
      req.end()
    })
  }

  // Callback is called with readable stream of the object content.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `callback(err, stream)` _function_: callback is called with `err` in case of error. `stream` is the object content stream
  getObject(bucketName, objectName, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameException('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameException(`Invalid object name: ${objectName}`)
    }
    if (objectName.trim() === '') {
      throw new errors.InvalidObjectNameException('Object name cannot be empty')
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    this.getPartialObject(bucketName, objectName, 0, 0, cb)
  }

  // Callback is called with readable stream of the partial object content.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `offset` _number_: offset of the object from where the stream will start
  // * `length` _number_: length of the object that will be read in the stream
  // * `callback(err, stream)` _function_: callback is called with `err` in case of error. `stream` is the object content stream
  getPartialObject(bucketName, objectName, offset, length, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameException('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameException(`Invalid object name: ${objectName}`)
    }
    if (objectName.trim() === '') {
      throw new errors.InvalidObjectNameException('Object name cannot be empty')
    }
    if (!isNumber(offset)) {
      throw new TypeError('offset should be of type "number"')
    }
    if (!isNumber(length)) {
      throw new TypeError('length should be of type "number"')
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
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
      path: `/${bucketName}/${uriResourceEscape(objectName)}`,
      method: 'GET',
      headers
    }

    signV4(requestParams, '', this.params.accessKey, this.params.secretKey)

    var req = this.transport.request(requestParams, (response) => {
      if (!(response.statusCode === 200 || response.statusCode === 206)) {
        var concater = transformers.getConcater()
        var errorTransformer = transformers.getErrorTransformer(response)
        pipesetup(response, concater, errorTransformer)
          .on('error', e => cb(e))
        return
      }
      var dummyTransformer = transformers.getDummyTransformer()
      pipesetup(response, dummyTransformer)
      cb(null, dummyTransformer)
      return
    })
    req.on('error', e => cb(e))
    req.end()
  }

  // Uploads the object.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `stream` _Stream_: Readable stream
  // * `size` _number_: size of the object
  // * `contentType` _string_: content type of the object
  // * `callback(err, etag)` _function_: non null `err` indicates error, `etag` _string_ is the etag of the object uploaded.
  putObject(bucketName, objectName, stream, size, contentType, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameException('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameException(`Invalid object name: ${objectName}`)
    }
    if (objectName.trim() === '') {
      throw new errors.InvalidObjectNameException('Object name cannot be empty')
    }
    if (!isObject(stream)) {
      throw new TypeError('stream should be a "Stream"')
    }
    if (!isNumber(size)) {
      throw new TypeError('size should be of type "number"')
    }
    if (!isString(contentType)) {
      throw new TypeError('contentType should be of type "string"')
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    if (contentType.trim() === '') {
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
      pipesetup(stream, concater)
        .on('error', e => cb(e))
        .on('data', chunk => self.doPutObject(bucketName, objectName, contentType, null, null, chunk, cb))
      return
    }
    async.waterfall([
      function(cb) {
        self.findUploadId(bucketName, objectName, cb)
      },
      function(uploadId, cb) {
        if (uploadId) {
          self.listAllParts(bucketName, objectName, uploadId,  (e, etags) => {
            return cb(e, uploadId, etags)
          })
          return
        }
        self.initiateNewMultipartUpload(bucketName, objectName, contentType, (e, uploadId) => {
          return cb(e, uploadId, [])
        })
      },
      function(uploadId, etags, cb) {
        var partSize = calculatePartSize(size)
        var sizeVerifier = transformers.getSizeVerifierTransformer(size)
        var chunker = BlockStream2({size: partSize, zeroPadding: false})
        var chunkUploader = self.chunkUploader(bucketName, objectName, contentType, uploadId, etags)
        pipesetup(stream, chunker, sizeVerifier, chunkUploader)
          .on('error', e => cb(e))
          .on('data', etags => cb(null, etags, uploadId))
      },
      function(etags, uploadId, cb) {
        self.completeMultipartUpload(bucketName, objectName, uploadId, etags, cb)
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
        pipesetup(response, concater, errorTransformer, dummyTransformer)
        return
      }
      pipesetup(response, concater, transformer, dummyTransformer)
    })
    req.end()
    return dummyTransformer
  }

  // List the objects in the bucket.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `prefix` _string_: the prefix of the objects that should be listed
  // * `recursive` _bool_: `true` indicates recursive style listing and `false` indicates directory style listing delimited by '/'.
  //
  // __Return Value__
  // * `stream` _Stream_: stream emitting the objects in the bucket, the object is of the format:
  //   * `stat.key` _string_: name of the object
  //   * `stat.size` _number_: size of the object
  //   * `stat.etag` _string_: etag of the object
  //   * `stat.lastModified` _string_: modified time stamp
  listObjects(bucketName, prefix, recursive) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameException('Invalid bucket name: ' + bucketName)
    }
    if (prefix && !isString(prefix)) {
      throw new TypeError('prefix should be of type "string"')
    }
    if (recursive && !isBoolean(recursive)) {
      throw new TypeError('recursive should be of type "boolean"')
    }
    // recursive is null set delimiter to '/'.
    var delimiter = recursive ? null : "/"
    var dummyTransformer = transformers.getDummyTransformer()
    var self = this
    function listNext(marker) {
      self.listObjectsOnce(bucketName, prefix, marker, delimiter, 1000)
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

  // Stat information of the object.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `callback(err, stat)` _function_: `err` is not `null` in case of error, `stat` contains the object information:
  //   * `stat.size` _number_: size of the object
  //   * `stat.etag` _string_: etag of the object
  //   * `stat.contentType` _string_: Content-Type of the object
  //   * `stat.lastModified` _string_: modified time stamp
  statObject(bucketName, objectName, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameException('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameException(`Invalid object name: ${objectName}`)
    }
    if (objectName.trim() === '') {
      throw new errors.InvalidObjectNameException('Object name cannot be empty')
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    var requestParams = {
      host: this.params.host,
      port: this.params.port,
      protocol: this.params.protocol,
      path: `/${bucketName}/${uriResourceEscape(objectName)}`,
      method: 'HEAD'
    }

    signV4(requestParams, '', this.params.accessKey, this.params.secretKey)

    var req = this.transport.request(requestParams, (response) => {
      var errorTransformer = transformers.getErrorTransformer(response)
      var concater = transformers.getConcater()
      if (response.statusCode !== 200) {
        pipesetup(response, concater, errorTransformer)
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

  // Remove the specified object.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `callback(err)` _function_: callback function is called with non `null` value in case of error
  removeObject(bucketName, objectName, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameException('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameException(`Invalid object name: ${objectName}`)
    }
    if (objectName.trim() === '') {
      throw new errors.InvalidObjectNameException('Object name cannot be empty')
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    this.objectRequest('DELETE', bucketName, objectName, cb)
  }

  // Generate a presigned URL for PUT. Using this URL, the browser can upload to S3 only with the specified object name.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `expiry` _number_: expiry in seconds
  presignedPutObject(bucketName, objectName, expires) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameException('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameException(`Invalid object name: ${objectName}`)
    }
    if (objectName.trim() === '') {
      throw new errors.InvalidObjectNameException('Object name cannot be empty')
    }
    if (!isNumber(expires)) {
      throw new TypeError('expires should be of type "number"')
    }
    expires = expires.toString()
    var requestParams = {
      host: this.params.host,
      port: this.params.port,
      protocol: this.params.protocol,
      path: `/${bucketName}/${uriResourceEscape(objectName)}`,
      method: 'PUT',
      expires: expires
    }
    return presignSignatureV4(requestParams, this.params.accessKey, this.params.secretKey)
  }

  // Generate a presigned URL for GET
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `expiry` _number_: expiry in seconds
  presignedGetObject(bucketName, objectName, expires) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameException('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameException(`Invalid object name: ${objectName}`)
    }
    if (objectName.trim() === '') {
      throw new errors.InvalidObjectNameException('Object name cannot be empty')
    }
    if (!isNumber(expires)) {
      throw new TypeError('expires should be of type "number"')
    }
    expires = expires.toString()
    var requestParams = {
      host: this.params.host,
      port: this.params.port,
      protocol: this.params.protocol,
      path: `/${bucketName}/${uriResourceEscape(objectName)}`,
      method: 'GET',
      expires: expires
    }
    return presignSignatureV4(requestParams, this.params.accessKey, this.params.secretKey)
  }

  // return PostPolicy object
  newPostPolicy() {
    return new PostPolicy()
  }

  // presignedPostPolicy can be used in situations where we want more control on the upload than what
  // presignedPutObject() provides. i.e Using presignedPostPolicy we will be able to put policy restrictions
  // on the object's `name` `bucket` `expiry` `Content-Type`
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

    var signature = postPresignSignatureV4(region, date, this.params.secretKey, policyBase64)

    postPolicy.formData['x-amz-signature'] = signature

    return postPolicy.formData
  }
}

// Build PostPolicy object that can be signed by presignedPostPolicy
class PostPolicy {
  constructor() {
    this.policy = {
      conditions: []
    }
    this.formData = {}
  }

  // set expiration date
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

  // set object name
  setKey(key) {
    if (!key) {
      throw new errors("key can not be null")
    }
    this.policy.conditions.push(["eq", "$key", key])
    this.formData.key = key
  }

  // set object name prefix, i.e policy allows any keys with this prefix
  setKeyStartsWith(prefix) {
    if (!prefix) {
      throw new errors("key prefix can not be null")
    }
    this.policy.conditions.push(["starts-with", "$key", keyStartsWith])
    this.formData.key = key
  }

  // set bucket name
  setBucket(bucket) {
    if (!bucket) {
      throw new errors("bucket can not be null")
    }
    this.policy.conditions.push(["eq", "$bucket", bucket])
    this.formData.bucket = bucket
  }

  // set Content-Type
  setContentType(type) {
    if (!type) {
      throw new errors("content-type can not be null")
    }
    this.policy.conditions.push(["eq", "$Content-Type", type])
    this.formData["Content-Type"] = type
  }

  // set minimum/maximum length of what Content-Length can be
  setContentLength(min, max) {
    if (min > max) {
      throw new errrors("min can not be more than max")
    }
    if (min < 0) {
      throw new errors("min has to be > 0")
    }
    if (max < 0) {
      throw new errors("max has to be > 0")
    }
    this.policy.conditions.push(["content-length-range", min, max])
  }
}
