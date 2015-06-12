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

// ignore x.['foo'] recommneded as x.foo
/*jshint sub: true */

require('source-map-support').install()

var BlockStream2 = require('block-stream2')
var Concat = require('concat-stream')
var Crypto = require('crypto')
var Http = require('http')
var Https = require('https')
var Package = require('../../package.json')
var ParseXml = require('xml-parser')
var Stream = require('stream')
var Through2 = require('through2')
var Url = require('url')
var Xml = require('xml')

var signV4 = require('./signing.js')
var simpleRequests = require('./simple-requests.js')
var helpers = require('./helpers.js')
var xmlParsers = require('./xml-parsers.js')
var upload = require('./upload.js')
var multipart = require('./multipart.js')

class Client {
  constructor(params, transport) {
    var parsedUrl = Url.parse(params.url)
    var port = +parsedUrl.port
    if (transport) {
      this.transport = transport
    } else {
      switch (parsedUrl.protocol) {
        case 'http:':
          this.transport = Http
          if (port === 0) {
            port = 80
          }
          break
        case 'https:':
          this.transport = Https
          if (port === 0) {
            port = 443
          }
          break
        default:
          throw new Error('Unknown protocol: ' + parsedUrl.protocol)
      }
    }
    this.params = {
      host: parsedUrl.hostname,
      port: port,
      accessKey: params.accessKey,
      secretKey: params.secretKey,
      agent: `minio-js/${Package.version} (${process.platform}; ${process.arch})`
    }
  }

  // CLIENT LEVEL CALLS

  addUserAgent(name, version, comments) {
    var formattedComments = ''
    if (comments && comments.length > 0) {
      var joinedComments = comments.join('; ')
      formattedComments = ` (${joinedComments})`
    }
    if (name && version) {
      this.params.agent = `${this.params.agent} ${name}/${version}${formattedComments}`
    } else {
      throw new Exception('Invalid user agent')
    }
  }

  // SERIVCE LEVEL CALLS

