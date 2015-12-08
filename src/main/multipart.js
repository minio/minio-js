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

import Crypto from 'crypto';
import Concat from 'concat-stream';
import Stream from 'stream';
import Xml from 'xml';
import Through2 from 'through2';

import { uriEscape, uriResourceEscape, pipesetup } from './helpers.js';
import { signV4 } from './signing.js';
import * as transformers from './transformers.js'
import * as xmlParsers from './xml-parsers.js'

export default class Multipart {
  constructor(params, transport, pathStyle) {
    this.params = params
    this.transport = transport
    this.pathStyle = pathStyle
  }

  initiateNewMultipartUpload(bucketName, objectName, contentType, cb) {
    var method = 'POST'
    var headers = {'Content-Type': contentType}
    var query = 'uploads'
    this.makeRequest({method, bucketName, objectName, query, headers}, '', 200, (e, response) => {
      if (e) return cb(e)
      var concater = transformers.getConcater()
      var transformer = transformers.getInitiateMultipartTransformer()
      pipesetup(response, concater, transformer)
        .on('error', e => cb(e))
        .on('data', uploadId => cb(null, uploadId))
    })
  }

  completeMultipartUpload(bucketName, objectName, uploadId, etags, cb) {
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
      var concater = transformers.getConcater()
      var transformer = transformers.getCompleteMultipartTransformer()
      pipesetup(response, concater, transformer)
        .on('error', e => cb(e))
        .on('data', result => cb(null, result.etag))
    })
  }

  listAllParts(bucketName, objectName, uploadId, cb) {
    var parts = []
    var self = this
    function listNext(marker) {
      self.listParts(bucketName, objectName, uploadId, marker, (e, result) => {
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
    var query = ''
    if (marker && marker !== 0) {
      query += `part-number-marker=${marker}&`
    }
    query += `uploadId=${uploadId}`

    var method = 'GET'
    this.makeRequest({method, bucketName, objectName, query}, '', 200, (e, response) => {
      if (e) return cb(e)
      var concater = transformers.getConcater()
      var transformer = transformers.getListPartsTransformer()
      pipesetup(response, concater, transformer)
        .on('error', e => cb(e))
        .on('data', data => cb(null, data))
    })
  }

  listIncompleteUploadsOnce(bucketName, prefix, keyMarker, uploadIdMarker, delimiter) {
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
    var dummyTransformer = transformers.getDummyTransformer()
    this.makeRequest({method, bucketName, query}, '', 200, (e, response) => {
      if (e) return dummyTransformer.emit('error', e)
      var transformer = transformers.getListMultipartTransformer()
      var concater = transformers.getConcater()
      pipesetup(response, concater, transformer, dummyTransformer)
    })
    return dummyTransformer
  }

  findUploadId(bucketName, objectName, cb) {
    var self = this
    function listNext(keyMarker, uploadIdMarker) {
      self.listIncompleteUploadsOnce(bucketName, objectName, keyMarker, uploadIdMarker)
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
    listNext()
  }

  chunkUploader(bucketName, objectName, contentType, uploadId, partsArray) {
    var partsDone = []
    var self = this
    var partNumber = 1

    // convert array to object to make things easy
    var parts = partsArray.reduce(function(acc, item) {
      if (!acc[item.part]) {
        acc[item.part] = item
      }
      return acc
    }, {})

    return Through2.obj(function(chunk, enc, cb) {
      var part = parts[partNumber]
      if (part) {
        var hash = Crypto.createHash('md5')
        hash.update(chunk)
        var md5 = hash.digest('hex').toLowerCase()
        if (md5 === part.etag) {
          //md5 matches, chunk already uploaded
          partsDone.push({part: part.part, etag: part.etag})
          partNumber++
          return cb()
        }
        // md5 doesn't match, upload again
      }
      self.doPutObject(bucketName, objectName, contentType, uploadId, partNumber, chunk, (e, etag) => {
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

  doPutObject(bucketName, objectName, contentType, uploadId, part, data, cb) {
    var query = ''
    if (part) {
      query = `partNumber=${part}&uploadId=${uploadId}`
    }
    if (contentType === null || contentType === '') {
      contentType = 'application/octet-stream'
    }
    var method = 'PUT'
    var hashMD5 = Crypto.createHash('md5')

    hashMD5.update(data)

    var headers = {
      'Content-Length': data.length,
      'Content-Type': contentType,
      'Content-MD5': hashMD5.digest('base64')
    }
    this.makeRequest({method, bucketName, objectName, query, headers}, data, 200, (e, response) => {
      if (e) return cb(e)
      var etag = response.headers.etag
      if (etag) {
        etag = etag.replace(/^\"/, '').replace(/\"$/, '')
      }
      cb(null, etag)
    })
  }
}
