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

import fs from 'fs'
import Crypto from 'crypto';
import Concat from 'concat-stream';
import Stream from 'stream';
import Xml from 'xml';
import Through2 from 'through2';
import _ from 'lodash'

import { uriEscape, uriResourceEscape, pipesetup, readableStream, isValidBucketName, isValidObjectName, isString, isNumber, isReadableStream, isFunction, isBoolean, isObject } from './helpers.js';
import { signV4 } from './signing.js';
import * as transformers from './transformers.js'
import * as xmlParsers from './xml-parsers.js'

export default class Multipart {
  constructor(params, transport, pathStyle) {
    this.params = params
    this.anonymous = !params.accessKey || !params.secretKey
    this.transport = transport
    this.pathStyle = pathStyle
    this.minimumPartSize = 5*1024*1024
    this.maximumPartSize = 5*1024*1024*1024
    this.maximumStreamObjectSize = 50*1024*1024*1024
    this.maxObjectSize = 5*1024*1024*1024*1024
  }

  initiateNewMultipartUpload(bucketName, objectName, contentType, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isString(contentType)) {
      throw new TypeError('contentType should be of type "string"')
    }
    var method = 'POST'
    var headers = {'Content-Type': contentType}
    var query = 'uploads'
    this.makeRequest({method, bucketName, objectName, query, headers}, '', 200, (e, response) => {
      if (e) return cb(e)
      var transformer = transformers.getInitiateMultipartTransformer()
      pipesetup(response, transformer)
        .on('error', e => cb(e))
        .on('data', uploadId => cb(null, uploadId))
    })
  }

  completeMultipartUpload(bucketName, objectName, uploadId, etags, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isString(uploadId)) {
      throw new TypeError('uploadId should be of type "string"')
    }
    if (!isObject(etags)) {
      throw new TypeError('etags should be of type "Array"')
    }
    if (!isFunction(cb)) {
      throw new TypeError('cb should be of type "function"')
    }

    if (!uploadId) {
      throw new errors.InvalidArgumentError('uploadId cannot be empty')
    }

    var method = 'POST'
    var query = `uploadId=${uploadId}`

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

    var payloadObject = {CompleteMultipartUpload: parts}
    var payload = Xml(payloadObject)

    this.makeRequest({method, bucketName, objectName, query}, payload, 200, (e, response) => {
      if (e) return cb(e)
      var transformer = transformers.getCompleteMultipartTransformer()
      pipesetup(response, transformer)
        .on('error', e => cb(e))
        .on('data', result => cb(null, result.etag))
    })
  }

  listAllParts(bucketName, objectName, uploadId, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isString(uploadId)) {
      throw new TypeError('uploadId should be of type "string"')
    }
    if (!uploadId) {
      throw new errors.InvalidArgumentError('uploadId cannot be empty')
    }
    var parts = []
    var listNext = (marker) => {
      this.listParts(bucketName, objectName, uploadId, marker, (e, result) => {
        if (e) {
          cb(e)
          return
        }
        parts = parts.concat(result.parts)
        if (result.isTruncated) {
          listNext(result.marker)
          return
        }
        cb(null, parts)
      })
    }
    listNext(0)
  }

  listParts(bucketName, objectName, uploadId, marker, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isString(uploadId)) {
      throw new TypeError('uploadId should be of type "string"')
    }
    if (!isNumber(marker)) {
      throw new TypeError('marker should be of type "number"')
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    if (!uploadId) {
      throw new errors.InvalidArgumentError('uploadId cannot be empty')
    }
    var query = ''
    if (marker && marker !== 0) {
      query += `part-number-marker=${marker}&`
    }
    query += `uploadId=${uploadId}`

    var method = 'GET'
    this.makeRequest({method, bucketName, objectName, query}, '', 200, (e, response) => {
      if (e) return cb(e)
      var transformer = transformers.getListPartsTransformer()
      pipesetup(response, transformer)
        .on('error', e => cb(e))
        .on('data', data => cb(null, data))
    })
  }

  listIncompleteUploadsOnce(bucketName, prefix, keyMarker, uploadIdMarker, delimiter) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isString(prefix)) {
      throw new TypeError('prefix should be of type "string"')
    }
    if (!isString(keyMarker)) {
      throw new TypeError('keyMarker should be of type "string"')
    }
    if (!isString(uploadIdMarker)) {
      throw new TypeError('uploadIdMarker should be of type "string"')
    }
    if (!isString(delimiter)) {
      throw new TypeError('delimiter should be of type "string"')
    }
    var queries = []
    if (prefix) {
      queries.push(`prefix=${uriEscape(prefix)}`)
    }
    if (keyMarker) {
      keyMarker = uriEscape(keyMarker)
      queries.push(`key-marker=${keyMarker}`)
    }
    if (uploadIdMarker) {
      queries.push(`upload-id-marker=${uploadIdMarker}`)
    }
    if (delimiter) {
      queries.push(`delimiter=${uriEscape(delimiter)}`)
    }
    var maxUploads = 1000
    queries.push(`max-uploads=${maxUploads}`)
    queries.sort()
    queries.unshift('uploads')
    var query = ''
    if (queries.length > 0) {
      query = `${queries.join('&')}`
    }
    var method = 'GET'
    var transformer = transformers.getListMultipartTransformer()
    this.makeRequest({method, bucketName, query}, '', 200, (e, response) => {
      if (e) return transformer.emit('error', e)
      pipesetup(response, transformer)
    })
    return transformer
  }

  findUploadId(bucketName, objectName, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isFunction(cb)) {
      throw new TypeError('cb should be of type "function"')
    }

    var listNext = (keyMarker, uploadIdMarker) => {
      this.listIncompleteUploadsOnce(bucketName, objectName, keyMarker, uploadIdMarker, '')
        .on('error', e => cb(e))
        .on('data', result => {
          var keyFound = false
          result.uploads.forEach(upload => {
            if (upload.key === objectName) {
              cb(null, upload.uploadId)
              keyFound = true
            }
          })
          if (keyFound) {
            return
          }
          if (result.isTruncated) {
            listNext(result.nextKeyMarker, result.nextUploadIdMarker)
            return
          }
          cb(null, undefined)
        })
    }
    listNext('', '')
  }

  chunkUploader(bucketName, objectName, contentType, uploadId, partsArray) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isString(contentType)) {
      throw new TypeError('contentType should be of type "string"')
    }
    if (!isString(uploadId)) {
      throw new TypeError('uploadId should be of type "string"')
    }
    if (!isObject(partsArray)) {
      throw new TypeError('partsArray should be of type "Array"')
    }
    var partsDone = []
    var partNumber = 1

    // convert array to object to make things easy
    var parts = partsArray.reduce(function(acc, item) {
      if (!acc[item.part]) {
        acc[item.part] = item
      }
      return acc
    }, {})

    return Through2.obj((chunk, enc, cb) => {
      var part = parts[partNumber]
      var md5sumhex = Crypto.createHash('md5').update(chunk).digest('hex').toLowerCase()
      if (part) {
        if (md5sumhex === part.etag) {
          //md5 matches, chunk already uploaded
          partsDone.push({part: part.part, etag: part.etag})
          partNumber++
          return cb()
        }
        // md5 doesn't match, upload again
      }
      var sha256sum = Crypto.createHash('sha256').update(chunk).digest('hex').toLowerCase()
      var md5sumbase64 = (new Buffer(md5sumhex, 'hex')).toString('base64')
      var stream = readableStream(chunk)
      var multipart = true
      var uploader = this.getUploader(bucketName, objectName, contentType, multipart)
      uploader(uploadId, partNumber, stream, chunk.length, sha256sum, md5sumbase64, (e, etag) => {
        if (e) {
          partNumber++
          return cb(e)
        }
        var part = {
          part: partNumber,
          etag: etag
        }
        partsDone.push(part)
        partNumber++
        cb()
      })
    }, function(cb) {
      this.push(partsDone)
      this.push(null)
      cb()
    })
  }

  getUploader(bucketName, objectName, contentType, multipart) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isString(contentType)) {
      throw new TypeError('contentType should be of type "string"')
    }
    if (!isBoolean(multipart)) {
      throw new TypeError('multipart should be of type "boolean"')
    }
    if (contentType === '') {
      contentType = 'application/octet-stream'
    }

    var validate = (stream, length, sha256sum, md5sum, cb) => {
      if (!isReadableStream(stream)) {
        throw new TypeError('stream should be of type "Stream"')
      }
      if (!isNumber(length)) {
        throw new TypeError('length should be of type "number"')
      }
      if (!isString(sha256sum)) {
        throw new TypeError('sha256sum should be of type "string"')
      }
      if (!isString(md5sum)) {
        throw new TypeError('md5sum should be of type "string"')
      }
      if (!isFunction(cb)) {
        throw new TypeError('callback should be of type "function"')
      }
    }
    var simpleUploader = (...args) => {
      validate(...args)
      var query = ''
      upload(query, ...args)
    }
    var multipartUploader = (uploadId, partNumber, ...rest) => {
      if (!isString(uploadId)) {
        throw new TypeError('uploadId should be of type "string"')
      }
      if (!isNumber(partNumber)) {
        throw new TypeError('partNumber should be of type "number"')
      }
      if (!uploadId) {
        throw new errors.InvalidArgumentError('Empty uploadId')
      }
      if (!partNumber) {
        throw new errors.InvalidArgumentError('partNumber cannot be 0')
      }
      validate(...rest)
      var query = `partNumber=${partNumber}&uploadId=${uploadId}`
      upload(query, ...rest)
    }
    var upload = (query, stream, length, sha256sum, md5sum, cb) => {
      var method = 'PUT'
      var headers = {
        'Content-Length': length,
        'Content-Type': contentType,
        'Content-MD5': md5sum
      }
      this.makeRequestStream({method, bucketName, objectName, query, headers},
                            stream, sha256sum, 200, (e, response) => {
        if (e) return cb(e)
        var etag = response.headers.etag
        if (etag) {
          etag = etag.replace(/^\"/, '').replace(/\"$/, '')
        }
        cb(null, etag)
      })
    }
    if (multipart) {
      return multipartUploader
    }
    return simpleUploader
  }
}
