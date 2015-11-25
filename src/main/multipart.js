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
  constructor(params, transport) {
    this.params = params
    this.transport = transport
  }

  initiateNewMultipartUpload(bucket, key, contentType, cb) {
    var requestParams = {
      host: this.params.host,
      port: this.params.port,
      protocol: this.params.protocol,
      path: `/${bucket}/${uriResourceEscape(key)}?uploads`,
      method: 'POST',
      headers: {
        'Content-Type': contentType
      }
    }

    signV4(requestParams, '', this.params.accessKey, this.params.secretKey)

    var concater = transformers.getConcater()
    var transformer = transformers.getInitiateMultipartTransformer()
    var request = this.transport.request(requestParams, (response) => {
      if (response.statusCode !== 200) {
        var errorTransformer = transformers.getErrorTransformer(response)
        pipesetup(response, concater, errorTransformer)
          .on('error', e => cb(e))
        return
      }
      pipesetup(response, concater, transformer)
        .on('error', e => cb(e))
        .on('data', uploadId => cb(null, uploadId))
    })
    request.end()
  }

  completeMultipartUpload(bucket, key, uploadId, etags, cb) {
    var requestParams = {
      host: this.params.host,
      port: this.params.port,
      protocol: this.params.protocol,
      path: `/${bucket}/${uriResourceEscape(key)}?uploadId=${uploadId}`,
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
      },
      payload = Xml(payloadObject),
      hash = Crypto.createHash('sha256')

    hash.update(payload)

    var sha256 = hash.digest('hex').toLowerCase()

    signV4(requestParams, sha256, this.params.accessKey, this.params.secretKey)

    var concater = transformers.getConcater()
    var transformer = transformers.getCompleteMultipartTransformer()

    var request = this.transport.request(requestParams, (response) => {
      if (response.statusCode !== 200) {
        var errorTransformer = transformers.getErrorTransformer(response)
        pipesetup(response, concater, errorTransformer)
          .on('error', e => cb(e))
        return
      }
      pipesetup(response, concater, transformer)
        .on('error', e => cb(e))
        .on('data', result => cb(null, result.etag))
    })
    request.write(payload)
    request.end()
  }

  listAllParts(bucket, key, uploadId, cb) {
    var parts = []
    var self = this
    function listNext(marker) {
      self.listParts(bucket, key, uploadId, marker, (e, result) => {
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

  listParts(bucket, key, uploadId, marker, cb) {
    var query = '?'
    if (marker && marker !== 0) {
      query += `part-number-marker=${marker}&`
    }
    query += `uploadId=${uploadId}`
    var requestParams = {
      host: this.params.host,
      port: this.params.port,
      protocol: this.params.protocol,
      path: `/${bucket}/${uriResourceEscape(key)}${query}`,
      method: 'GET'
    }

    signV4(requestParams, '', this.params.accessKey, this.params.secretKey)
    var concater = transformers.getConcater()
    var transformer = transformers.getListPartsTransformer()
    var req = this.transport.request(requestParams, (response) => {
      if (response.statusCode !== 200) {
        var errorTransformer = transformers.getErrorTransformer(response)
        pipesetup(response, concater, errorTransformer)
          .on('error', e => cb(e))
        return
      }
      pipesetup(response, concater, transformer)
        .on('error', e => cb(e))
        .on('data', data => cb(null, data))
    })
    req.on('error', e => cb(e))
    req.end()
  }

  listIncompleteUploadsOnce(bucket, prefix, keyMarker, uploadIdMarker, delimiter) {
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
      query = `?${queries.join('&')}`
    }
    var requestParams = {
      host: this.params.host,
      port: this.params.port,
      path: `/${bucket}${query}`,
      method: 'GET'
    }
    signV4(requestParams, '', this.params.accessKey, this.params.secretKey)

    var transformer = transformers.getListMultipartTransformer()
    var dummyTransformer = transformers.getDummyTransformer()
    var concater = transformers.getConcater()

    var req = this.transport.request(requestParams, (response) => {
      if (response.statusCode !== 200) {
        var errorTransformer = transformers.getErrorTransformer(response)
        pipesetup(response, concater, errorTransformer, dummyTransformer)
        return
      }
      pipesetup(response, concater, transformer, dummyTransformer)
    })
    req.on('error', e => dummyTransformer.emit('error', e))
    req.end()
    return dummyTransformer
  }

  findUploadId(bucket, key, cb) {
    var self = this
    function listNext(keyMarker, uploadIdMarker) {
      self.listIncompleteUploadsOnce(bucket, key, keyMarker, uploadIdMarker)
        .on('error', e => cb(e))
        .on('data', result => {
          var keyFound = false
          result.uploads.forEach(upload => {
            if (upload.key === key) {
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

  chunkUploader(bucket, key, contentType, uploadId, partsArray) {
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
      self.doPutObject(bucket, key, contentType, uploadId, partNumber, chunk, (e, etag) => {
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

  doPutObject(bucket, key, contentType, uploadId, part, data, cb) {
    var query = ''
    if (part) {
      query = `?partNumber=${part}&uploadId=${uploadId}`
    }
    if (contentType === null || contentType === '') {
      contentType = 'application/octet-stream'
    }

    var hash256 = Crypto.createHash('sha256')
    var hashMD5 = Crypto.createHash('md5')

    hash256.update(data)
    hashMD5.update(data)

    var sha256 = hash256.digest('hex').toLowerCase(),
      md5 = hashMD5.digest('base64'),
      requestParams = {
        host: this.params.host,
        port: this.params.port,
        protocol: this.params.protocol,
        path: `/${bucket}/${uriResourceEscape(key)}${query}`,
        method: 'PUT',
        headers: {
          'Content-Length': data.length,
          'Content-Type': contentType,
          'Content-MD5': md5
        }
      }

    signV4(requestParams, sha256, this.params.accessKey, this.params.secretKey)
    var req = this.transport.request(requestParams, (response) => {
      if (response.statusCode !== 200) {
        var concater = transformers.getConcater()
        var errorTransformer = transformers.getErrorTransformer(response)
        pipesetup(response, concater, errorTransformer)
          .on('error', e => cb(e))
        return
      }
      var etag = response.headers.etag
      if (etag) {
        etag = etag.replace(/^\"/, '').replace(/\"$/, '')
      }
      cb(null, etag)
    })
    req.on('error', e => cb(e))
    req.write(data)
    req.end()
  }
}
