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

var Concat = require('concat-stream'),
    Stream = require('stream'),
    ParseXml = require('xml-parser'),
    Through2 = require('through2'),
    helpers = require('./helpers.js'),
    signV4 = require('./signing.js').signV4,
    xmlParsers = require('./xml-parsers.js')

var listAllIncompleteUploads = function(transport, params, bucket, object) {
  var errored = null
  var queue = new Stream.Readable({
    objectMode: true
  })
  queue._read = function() {}

  var stream = queue.pipe(Through2.obj(function(currentJob, enc, done) {
    if (errored) {
      return done()
    }
    listMultipartUploads(transport, params, currentJob.bucket, currentJob.object, currentJob.objectMarker, currentJob.uploadIdMarker, (e, r) => {
      if (errored) {
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
    if (errored) {
      return done(errored)
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
  if (key) {
    queries.push(`prefix=${helpers.uriEscape(key)}`)
  }
  if (keyMarker) {
    keyMarker = helpers.uriEscape(keyMarker)
    queries.push(`key-marker=${keyMarker}`)
  }
  if (uploadIdMarker) {
    queries.push(`upload-id-marker=${uploadIdMarker}`)
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

  var errored = null

  var queue = new Stream.Readable({
    objectMode: true
  })
  queue._read = function() {}
  queue.pipe(Through2.obj(function(job, enc, done) {
      if (errored) {
        return done()
      }
      listMultipartUploads(transport, params, job.bucket, job.key, job.keyMarker, job.uploadIdMarker, (e, result) => {
        if (errored) {
          return done()
        }
        if (e) {
          errored = e
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
      if (errored) {
        return done()
      }
      abortMultipartUpload(transport, params, upload.bucket, upload.key, upload.uploadId, (e) => {
        if (errored) {
          return done()
        }
        if (e) {
          errored = e
          queue.push(null)
          return done()
        }
        done()
      })
    }, function(done) {
      cb(errored)
      done()
    }))
  queue.push({
    bucket: bucket,
    key: key,
    keyMarker: null,
    uploadIdMarker: null
  })
}

var listAllParts = (transport, params, bucket, key, uploadId) => {
  var errored = null
  var queue = new Stream.Readable({
    objectMode: true
  })
  queue._read = function() {}
  var stream = queue
    .pipe(Through2.obj(function(job, enc, done) {
      if (errored) {
        return done()
      }
      listParts(transport, params, bucket, key, uploadId, job.marker, (e, r) => {
        if (errored) {
          return done()
        }
        if (e) {
          errored = e
          queue.push(null)
          return done()
        }
        r.parts.forEach((element) => {
          this.push(element)
        })
        if (r.isTruncated) {
          queue.push(r.nextJob)
        } else {
          queue.push(null)
        }
        done()
      })
    }, function(end) {
      end(errored)
    }))
  queue.push({
    bucket: bucket,
    key: key,
    uploadId: uploadId,
    marker: 0
  })
  return stream
}

var listParts = (transport, params, bucket, key, uploadId, marker, cb) => {
  var query = '?'
  if (marker && marker !== 0) {
    query += `part-number-marker=${marker}&`
  }
  query += `uploadId=${uploadId}`
  var requestParams = {
    host: params.host,
    port: params.port,
    path: `/${bucket}/${helpers.uriResourceEscape(key)}${query}`,
    method: 'GET'
  }

  signV4(requestParams, '', params.accessKey, params.secretKey)

  var request = transport.request(requestParams, (response) => {
    if (response.statusCode !== 200) {
      return xmlParsers.parseError(response, cb)
    }
    response.pipe(Concat(body => {
      var xml = ParseXml(body.toString())
      var result = {
        isTruncated: false,
        parts: [],
        nextJob: null
      }
      var nextJob = {
        bucket: bucket,
        key: key,
        uploadId: uploadId
      }
      xml.root.children.forEach(element => {
        switch (element.name) {
          case 'IsTruncated':
            result.isTruncated = element.content === 'true'
            break
          case 'NextPartNumberMarker':
            nextJob.marker = +element.content
            break
          case 'Part':
            var object = {}
            element.children.forEach(xmlObject => {
              switch (xmlObject.name) {
                case 'PartNumber':
                  object.part = +xmlObject.content
                  break
                case 'LastModified':
                  object.lastModified = xmlObject.content
                  break
                case 'ETag':
                  object.etag = xmlObject.content.replace(/"/g, '').replace(/&quot;/g, '').replace(/&#34;/g, '')
                  break
                case 'Size':
                  object.size = +xmlObject.content
                  break
                default:
              }
            })
            result.parts.push(object)
            break
          default:
            break
        }
      })
      if (result.isTruncated) {
        result.nextJob = nextJob
      }
      cb(null, result)
    }))
  })
  request.end()
}

module.exports = {
  listAllIncompleteUploads: listAllIncompleteUploads,
  listMultipartUploads: listMultipartUploads,
  dropUploads: dropUploads,
  abortMultipartUpload: abortMultipartUpload,
  listAllParts: listAllParts,
  listParts: listParts
}