  makeBucket(bucket, cb) {
    if (bucket === null || bucket.trim() === "") {
      return cb('bucket name cannot be empty')
    }

    var region = helpers.getRegion(this.params.host)
    if (region === 'milkyway') {
      region = null;
    }
    var createBucketConfiguration = []
    createBucketConfiguration.push({
      _attr: {
        xmlns: 'http://s3.amazonaws.com/doc/2006-03-01/'
      }
    })
    if (region) {
      createBucketConfiguration.push({
        LocationConstraint: helpers.getRegion(this.params.host)
      })
    }
    var payloadObject = {
      CreateBucketConfiguration: createBucketConfiguration
    }

    var payload = Xml(payloadObject)

    var stream = new Stream.Readable()
    stream._read = function() {}
    stream.push(payload.toString())
    stream.push(null)

    var hash = Crypto.createHash('sha256')
    hash.update(payload)
    var sha256 = hash.digest('hex').toLowerCase()

    var requestParams = {
      host: this.params.host,
      port: this.params.port,
      method: 'PUT',
      path: `/${bucket}`,
      headers: {
        'Content-Length': payload.length
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

  listBuckets() {
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
    stream._read = () => {}

    var req = this.transport.request(requestParams, (response) => {
      if (response.statusCode !== 200) {
        // TODO work out how to handle errors with stream
        stream.push(xmlParsers.parseError(response, (error) => {
          stream.emit('error', error)
        }))
        stream.push(null)
      }
      response.pipe(Concat(errorXml => {
        var parsedXml = ParseXml(errorXml.toString())
        parsedXml.root.children.forEach(element => {
          if (element.name === 'Buckets') {
            element.children.forEach(bucketListing => {
              var bucket = {}
              bucketListing.children.forEach(prop => {
                switch (prop.name) {
                  case "Name":
                    bucket.name = prop.content
                    break
                  case "CreationDate":
                    bucket.creationDate = prop.content
                    break
                }
              })
              stream.push(bucket)
            })
          }
        })
        stream.push(null)
      }))
    })
    req.end()
    return stream
  }

  bucketExists(bucket, cb) {
    if (bucket === null || bucket.trim() === "") {
      return cb('bucket name cannot be empty')
    }
    simpleRequests.bucketRequest(this, 'HEAD', bucket, cb)
  }

  removeBucket(bucket, cb) {
    if (bucket === null || bucket.trim() === "") {
      return cb('bucket name cannot be empty')
    }
    simpleRequests.bucketRequest(this, 'DELETE', bucket, cb)
  }

  getBucketACL(bucket, cb) {
    if (bucket === null || bucket.trim() === "") {
      return cb('bucket name cannot be empty')
    }

    var query = `?acl`;
    var requestParams = {
      host: this.params.host,
      port: this.params.port,
      method: 'GET',
      path: `/${bucket}${query}`,
    }

    signV4(requestParams, '', this.params.accessKey, this.params.secretKey)

    var req = this.transport.request(requestParams, response => {
      if (response.statusCode !== 200) {
        return xmlParsers.parseError(response, cb)
      }
      response.pipe(Concat((body) => {
        var xml = ParseXml(body.toString())

        var publicRead = false
        var publicWrite = false
        var authenticatedRead = false
        var authenticatedWrite = false

        xml.root.children.forEach(element => {
          switch (element.name) {
            case "AccessControlList":
              element.children.forEach(grant => {
                var granteeURL = null
                var permission = null
                grant.children.forEach(grantChild => {
                  switch (grantChild.name) {
                    case "Grantee":
                      grantChild.children.forEach(grantee => {
                        switch (grantee.name) {
                          case "URI":
                            granteeURL = grantee.content
                            break
                        }
                      })
                      break
                    case "Permission":
                      permission = grantChild.content
                      break
                  }
                })
                if (granteeURL === 'http://acs.amazonaws.com/groups/global/AllUsers') {
                  if (permission === 'READ') {
                    publicRead = true
                  } else if (permission === 'WRITE') {
                    publicWrite = true
                  }
                } else if (granteeURL === 'http://acs.amazonaws.com/groups/global/AuthenticatedUsers') {
                  if (permission === 'READ') {
                    authenticatedRead = true
                  } else if (permission === 'WRITE') {
                    authenticatedWrite = true
                  }
                }
              })
              break
          }
        })
        var cannedACL = 'unsupported-acl'
        if (publicRead && publicWrite && !authenticatedRead && !authenticatedWrite) {
          cannedACL = 'public-read-write'
        } else if (publicRead && !publicWrite && !authenticatedRead && !authenticatedWrite) {
          cannedACL = 'public-read'
        } else if (!publicRead && !publicWrite && authenticatedRead && !authenticatedWrite) {
          cannedACL = 'authenticated-read'
        } else if (!publicRead && !publicWrite && !authenticatedRead && !authenticatedWrite) {
          cannedACL = 'private'
        }
        cb(null, cannedACL)
      }))
    })
    req.end()
  }

  setBucketACL(bucket, acl, cb) {
    if (bucket === null || bucket.trim() === "") {
      return cb('bucket name cannot be empty')
    }

    if (acl === null || acl.trim() === "") {
      return cb('acl name cannot be empty')
    }

    // we should make sure to set this query parameter, but the call apparently succeeds without it to s3
    // To differentiate this functionality from makeBucket() lets do it anyways.
    if (bucket === null || bucket.trim() === "") {
      return cb('bucket name cannot be empty')
    }
    var query = `?acl`;
    var requestParams = {
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
    if (bucket === null || bucket.trim() === "") {
      return cb('bucket name cannot be empty')
    }

    multipart.dropUploads(this.transport, this.params, bucket, null, cb)
  }

  dropIncompleteUpload(bucket, key, cb) {
    if (bucket === null || bucket.trim() === "") {
      return cb('bucket name cannot be empty')
    }

    if (key === null || key.trim() === "") {
      return cb('object key cannot be empty')
    }

    multipart.dropUploads(this.transport, this.params, bucket, key, cb)
  }

  getObject(bucket, object, cb) {
    this.getPartialObject(bucket, object, 0, 0, cb)
  }

  getPartialObject(bucket, object, offset, length, cb) {
    if (bucket === null || bucket.trim() === "") {
      return cb('bucket name cannot be empty')
    }

    if (object === null || object.trim() === "") {
      return cb('object key cannot be empty')
    }


    var range = ''

    if (offset) {
      range = `${+offset}-`
    } else {
      offset = 0
    }
    if (length) {
      range += `${+length + offset}`
    }

    var headers = {}
    if (range !== '') {
      headers.Range = range
    }

    var requestParams = {
      host: this.params.host,
      port: this.params.port,
      path: `/${bucket}/${object}`,
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
    if (bucket === null || bucket.trim() === "") {
      return cb('bucket name cannot be empty')
    }

    if (key === null || key.trim() === "") {
      return cb('object key cannot be empty')
    }

    var self = this

    if (size > 5 * 1024 * 1024) {
      var stream = multipart.listAllIncompleteUploads(this.transport, this.params, bucket, key)
      var uploadId = null
      stream.on('error', (e) => {
        cb(e)
      })
      stream.pipe(Through2.obj(function(upload, enc, done) {
        uploadId = upload.uploadId
        done()
      }, function(done) {
        if (!uploadId) {
          upload.initiateNewMultipartUpload(self.transport, self.params, bucket, key, (e, uploadId) => {
            if (e) {
              return done(e)
            }
            upload.streamUpload(self.transport, self.params, bucket, key, contentType, uploadId, [], size, r, (e, etags) => {
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
          var partsErrorred = null
          var partsArray = []
          parts.pipe(Through2.obj(function(part, enc, partDone) {
            partsArray.push(part)
            partDone()
          }, function(partDone) {
            if (partsErrorred) {
              return partDone(partsErrorred)
            }
            upload.streamUpload(self.transport, self.params, bucket, key, contentType, uploadId, partsArray, size, r, (e, etags) => {
              if (partsErrorred) {
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
    var self = this

    var prefix = null
    var delimiter = null
    if (params) {
      if (params.prefix) {
        prefix = params.prefix
      }
      // we delimit when recursive is false
      if (params.recursive === false) {
        delimiter = '/'
      }
    }

    var queue = new Stream.Readable({
      objectMode: true
    })
    queue._read = () => {}
    var stream = queue.pipe(Through2.obj(function(currentRequest, enc, done) {
      getObjectList(self.transport, self.params, currentRequest.bucket, currentRequest.prefix, currentRequest.marker, currentRequest.delimiter, currentRequest.maxKeys, (e, r) => {
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

  statObject(bucket, object, cb) {
    if (bucket === null || bucket.trim() === "") {
      return cb('bucket name cannot be empty')
    }

    if (object === null || object.trim() === "") {
      return cb('object key cannot be empty')
    }

    var requestParams = {
      host: this.params.host,
      port: this.params.port,
      path: `/${bucket}/${object}`,
      method: 'HEAD'
    }

    signV4(requestParams, '', this.params.accessKey, this.params.secretKey)

    var req = this.transport.request(requestParams, (response) => {
      if (response.statusCode !== 200) {
        return xmlParsers.parseError(response, cb)
      } else {
        var result = {
          size: +response.headers['content-length'],
          etag: response.headers['etag'],
          lastModified: response.headers['last-modified']
        }
        cb(null, result)
      }
    })
    req.end()
  }

  removeObject(bucket, object, cb) {
    if (bucket === null || bucket.trim() === "") {
      return cb('bucket name cannot be empty')
    }

    if (object === null || object.trim() === "") {
      return cb('object key cannot be empty')
    }

    var requestParams = {
      host: this.params.host,
      port: this.params.port,
      path: `/${bucket}/${object}`,
      method: 'DELETE'
    }

    signV4(requestParams, '', this.params.accessKey, this.params.secretKey)

    var req = this.transport.request(requestParams, (response) => {
      if (response.statusCode !== 204) {
        return xmlParsers.parseError(response, cb)
      }
      cb()
    })
    req.end()
  }
}


var getObjectList = (transport, params, bucket, prefix, marker, delimiter, maxKeys, cb) => {
  var queries = []
  var escape = helpers.uriEscape; // escape every value, for query string
  if (prefix) {
    prefix = escape(prefix)
    queries.push(`prefix=${prefix}`)
  }
  if (marker) {
    marker = escape(marker)
    queries.push(`marker=${marker}`)
  }
  if (delimiter) {
    delimiter = escape(delimiter)
    queries.push(`delimiter=${delimiter}`)
  }
  if (maxKeys) {
    maxKeys = escape(maxKeys)
    queries.push(`max-keys=${maxKeys}`)
  }
  queries.sort()
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
    response.pipe(Concat((body) => {
      var xml = ParseXml(body.toString())
      var result = {
        objects: [],
        marker: null,
        isTruncated: false
      }
      var marker = null
      xml.root.children.forEach(element => {
          switch (element.name) {
            case "IsTruncated":
              result.isTruncated = element.content === 'true'
              break
            case "NextMarker":
              result.nextMarker = element.content
              break
            case "Contents":
              var content = {}
              element.children.forEach(xmlObject => {
                switch (xmlObject.name) {
                  case "Key":
                    content.name = xmlObject.content
                    marker = content.name
                    break
                  case "LastModified":
                    content.lastModified = xmlObject.content
                    break
                  case "Size":
                    content.size = +xmlObject.content
                    break
                  case "ETag":
                    content.etag = xmlObject.content
                    break
                  default:
                }
              })
              result.objects.push(content)
              break
            case "CommonPrefixes": // todo, this is the only known way for now to propagate delimited entries
              var commonPrefixes = {}
              element.children.forEach(xmlPrefix => {
                switch (xmlPrefix.name) {
                  case "Prefix":
                    commonPrefixes.name = xmlPrefix.content
                    commonPrefixes.size = 0
                    break
                  default:
                }
              })
              result.objects.push(commonPrefixes);
              break;
            default:
          }
        })
        // if truncated but no marker set, we set it
      if (!result.marker && result.isTruncated) {
        result.marker = marker
      }
      cb(null, result)
    }))
  })
  req.end()
}


var inst = Client
module.exports = inst
