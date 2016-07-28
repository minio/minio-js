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

import fs from 'fs'
import Crypto from 'crypto'
import Http from 'http'
import Https from 'https'
import Stream from 'stream'
import Through2 from 'through2'
import BlockStream2 from 'block-stream2'
import Url from 'url'
import Xml from 'xml'
import Moment from 'moment'
import async from 'async'
import mkdirp from 'mkdirp'
import path from 'path'
import _ from 'lodash'

import { isValidPrefix, isValidEndpoint, isValidBucketName,
         isValidPort, isValidObjectName, isAmazonEndpoint, getScope,
         uriEscape, uriResourceEscape, isBoolean, isFunction, isNumber,
         isString, isObject, isNullOrUndefined, pipesetup,
         readableStream, isReadableStream, isVirtualHostStyle } from './helpers.js';

import { signV4, presignSignatureV4, postPresignSignatureV4 } from './signing.js';

import * as transformers from './transformers'

import * as errors from './errors.js';

import { getS3Endpoint } from './s3-endpoints.js';

var Package = require('../../package.json');

export default class Client {
  constructor(params) {
    // Default values if not specified.
    if (typeof params.secure === 'undefined') params.secure = true
    if (!params.port) params.port = 0
    // Validate input params.
    if (!isValidEndpoint(params.endPoint)) {
      throw new errors.InvalidEndPointError(`endPoint ${params.endPoint} is invalid`)
    }
    if (!isValidPort(params.port)) {
      throw new errors.InvalidArgumentError(`port ${params.port} is invalid`)
    }
    if (!isBoolean(params.secure)) {
      throw new errors.InvalidArgumentError(`secure option is of invalid type should be of type boolean true/false`)
    }

    var host = params.endPoint
    var port = params.port;
    var protocol = ''
    var transport;
    // Validate if configuration is not using SSL
    // for constructing relevant endpoints.
    if (params.secure === false) {
      transport = Http
      protocol = 'http:'
      if (port === 0) {
        port = 80
      }
    } else {
      // Defaults to secure.
      transport = Https
      protocol = 'https:'
      if (port === 0) {
        port = 443
      }
    }

    // if custom transport is set, use it.
    if (params.transport) {
      if (!isObject(params.transport)) {
        throw new errors.InvalidArgumentError('transport should be of type "object"')
      }
      transport = params.transport
    }

    // User Agent should always following the below style.
    // Please open an issue to discuss any new changes here.
    //
    //       Minio (OS; ARCH) LIB/VER APP/VER
    //
    var libraryComments = `(${process.platform}; ${process.arch})`
    var libraryAgent = `Minio ${libraryComments} minio-js/${Package.version}`
    // User agent block ends.

    // enable connection reuse and pooling
    transport.globalAgent.keepAlive = true

    this.host = host
    this.port = port
    this.protocol = protocol
    this.accessKey = params.accessKey
    this.secretKey = params.secretKey
    this.userAgent = `${libraryAgent}`
    if (!this.accessKey) this.accessKey = ''
    if (!this.secretKey) this.secretKey = ''
    this.anonymous = !this.accessKey || !this.secretKey
    this.transport = transport
    this.regionMap = {}
    this.minimumPartSize = 5*1024*1024
    this.maximumPartSize = 5*1024*1024*1024
    this.maxObjectSize = 5*1024*1024*1024*1024
    // SHA256 is enabled only for authenticated http requests. If the request is authenticated
    // and the connection is https we use x-amz-content-sha256=UNSIGNED-PAYLOAD
    // header for signature calculation.
    this.enableSHA256 = !this.anonymous && !params.secure
  }

