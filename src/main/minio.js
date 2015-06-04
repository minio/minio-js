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

var BlockStream = require('block-stream')
var Concat = require('concat-stream')
var Crypto = require('crypto')
var Http = require('http')
var Moment = require('moment')
var ParseXml = require('xml-parser')
var Stream = require('stream')
var Through2 = require('through2')
var Xml = require('xml')

class Client {
  constructor(params, transport) {
    "use strict"
    if (transport) {
      this.transport = transport
    } else {
      this.transport = Http
    }
    this.params = params
  }

  // SERIVCE LEVEL CALLS

  makeBucket(bucket, cb) {
    "use strict"

    var requestParams = {
      host: this.params.host,
      port: this.params.port,
      method: 'PUT',
      path: `/${bucket}`
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
        stream.push(parseError(response, (error) => {
          "use strict";
          stream.emit('error', error)
        }))
        stream.push(null)
      }
      response.pipe(Concat(errorXml => {
        "use strict";
        var parsedXml = ParseXml(errorXml.toString())
        parsedXml.root.children.forEach(element => {
          "use strict";
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
    "use strict";

    var requestParams = {
      host: this.params.host,
      port: this.params.port,
      method: 'HEAD',
      path: `/${bucket}`
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

  removeBucket(bucket, cb) {
    "use strict";

    var requestParams = {
      host: this.params.host,
      port: this.params.port,
      method: 'DELETE',
      path: `/${bucket}`
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

  getBucketACL(bucket, cb) {
    "use strict";
    cb('not implemented')
  }

  setBucketACL(bucket, acl, cb) {
    // we should make sure to set this query parameter, but the call apparently succeeds without it to s3
    // To differentiate this functionality from makeBucket() lets do it anyways.
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
        return parseError(response, cb)
      }
      cb()
    })
    req.end()
  }

  dropIncompleteUpload(bucket, key, cb) {
    "use strict";
    dropUploads(this.transport, this.params, bucket, key, cb)
  }

  dropAllIncompleteUploads(bucket, cb) {
    "use strict";
    dropUploads(this.transport, this.params, bucket, null, cb)
  }


  getObject(bucket, object, cb) {
    "use strict";

    var requestParams = {
      host: this.params.host,
      port: this.params.port,
      path: `/${bucket}/${object}`,
      method: 'GET'
    }

    signV4(requestParams, '', this.params.accessKey, this.params.secretKey)

    var req = this.transport.request(requestParams, (response) => {
      if (response.statusCode !== 200) {
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
    "use strict";

    var self = this

    var uploadId = null
    var part = null

    var etags = []

    if (size > 5 * 1024 * 1024) {
      //console.log('large file triggered')
      var stream = listAllIncompleteUploads(this.transport, this.params, bucket, key)
      var uploadId = null
      stream.pipe(Through2.obj(function(upload, enc, done) {
        //console.log('found existing upload')
        //console.log(upload)
        uploadId = upload.uploadId
        done()
      }, function(done) {
        //console.log('final upload id')
        //console.log(uploadId)
        if(!uploadId) {
          initiateNewMultipartUpload(self.transport, self.params, bucket, key, (e, uploadId) => {
            if (e) {
              return done(e)
            }
            streamUpload(self.transport, self.params, bucket, key, uploadId, [], r, (e) => {
              //console.log('other upload')
              return completeMultipartUpload( self.transport, self.params, bucket, key, uploadId, etags, (e) => {
                done(e)
                cb(e)
              })
            })
          })
        } else {
          //console.log('list parts pre init')
          var parts = listAllParts(self.transport, self.params, bucket, key, uploadId)
          var partsErrorred = null
          var partsArray = []
          parts.pipe(Through2.obj(function(part, enc, partDone) {
            //console.log('got part')
            //console.log(part)
            partsArray.push(part)
            partDone()
          }, function(partDone) {
            if(partsErrorred) {
              return partDone(partsErrorred)
            }
            //console.log('got all parts')
            //console.log(partsArray)
            streamUpload(self.transport, self.params, bucket, key, uploadId, partsArray, r, (e) => {
              //console.log('stream upload finished')
              if(e) {
                return partDone(e)
              }
              //console.log('calling complete multipart upload')
              completeMultipartUpload( self.transport, self.params, bucket, key, uploadId, etags, (e) => {
                partDone(e)
                cb(e)
              })
            })
          }))
        }
      }))
      .on('error', (e) => {
        cb(e)
      })
      function streamUpload(transport, params, bucket, key, uploadId, partsArray, r, cb) {
        //console.log('stream upload started')
        var part = 1
        var errorred = null
        r.on('finish', () => {
          //console.log('data stream finished')
        })
        r.pipe(new BlockStream(5 * 1024 * 1024)).pipe(Through2.obj(function(data, enc, done) {
          //console.log('block found')
          if(errorred) {
            return done()
          }
          var curPart = part
          part = part + 1
          if(partsArray.length > 0) {
            //console.log('found part ' + curPart)
            var curPart = partsArray.shift()
            var hash = Crypto.createHash('md5')
            hash.update(data)
            var md5 = hash.digest('hex').toLowerCase()
            if(curPart.etag == md5) {
              etags.push({
                part: curPart,
                etag: md5
              })
              done()
            } else {
              //console.log('actual  : ' + md5)
              //console.log('expected: ' + curPart.etag)
              errorred = new Error('mismatched etag')
              return done()
            }
          } else {
            //console.log('no found part ' + curPart)
            var dataStream = new Stream.Readable()
            dataStream.push(data)
            dataStream.push(null)
            dataStream._read = () => {}
            //console.log('data length:')
            doPutObject(transport, params, bucket, key, contentType, data.length, uploadId, curPart, dataStream, (e, etag) => {
              //console.log('do put object returned')
              //console.log(e)
              //console.log(etag)
              if(errorred) {
                return done()
              }
              if(e) {
                errorred = e
                return done()
              }
              //console.log('pushing to etag')
              etags.push({
                part: curPart,
                etag: etag
              })
              return done()
            })
          }
        }, function(done) {
          //console.log('data pipe end reached')
          done(errorred)
          //console.log('wee')
          cb(errorred)
        }))
      }
    } else {
      doPutObject(this.transport, this.params, bucket, key, contentType, size, null, null, r, cb)
    }
  }

  listObjects(bucket, params) {
    "use strict";
    var self = this

    var prefix = null
    var delimiter = null
    if (params) {
      if (params.prefix) {
        prefix = params.prefix
      }
      // we delimit when recursive is false
      if (params.recursive == false) {
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
        r.objects.forEach(object => {
          this.push(object)
        })
        if (r.isTruncated) {
          queue.push({
            bucket: currentRequest.bucket,
            prefix: currentRequest.prefix,
            marker: r.marker,
            delimiter: currentRequest.delimiter,
            maxKeys: currentRequest.maxKeys
          })
          queue.push(null)
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
    "use strict";
    var requestParams = {
      host: this.params.host,
      port: this.params.port,
      path: `/${bucket}/${object}`,
      method: 'HEAD'
    }

    signV4(requestParams, '', this.params.accessKey, this.params.secretKey)

    var req = this.transport.request(requestParams, (response) => {
      if (response.statusCode !== 200) {
        return parseError(response, cb)
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
    "use strict";
    var requestParams = {
      host: this.params.host,
      port: this.params.port,
      path: `/${bucket}/${object}`,
      method: 'DELETE'
    }

    signV4(requestParams, '', this.params.accessKey, this.params.secretKey)

    var req = this.transport.request(requestParams, (response) => {
      if (response.statusCode !== 200) {
        return parseError(response, cb)
      }
      cb()
    })
    req.end()
  }
}

var parseError = (response, cb) => {
  "use strict";
  response.pipe(Concat(errorXml => {
    var parsedXml = ParseXml(errorXml.toString())
    var e = {}
    parsedXml.root.children.forEach(element => {
      if (element.name === 'Code') {
        e.code = element.content
      } else if (element.name === 'Message') {
        e.message = element.content
      } else if (element.name === 'RequestId') {
        e.requestid = element.content
      } else if (element.name === 'Resource') {
        e.resource = element.content
      } else if (element.name === 'HostId') {
        e.hostid = element.content
      }
    })
    cb(e)
  }))
}

var getStringToSign = function(canonicalRequestHash, requestDate, region) {
  "use strict";
  var stringToSign = "AWS4-HMAC-SHA256\n"
  stringToSign += requestDate.format('YYYYMMDDTHHmmSS') + 'Z\n'
  stringToSign += `${requestDate.format('YYYYMMDD')}/${region}/s3/aws4_request\n`
  stringToSign += canonicalRequestHash
  return stringToSign
}

var signV4 = (request, dataShaSum256, accessKey, secretKey) => {
  "use strict";

  if (!accessKey || !secretKey) {
    return
  }

  var requestDate = Moment().utc()

  if (!dataShaSum256) {
    dataShaSum256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  }

  if (!request.headers) {
    request.headers = {}
  }

  var region = getRegion(request.host)

  request.headers['host'] = request.host
  request.headers['x-amz-date'] = requestDate.format('YYYYMMDDTHHmmSS') + 'Z'
  request.headers['x-amz-content-sha256'] = dataShaSum256

  var canonicalRequestAndSignedHeaders = getCanonicalRequest(request, dataShaSum256)
  var canonicalRequest = canonicalRequestAndSignedHeaders[0]
  var signedHeaders = canonicalRequestAndSignedHeaders[1]
  var hash = Crypto.createHash('sha256')
  hash.update(canonicalRequest)
  var canonicalRequestHash = hash.digest('hex')

  var stringToSign = getStringToSign(canonicalRequestHash, requestDate, region)

  var signingKey = getSigningKey(requestDate, region, secretKey)

  var hmac = Crypto.createHmac('sha256', signingKey)

  hmac.update(stringToSign)
  var signedRequest = hmac.digest('hex').toLowerCase().trim()

  var credentials = `${accessKey}/${requestDate.format('YYYYMMDD')}/${region}/s3/aws4_request`

  request.headers['authorization'] = `AWS4-HMAC-SHA256 Credential=${credentials}, SignedHeaders=${signedHeaders}, Signature=${signedRequest}`

  function getSigningKey(date, region, secretKey) {
    var key = "AWS4" + secretKey
    var dateLine = date.format('YYYYMMDD')

    var hmac1 = Crypto.createHmac('sha256', key).update(dateLine).digest('binary')
    var hmac2 = Crypto.createHmac('sha256', hmac1).update(region).digest('binary')
    var hmac3 = Crypto.createHmac('sha256', hmac2).update("s3").digest('binary')
    return Crypto.createHmac('sha256', hmac3).update("aws4_request").digest('binary')
  }

  function getRegion(host) {
    switch (host) {
      case "s3.amazonaws.com":
        return "us-east-1"
      case "s3-ap-northeast-1.amazonaws.com":
        return "ap-northeast-1"
      case "s3-ap-southeast-1.amazonaws.com":
        return "ap-southeast-1"
      case "s3-ap-southeast-2.amazonaws.com":
        return "ap-southeast-2"
      case "s3-eu-central-1.amazonaws.com":
        return "eu-central-1"
      case "s3-eu-west-1.amazonaws.com":
        return "eu-west-1"
      case "s3-sa-east-1.amazonaws.com":
        return "sa-east-1"
      case "s3-external-1.amazonaws.com":
        return "us-east-1"
      case "s3-us-west-1.amazonaws.com":
        return "us-west-1"
      case "s3-us-west-2.amazonaws.com":
        return "us-west-2"
      default:
        return "milkyway"
    }
  }

  function getCanonicalRequest(request, dataShaSum1) {


    var headerKeys = []
    var headers = []

    for (var key in request.headers) {
      if (request.headers.hasOwnProperty(key)) {
        var value = request.headers[key]
        headers.push(`${key.toLowerCase()}:${value}`)
        headerKeys.push(key.toLowerCase())
      }
    }

    headers.sort()
    headerKeys.sort()

    var signedHeaders = ""
    headerKeys.forEach(element => {
      if (signedHeaders) {
        signedHeaders += ';'
      }
      signedHeaders += element
    })


    var canonicalString = ""
    canonicalString += canonicalString + request.method.toUpperCase() + '\n'
    // TODO this not clean, but works
    canonicalString += request.path.split('?')[0] + '\n';
    if (request.path.split('?')[1]) {
      canonicalString += request.path.split('?')[1] + '\n';
    } else {
      canonicalString += '\n'
    }
    headers.forEach(element => {
      canonicalString += element + '\n'
    })
    canonicalString += '\n'
    canonicalString += signedHeaders + '\n'
    canonicalString += dataShaSum1
    return [canonicalString, signedHeaders]
  }
}

var uriEscape = function uriEscape(string) {
  var output = encodeURIComponent(string);
  output = output.replace(/[^A-Za-z0-9_.~\-%]+/g, escape);

  // AWS percent-encodes some extra non-standard characters in a URI
  output = output.replace(/[*]/g, function(ch) {
    return '%' + ch.charCodeAt(0).toString(16).toUpperCase();
  });

  return output;
}

var listAllIncompleteUploads = function(transport, params, bucket, object) {
  "use strict";
  var errorred = null
  var queue = new Stream.Readable({
    objectMode: true
  })
  queue._read = () => {}

  var stream = queue.pipe(Through2.obj(function(currentJob, enc, done) {
    //console.log('list all incomplete uploads job found')
    //console.log(currentJob)
    if(errorred) {
      return done()
    }
    listMultipartUploads(transport, params, currentJob.bucket, currentJob.object, currentJob.objectMarker, currentJob.uploadIdMarker, (e, r) => {
      //console.log('list multipart uploads result')
      //console.log(r)
      if(errorred) {
        return done()
      }
      // TODO handle error
      if(e) {
        return done(e)
      }
      r.uploads.forEach(upload => {
        //console.log('emitting upload')
        //console.log(upload)
        this.push(upload)
      })
      if(r.isTruncated) {
        //console.log('truncated, emitting job')
        queue.push({
          bucket: bucket,
          object: object,
          objectMarker: r.objectMarker,
          uploadIdMarker: r.uploadIdMarker
        })
      } else {
        //console.log('not truncated, sending finally push')
        queue.push(null)
      }
      done()
    })
  }, function(done) {
    //console.log('stream ended')
    if(errorred) {
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
  "use strict";
  var queries = []
  var escape = uriEscape
  if (key) {
    key = escape(key)
    queries.push(`prefix=${key}`)
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
      return parseError(response, cb)
    }
    response.pipe(Concat(xml => {
      var parsedXml = ParseXml(xml.toString())
      var result = {
        uploads: [],
        isTruncated: false,
        nextJob: null
      }
      var nextJob = {
        bucket: bucket,
        key: key
      }
      var ignoreTruncated = false
      parsedXml.root.children.forEach(element => {
        switch (element.name) {
          case "IsTruncated":
            result.isTruncated = element.content === 'true'
            break
          case "NextKeyMarker":
            nextJob.keyMarker = element.content
            break
          case "NextUploadIdMarker":
            nextJob.uploadIdMarker = element.content
            break
          case "Upload":
            var upload = {
              bucket: bucket,
              key: null,
              uploadId: null,
            }
            element.children.forEach(xmlObject => {
              switch (xmlObject.name) {
                case "Key":
                  upload.key = xmlObject.content
                  break
                case "UploadId":
                  upload.uploadId = xmlObject.content
                  break
                default:
              }
            })
            if (key) {
              if (key === upload.key) {
                result.uploads.push(upload)
              } else {
                ignoreTruncated = true
              }
            } else {
              result.uploads.push(upload)
            }
            break
          default:
        }
      })
      if (result.isTruncated && !ignoreTruncated) {
        result.nextJob = nextJob
      } else {
        result.isTruncated = false
      }
      cb(null, result)
    }))
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
    "use strict";
    if (response.statusCode !== 200) {
      return parseError(response, cb)
    }
    cb()
  })
  req.end()
}

var dropUploads = (transport, params, bucket, key, cb) => {
  "use strict";
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

var initiateNewMultipartUpload = (transport, params, bucket, key, cb) => {
  var requestParams = {
    host: params.host,
    port: params.port,
    path: `/${bucket}/${key}?uploads`,
    method: 'POST'
  }

  signV4(requestParams, '', params.accessKey, params.secretKey)

  var request = transport.request(requestParams, (response) => {
    if (response.statusCode !== 200) {
      return parseError(response, cb)
    }
    response.pipe(Concat(xml => {
      "use strict";
      var parsedXml = ParseXml(xml.toString())
      var uploadId = null
      parsedXml.root.children.forEach(element => {
        "use strict";
        if (element.name === 'UploadId') {
          uploadId = element.content
        }
      })

      if (uploadId) {
        return cb(null, uploadId)
      }
      cb('unable to get upload id')
    }))
  })
  request.end()
}

function doPutObject(transport, params, bucket, key, contentType, size, uploadId, part, r, cb) {
  var query = ''
  if (part) {
    query = `?partNumber=${part}&uploadId=${uploadId}`
  }
  if (contentType == null || contentType == '') {
    contentType = 'aplication/octet-stream'
  }

  var requestParams = {
    host: params.host,
    port: params.port,
    path: `/${bucket}/${key}${query}`,
    method: 'PUT',
    headers: {
      "Content-Length": size,
      "Content-Type": contentType
    }
  }

  signV4(requestParams, '', params.accessKey, params.secretKey)

  var request = transport.request(requestParams, (response) => {
    if (response.statusCode !== 200) {
      return parseError(response, cb)
    }
    var etag = response.headers['etag']
    cb(null, etag)
  })
  r.pipe(request)
}

function completeMultipartUpload(transport, params, bucket, key, uploadId, etags, cb) {
  //console.log('complete multipart')
  var requestParams = {
    host: params.host,
    port: params.port,
    path: `/${bucket}/${key}?uploadId=${uploadId}`,
    method: 'POST'
  }

  var parts = []

  etags.forEach(element => {
    parts.push({
      Part: [{
        PartNumber: element.part
      }, {
        ETag: element.etag
      }, ]
    })
  })


  var payloadObject = {
    CompleteMultipartUpload: parts
  }


  var payload = Xml(payloadObject)

  var hash = Crypto.createHash('sha256')
  hash.update(payload)
  var payloadHash = hash.digest('hex')

  var stream = new Stream.Readable()
  stream._read = () => {}
  stream.push(payload)
  stream.push(null)

  signV4(requestParams, payloadHash, params.accessKey, params.secretKey)

  var request = transport.request(requestParams, (response) => {
    //console.log('multipart complete returned')
    if (response.statusCode !== 200) {
      return parseError(response, cb)
    }
    //console.log('calling cb')
    cb()
  })
  stream.pipe(request)
}

var getObjectList = (transport, params, bucket, prefix, marker, delimiter, maxKeys, cb) => {
  var queries = []
  var escape = uriEscape; // escape every value, for query string
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
      return parseError(response, cb)
    }
    response.pipe(Concat((body) => {
      var xml = ParseXml(body.toString())
      var result = {
        objects: []
      }
      xml.root.children.forEach(element => {
        switch (element.name) {
          case "IsTruncated":
            result.isTruncated = element.content === 'true'
            break
          case "Contents":
            var object = {}
            element.children.forEach(xmlObject => {
              switch (xmlObject.name) {
                case "Key":
                  object.name = xmlObject.content
                  break
                case "LastModified":
                  object.lastModified = xmlObject.content
                  break
                case "Size":
                  object.size = +xmlObject.content
                  break
                case "ETag":
                  object.etag = xmlObject.content
                  break
                default:
              }
            })
            result.objects.push(object)
            break
          case "CommonPrefixes": // todo, this is the only known way for now to propagate delimited entries
            var object = {}
            element.children.forEach(xmlPrefix => {
              switch (xmlPrefix.name) {
                case "Prefix":
                  object.name = xmlPrefix.content
                  object.size = 0
                  break
                default:
              }
            })
            result.objects.push(object);
            break;
          default:
        }
      })
      cb(null, result)
    }))
  })
  req.end()
}

var listAllParts = (transport, params, bucket, key, uploadId) => {
  var errorred = null
  var queue = new Stream.Readable({
    objectMode: true
  })
  queue._read = () => {}
  var stream = queue
    .pipe(Through2.obj(function(job, enc, done) {
      //console.log('list parts job found')
      //console.log(job)
      if (errorred) {
        return done()
      }
      listParts(transport, params, bucket, key, uploadId, job.marker, (e, r) => {
        //console.log('list parts result')
        //console.log(r)
        if (errorred) {
          return done()
        }
        if (e) {
          errorred = e
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
      //console.log('list parts jobs complete')
      end(errorred)
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
  if (marker && marker != 0) {
    query += `part-number-marker=${marker}&`
  }
  query += `uploadId=${uploadId}`
  var requestParams = {
    host: params.host,
    port: params.port,
    path: `/${bucket}/${key}${query}`,
    method: 'GET'
  }

  signV4(requestParams, '', params.accessKey, params.secretKey)

  var request = Http.request(requestParams, (response) => {
    if (response.statusCode !== 200) {
      return parseError(response, cb)
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
          case "IsTruncated":
            result.isTruncated = element.content === 'true'
            break
          case "NextPartNumberMarker":
            nextJob.marker = +element.content
            break
          case "Part":
            var object = {}
            element.children.forEach(xmlObject => {
              switch (xmlObject.name) {
                case "PartNumber":
                  object.part = +xmlObject.content
                  break
                case "ETag":
                  object.etag = xmlObject.content
                  break
                case "Size":
                  object.size = +xmlObject.content
                  break
                case "ETag":
                  object.etag = xmlObject.content
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

var inst = Client
module.exports = inst
