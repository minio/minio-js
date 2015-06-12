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

var Stream = require('stream')
var Through2 = require('through2')

var helpers = require('./helpers.js')
var signV4 = require('./signing.js')
var xmlParsers = require('./xml-parsers.js')

var listAllIncompleteUploads = function(transport, params, bucket, object) {
  var errorred = null
  var queue = new Stream.Readable({
    objectMode: true
  })
  queue._read = () => {}

  var stream = queue.pipe(Through2.obj(function(currentJob, enc, done) {
    if (errorred) {
      return done()
    }
    listMultipartUploads(transport, params, currentJob.bucket, currentJob.object, currentJob.objectMarker, currentJob.uploadIdMarker, (e, r) => {
      if (errorred) {
        return done()
      }
      // TODO handle error
      if (e) {
        return done(e)
      }
      r.uploads.forEach(upload => {
        this.push(upload)
      })
      if (r.isTruncated) {
        queue.push({
          bucket: bucket,
          object: decodeURI(object),
          objectMarker: decodeURI(r.objectMarker),
          uploadIdMarker: decodeURI(r.uploadIdMarker)
        })
      } else {
        queue.push(null)
      }
      done()
    })
  }, function(done) {
    if (errorred) {
      return done(errorred)
    }
    return done()
  }))

  queue.push({
    bucket: bucket,
    object: object,
    objectMarker: null,
    uploadIdMarker: null
  })

  return stream
}

function listMultipartUploads(transport, params, bucket, key, keyMarker, uploadIdMarker, cb) {
  var queries = []
  var escape = helpers.uriEscape
  if (key) {
    queries.push(`prefix=${escape(key)}`)
  }
  if (keyMarker) {
    keyMarker = escape(keyMarker)
    queries.push(`key-marker=${keyMarker}`)
  }
  if (uploadIdMarker) {
    uploadIdMarker = escape(uploadIdMarker)
    queries.push(`upload-id-marker=${uploadIdMarker}`)
  }
  var maxuploads = 1000;
  queries.push(`max-uploads=${maxuploads}`)
  queries.sort()
  queries.unshift('uploads')
  var query = ''
  if (queries.length > 0) {
    query = `?${queries.join('&')}`
  }
  var requestParams = {
    host: params.host,
    port: params.port,
    path: `/${bucket}${query}`,
    method: 'GET'
  }

  signV4(requestParams, '', params.accessKey, params.secretKey)

  var req = transport.request(requestParams, (response) => {
    if (response.statusCode !== 200) {
      return xmlParsers.parseError(response, cb)
    }
    xmlParsers.parseListMultipartResult(bucket, key, response, cb)
  })
  req.end()
}

var abortMultipartUpload = (transport, params, bucket, key, uploadId, cb) => {
  var requestParams = {
    host: params.host,
    port: params.port,
    path: `/${bucket}/${key}?uploadId=${uploadId}`,
    method: 'DELETE'
  }

  signV4(requestParams, '', params.accessKey, params.secretKey)

  var req = transport.request(requestParams, (response) => {
    if (response.statusCode !== 204) {
      return xmlParsers.parseError(response, cb)
    }
    cb()
  })
  req.end()
}

var dropUploads = (transport, params, bucket, key, cb) => {
  var self = this

  var errorred = null

  var queue = new Stream.Readable({
    objectMode: true
  })
  queue._read = () => {}
  queue.pipe(Through2.obj(function(job, enc, done) {
      if (errorred) {
        return done()
      }
      listMultipartUploads(transport, params, job.bucket, job.key, job.keyMarker, job.uploadIdMarker, (e, result) => {
        if (errorred) {
          return done()
        }
        if (e) {
          errorred = e
          queue.push(null)
          return done()
        }
        result.uploads.forEach(element => {
          this.push(element)
        })
        if (result.isTruncated) {
          queue.push({
            bucket: result.nextJob.bucket,
            key: result.nextJob.key,
            keyMarker: result.nextJob.keyMarker,
            uploadIdMarker: result.nextJob.uploadIdMarker
          })
        } else {
          queue.push(null)
        }
        done()
      })
    }))
    .pipe(Through2.obj(function(upload, enc, done) {
      if (errorred) {
        return done()
      }
      abortMultipartUpload(transport, params, upload.bucket, upload.key, upload.uploadId, (e) => {
        if (errorred) {
          return done()
        }
        if (e) {
          errorred = e
          queue.push(null)
          return done()
        }
        done()
      })
    }, function(done) {
      cb(errorred)
      done()
    }))
  queue.push({
    bucket: bucket,
    key: key,
    keyMarker: null,
    uploadIdMarker: null
  })
}

module.exports = {
  listAllIncompleteUploads: listAllIncompleteUploads,
  listMultipartUploads: listMultipartUploads,
  dropUploads: dropUploads,
  abortMultipartUpload: abortMultipartUpload
}