  // returns *options* object that can be used with http.request()
  // Takes care of constructing virtual-host-style or path-style hostname
  getRequestOptions(opts) {
    var method = opts.method
    var region = opts.region
    var bucketName = opts.bucketName
    var objectName = opts.objectName
    var headers = opts.headers
    var query = opts.query

    var reqOptions = {method}
    reqOptions.headers = {}

    // Verify if virtual host supported.
    var virtualHostStyle
    if (bucketName) {
      virtualHostStyle = isVirtualHostStyle(this.host,
                                            this.protocol,
                                            bucketName)
    }

    if (this.port) reqOptions.port = this.port
    reqOptions.protocol = this.protocol

    if (objectName) {
      objectName = `${uriResourceEscape(objectName)}`
    }

    reqOptions.path = '/'

    // Save host.
    reqOptions.host = this.host
    // For Amazon S3 endpoint, get endpoint based on region.
    if (isAmazonEndpoint(reqOptions.host)) {
      reqOptions.host = getS3Endpoint(region)
    }

    if (virtualHostStyle && !opts.pathStyle) {
      // For all hosts which support virtual host style, `bucketName`
      // is part of the hostname in the following format:
      //
      //  var host = 'bucketName.example.com'
      //
      if (bucketName) reqOptions.host = `${bucketName}.${reqOptions.host}`
      if (objectName) reqOptions.path = `/${objectName}`
    } else {
      // For all S3 compatible storage services we will fallback to
      // path style requests, where `bucketName` is part of the URI
      // path.
      if (bucketName) reqOptions.path = `/${bucketName}`
      if (objectName) reqOptions.path = `/${bucketName}/${objectName}`
    }

    if (query) reqOptions.path += `?${query}`
    reqOptions.headers.host = reqOptions.host
    if ((reqOptions.protocol === 'http:' && reqOptions.port !== 80) ||
        (reqOptions.protocol === 'https:' && reqOptions.port !== 443)) {
      reqOptions.headers.host = `${reqOptions.host}:${reqOptions.port}`
    }
    reqOptions.headers['user-agent'] = this.userAgent
    if (headers) {
      // have all header keys in lower case - to make signing easy
      _.map(headers, (v, k) => reqOptions.headers[k.toLowerCase()] = v)
    }

    return reqOptions
  }

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
      throw new errors.InvalidArgumentError('Input appName cannot be empty.')
    }
    if (!isString(appVersion)) {
      throw new TypeError(`Invalid appName: ${appVersion}`)
    }
    if (appVersion.trim() === '') {
      throw new errors.InvalidArgumentError('Input appVersion cannot be empty.')
    }
    this.userAgent = `${this.userAgent} ${appName}/${appVersion}`
  }

  // partSize will be atleast minimumPartSize or a multiple of minimumPartSize
  // for size <= 50000 MB partSize is always 5MB (10000*5 = 50000)
  // for size > 50000MB partSize will be a multiple of 5MB
  // for size = 5TB partSize will be 525MB
  calculatePartSize(size) {
    if (!isNumber(size)) {
      throw new TypeError('size should be of type "number"')
    }
    if (size > this.maxObjectSize) {
      throw new TypeError(`size should not be more than ${this.maxObjectSize}`)
    }
    var partSize = Math.ceil(size/10000)
    partSize = Math.ceil(partSize/this.minimumPartSize) * this.minimumPartSize
    return partSize
  }

  // log the request, response, error
  logHTTP(reqOptions, response, err) {
    // if no logstreamer available return.
    if (!this.logStream) return
    if (!isObject(reqOptions)) {
      throw new TypeError('reqOptions should be of type "object"')
    }
    if (response && !isReadableStream(response)) {
      throw new TypeError('response should be of type "Stream"')
    }
    if (err && !(err instanceof Error)) {
      throw new TypeError('err should be of type "Error"')
    }
    var logHeaders = (headers) => {
      _.forEach(headers, (v, k) => {
        if (k == 'authorization') {
          var redacter = new RegExp('Signature=([0-9a-f]+)')
          v = v.replace(redacter, 'Signature=**REDACTED**')
        }
        this.logStream.write(`${k}: ${v}\n`)
      })
      this.logStream.write('\n')
    }.bind(this)
    this.logStream.write(`REQUEST: ${reqOptions.method} ${reqOptions.path}\n`)
    logHeaders(reqOptions.headers)
    if (response) {
      this.logStream.write(`RESPONSE: ${response.statusCode}\n`)
      logHeaders(response.headers)
    }
    if (err) {
      this.logStream.write('ERROR BODY:\n')
      var errJSON = JSON.stringify(err, null, '\t')
      this.logStream.write(`${errJSON}\n`)
    }
  }

  // Enable tracing
  traceOn(stream) {
    if (!stream) stream = process.stdout
    this.logStream = stream
  }

  // Disable tracing
  traceOff() {
    this.logStream = null
  }

  // makeRequest is the primitive used by the apis for making S3 requests.
  // payload can be empty string in case of no payload.
  // statusCode is the expected statusCode. If response.statusCode does not match
  // we parse the XML error and call the callback with the error message.
  // A valid region is passed by the calls - listBuckets, makeBucket and
  // getBucketRegion.
  makeRequest(options, payload, statusCode, region, cb) {
    if (!isObject(options)) {
      throw new TypeError('options should be of type "object"')
    }
    if (!isString(payload) && !isObject(payload)) {
      // Buffer is of type 'object'
      throw new TypeError('payload should be of type "string" or "Buffer"')
    }
    if (!isNumber(statusCode)) {
      throw new TypeError('statusCode should be of type "number"')
    }
    if (!isString(region)) {
      throw new TypeError('region should be of type "string"')
    }
    if(!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    if (!options.headers) options.headers = {}
    if (options.method === 'POST' || options.method === 'PUT' || options.method === 'DELETE') {
      options.headers['content-length'] = payload.length
    }
    var sha256sum = ''
    if (this.enableSHA256) sha256sum = Crypto.createHash('sha256').update(payload).digest('hex')
    var stream = readableStream(payload)
    this.makeRequestStream(options, stream, sha256sum, statusCode, region, cb)
  }

  // makeRequestStream will be used directly instead of makeRequest in case the payload
  // is available as a stream. for ex. putObject
  makeRequestStream(options, stream, sha256sum, statusCode, region, cb) {
    if (!isObject(options)) {
      throw new TypeError('options should be of type "object"')
    }
    if (!isReadableStream(stream)) {
      throw new errors.InvalidArgumentError('stream should be a readable Stream')
    }
    if (!isString(sha256sum)) {
      throw new TypeError('sha256sum should be of type "string"')
    }
    if (!isNumber(statusCode)) {
      throw new TypeError('statusCode should be of type "number"')
    }
    if (!isString(region)) {
      throw new TypeError('region should be of type "string"')
    }
    if(!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    // sha256sum will be empty for anonymous or https requests
    if (!this.enableSHA256 && sha256sum.length !== 0) {
      throw new errors.InvalidArgumentError(`sha256sum expected to be empty for anonymous or https requests`)
    }
    // sha256sum should be valid for non-anonymous http requests.
    if (this.enableSHA256 && sha256sum.length !== 64) {
      throw new errors.InvalidArgumentError(`Invalid sha256sum : ${sha256sum}`)
    }

    var _makeRequest = (e, region) => {
      if (e) return cb(e)
      options.region = region
      var reqOptions = this.getRequestOptions(options)
      if (!this.anonymous) {
	// For non-anonymous https requests sha256sum is 'UNSIGNED-PAYLOAD' for signature calculation.
	if (!this.enableSHA256) sha256sum = 'UNSIGNED-PAYLOAD'
        reqOptions.headers['x-amz-date'] = Moment().utc().format('YYYYMMDDTHHmmss') + 'Z'
        reqOptions.headers['x-amz-content-sha256'] = sha256sum
        var authorization = signV4(reqOptions, this.accessKey, this.secretKey, region)
        reqOptions.headers.authorization = authorization
      }
      var req = this.transport.request(reqOptions, response => {
        if (statusCode !== response.statusCode) {
          // For an incorrect region, S3 server always sends back 400.
          // But we will do cache invalidation for all errors so that,
          // in future, if AWS S3 decides to send a different status code or
          // XML error code we will still work fine.
          delete(this.regionMap[options.bucketName])
          var errorTransformer = transformers.getErrorTransformer(response)
          pipesetup(response, errorTransformer)
            .on('error', e => {
              this.logHTTP(reqOptions, response, e)
              cb(e)
            })
          return
        }
        this.logHTTP(reqOptions, response)
        cb(null, response)
      })
      pipesetup(stream, req)
        .on('error', e => {
          this.logHTTP(reqOptions, null, e)
          cb(e)
        })
    }
    if (region) return _makeRequest(null, region)
    this.getBucketRegion(options.bucketName, _makeRequest)
  }

  // gets the region of the bucket
  getBucketRegion(bucketName, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name : ${bucketName}`)
    }
    if (!isFunction(cb)) {
      throw new TypeError('cb should be of type "function"')
    }
    if (this.regionMap[bucketName]) return cb(null, this.regionMap[bucketName])
    var extractRegion = (response) => {
      var transformer = transformers.getBucketRegionTransformer()
      var region = 'us-east-1'
      pipesetup(response, transformer)
        .on('error', cb)
        .on('data', data => {
          if (data) region = data
        })
        .on('end', () => {
          this.regionMap[bucketName] = region
          cb(null, region)
        })
    }

    var method = 'GET'
    var query = 'location'

    // `getBucketLocation` behaves differently in following ways for
    // different environments.
    //
    // - For nodejs env we default to path style requests.
    // - For browser env path style requests on buckets yields CORS
    //   error. To circumvent this problem we make a virtual host
    //   style request signed with 'us-east-1'. This request fails
    //   with an error 'AuthorizationHeaderMalformed', additionally
    //   the error XML also provides Region of the bucket. To validate
    //   this region is proper we retry the same request with the newly
    //   obtained region.
    var pathStyle = typeof window === 'undefined'
    this.makeRequest({method, bucketName, query, pathStyle}, '', 200, 'us-east-1', (e, response) => {
      if (e) {
        if (e.name === 'AuthorizationHeaderMalformed') {
          var region = e.Region
          if (!region) return cb(e)
          this.makeRequest({method, bucketName, query}, '', 200, region, (e, response) => {
            if (e) return cb(e)
            extractRegion(response)
          })
          return
        }
        return cb(e)
      }
      extractRegion(response)
    })
  }

  // Creates the bucket `bucketName`.
  //
  // __Arguments__
  // * `bucketName` _string_ - Name of the bucket
  // * `region` _string_ - region valid values are _us-west-1_, _us-west-2_,  _eu-west-1_, _eu-central-1_, _ap-southeast-1_, _ap-northeast-1_, _ap-southeast-2_, _sa-east-1_.
  // * `callback(err)` _function_ - callback function with `err` as the error argument. `err` is null if the bucket is successfully created.
  makeBucket(bucketName, region, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isString(region)) {
      throw new TypeError('region should be of type "string"')
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    var payload = ''

    // sending makeBucket request with XML containing 'us-east-1' fails. For
    // default region server expects the request without body
    if (region && region !== 'us-east-1') {
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
    var method = 'PUT'
    var headers = {}
    // virtual-host-style request but signed  with region 'us-east-1'
    // makeBucket request has to be always signed bye 'us-east-1'
    this.makeRequest({method, bucketName, headers}, payload, 200, 'us-east-1', (e) => {
      if (e && e.name === 'AuthorizationHeaderMalformed') {
        // if the bucket already exists in non-standard location we try again
        // by signing the request with the correct region and S3 returns:
        // 1) BucketAlreadyOwnedByYou - if the user is the bucket owner
        // 2) BucketAlreadyExists - if the user is not the bucket owner
        return this.makeRequest({method, bucketName, headers}, payload, 200, e.Region, cb)
      }
      cb(e)
    })
  }

  // List of buckets created.
  //
  // __Arguments__
  // * `callback(err, buckets)` _function_ - callback function with error as the first argument. `buckets` is an array of bucket information
  //
  // `buckets` array element:
  // * `bucket.name` _string_ : bucket name
  // * `bucket.creationDate` _string_: date when bucket was created
  listBuckets(cb) {
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    var method = 'GET'
    this.makeRequest({method}, '', 200, 'us-east-1', (e, response) => {
      if (e) return cb(e)
      var transformer = transformers.getListBucketTransformer()
      var buckets
      pipesetup(response, transformer)
        .on('data', result => buckets = result)
        .on('error', e => cb(e))
        .on('end', () => cb(null, buckets))
    })
  }

  // Returns a stream that emits objects that are partially uploaded.
  //
  // __Arguments__
  // * `bucketname` _string_: name of the bucket
  // * `prefix` _string_: prefix of the object names that are partially uploaded (optional, default `''`)
  // * `recursive` _bool_: directory style listing when false, recursive listing when true (optional, default `false`)
  //
  // __Return Value__
  // * `stream` _Stream_ : emits objects of the format:
  //   * `object.key` _string_: name of the object
  //   * `object.uploadId` _string_: upload ID of the object
  //   * `object.size` _Integer_: size of the partially uploaded object
  listIncompleteUploads(bucket, prefix, recursive) {
    if (prefix === undefined) prefix = ''
    if (recursive === undefined) recursive = false
    if (!isValidBucketName(bucket)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucket)
    }
    if (!isValidPrefix(prefix)) {
      throw new errors.InvalidPrefixError(`Invalid prefix : ${prefix}`)
    }
    if (!isBoolean(recursive)) {
      throw new TypeError('recursive should be of type "boolean"')
    }
    var delimiter = recursive ? '' : '/'
    var keyMarker = ''
    var uploadIdMarker = ''
    var uploads = []
    var ended = false
    var readStream = Stream.Readable({objectMode: true})
    readStream._read = () => {
      // push one upload info per _read()
      if (uploads.length) {
        return readStream.push(uploads.shift())
      }
      if (ended) return readStream.push(null)
      this.listIncompleteUploadsQuery(bucket, prefix, keyMarker, uploadIdMarker, delimiter)
        .on('error', e => dummyTransformer.emit('error', e))
        .on('data', result => {
          result.prefixes.forEach(prefix => uploads.push(prefix))
          async.eachSeries(result.uploads, (upload, cb) => {
            // for each incomplete upload add the sizes of its uploaded parts
            this.listParts(bucket, upload.key, upload.uploadId, (err, parts) => {
              if (err) return cb(err)
              upload.size = parts.reduce((acc, item) => acc + item.size, 0)
              uploads.push(upload)
              cb()
            })
          }, err => {
            if (err) {
              readStream.emit('error', err)
              return
            }
            if (result.isTruncated) {
              keyMarker = result.nextKeyMarker
              uploadIdMarker = result.nextUploadIdMarker
            } else {
              ended = true
            }
            readStream._read()
          })
        })
    }
    return readStream
  }

  // To check if a bucket already exists.
  //
  // __Arguments__
  // * `bucketName` _string_ : name of the bucket
  // * `callback(err)` _function_ : `err` is `null` if the bucket exists
  bucketExists(bucketName, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    var method = 'HEAD'
    this.makeRequest({method, bucketName}, '', 200, '', cb)
  }

  // Remove a bucket.
  //
  // __Arguments__
  // * `bucketName` _string_ : name of the bucket
  // * `callback(err)` _function_ : `err` is `null` if the bucket is removed successfully.
  removeBucket(bucketName, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    var method = 'DELETE'
    this.makeRequest({method, bucketName}, '', 204, '', (e) => {
      // If the bucket was successfully removed, remove the region map entry.
      if (!e) delete(this.regionMap[bucketName])
      cb(e)
    })
  }

  // Remove the partially uploaded object.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `callback(err)` _function_: callback function is called with non `null` value in case of error
  removeIncompleteUpload(bucketName, objectName, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.isValidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    var removeUploadId
    async.during(
      cb => {
        this.findUploadId(bucketName, objectName, (e, uploadId) => {
          if (e) return cb(e)
          removeUploadId = uploadId
          cb(null, uploadId)
        })
      },
      cb => {
        var method = 'DELETE'
        var query = `uploadId=${removeUploadId}`
        this.makeRequest({method, bucketName, objectName, query}, '', 204, '', e => cb(e))
      },
      cb
    )
  }

  // Callback is called with `error` in case of error or `null` in case of success
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `filePath` _string_: path to which the object data will be written to
  // * `callback(err)` _function_: callback is called with `err` in case of error.
  fGetObject(bucketName, objectName, filePath, cb) {
    // Input validation.
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isString(filePath)) {
      throw new TypeError('filePath should be of type "string"')
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    // Internal data.
    var partFile
    var partFileStream
    var objStat

    // Rename wrapper.
    var rename = err => {
      if (err) return cb(err)
      fs.rename(partFile, filePath, cb)
    }

    async.waterfall([
      cb => this.statObject(bucketName, objectName, cb),
      (result, cb) => {
        objStat = result
        var dir = path.dirname(filePath)
        // If file is in current directory skip.
        if (dir === '.') return cb()
        // Create any missing top level directories.
        mkdirp(dir, cb)
      },
      (ignore, cb) => {
        partFile = `${filePath}.${objStat.etag}.part.minio`
        fs.stat(partFile, (e, stats) => {
          var offset = 0
          if (e) {
            partFileStream = fs.createWriteStream(partFile, {flags: 'w'})
          } else {
            if (objStat.size === stats.size) return rename()
            offset = stats.size
            partFileStream = fs.createWriteStream(partFile, {flags: 'a'})
          }
          this.getPartialObject(bucketName, objectName, offset, 0, cb)
        })
      },
      (downloadStream, cb) => {
        pipesetup(downloadStream, partFileStream)
          .on('error', e => cb(e))
          .on('finish', cb)
      },
      cb => fs.stat(partFile, cb),
      (stats, cb) => {
        if (stats.size === objStat.size) return cb()
        cb(new Error('Size mismatch between downloaded file and the object'))
      }
    ], rename)
  }

  // Callback is called with readable stream of the object content.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `callback(err, stream)` _function_: callback is called with `err` in case of error. `stream` is the object content stream
  getObject(bucketName, objectName, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
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
  // * `length` _number_: length of the object that will be read in the stream (optional, if not specified we read the rest of the file from the offset)
  // * `callback(err, stream)` _function_: callback is called with `err` in case of error. `stream` is the object content stream
  getPartialObject(bucketName, objectName, offset, length, cb) {
    if (typeof length === 'function') {
      cb = length
      length = 0
    }
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
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
      headers.range = range
    }

    var expectedStatus = 200
    if (range) {
      expectedStatus = 206
    }
    var method = 'GET'
    this.makeRequest({method, bucketName, objectName, headers}, '', expectedStatus, '', cb)
  }

  // Uploads the object using contents from a file
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `filePath` _string_: file path of the file to be uploaded
  // * `contentType` _string_: content type of the object
  // * `callback(err, etag)` _function_: non null `err` indicates error, `etag` _string_ is the etag of the object uploaded.
  fPutObject(bucketName, objectName, filePath, contentType, callback) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isString(contentType)) {
      throw new TypeError('contentType should be of type "string"')
    }
    if (!isString(filePath)) {
      throw new TypeError('filePath should be of type "string"')
    }

    if (contentType.trim() === '') {
      contentType = 'application/octet-stream'
    }

    var size
    var partSize

    async.waterfall([
      cb => fs.stat(filePath, cb),
      (stats, cb) => {
        size = stats.size
        if (size > this.maxObjectSize) {
          return cb(new Error(`${filePath} size : ${stats.size}, max allowed size : 5TB`))
        }
        if (size < this.minimumPartSize) {
          // simple PUT request, no multipart
          var multipart = false
          var uploader = this.getUploader(bucketName, objectName, contentType, multipart)
          var hash = transformers.getHashSummer(this.enableSHA256)
          var start = 0
          var end = size - 1
          var autoClose = true
          if (size === 0) end = 0
          var options = {start, end, autoClose}
          pipesetup(fs.createReadStream(filePath, options), hash)
            .on('data', data => {
              var md5sum = data.md5sum
              var sha256sum = data.sha256sum
              var stream = fs.createReadStream(filePath, options)
              var uploadId = ''
              var partNumber = 0
              uploader(stream, size, sha256sum, md5sum, (err, etag) => {
                callback(err, etag)
                cb(true)
              })
            })
            .on('error', e => cb(e))
          return
        }
        this.findUploadId(bucketName, objectName, cb)
      },
      (uploadId, cb) => {
        // if there was a previous incomplete upload, fetch all its uploaded parts info
        if (uploadId) return this.listParts(bucketName, objectName, uploadId,  (e, etags) =>  cb(e, uploadId, etags))
        // there was no previous upload, initiate a new one
        this.initiateNewMultipartUpload(bucketName, objectName, '', (e, uploadId) => cb(e, uploadId, []))
      },
      (uploadId, etags, cb) => {
        partSize = this.calculatePartSize(size)
        var multipart = true
        var uploader = this.getUploader(bucketName, objectName, contentType, multipart)

        // convert array to object to make things easy
        var parts = etags.reduce(function(acc, item) {
          if (!acc[item.part]) {
            acc[item.part] = item
          }
          return acc
        }, {})
        var partsDone = []
        var partNumber = 1
        var uploadedSize = 0
        async.whilst(
          () => uploadedSize < size,
          cb => {
            var part = parts[partNumber]
            var hash = transformers.getHashSummer(this.enableSHA256)
            var length = partSize
            if (length > (size - uploadedSize)) {
              length = size - uploadedSize
            }
            var start = uploadedSize
            var end = uploadedSize + length - 1
            var autoClose = true
            var options = {autoClose, start, end}
            // verify md5sum of each part
            pipesetup(fs.createReadStream(filePath, options), hash)
              .on('data', data => {
                var md5sumHex = (new Buffer(data.md5sum, 'base64')).toString('hex')
                if (part && (md5sumHex === part.etag)) {
                  //md5 matches, chunk already uploaded
                  partsDone.push({part: partNumber, etag: part.etag})
                  partNumber++
                  uploadedSize += length
                  return cb()
                }
                // part is not uploaded yet, or md5 mismatch
                var stream = fs.createReadStream(filePath, options)
                uploader(uploadId, partNumber, stream, length,
                  data.sha256sum, data.md5sum, (e, etag) => {
                    if (e) return cb(e)
                    partsDone.push({part: partNumber, etag})
                    partNumber++
                    uploadedSize += length
                    return cb()
                  })
              })
              .on('error', e => cb(e))
          },
          e => {
            if (e) return cb(e)
            cb(null, partsDone, uploadId)
          }
        )
      },
      // all parts uploaded, complete the multipart upload
      (etags, uploadId, cb) => this.completeMultipartUpload(bucketName, objectName, uploadId, etags, cb)
    ], (err, ...rest) => {
      if (err === true) return
      callback(err, ...rest)
    })
  }

  // Uploads the object.
  //
  // Uploading a stream
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `stream` _Stream_: Readable stream
  // * `size` _number_: size of the object
  // * `contentType` _string_: content type of the object (optional, default `application/octet-stream`)
  // * `callback(err, etag)` _function_: non null `err` indicates error, `etag` _string_ is the etag of the object uploaded.
  //
  // Uploading "Buffer" or "string"
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `string or Buffer` _Stream_ or _Buffer_: Readable stream
  // * `contentType` _string_: content type of the object (optional, default `application/octet-stream`)
  // * `callback(err, etag)` _function_: non null `err` indicates error, `etag` _string_ is the etag of the object uploaded.
  putObject(arg1, arg2, arg3, arg4, arg5, arg6) {
    var bucketName = arg1
    var objectName = arg2
    var stream
    var size
    var contentType
    var cb
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (isReadableStream(arg3)) {
      stream = arg3
      size = arg4
      if (typeof arg5 === 'function') {
        contentType = 'application/octet-stream'
        cb = arg5
      } else {
        contentType = arg5
        cb = arg6
      }
    } else if (typeof(arg3) === 'string' || arg3 instanceof Buffer) {
      stream = readableStream(arg3)
      size = arg3.length
      if (typeof arg4 === 'function') {
        contentType = 'application/octet-stream'
        cb = arg4
      } else {
        contentType = arg4
        cb = arg5
      }
    } else {
      throw new TypeError('third argument should be of type "stream.Readable" or "Buffer" or "string"')
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
    if (size < 0) {
      throw new errors.InvalidArgumentError(`size cannot be negative, given size : ${size}`)
    }

    if (contentType.trim() === '') {
      contentType = 'application/octet-stream'
    }

    if (size <= this.minimumPartSize) {
      // simple PUT request, no multipart
      var concater = transformers.getConcater()
      pipesetup(stream, concater)
        .on('error', e => cb(e))
        .on('data', chunk => {
          var multipart = false
          var uploader = this.getUploader(bucketName, objectName, contentType, multipart)
          var readStream = readableStream(chunk)
          var sha256sum = ''
          if (this.enableSHA256) sha256sum = Crypto.createHash('sha256').update(chunk).digest('hex')
          var md5sum = Crypto.createHash('md5').update(chunk).digest('base64')
          uploader(readStream, chunk.length, sha256sum, md5sum, cb)
        })
      return
    }
    async.waterfall([
      cb => this.findUploadId(bucketName, objectName, cb),
      (uploadId, cb) => {
        if (uploadId) return this.listParts(bucketName, objectName, uploadId,  (e, etags) =>  cb(e, uploadId, etags))
        this.initiateNewMultipartUpload(bucketName, objectName, contentType, (e, uploadId) => cb(e, uploadId, []))
      },
      (uploadId, etags, cb) => {
        var multipartSize = this.calculatePartSize(size)
        var chunker = BlockStream2({size: this.minimumPartSize, zeroPadding: false})
        var sizeLimiter = transformers.getSizeLimiter(size, stream, chunker)
        var chunkUploader = this.chunkUploader(bucketName, objectName, contentType, uploadId, etags, multipartSize)
        pipesetup(stream, chunker, sizeLimiter, chunkUploader)
          .on('error', e => cb(e))
          .on('data', etags => cb(null, etags, uploadId))
      },
      (etags, uploadId, cb) => this.completeMultipartUpload(bucketName, objectName, uploadId, etags, cb)
    ], cb)
  }

  // list a batch of objects
  listObjectsQuery(bucketName, prefix, marker, delimiter, maxKeys) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isString(prefix)) {
      throw new TypeError('prefix should be of type "string"')
    }
    if (!isString(marker)) {
      throw new TypeError('marker should be of type "string"')
    }
    if (!isString(delimiter)) {
      throw new TypeError('delimiter should be of type "string"')
    }
    if (!isNumber(maxKeys)) {
      throw new TypeError('maxKeys should be of type "number"')
    }
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
      query = `${queries.join('&')}`
    }
    var method = 'GET'
    var transformer = transformers.getListObjectsTransformer()
    this.makeRequest({method, bucketName, query}, '', 200, '', (e, response) => {
      if (e) return transformer.emit('error', e)
      pipesetup(response, transformer)
    })
    return transformer
  }

  // List the objects in the bucket.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `prefix` _string_: the prefix of the objects that should be listed (optional, default `''`)
  // * `recursive` _bool_: `true` indicates recursive style listing and `false` indicates directory style listing delimited by '/'. (optional, default `false`)
  //
  // __Return Value__
  // * `stream` _Stream_: stream emitting the objects in the bucket, the object is of the format:
  //   * `stat.key` _string_: name of the object
  //   * `stat.size` _number_: size of the object
  //   * `stat.etag` _string_: etag of the object
  //   * `stat.lastModified` _string_: modified time stamp
  listObjects(bucketName, prefix, recursive) {
    if (prefix === undefined) prefix = ''
    if (recursive === undefined) recursive = false
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidPrefix(prefix)) {
      throw new errors.InvalidPrefixError(`Invalid prefix : ${prefix}`)
    }
    if (!isString(prefix)) {
      throw new TypeError('prefix should be of type "string"')
    }
    if (!isBoolean(recursive)) {
      throw new TypeError('recursive should be of type "boolean"')
    }
    // if recursive is false set delimiter to '/'
    var delimiter = recursive ? '' : '/'
    var marker = ''
    var objects = []
    var ended = false
    var readStream = Stream.Readable({objectMode: true})
    readStream._read = () => {
      // push one object per _read()
      if (objects.length) {
        readStream.push(objects.shift())
        return
      }
      if (ended) return readStream.push(null)
      // if there are no objects to push do query for the next batch of objects
      this.listObjectsQuery(bucketName, prefix, marker, delimiter, 1000)
          .on('error', e => readStream.emit('error', e))
          .on('data', result => {
            if (result.isTruncated) {
              marker = result.nextMarker
            } else {
              ended = true
            }
            objects = result.objects
            readStream._read()
          })
    }
    return readStream
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
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    var method = 'HEAD'
    this.makeRequest({method, bucketName, objectName}, '', 200, '', (e, response) => {
      if (e) return cb(e)
      var result = {
        size: +response.headers['content-length'],
        contentType: response.headers['content-type'],
        lastModified: response.headers['last-modified']
      }
      var etag = response.headers.etag
      if (etag) {
        etag = etag.replace(/^\"/, '').replace(/\"$/, '')
        result.etag = etag
      }
      cb(null, result)
    })
  }

  // Remove the specified object.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `callback(err)` _function_: callback function is called with non `null` value in case of error
  removeObject(bucketName, objectName, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    var method = 'DELETE'
    this.makeRequest({method, bucketName, objectName}, '', 204, '', cb)
  }

  // Generate a presigned URL for PUT. Using this URL, the browser can upload to S3 only with the specified object name.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `expiry` _number_: expiry in seconds
  presignedPutObject(bucketName, objectName, expires, cb) {
    if (this.anonymous) {
      throw new errors.AnonymousRequestError('Presigned PUT url cannot be generated for anonymous requests')
    }
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isNumber(expires)) {
      throw new TypeError('expires should be of type "number"')
    }
    var method = 'PUT'
    var requestDate = Moment().utc()
    this.getBucketRegion(bucketName, (e, region) => {
      if (e) return cb(e)
      // This statement is added to ensure that we send error through
      // callback on presign failure.
      var url
      var reqOptions = this.getRequestOptions({method,
                                               region,
                                               bucketName,
                                               objectName})
      try {
        url = presignSignatureV4(reqOptions, this.accessKey, this.secretKey,
                                 region, requestDate, expires)
      } catch (pe) {
        return cb(pe)
      }
      cb(null, url)
    })
  }

  // Generate a presigned URL for GET
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `expiry` _number_: expiry in seconds (optional, default 7 days)
  // * `respHeaders` _object_: response headers to override (optional)
  presignedGetObject(bucketName, objectName, expires, respHeaders, cb) {
    if (this.anonymous) {
      throw new errors.AnonymousRequestError('Presigned GET url cannot be generated for anonymous requests')
    }
    if (isFunction(respHeaders)) {
      cb = respHeaders
      respHeaders = {}
    }
    if (isFunction(expires)) {
      cb = expires
      respHeaders = {}
      expires = 24 * 60 * 60 * 7
    }
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isNumber(expires)) {
      throw new TypeError('expires should be of type "number"')
    }
    if (!isObject(respHeaders)) {
      throw new TypeError('respHeaders should be of type "object"')
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    var validRespHeaders = ['response-content-type', 'response-content-language', 'response-expires', 'response-cache-control',
                            'response-content-disposition', 'response-content-encoding']
    validRespHeaders.forEach(header => {
      if (respHeaders[header] !== undefined && !isString(respHeaders[header])) {
        throw new TypeError(`response header ${header} should be of type "string"`)
      }
    })
    var method = 'GET'
    var requestDate = Moment().utc()
    var query = _.map(respHeaders, (value, key) => `${key}=${uriEscape(value)}`).join('&')
    this.getBucketRegion(bucketName, (e, region) => {
      if (e) return cb(e)
      // This statement is added to ensure that we send error through
      // callback on presign failure.
      var url
      var reqOptions = this.getRequestOptions({method,
                                               region,
                                               bucketName,
                                               objectName,
                                               query})
      try {
        url = presignSignatureV4(reqOptions, this.accessKey, this.secretKey,
                                 region, requestDate, expires)
      } catch (pe) {
        return cb(pe)
      }
      cb(null, url)
    })
  }

  // return PostPolicy object
  newPostPolicy() {
    return new PostPolicy()
  }

  // presignedPostPolicy can be used in situations where we want more control on the upload than what
  // presignedPutObject() provides. i.e Using presignedPostPolicy we will be able to put policy restrictions
  // on the object's `name` `bucket` `expiry` `Content-Type`
  presignedPostPolicy(postPolicy, cb) {
    if (this.anonymous) {
      throw new errors.AnonymousRequestError('Presigned POST policy cannot be generated for anonymous requests')
    }
    if (!isObject(postPolicy)) {
      throw new TypeError('postPolicy should be of type "object"')
    }
    if (!isFunction(cb)) {
      throw new TypeError('cb should be of type "function"')
    }
    this.getBucketRegion(postPolicy.formData.bucket, (e, region) => {
      if (e) return cb(e)
      var date = Moment.utc()
      var dateStr = date.format('YYYYMMDDTHHmmss') + 'Z'

      if (!postPolicy.policy.expiration) {
        // 'expiration' is mandatory field for S3.
        // Set default expiration date of 7 days.
        var expires = new Date()
        expires.setSeconds(24 * 60 * 60 * 7)
        postPolicy.setExpires(expires)
      }

      postPolicy.policy.conditions.push(['eq', '$x-amz-date', dateStr])
      postPolicy.formData['x-amz-date'] = dateStr

      postPolicy.policy.conditions.push(['eq', '$x-amz-algorithm', 'AWS4-HMAC-SHA256'])
      postPolicy.formData['x-amz-algorithm'] = 'AWS4-HMAC-SHA256'

      postPolicy.policy.conditions.push(["eq", "$x-amz-credential", this.accessKey + "/" + getScope(region, date)])
      postPolicy.formData['x-amz-credential'] = this.accessKey + "/" + getScope(region, date)

      var policyBase64 = new Buffer(JSON.stringify(postPolicy.policy)).toString('base64')

      postPolicy.formData.policy = policyBase64

      var signature = postPresignSignatureV4(region, date, this.secretKey, policyBase64)

      postPolicy.formData['x-amz-signature'] = signature
      var opts = {}
      opts.region = region
      opts.bucketName = postPolicy.formData.bucket
      var reqOptions = this.getRequestOptions(opts)
      var portStr = (this.port == 80 || this.port === 443) ? '' : `:${this.port.toString()}`
      var urlStr = `${reqOptions.protocol}//${reqOptions.host}${portStr}${reqOptions.path}`
      cb(null, urlStr, postPolicy.formData)
    })
  }

  // Calls implemented below are related to multipart.

  // Initiate a new multipart upload.
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
    this.makeRequest({method, bucketName, objectName, query, headers}, '', 200, '', (e, response) => {
      if (e) return cb(e)
      var transformer = transformers.getInitiateMultipartTransformer()
      pipesetup(response, transformer)
        .on('error', e => cb(e))
        .on('data', uploadId => cb(null, uploadId))
    })
  }

  // Complete the multipart upload. After all the parts are uploaded issuing
  // this call will aggregate the parts on the server into a single object.
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

    this.makeRequest({method, bucketName, objectName, query}, payload, 200, '', (e, response) => {
      if (e) return cb(e)
      var transformer = transformers.getCompleteMultipartTransformer()
      pipesetup(response, transformer)
        .on('error', e => cb(e))
        .on('data', result => cb(null, result.etag))
    })
  }

  // Get part-info of all parts of an incomplete upload specified by uploadId.
  listParts(bucketName, objectName, uploadId, cb) {
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
      this.listPartsQuery(bucketName, objectName, uploadId, marker, (e, result) => {
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

  // Called by listParts to fetch a batch of part-info
  listPartsQuery(bucketName, objectName, uploadId, marker, cb) {
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
    this.makeRequest({method, bucketName, objectName, query}, '', 200, '', (e, response) => {
      if (e) return cb(e)
      var transformer = transformers.getListPartsTransformer()
      pipesetup(response, transformer)
        .on('error', e => cb(e))
        .on('data', data => cb(null, data))
    })
  }

  // Called by listIncompleteUploads to fetch a batch of incomplete uploads.
  listIncompleteUploadsQuery(bucketName, prefix, keyMarker, uploadIdMarker, delimiter) {
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
    this.makeRequest({method, bucketName, query}, '', 200, '', (e, response) => {
      if (e) return transformer.emit('error', e)
      pipesetup(response, transformer)
    })
    return transformer
  }

  // Find uploadId of an incomplete upload.
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
    var latestUpload
    var listNext = (keyMarker, uploadIdMarker) => {
      this.listIncompleteUploadsQuery(bucketName, objectName, keyMarker, uploadIdMarker, '')
        .on('error', e => cb(e))
        .on('data', result => {
          result.uploads.forEach(upload => {
            if (upload.key === objectName) {
              if (!latestUpload ||
                (upload.initiated.getTime() > latestUpload.initiated.getTime())) {
                latestUpload = upload
                return
              }
            }
          })
          if (result.isTruncated) {
            listNext(result.nextKeyMarker, result.nextUploadIdMarker)
            return
          }
          if (latestUpload) return cb(null, latestUpload.uploadId)
          cb(null, undefined)
        })
    }
    listNext('', '')
  }

  // Returns a stream that does multipart upload of the chunks it receives.
  chunkUploader(bucketName, objectName, contentType, uploadId, partsArray, multipartSize) {
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
    if (!isNumber(multipartSize)) {
      throw new TypeError('multipartSize should be of type "number"')
    }
    if (multipartSize > this.maximumPartSize) {
      throw new errors.InvalidArgumentError(`multipartSize cannot be more than ${this.maximumPartSize}`)
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

    var aggregatedSize = 0

    var aggregator = null   // aggregator is a simple through stream that aggregates
                            // chunks of minimumPartSize adding up to multipartSize

    var md5 = null
    var sha256 = null
    return Through2.obj((chunk, enc, cb) => {
      if (chunk.length > this.minimumPartSize) {
        return cb(new Error(`chunk length cannot be more than ${this.minimumPartSize}`))
      }

      // get new objects for a new part upload
      if (!aggregator) aggregator = Through2()
      if (!md5) md5 = Crypto.createHash('md5')
      if (!sha256 && this.enableSHA256) sha256 = Crypto.createHash('sha256')

      aggregatedSize += chunk.length
      if (aggregatedSize > multipartSize) return cb(new Error('aggregated size cannot be greater than multipartSize'))

      aggregator.write(chunk)
      md5.update(chunk)
      if (this.enableSHA256) sha256.update(chunk)

      var done = false
      if (aggregatedSize === multipartSize) done = true
      // This is the last chunk of the stream.
      if (aggregatedSize < multipartSize && chunk.length < this.minimumPartSize) done = true

      // more chunks are expected
      if (!done) return cb()

      aggregator.end() // when aggregator is piped to another stream it emits all the chunks followed by 'end'

      var part = parts[partNumber]
      var md5sumHex = md5.digest('hex')
      if (part) {
        if (md5sumHex === part.etag) {
          // md5 matches, chunk already uploaded
          // reset aggregator md5 sha256 and aggregatedSize variables for a fresh multipart upload
          aggregator = md5 = sha256 = null
          aggregatedSize = 0
          partsDone.push({part: part.part, etag: part.etag})
          partNumber++
          return cb()
        }
        // md5 doesn't match, upload again
      }
      var sha256sum = ''
      if (this.enableSHA256) sha256sum = sha256.digest('hex')
      var md5sumBase64 = (new Buffer(md5sumHex, 'hex')).toString('base64')
      var multipart = true
      var uploader = this.getUploader(bucketName, objectName, contentType, multipart)
      uploader(uploadId, partNumber, aggregator, aggregatedSize, sha256sum, md5sumBase64, (e, etag) => {
        if (e) {
          return cb(e)
        }
        // reset aggregator md5 sha256 and aggregatedSize variables for a fresh multipart upload
        aggregator = md5 = sha256 = null
        aggregatedSize = 0
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

  // Returns a function that can be used for uploading objects.
  // If multipart === true, it returns function that is used to upload
  // a part of the multipart.
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
                            stream, sha256sum, 200, '', (e, response) => {
        if (e) return cb(e)
        var etag = response.headers.etag
        if (etag) {
          etag = etag.replace(/^\"/, '').replace(/\"$/, '')
        }
        // Ignore the 'data' event so that the stream closes. (nodejs stream requirement)
        response.on('data', () => {})
        cb(null, etag)
      })
    }
    if (multipart) {
      return multipartUploader
    }
    return simpleUploader
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
    if (!nativedate) {
      throw new errrors.InvalidDateError('Invalid date : cannot be null')
    }
    var date = Moment(nativedate)

    function getExpirationString(date) {
      return date.format('YYYY-MM-DDThh:mm:ss.SSS') + 'Z'
    }
    this.policy.expiration = getExpirationString(date)
  }

  // set object name
  setKey(objectName) {
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name : ${objectName}`)
    }
    this.policy.conditions.push(['eq', '$key', objectName])
    this.formData.key = objectName
  }

  // set object name prefix, i.e policy allows any keys with this prefix
  setKeyStartsWith(prefix) {
    if (!isValidPrefix(prefix)) {
      throw new errors.InvalidPrefixError(`invalid prefix : ${prefix}`)
    }
    this.policy.conditions.push(['starts-with', '$key', prefix])
    this.formData.key = prefix
  }

  // set bucket name
  setBucket(bucketName) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name : ${bucketName}`)
    }
    this.policy.conditions.push(['eq', '$bucket', bucketName])
    this.formData.bucket = bucketName
  }

  // set Content-Type
  setContentType(type) {
    if (!type) {
      throw new Error('content-type cannot be null')
    }
    this.policy.conditions.push(['eq', '$Content-Type', type])
    this.formData['Content-Type'] = type
  }

  // set minimum/maximum length of what Content-Length can be.
  setContentLengthRange(min, max) {
    if (min > max) {
      throw new Error('min cannot be more than max')
    }
    if (min < 0) {
      throw new Error('min should be > 0')
    }
    if (max < 0) {
      throw new Error('max should be > 0')
    }
    this.policy.conditions.push(['content-length-range', min, max])
  }
}
