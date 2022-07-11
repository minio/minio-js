/*
 * MinIO Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2015 MinIO, Inc.
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
import Http from 'http'
import Https from 'https'
import Stream from 'stream'
import BlockStream2 from 'block-stream2'
import Xml from 'xml'
import xml2js from 'xml2js'
import async from 'async'
import querystring from 'querystring'
import mkdirp from 'mkdirp'
import path from 'path'
import _ from 'lodash'
import { TextEncoder } from "web-encoding"

import {
  extractMetadata, prependXAMZMeta, isValidPrefix, isValidEndpoint, isValidBucketName,
  isValidPort, isValidObjectName, isAmazonEndpoint, getScope,
  uriEscape, uriResourceEscape, isBoolean, isFunction, isNumber,
  isString, isObject, isArray, isValidDate, pipesetup,
  readableStream, isReadableStream, isVirtualHostStyle,
  insertContentType, makeDateLong, promisify, getVersionId, sanitizeETag,
  toMd5, toSha256,
  RETENTION_MODES, RETENTION_VALIDITY_UNITS,
  LEGAL_HOLD_STATUS, CopySourceOptions, CopyDestinationOptions, getSourceVersionId,
  PART_CONSTRAINTS,
  partsRequired,
  calculateEvenSplits,
  DEFAULT_REGION
} from './helpers.js'

import { signV4, presignSignatureV4, postPresignSignatureV4 } from './signing.js'

import ObjectUploader from './object-uploader'

import * as transformers from './transformers'

import * as errors from './errors.js'

import { getS3Endpoint } from './s3-endpoints.js'

import { NotificationConfig, NotificationPoller } from './notification'

import extensions from './extensions'
import CredentialProvider from "./CredentialProvider"

import { parseSelectObjectContentResponse} from "./xml-parsers"

var Package = require('../../package.json')

export class Client {
  constructor(params) {
    if (typeof params.secure !== 'undefined') throw new Error('"secure" option deprecated, "useSSL" should be used instead')
    // Default values if not specified.
    if (typeof params.useSSL === 'undefined') params.useSSL = true
    if (!params.port) params.port = 0
    // Validate input params.
    if (!isValidEndpoint(params.endPoint)) {
      throw new errors.InvalidEndpointError(`Invalid endPoint : ${params.endPoint}`)
    }
    if (!isValidPort(params.port)) {
      throw new errors.InvalidArgumentError(`Invalid port : ${params.port}`)
    }
    if (!isBoolean(params.useSSL)) {
      throw new errors.InvalidArgumentError(`Invalid useSSL flag type : ${params.useSSL}, expected to be of type "boolean"`)
    }

    // Validate region only if its set.
    if (params.region) {
      if (!isString(params.region)) {
        throw new errors.InvalidArgumentError(`Invalid region : ${params.region}`)
      }
    }

    var host = params.endPoint.toLowerCase()
    var port = params.port
    var protocol = ''
    var transport
    // Validate if configuration is not using SSL
    // for constructing relevant endpoints.
    if (params.useSSL === false) {
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
        throw new errors.InvalidArgumentError('Invalid transport type : ${params.transport}, expected to be type "object"')
      }
      transport = params.transport
    }

    // User Agent should always following the below style.
    // Please open an issue to discuss any new changes here.
    //
    //       MinIO (OS; ARCH) LIB/VER APP/VER
    //
    var libraryComments = `(${process.platform}; ${process.arch})`
    var libraryAgent = `MinIO ${libraryComments} minio-js/${Package.version}`
    // User agent block ends.

    this.transport = transport
    this.host = host
    this.port = port
    this.protocol = protocol
    this.accessKey = params.accessKey
    this.secretKey = params.secretKey
    this.sessionToken = params.sessionToken
    this.userAgent = `${libraryAgent}`

    // Default path style is true
    if (params.pathStyle === undefined) {
      this.pathStyle = true
    } else {
      this.pathStyle = params.pathStyle
    }

    if (!this.accessKey) this.accessKey = ''
    if (!this.secretKey) this.secretKey = ''
    this.anonymous = !this.accessKey || !this.secretKey

    if(params.credentialsProvider)  {
      this.credentialsProvider = params.credentialsProvider
      this.checkAndRefreshCreds()
    }

    this.regionMap = {}
    if (params.region) {
      this.region = params.region
    }

    this.partSize = 64*1024*1024
    if (params.partSize) {
      this.partSize = params.partSize
      this.overRidePartSize = true
    }
    if (this.partSize < 5*1024*1024) {
      throw new errors.InvalidArgumentError(`Part size should be greater than 5MB`)
    }
    if (this.partSize > 5*1024*1024*1024) {
      throw new errors.InvalidArgumentError(`Part size should be less than 5GB`)
    }

    this.maximumPartSize = 5*1024*1024*1024
    this.maxObjectSize = 5*1024*1024*1024*1024
    // SHA256 is enabled only for authenticated http requests. If the request is authenticated
    // and the connection is https we use x-amz-content-sha256=UNSIGNED-PAYLOAD
    // header for signature calculation.
    this.enableSHA256 = !this.anonymous && !params.useSSL

    this.s3AccelerateEndpoint = ( params.s3AccelerateEndpoint || null )
    this.reqOptions = {}
  }

  // This is s3 Specific and does not hold validity in any other Object storage.
  getAccelerateEndPointIfSet(bucketName, objectName){
    if (!_.isEmpty(this.s3AccelerateEndpoint)  && !_.isEmpty(bucketName)  && !_.isEmpty(objectName) ) {
      // http://docs.aws.amazon.com/AmazonS3/latest/dev/transfer-acceleration.html
      // Disable transfer acceleration for non-compliant bucket names.
      if (bucketName.indexOf(".")!== -1) {
        throw new Error(`Transfer Acceleration is not supported for non compliant bucket:${bucketName}`)
      }
      // If transfer acceleration is requested set new host.
      // For more details about enabling transfer acceleration read here.
      // http://docs.aws.amazon.com/AmazonS3/latest/dev/transfer-acceleration.html
      return this.s3AccelerateEndpoint
    }
    return  false
  }

  /**
   * @param endPoint _string_ valid S3 acceleration end point
   */
  setS3TransferAccelerate(endPoint){
    this.s3AccelerateEndpoint = endPoint
  }

  // Sets the supported request options.
  setRequestOptions(options) {
    if (!isObject(options)) {
      throw new TypeError('request options should be of type "object"')
    }
    this.reqOptions = _.pick(options, ['agent', 'ca', 'cert', 'ciphers', 'clientCertEngine', 'crl', 'dhparam', 'ecdhCurve', 'family', 'honorCipherOrder', 'key', 'passphrase', 'pfx', 'rejectUnauthorized', 'secureOptions', 'secureProtocol', 'servername', 'sessionIdContext'])
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
      virtualHostStyle = isVirtualHostStyle(this.host, this.protocol, bucketName, this.pathStyle)
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
      const accelerateEndPoint = this.getAccelerateEndPointIfSet(bucketName, objectName)
      if (accelerateEndPoint ) {
        reqOptions.host = `${accelerateEndPoint}`
      }else {
        reqOptions.host = getS3Endpoint(region)
      }
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

    // Use any request option specified in minioClient.setRequestOptions()
    reqOptions = Object.assign({}, this.reqOptions, reqOptions)

    return reqOptions
  }

  // Set application specific information.
  //
  // Generates User-Agent in the following style.
  //
  //       MinIO (OS; ARCH) LIB/VER APP/VER
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
      throw new TypeError(`Invalid appVersion: ${appVersion}`)
    }
    if (appVersion.trim() === '') {
      throw new errors.InvalidArgumentError('Input appVersion cannot be empty.')
    }
    this.userAgent = `${this.userAgent} ${appName}/${appVersion}`
  }

  // Calculate part size given the object size. Part size will be atleast this.partSize
  calculatePartSize(size) {
    if (!isNumber(size)) {
      throw new TypeError('size should be of type "number"')
    }
    if (size > this.maxObjectSize) {
      throw new TypeError(`size should not be more than ${this.maxObjectSize}`)
    }
    if (this.overRidePartSize) {
      return this.partSize
    }
    var partSize = this.partSize
    for (;;) { 			// while(true) {...} throws linting error.
      // If partSize is big enough to accomodate the object size, then use it.
      if ((partSize * 10000) > size) {
        return partSize
      }
      // Try part sizes as 64MB, 80MB, 96MB etc.
      partSize += 16*1024*1024
    }
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
    }
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
  makeRequest(options, payload, statusCodes, region, returnResponse, cb) {
    if (!isObject(options)) {
      throw new TypeError('options should be of type "object"')
    }
    if (!isString(payload) && !isObject(payload)) {
      // Buffer is of type 'object'
      throw new TypeError('payload should be of type "string" or "Buffer"')
    }
    statusCodes.forEach(statusCode => {
      if (!isNumber(statusCode)) {
        throw new TypeError('statusCode should be of type "number"')
      }
    })
    if (!isString(region)) {
      throw new TypeError('region should be of type "string"')
    }
    if (!isBoolean(returnResponse)) {
      throw new TypeError('returnResponse should be of type "boolean"')
    }
    if(!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    if (!options.headers) options.headers = {}
    if (options.method === 'POST' || options.method === 'PUT' || options.method === 'DELETE') {
      options.headers['content-length'] = payload.length
    }
    var sha256sum = ''
    if (this.enableSHA256) sha256sum = toSha256(payload)
    var stream = readableStream(payload)
    this.makeRequestStream(options, stream, sha256sum, statusCodes, region, returnResponse, cb)
  }

  // makeRequestStream will be used directly instead of makeRequest in case the payload
  // is available as a stream. for ex. putObject
  makeRequestStream(options, stream, sha256sum, statusCodes, region, returnResponse, cb) {
    if (!isObject(options)) {
      throw new TypeError('options should be of type "object"')
    }
    if (!isReadableStream(stream)) {
      throw new errors.InvalidArgumentError('stream should be a readable Stream')
    }
    if (!isString(sha256sum)) {
      throw new TypeError('sha256sum should be of type "string"')
    }
    statusCodes.forEach(statusCode => {
      if (!isNumber(statusCode)) {
        throw new TypeError('statusCode should be of type "number"')
      }
    })
    if (!isString(region)) {
      throw new TypeError('region should be of type "string"')
    }
    if (!isBoolean(returnResponse)) {
      throw new TypeError('returnResponse should be of type "boolean"')
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

        let date = new Date()

        reqOptions.headers['x-amz-date'] = makeDateLong(date)
        reqOptions.headers['x-amz-content-sha256'] = sha256sum
        if (this.sessionToken) {
          reqOptions.headers['x-amz-security-token'] = this.sessionToken
        }

        this.checkAndRefreshCreds()
        var authorization = signV4(reqOptions, this.accessKey, this.secretKey, region, date)
        reqOptions.headers.authorization = authorization
      }
      var req = this.transport.request(reqOptions, response => {
        if (!statusCodes.includes(response.statusCode)) {
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
        if (returnResponse) return cb(null, response)
        // We drain the socket so that the connection gets closed. Note that this
        // is not expensive as the socket will not have any data.
        response.on('data', ()=>{})
        cb(null)
      })
      let pipe = pipesetup(stream, req)
      pipe.on('error', e => {
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

    // Region is set with constructor, return the region right here.
    if (this.region) return cb(null, this.region)

    if (this.regionMap[bucketName]) return cb(null, this.regionMap[bucketName])
    var extractRegion = (response) => {
      var transformer = transformers.getBucketRegionTransformer()
      var region = DEFAULT_REGION
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
    var pathStyle = this.pathStyle && typeof window === 'undefined'

    this.makeRequest({method, bucketName, query, pathStyle}, '', [200], DEFAULT_REGION, true, (e, response) => {
      if (e) {
        if (e.name === 'AuthorizationHeaderMalformed') {
          var region = e.Region
          if (!region) return cb(e)
          this.makeRequest({method, bucketName, query}, '', [200], region, true, (e, response) => {
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
  // * `makeOpts` _object_ - Options to create a bucket. e.g {ObjectLocking:true} (Optional)
  // * `callback(err)` _function_ - callback function with `err` as the error argument. `err` is null if the bucket is successfully created.
  makeBucket(bucketName, region, makeOpts={}, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }

    // Backward Compatibility
    if(isObject(region)){
      cb= makeOpts
      makeOpts=region
      region = ''
    }
    if (isFunction(region)) {
      cb = region
      region = ''
      makeOpts={}
    }
    if(isFunction(makeOpts)){
      cb=makeOpts
      makeOpts={}
    }

    if (!isString(region)) {
      throw new TypeError('region should be of type "string"')
    }
    if (!isObject(makeOpts)) {
      throw new TypeError('makeOpts should be of type "object"')
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    var payload = ''

    // Region already set in constructor, validate if
    // caller requested bucket location is same.
    if (region && this.region) {
      if (region !== this.region) {
        throw new errors.InvalidArgumentError(`Configured region ${this.region}, requested ${region}`)
      }
    }
    // sending makeBucket request with XML containing 'us-east-1' fails. For
    // default region server expects the request without body
    if (region && region !== DEFAULT_REGION) {
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

    if(makeOpts.ObjectLocking){
      headers["x-amz-bucket-object-lock-enabled"]=true
    }

    if (!region) region = DEFAULT_REGION

    const processWithRetry = (err) =>{
      if (err && (region === "" || region === DEFAULT_REGION)) {
        if(err.code === "AuthorizationHeaderMalformed" && err.region !== ""){
          // Retry with region returned as part of error
          this.makeRequest({method, bucketName, headers}, payload, [200], err.region, false, cb)
        }
        return
      }
      cb && cb()
    }

    this.makeRequest({method, bucketName, headers}, payload, [200], region, false, processWithRetry)
  }

  // List of buckets created.
  //
  // __Arguments__
  // * `callback(err, buckets)` _function_ - callback function with error as the first argument. `buckets` is an array of bucket information
  //
  // `buckets` array element:
  // * `bucket.name` _string_ : bucket name
  // * `bucket.creationDate` _Date_: date when bucket was created
  listBuckets(cb) {
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    var method = 'GET'
    this.makeRequest({method}, '', [200], DEFAULT_REGION, true, (e, response) => {
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
        .on('error', e => readStream.emit('error', e))
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
    this.makeRequest({method, bucketName}, '', [200], '', false, err => {
      if (err) {
        if (err.code == 'NoSuchBucket' || err.code == 'NotFound') return cb(null, false)
        return cb(err)
      }
      cb(null, true)
    })
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
    this.makeRequest({method, bucketName}, '', [204], '', false, (e) => {
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
        this.makeRequest({method, bucketName, objectName, query}, '', [204], '', false, e => cb(e))
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
  // * `getOpts` _object_: Version of the object in the form `{versionId:'my-uuid'}`. Default is `{}`. (optional)
  // * `callback(err)` _function_: callback is called with `err` in case of error.
  fGetObject(bucketName, objectName, filePath, getOpts={}, cb) {
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
    // Backward Compatibility
    if (isFunction(getOpts)) {
      cb = getOpts
      getOpts = {}
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
      cb => this.statObject(bucketName, objectName, getOpts, cb),
      (result, cb) => {
        objStat = result
        // Create any missing top level directories.
        mkdirp(path.dirname(filePath), cb)
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
          this.getPartialObject(bucketName, objectName, offset, 0, getOpts, cb)
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
  // * `getOpts` _object_: Version of the object in the form `{versionId:'my-uuid'}`. Default is `{}`. (optional)
  // * `callback(err, stream)` _function_: callback is called with `err` in case of error. `stream` is the object content stream
  getObject(bucketName, objectName, getOpts={}, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    // Backward Compatibility
    if (isFunction(getOpts)) {
      cb = getOpts
      getOpts = {}
    }

    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    this.getPartialObject(bucketName, objectName, 0, 0, getOpts, cb)
  }

  // Callback is called with readable stream of the partial object content.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `offset` _number_: offset of the object from where the stream will start
  // * `length` _number_: length of the object that will be read in the stream (optional, if not specified we read the rest of the file from the offset)
  // * `getOpts` _object_: Version of the object in the form `{versionId:'my-uuid'}`. Default is `{}`. (optional)
  // * `callback(err, stream)` _function_: callback is called with `err` in case of error. `stream` is the object content stream
  getPartialObject(bucketName, objectName, offset, length, getOpts={}, cb) {
    if (isFunction(length)) {
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
    // Backward Compatibility
    if (isFunction(getOpts)) {
      cb = getOpts
      getOpts = {}
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

    var expectedStatusCodes = [200]
    if (range) {
      expectedStatusCodes.push(206)
    }
    var method = 'GET'

    var query = querystring.stringify(getOpts)
    this.makeRequest({method, bucketName, objectName, headers, query}, '', expectedStatusCodes, '', true, cb)
  }

  // Uploads the object using contents from a file
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `filePath` _string_: file path of the file to be uploaded
  // * `metaData` _Javascript Object_: metaData assosciated with the object
  // * `callback(err, objInfo)` _function_: non null `err` indicates error, `objInfo` _object_ which contains versionId and etag.
  fPutObject(bucketName, objectName, filePath, metaData, callback) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }

    if (!isString(filePath)) {
      throw new TypeError('filePath should be of type "string"')
    }
    if (isFunction(metaData)) {
      callback = metaData
      metaData = {} // Set metaData empty if no metaData provided.
    }
    if (!isObject(metaData)) {
      throw new TypeError('metaData should be of type "object"')
    }

    // Inserts correct `content-type` attribute based on metaData and filePath
    metaData = insertContentType(metaData, filePath)

    // Updates metaData to have the correct prefix if needed
    metaData = prependXAMZMeta(metaData)
    var size
    var partSize

    async.waterfall([
      cb => fs.stat(filePath, cb),
      (stats, cb) => {
        size = stats.size
        if (size > this.maxObjectSize) {
          return cb(new Error(`${filePath} size : ${stats.size}, max allowed size : 5TB`))
        }
        if (size <= this.partSize) {
          // simple PUT request, no multipart
          var multipart = false
          var uploader = this.getUploader(bucketName, objectName, metaData, multipart)
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
              uploader(stream, size, sha256sum, md5sum, (err, objInfo) => {
                callback(err, objInfo)
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
        this.initiateNewMultipartUpload(bucketName, objectName, metaData, (e, uploadId) => cb(e, uploadId, []))
      },
      (uploadId, etags, cb) => {
        partSize = this.calculatePartSize(size)
        var multipart = true
        var uploader = this.getUploader(bucketName, objectName, metaData, multipart)

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
          cb => { cb(null, uploadedSize < size) },
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
                var md5sumHex = (Buffer.from(data.md5sum, 'base64')).toString('hex')
                if (part && (md5sumHex === part.etag)) {
                  // md5 matches, chunk already uploaded
                  partsDone.push({part: partNumber, etag: part.etag})
                  partNumber++
                  uploadedSize += length
                  return cb()
                }
                // part is not uploaded yet, or md5 mismatch
                var stream = fs.createReadStream(filePath, options)
                uploader(uploadId, partNumber, stream, length,
                         data.sha256sum, data.md5sum, (e, objInfo) => {
                           if (e) return cb(e)
                           partsDone.push({part: partNumber, etag: objInfo.etag})
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
  // * `size` _number_: size of the object (optional)
  // * `callback(err, etag)` _function_: non null `err` indicates error, `etag` _string_ is the etag of the object uploaded.
  //
  // Uploading "Buffer" or "string"
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `string or Buffer` _string_ or _Buffer_: string or buffer
  // * `callback(err, objInfo)` _function_: `err` is `null` in case of success and `info` will have the following object details:
  //   * `etag` _string_: etag of the object
  //   * `versionId` _string_: versionId of the object
  putObject(bucketName, objectName, stream, size, metaData, callback) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }

    // We'll need to shift arguments to the left because of size and metaData.
    if (isFunction(size)) {
      callback = size
      metaData = {}
    } else if (isFunction(metaData)) {
      callback = metaData
      metaData = {}
    }

    // We'll need to shift arguments to the left because of metaData
    // and size being optional.
    if (isObject(size)) {
      metaData = size
    }

    // Ensures Metadata has appropriate prefix for A3 API
    metaData = prependXAMZMeta(metaData)
    if (typeof stream === 'string' || stream instanceof Buffer) {
      // Adapts the non-stream interface into a stream.
      size = stream.length
      stream = readableStream(stream)
    } else if (!isReadableStream(stream)) {
      throw new TypeError('third argument should be of type "stream.Readable" or "Buffer" or "string"')
    }

    if (!isFunction(callback)) {
      throw new TypeError('callback should be of type "function"')
    }

    if (isNumber(size) && size < 0) {
      throw new errors.InvalidArgumentError(`size cannot be negative, given size: ${size}`)
    }

    // Get the part size and forward that to the BlockStream. Default to the
    // largest block size possible if necessary.
    if (!isNumber(size))
      size = this.maxObjectSize

    size = this.calculatePartSize(size)

    // s3 requires that all non-end chunks be at least `this.partSize`,
    // so we chunk the stream until we hit either that size or the end before
    // we flush it to s3.
    let chunker = new BlockStream2({size, zeroPadding: false})

    // This is a Writable stream that can be written to in order to upload
    // to the specified bucket and object automatically.
    let uploader = new ObjectUploader(this, bucketName, objectName, size, metaData, callback)
    // stream => chunker => uploader
    stream.pipe(chunker).pipe(uploader)
  }

  // Copy the object.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `srcObject` _string_: path of the source object to be copied
  // * `conditions` _CopyConditions_: copy conditions that needs to be satisfied (optional, default `null`)
  // * `callback(err, {etag, lastModified})` _function_: non null `err` indicates error, `etag` _string_ and `listModifed` _Date_ are respectively the etag and the last modified date of the newly copied object
  copyObjectV1(arg1, arg2, arg3, arg4, arg5) {
    var bucketName = arg1
    var objectName = arg2
    var srcObject = arg3
    var conditions, cb
    if (typeof arg4 == 'function' && arg5 === undefined) {
      conditions = null
      cb = arg4
    } else {
      conditions = arg4
      cb = arg5
    }
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isString(srcObject)) {
      throw new TypeError('srcObject should be of type "string"')
    }
    if (srcObject === "") {
      throw new errors.InvalidPrefixError(`Empty source prefix`)
    }

    if (conditions !== null && !(conditions instanceof CopyConditions)) {
      throw new TypeError('conditions should be of type "CopyConditions"')
    }

    var headers = {}
    headers['x-amz-copy-source'] = uriResourceEscape(srcObject)

    if (conditions !== null) {
      if (conditions.modified !== "") {
        headers['x-amz-copy-source-if-modified-since'] = conditions.modified
      }
      if (conditions.unmodified !== "") {
        headers['x-amz-copy-source-if-unmodified-since'] = conditions.unmodified
      }
      if (conditions.matchETag !== "") {
        headers['x-amz-copy-source-if-match'] = conditions.matchETag
      }
      if (conditions.matchEtagExcept !== "") {
        headers['x-amz-copy-source-if-none-match'] = conditions.matchETagExcept
      }
    }

    var method = 'PUT'
    this.makeRequest({method, bucketName, objectName, headers}, '', [200], '', true, (e, response) => {
      if (e) return cb(e)
      var transformer = transformers.getCopyObjectTransformer()
      pipesetup(response, transformer)
        .on('error', e => cb(e))
        .on('data', data => cb(null, data))
    })
  }

  /**
     * Internal Method to perform copy of an object.
     * @param sourceConfig __object__   instance of CopySourceOptions @link ./helpers/CopySourceOptions
     * @param destConfig  __object__   instance of CopyDestinationOptions @link ./helpers/CopyDestinationOptions
     * @param cb __function__ called with null if there is an error
     * @returns Promise if no callack is passed.
     */
  copyObjectV2(sourceConfig, destConfig, cb){

    if(!(sourceConfig instanceof CopySourceOptions )){
      throw new errors.InvalidArgumentError('sourceConfig should of type CopySourceOptions ')
    }
    if(!(destConfig instanceof CopyDestinationOptions )){
      throw new errors.InvalidArgumentError('destConfig should of type CopyDestinationOptions ')
    }
    if(!destConfig.validate()){
      return false
    }
    if(!destConfig.validate()){
      return false
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    const headers = Object.assign({}, sourceConfig.getHeaders(), destConfig.getHeaders())

    const  bucketName = destConfig.Bucket
    const objectName= destConfig.Object

    const method = 'PUT'
    this.makeRequest({method, bucketName, objectName, headers}, '', [200], '', true, (e, response) => {
      if (e) return cb(e)
      const transformer = transformers.getCopyObjectTransformer()
      pipesetup(response, transformer)
        .on('error', e => cb(e))
        .on('data', data => {
          const resHeaders = response.headers

          const copyObjResponse = {
            Bucket: destConfig.Bucket,
            Key: destConfig.Object,
            LastModified: data.LastModified,
            MetaData: extractMetadata(resHeaders),
            VersionId:getVersionId(resHeaders),
            SourceVersionId:getSourceVersionId(resHeaders),
            Etag:sanitizeETag(resHeaders.etag),
            Size: +resHeaders['content-length']
          }

          return  cb(null, copyObjResponse)
        })
    })
  }

  // Backward compatibility for Copy Object API.
  copyObject(...allArgs) {
    if (allArgs[0] instanceof CopySourceOptions && allArgs[1] instanceof CopyDestinationOptions) {
      return this.copyObjectV2(...arguments)
    }
    return this.copyObjectV1(...arguments)
  }

  // list a batch of objects
  listObjectsQuery(bucketName, prefix, marker, listQueryOpts={}) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isString(prefix)) {
      throw new TypeError('prefix should be of type "string"')
    }
    if (!isString(marker)) {
      throw new TypeError('marker should be of type "string"')
    }
    let{
      Delimiter,
      MaxKeys,
      IncludeVersion,
    } = listQueryOpts

    if (!isObject(listQueryOpts)) {
      throw new TypeError('listQueryOpts should be of type "object"')
    }

    if (!isString(Delimiter)) {
      throw new TypeError('Delimiter should be of type "string"')
    }
    if (!isNumber(MaxKeys)) {
      throw new TypeError('MaxKeys should be of type "number"')
    }

    const queries = []
    // escape every value in query string, except maxKeys
    queries.push(`prefix=${uriEscape(prefix)}`)
    queries.push(`delimiter=${uriEscape(Delimiter)}`)
    queries.push(`encoding-type=url`)

    if (IncludeVersion) {
      queries.push(`versions`)
    }

    if (marker) {
      marker = uriEscape(marker)
      if (IncludeVersion) {
        queries.push(`key-marker=${marker}`)
      } else {
        queries.push(`marker=${marker}`)
      }
    }

    // no need to escape maxKeys
    if (MaxKeys) {
      if (MaxKeys >= 1000) {
        MaxKeys = 1000
      }
      queries.push(`max-keys=${MaxKeys}`)
    }
    queries.sort()
    var query = ''
    if (queries.length > 0) {
      query = `${queries.join('&')}`
    }

    var method = 'GET'
    var transformer = transformers.getListObjectsTransformer()
    this.makeRequest({method, bucketName, query}, '', [200], '', true, (e, response) => {
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
  // * `listOpts _object_: query params to list object with below keys
  // *    listOpts.MaxKeys _int_ maximum number of keys to return
  // *    listOpts.IncludeVersion  _bool_ true|false to include versions.
  // __Return Value__
  // * `stream` _Stream_: stream emitting the objects in the bucket, the object is of the format:
  // * `obj.name` _string_: name of the object
  // * `obj.prefix` _string_: name of the object prefix
  // * `obj.size` _number_: size of the object
  // * `obj.etag` _string_: etag of the object
  // * `obj.lastModified` _Date_: modified time stamp
  // * `obj.isDeleteMarker` _boolean_: true if it is a delete marker
  // * `obj.versionId` _string_: versionId of the object
  listObjects(bucketName, prefix, recursive, listOpts={}) {
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
    if (!isObject(listOpts)) {
      throw new TypeError('listOpts should be of type "object"')
    }
    var marker = ''
    const listQueryOpts={
      Delimiter:recursive ? '' : '/', // if recursive is false set delimiter to '/'
      MaxKeys: 1000,
      IncludeVersion:listOpts.IncludeVersion,
    }
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
      this.listObjectsQuery(bucketName, prefix, marker, listQueryOpts)
        .on('error', e => readStream.emit('error', e))
        .on('data', result => {
          if (result.isTruncated) {
            marker = result.nextMarker || result.versionIdMarker
          } else {
            ended = true
          }
          objects = result.objects
          readStream._read()
        })
    }
    return readStream
  }

  // listObjectsV2Query - (List Objects V2) - List some or all (up to 1000) of the objects in a bucket.
  //
  // You can use the request parameters as selection criteria to return a subset of the objects in a bucket.
  // request parameters :-
  // * `bucketName` _string_: name of the bucket
  // * `prefix` _string_: Limits the response to keys that begin with the specified prefix.
  // * `continuation-token` _string_: Used to continue iterating over a set of objects.
  // * `delimiter` _string_: A delimiter is a character you use to group keys.
  // * `max-keys` _number_: Sets the maximum number of keys returned in the response body.
  // * `start-after` _string_: Specifies the key to start after when listing objects in a bucket.
  listObjectsV2Query(bucketName, prefix, continuationToken, delimiter, maxKeys, startAfter) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isString(prefix)) {
      throw new TypeError('prefix should be of type "string"')
    }
    if (!isString(continuationToken)) {
      throw new TypeError('continuationToken should be of type "string"')
    }
    if (!isString(delimiter)) {
      throw new TypeError('delimiter should be of type "string"')
    }
    if (!isNumber(maxKeys)) {
      throw new TypeError('maxKeys should be of type "number"')
    }
    if (!isString(startAfter)) {
      throw new TypeError('startAfter should be of type "string"')
    }
    var queries = []

    // Call for listing objects v2 API
    queries.push(`list-type=2`)
    queries.push(`encoding-type=url`)

    // escape every value in query string, except maxKeys
    queries.push(`prefix=${uriEscape(prefix)}`)
    queries.push(`delimiter=${uriEscape(delimiter)}`)

    if (continuationToken) {
      continuationToken = uriEscape(continuationToken)
      queries.push(`continuation-token=${continuationToken}`)
    }
    // Set start-after
    if (startAfter) {
      startAfter = uriEscape(startAfter)
      queries.push(`start-after=${startAfter}`)
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
    var transformer = transformers.getListObjectsV2Transformer()
    this.makeRequest({method, bucketName, query}, '', [200], '', true, (e, response) => {
      if (e) return transformer.emit('error', e)
      pipesetup(response, transformer)
    })
    return transformer
  }

  // List the objects in the bucket using S3 ListObjects V2
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `prefix` _string_: the prefix of the objects that should be listed (optional, default `''`)
  // * `recursive` _bool_: `true` indicates recursive style listing and `false` indicates directory style listing delimited by '/'. (optional, default `false`)
  // * `startAfter` _string_: Specifies the key to start after when listing objects in a bucket. (optional, default `''`)
  //
  // __Return Value__
  // * `stream` _Stream_: stream emitting the objects in the bucket, the object is of the format:
  //   * `obj.name` _string_: name of the object
  //   * `obj.prefix` _string_: name of the object prefix
  //   * `obj.size` _number_: size of the object
  //   * `obj.etag` _string_: etag of the object
  //   * `obj.lastModified` _Date_: modified time stamp
  listObjectsV2(bucketName, prefix, recursive, startAfter) {
    if (prefix === undefined) prefix = ''
    if (recursive === undefined) recursive = false
    if (startAfter === undefined) startAfter = ''
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
    if (!isString(startAfter)) {
      throw new TypeError('startAfter should be of type "string"')
    }
    // if recursive is false set delimiter to '/'
    var delimiter = recursive ? '' : '/'
    var continuationToken = ''
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
      this.listObjectsV2Query(bucketName, prefix, continuationToken, delimiter, 1000, startAfter)
        .on('error', e => readStream.emit('error', e))
        .on('data', result => {
          if (result.isTruncated) {
            continuationToken = result.nextContinuationToken
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
  // * `statOpts`  _object_ : Version of the object in the form `{versionId:'my-uuid'}`. Default is `{}`. (optional).
  // * `callback(err, stat)` _function_: `err` is not `null` in case of error, `stat` contains the object information:
  //   * `stat.size` _number_: size of the object
  //   * `stat.etag` _string_: etag of the object
  //   * `stat.metaData` _string_: MetaData of the object
  //   * `stat.lastModified` _Date_: modified time stamp
  //   * `stat.versionId` _string_: version id of the object if available
  statObject(bucketName, objectName, statOpts={}, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    // backward compatibility
    if (isFunction(statOpts)) {
      cb = statOpts
      statOpts={}
    }

    if(!isObject(statOpts)){
      throw new errors.InvalidArgumentError('statOpts should be of type "object"')
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    var query = querystring.stringify(statOpts)
    var method = 'HEAD'
    this.makeRequest({method, bucketName, objectName, query},'' , [200], '', true, (e, response) => {
      if (e) return cb(e)

      // We drain the socket so that the connection gets closed. Note that this
      // is not expensive as the socket will not have any data.
      response.on('data', ()=>{})

      const result = {
        size: +response.headers['content-length'],
        metaData: extractMetadata(response.headers),
        lastModified: new Date(response.headers['last-modified']),
        versionId:getVersionId(response.headers),
        etag:sanitizeETag(response.headers.etag)
      }

      cb(null, result)
    })
  }

  // Remove the specified object.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `removeOpts` _object_: Version of the object in the form `{versionId:'my-uuid', governanceBypass:true|false}`. Default is `{}`. (optional)
  // * `callback(err)` _function_: callback function is called with non `null` value in case of error
  removeObject(bucketName, objectName, removeOpts={} , cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    // backward compatibility
    if (isFunction(removeOpts)) {
      cb = removeOpts
      removeOpts={}
    }

    if(!isObject(removeOpts)){
      throw new errors.InvalidArgumentError('removeOpts should be of type "object"')
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    const method = 'DELETE'
    const queryParams = {}

    if(removeOpts.versionId){
      queryParams.versionId=`${removeOpts.versionId}`
    }
    const headers = {}
    if(removeOpts.governanceBypass){
      headers["X-Amz-Bypass-Governance-Retention"]=true
    }

    const query = querystring.stringify( queryParams )

    let requestOptions = {method, bucketName, objectName, headers}
    if(query){
      requestOptions['query']=query
    }

    this.makeRequest(requestOptions, '', [200, 204], '', false, cb)
  }

  // Remove all the objects residing in the objectsList.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectsList` _array_: array of objects of one of the following:
  // *         List of Object names as array of strings which are object keys:  ['objectname1','objectname2']
  // *         List of Object name and versionId as an object:  [{name:"objectname",versionId:"my-version-id"}]

  removeObjects(bucketName, objectsList, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isArray(objectsList)) {
      throw new errors.InvalidArgumentError('objectsList should be a list')
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    const maxEntries = 1000
    const query = 'delete'
    const method = 'POST'

    let result = objectsList.reduce((result, entry) => {
      result.list.push(entry)
      if (result.list.length === maxEntries) {
        result.listOfList.push(result.list)
        result.list = []
      }
      return result
    }, {listOfList: [], list:[]})

    if (result.list.length > 0) {
      result.listOfList.push(result.list)
    }

    const encoder = new TextEncoder()

    async.eachSeries(result.listOfList, (list, callback) => {
      var objects=[]
      list.forEach(function(value){
        if (isObject(value)) {
          objects.push({"Key": value.name,  "VersionId": value.versionId})
        } else {
          objects.push({"Key": value})
        }
      })
      let deleteObjects = {"Delete": {"Quiet": true, "Object": objects}}
      const builder = new xml2js.Builder({ headless: true })
      let payload = builder.buildObject(deleteObjects)
      payload = encoder.encode(payload)
      const headers = {}

      headers['Content-MD5'] = toMd5(payload)

      this.makeRequest({ method, bucketName, query, headers}, payload, [200], '', false, (e) => {
        if (e) return callback(e)
        callback(null)
      })
    }, cb)
  }


  // Get the policy on a bucket or an object prefix.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `callback(err, policy)` _function_: callback function
  getBucketPolicy(bucketName, cb) {
    // Validate arguments.
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`)
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    let method = 'GET'
    let query = 'policy'
    this.makeRequest({method, bucketName, query}, '', [200], '', true, (e, response) => {
      if (e) return cb(e)

      let policy = Buffer.from('')
      pipesetup(response, transformers.getConcater())
        .on('data', data => policy = data)
        .on('error', cb)
        .on('end', () => {
          cb(null, policy.toString())
        })
    })
  }

  // Set the policy on a bucket or an object prefix.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `bucketPolicy` _string_: bucket policy (JSON stringify'ed)
  // * `callback(err)` _function_: callback function
  setBucketPolicy(bucketName, policy, cb) {
    // Validate arguments.
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`)
    }
    if (!isString(policy)) {
      throw new errors.InvalidBucketPolicyError(`Invalid bucket policy: ${policy} - must be "string"`)
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    let method = 'DELETE'
    let query = 'policy'

    if (policy) {
      method = 'PUT'
    }

    this.makeRequest({method, bucketName, query}, policy, [204], '', false, cb)
  }

  // Generate a generic presigned URL which can be
  // used for HTTP methods GET, PUT, HEAD and DELETE
  //
  // __Arguments__
  // * `method` _string_: name of the HTTP method
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `expiry` _number_: expiry in seconds (optional, default 7 days)
  // * `reqParams` _object_: request parameters (optional) e.g {versionId:"10fa9946-3f64-4137-a58f-888065c0732e"}
  // * `requestDate` _Date_: A date object, the url will be issued at (optional)
  presignedUrl(method, bucketName, objectName, expires, reqParams, requestDate, cb) {
    if (this.anonymous) {
      throw new errors.AnonymousRequestError('Presigned ' + method + ' url cannot be generated for anonymous requests')
    }
    if (isFunction(requestDate)) {
      cb = requestDate
      requestDate = new Date()
    }
    if (isFunction(reqParams)) {
      cb = reqParams
      reqParams = {}
      requestDate = new Date()
    }
    if (isFunction(expires)) {
      cb = expires
      reqParams = {}
      expires = 24 * 60 * 60 * 7 // 7 days in seconds
      requestDate = new Date()
    }
    if (!isNumber(expires)) {
      throw new TypeError('expires should be of type "number"')
    }
    if (!isObject(reqParams)) {
      throw new TypeError('reqParams should be of type "object"')
    }
    if (!isValidDate(requestDate)) {
      throw new TypeError('requestDate should be of type "Date" and valid')
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    var query = querystring.stringify(reqParams)
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

      this.checkAndRefreshCreds()
      try {
        url = presignSignatureV4(reqOptions, this.accessKey, this.secretKey,
                                 this.sessionToken, region, requestDate, expires)
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
  // * `respHeaders` _object_: response headers to override or request params for query (optional) e.g {versionId:"10fa9946-3f64-4137-a58f-888065c0732e"}
  // * `requestDate` _Date_: A date object, the url will be issued at (optional)
  presignedGetObject(bucketName, objectName, expires, respHeaders, requestDate, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }

    if (isFunction(respHeaders)) {
      cb = respHeaders
      respHeaders = {}
      requestDate = new Date()
    }

    var validRespHeaders = ['response-content-type', 'response-content-language', 'response-expires', 'response-cache-control',
                            'response-content-disposition', 'response-content-encoding']
    validRespHeaders.forEach(header => {
      if  (respHeaders !== undefined && respHeaders[header] !== undefined && !isString(respHeaders[header])) {
        throw new TypeError(`response header ${header} should be of type "string"`)
      }
    })
    return this.presignedUrl('GET', bucketName, objectName, expires, respHeaders, requestDate, cb)
  }

  // Generate a presigned URL for PUT. Using this URL, the browser can upload to S3 only with the specified object name.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `expiry` _number_: expiry in seconds (optional, default 7 days)
  presignedPutObject(bucketName, objectName, expires, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ${bucketName}')
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError('Invalid object name: ${objectName}')
    }
    return this.presignedUrl('PUT', bucketName, objectName, expires, cb)
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
      var date = new Date()
      var dateStr = makeDateLong(date)

      this.checkAndRefreshCreds()

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

      if (this.sessionToken) {
        postPolicy.policy.conditions.push(['eq', '$x-amz-security-token', this.sessionToken])
        postPolicy.formData['x-amz-security-token'] = this.sessionToken
      }

      var policyBase64 = Buffer.from(JSON.stringify(postPolicy.policy)).toString('base64')

      postPolicy.formData.policy = policyBase64

      var signature = postPresignSignatureV4(region, date, this.secretKey, policyBase64)

      postPolicy.formData['x-amz-signature'] = signature
      var opts = {}
      opts.region = region
      opts.bucketName = postPolicy.formData.bucket
      var reqOptions = this.getRequestOptions(opts)
      var portStr = (this.port == 80 || this.port === 443) ? '' : `:${this.port.toString()}`
      var urlStr = `${reqOptions.protocol}//${reqOptions.host}${portStr}${reqOptions.path}`
      cb(null, {postURL: urlStr,formData: postPolicy.formData})
    })
  }

  // Calls implemented below are related to multipart.

  // Initiate a new multipart upload.
  initiateNewMultipartUpload(bucketName, objectName, metaData, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isObject(metaData)) {
      throw new errors.InvalidObjectNameError('contentType should be of type "object"')
    }
    var method = 'POST'
    let headers = Object.assign({}, metaData)
    var query = 'uploads'
    this.makeRequest({method, bucketName, objectName, query, headers}, '', [200], '', true, (e, response) => {
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
    var query = `uploadId=${uriEscape(uploadId)}`

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

    this.makeRequest({method, bucketName, objectName, query}, payload, [200], '', true, (e, response) => {
      if (e) return cb(e)
      var transformer = transformers.getCompleteMultipartTransformer()
      pipesetup(response, transformer)
        .on('error', e => cb(e))
        .on('data', result => {
          if (result.errCode) {
            // Multipart Complete API returns an error XML after a 200 http status
            cb(new errors.S3Error(result.errMessage))
          } else {
            const completeMultipartResult = {
              etag: result.etag,
              versionId:getVersionId(response.headers)
            }
            cb(null, completeMultipartResult)
          }
        })
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
    query += `uploadId=${uriEscape(uploadId)}`

    var method = 'GET'
    this.makeRequest({method, bucketName, objectName, query}, '', [200], '', true, (e, response) => {
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
    queries.push(`prefix=${uriEscape(prefix)}`)
    queries.push(`delimiter=${uriEscape(delimiter)}`)

    if (keyMarker) {
      keyMarker = uriEscape(keyMarker)
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
      query = `${queries.join('&')}`
    }
    var method = 'GET'
    var transformer = transformers.getListMultipartTransformer()
    this.makeRequest({method, bucketName, query}, '', [200], '', true, (e, response) => {
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

  // Returns a function that can be used for uploading objects.
  // If multipart === true, it returns function that is used to upload
  // a part of the multipart.
  getUploader(bucketName, objectName, metaData, multipart) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isBoolean(multipart)) {
      throw new TypeError('multipart should be of type "boolean"')
    }
    if (!isObject(metaData)) {
      throw new TypeError('metadata should be of type "object"')
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
      var query = `partNumber=${partNumber}&uploadId=${uriEscape(uploadId)}`
      upload(query, ...rest)
    }
    var upload = (query, stream, length, sha256sum, md5sum, cb) => {
      var method = 'PUT'
      let headers = {'Content-Length': length}

      if (!multipart) {
        headers = Object.assign({}, metaData, headers)
      }

      if (!this.enableSHA256) headers['Content-MD5'] = md5sum
      this.makeRequestStream({method, bucketName, objectName, query, headers},
                             stream, sha256sum, [200], '', true, (e, response) => {
                               if (e) return cb(e)
                               const result = {
                                 etag: sanitizeETag(response.headers.etag),
                                 versionId:getVersionId(response.headers)
                               }
                               // Ignore the 'data' event so that the stream closes. (nodejs stream requirement)
                               response.on('data', () => {})
                               cb(null, result)
                             })
    }
    if (multipart) {
      return multipartUploader
    }
    return simpleUploader
  }

  // Remove all the notification configurations in the S3 provider
  setBucketNotification(bucketName, config, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isObject(config)) {
      throw new TypeError('notification config should be of type "Object"')
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    var method = 'PUT'
    var query = 'notification'
    var builder = new xml2js.Builder({rootName:'NotificationConfiguration', renderOpts:{'pretty':false}, headless:true})
    var payload = builder.buildObject(config)
    this.makeRequest({method, bucketName, query}, payload, [200], '', false, cb)
  }

  removeAllBucketNotification(bucketName, cb) {
    this.setBucketNotification(bucketName, new NotificationConfig(), cb)
  }

  // Return the list of notification configurations stored
  // in the S3 provider
  getBucketNotification(bucketName, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    var method = 'GET'
    var query = 'notification'
    this.makeRequest({method, bucketName, query}, '', [200], '', true, (e, response) => {
      if (e) return cb(e)
      var transformer = transformers.getBucketNotificationTransformer()
      var bucketNotification
      pipesetup(response, transformer)
        .on('data', result => bucketNotification = result)
        .on('error', e => cb(e))
        .on('end', () => cb(null, bucketNotification))
    })
  }

  // Listens for bucket notifications. Returns an EventEmitter.
  listenBucketNotification(bucketName, prefix, suffix, events) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`)
    }
    if (!isString(prefix)) {
      throw new TypeError('prefix must be of type string')
    }
    if (!isString(suffix)) {
      throw new TypeError('suffix must be of type string')
    }
    if (!isArray(events)) {
      throw new TypeError('events must be of type Array')
    }
    let listener = new NotificationPoller(this, bucketName, prefix, suffix, events)
    listener.start()

    return listener
  }

  getBucketVersioning(bucketName,cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isFunction(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"')
    }
    var method = 'GET'
    var query = "versioning"

    this.makeRequest({method, bucketName, query}, '', [200], '', true, (e, response) => {
      if (e) return cb(e)

      let versionConfig = Buffer.from('')
      pipesetup(response, transformers.bucketVersioningTransformer())
        .on('data', data => {
          versionConfig = data
        })
        .on('error', cb)
        .on('end', () => {
          cb(null, versionConfig)
        })
    })
  }

  setBucketVersioning(bucketName,versionConfig, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if(!Object.keys(versionConfig).length){
      throw new errors.InvalidArgumentError('versionConfig should be of type "object"')
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    var method = 'PUT'
    var query = "versioning"
    var builder = new xml2js.Builder({rootName:'VersioningConfiguration', renderOpts:{'pretty':false}, headless:true})
    var payload = builder.buildObject(versionConfig)

    this.makeRequest({method, bucketName, query}, payload, [200], '', false, cb)
  }

  /** To set Tags on a bucket or object based on the params
     *  __Arguments__
     * taggingParams _object_ Which contains the following properties
     *  bucketName _string_,
     *  objectName _string_ (Optional),
     *  tags _object_ of the form {'<tag-key-1>':'<tag-value-1>','<tag-key-2>':'<tag-value-2>'}
     *  putOpts _object_ (Optional) e.g {versionId:"my-object-version-id"},
     *  cb(error)` _function_ - callback function with `err` as the error argument. `err` is null if the operation is successful.
     */
  setTagging(taggingParams){

    const { bucketName, objectName, tags, putOpts={}, cb} = taggingParams
    const method = 'PUT'
    let query ="tagging"

    if(putOpts && putOpts.versionId){
      query =`${query}&versionId=${putOpts.versionId}`
    }
    const tagsList=[]
    for (const [key, value] of Object.entries(tags)) {
      tagsList.push( { Key: key, Value: value} )
    }
    const taggingConfig = {
      Tagging: {
        TagSet: {
          Tag: tagsList
        }
      }
    }
    const encoder = new TextEncoder()
    const headers ={}
    const builder = new xml2js.Builder({ headless:true,renderOpts:{'pretty':false},})
    let payload = builder.buildObject(taggingConfig)
    payload = encoder.encode(payload)
    headers['Content-MD5'] = toMd5(payload)
    const requestOptions = { method, bucketName, query, headers }

    if(objectName){
      requestOptions['objectName']=objectName
    }
    headers['Content-MD5'] = toMd5(payload)

    this.makeRequest(requestOptions, payload, [200], '', false, cb)

  }

  /** Set Tags on a Bucket
   * __Arguments__
   * bucketName _string_
   * tags _object_ of the form {'<tag-key-1>':'<tag-value-1>','<tag-key-2>':'<tag-value-2>'}
   * `cb(error)` _function_ - callback function with `err` as the error argument. `err` is null if the operation is successful.
   */
  setBucketTagging(bucketName,tags,cb){
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if(!isObject(tags)){
      throw new errors.InvalidArgumentError('tags should be of type "object"')
    }
    if(Object.keys(tags).length > 10){
      throw new errors.InvalidArgumentError('maximum tags allowed is 10"')
    }
    if (!isFunction(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"')
    }

    return this.setTagging({bucketName, tags, cb})
  }

  /** Set Tags on an Object
   * __Arguments__
   * bucketName _string_
   * objectName _string_
   *  * tags _object_ of the form {'<tag-key-1>':'<tag-value-1>','<tag-key-2>':'<tag-value-2>'}
   *  putOpts _object_ (Optional) e.g {versionId:"my-object-version-id"},
   * `cb(error)` _function_ - callback function with `err` as the error argument. `err` is null if the operation is successful.
   */
  setObjectTagging(bucketName, objectName, tags, putOpts={}, cb){
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidBucketNameError('Invalid object name: ' + objectName)
    }

    if(isFunction(putOpts)){
      cb=putOpts
      putOpts={}
    }

    if(!isObject(tags)){
      throw new errors.InvalidArgumentError('tags should be of type "object"')
    }
    if(Object.keys(tags).length > 10){
      throw new errors.InvalidArgumentError('Maximum tags allowed is 10"')
    }

    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    return this.setTagging({bucketName, objectName, tags, putOpts, cb})
  }

  /** Remove Tags on an Bucket/Object based on params
   * __Arguments__
   * bucketName _string_
   * objectName _string_ (optional)
   * removeOpts _object_ (Optional) e.g {versionId:"my-object-version-id"},
   * `cb(error)` _function_ - callback function with `err` as the error argument. `err` is null if the operation is successful.
   */
  removeTagging({bucketName, objectName, removeOpts, cb}){
    const method = 'DELETE'
    let query ="tagging"

    if (removeOpts && Object.keys(removeOpts).length && removeOpts.versionId) {
      query =`${query}&versionId=${removeOpts.versionId}`
    }
    const requestOptions = { method, bucketName, objectName, query }

    if (objectName) {
      requestOptions['objectName'] = objectName
    }
    this.makeRequest(requestOptions, '', [200, 204], '', true, cb)
  }

  /** Remove Tags associated with a bucket
   *  __Arguments__
   * bucketName _string_
   * `cb(error)` _function_ - callback function with `err` as the error argument. `err` is null if the operation is successful.
   */
  removeBucketTagging(bucketName, cb){
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    return this.removeTagging({bucketName, cb})
  }

  /** Remove tags associated with an object
   * __Arguments__
   * bucketName _string_
   * objectName _string_
   * removeOpts _object_ (Optional) e.g. {VersionID:"my-object-version-id"}
   * `cb(error)` _function_ - callback function with `err` as the error argument. `err` is null if the operation is successful.
   */
  removeObjectTagging(bucketName, objectName, removeOpts, cb){

    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidBucketNameError('Invalid object name: ' + objectName)
    }
    if(isFunction(removeOpts)){
      cb=removeOpts
      removeOpts={}
    }
    if(removeOpts && Object.keys(removeOpts).length && !isObject(removeOpts)){
      throw new errors.InvalidArgumentError('removeOpts should be of type "object"')
    }

    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    return this.removeTagging({bucketName, objectName, removeOpts, cb})
  }

  /** Get Tags associated with a Bucket
   *  __Arguments__
   * bucketName _string_
   * `cb(error, tags)` _function_ - callback function with `err` as the error argument. `err` is null if the operation is successful.
   */
  getBucketTagging(bucketName, cb){
    const method = 'GET'
    const query ="tagging"
    const requestOptions = { method, bucketName, query }

    this.makeRequest(requestOptions, '', [200], '', true, (e, response) => {
      var transformer = transformers.getTagsTransformer()
      if (e) return cb(e)
      let tagsList
      pipesetup(response, transformer)
        .on('data', result => tagsList = result)
        .on('error', e => cb(e))
        .on('end', () => cb(null, tagsList))
    })
  }

  /** Get the tags associated with a bucket OR an object
   * bucketName _string_
   * objectName _string_ (Optional)
   * getOpts _object_ (Optional) e.g {versionId:"my-object-version-id"}
   * `cb(error, tags)` _function_ - callback function with `err` as the error argument. `err` is null if the operation is successful.
   */
  getObjectTagging(bucketName, objectName, getOpts={}, cb=()=>false){
    const method = 'GET'
    let query ="tagging"

    if(!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if(!isValidObjectName(objectName)) {
      throw new errors.InvalidBucketNameError('Invalid object name: ' + objectName)
    }
    if(isFunction(getOpts)){
      cb=getOpts
      getOpts={}
    }
    if(!isObject(getOpts)){
      throw new errors.InvalidArgumentError('getOpts should be of type "object"')
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    if(getOpts && getOpts.versionId){
      query =`${query}&versionId=${getOpts.versionId}`
    }
    const requestOptions = { method, bucketName, query }
    if(objectName){
      requestOptions['objectName']=objectName
    }

    this.makeRequest(requestOptions, '', [200], '', true, (e, response) => {
      const transformer = transformers.getTagsTransformer()
      if (e) return cb(e)
      let tagsList
      pipesetup(response, transformer)
        .on('data', result => tagsList = result)
        .on('error', e => cb(e))
        .on('end', () => cb(null, tagsList))
    })

  }

  /** Put lifecycle configuration on a bucket.
  /** Apply lifecycle configuration on a bucket.
   * bucketName _string_
   * policyConfig _object_ a valid policy configuration object.
   * `cb(error)` _function_ - callback function with `err` as the error argument. `err` is null if the operation is successful.
   */
  applyBucketLifecycle(bucketName, policyConfig, cb){
    const method = 'PUT'
    const query="lifecycle"

    const encoder = new TextEncoder()
    const headers ={}
    const builder = new xml2js.Builder({ rootName:'LifecycleConfiguration', headless:true, renderOpts:{'pretty':false},})
    let payload = builder.buildObject(policyConfig)
    payload = encoder.encode(payload)
    const requestOptions = { method, bucketName, query, headers }
    headers['Content-MD5'] = toMd5(payload)

    this.makeRequest(requestOptions, payload, [200], '', false, cb)
  }

  /** Remove lifecycle configuration of a bucket.
   * bucketName _string_
   * `cb(error)` _function_ - callback function with `err` as the error argument. `err` is null if the operation is successful.
   */
  removeBucketLifecycle(bucketName, cb){
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    const method = 'DELETE'
    const query="lifecycle"
    this.makeRequest({method, bucketName, query}, '', [204], '', false, cb)
  }

  /** Set/Override lifecycle configuration on a bucket. if the configuration is empty, it removes the configuration.
   * bucketName _string_
   * lifeCycleConfig _object_ one of the following values: (null or '') to remove the lifecycle configuration. or a valid lifecycle configuration
   * `cb(error)` _function_ - callback function with `err` as the error argument. `err` is null if the operation is successful.
   */
  setBucketLifecycle(bucketName, lifeCycleConfig=null, cb){
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if(_.isEmpty(lifeCycleConfig)){
      this.removeBucketLifecycle(bucketName, cb)
    }else {
      this.applyBucketLifecycle(bucketName, lifeCycleConfig, cb)
    }
  }

  /** Get lifecycle configuration on a bucket.
   * bucketName _string_
   * `cb(config)` _function_ - callback function with lifecycle configuration as the error argument.
   */
  getBucketLifecycle(bucketName, cb){
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    const method = 'GET'
    const query ="lifecycle"
    const requestOptions = { method, bucketName, query }

    this.makeRequest(requestOptions, '', [200], '', true, (e, response) => {
      const transformer = transformers.lifecycleTransformer()
      if (e) return cb(e)
      let lifecycleConfig
      pipesetup(response, transformer)
        .on('data', result => lifecycleConfig = result)
        .on('error', e => cb(e))
        .on('end', () => cb(null, lifecycleConfig))
    })

  }

  setObjectLockConfig(bucketName, lockConfigOpts={}, cb) {

    const retentionModes = [RETENTION_MODES.COMPLIANCE, RETENTION_MODES.GOVERNANCE]
    const validUnits = [RETENTION_VALIDITY_UNITS.DAYS, RETENTION_VALIDITY_UNITS.YEARS]

    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }

    if (lockConfigOpts.mode && !retentionModes.includes(lockConfigOpts.mode)) {
      throw new TypeError(`lockConfigOpts.mode should be one of ${retentionModes}`)
    }
    if (lockConfigOpts.unit && !validUnits.includes(lockConfigOpts.unit)){
      throw new TypeError(`lockConfigOpts.unit should be one of ${validUnits}`)
    }
    if (lockConfigOpts.validity && !isNumber(lockConfigOpts.validity)){
      throw new TypeError(`lockConfigOpts.validity should be a number`)
    }

    const method = 'PUT'
    const query = "object-lock"

    let config={
      ObjectLockEnabled:"Enabled"
    }
    const configKeys = Object.keys(lockConfigOpts)
    // Check if keys are present and all keys are present.
    if(configKeys.length > 0){
      if(_.difference(configKeys, ['unit','mode','validity']).length !== 0){
        throw new TypeError(`lockConfigOpts.mode,lockConfigOpts.unit,lockConfigOpts.validity all the properties should be specified.`)
      } else {
        config.Rule={
          DefaultRetention:{}
        }
        if (lockConfigOpts.mode) {
          config.Rule.DefaultRetention.Mode = lockConfigOpts.mode
        }
        if (lockConfigOpts.unit === RETENTION_VALIDITY_UNITS.DAYS) {
          config.Rule.DefaultRetention.Days = lockConfigOpts.validity
        } else if (lockConfigOpts.unit === RETENTION_VALIDITY_UNITS.YEARS) {
          config.Rule.DefaultRetention.Years = lockConfigOpts.validity
        }
      }
    }

    const builder = new xml2js.Builder({rootName:'ObjectLockConfiguration', renderOpts:{'pretty':false}, headless:true})
    const payload = builder.buildObject(config)

    const headers = {}
    headers['Content-MD5'] =toMd5(payload)

    this.makeRequest({method, bucketName, query, headers}, payload, [200], '', false, cb)
  }

  getObjectLockConfig(bucketName, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isFunction(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"')
    }
    const method = 'GET'
    const query = "object-lock"

    this.makeRequest({method, bucketName, query}, '', [200], '', true, (e, response) => {
      if (e) return cb(e)

      let objectLockConfig = Buffer.from('')
      pipesetup(response, transformers.objectLockTransformer())
        .on('data', data => {
          objectLockConfig = data
        })
        .on('error', cb)
        .on('end', () => {
          cb(null, objectLockConfig)
        })
    })
  }

  putObjectRetention(bucketName, objectName, retentionOpts={}, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isObject(retentionOpts)) {
      throw new errors.InvalidArgumentError('retentionOpts should be of type "object"')
    } else {
      if (retentionOpts.governanceBypass && !isBoolean(retentionOpts.governanceBypass)) {
        throw new errors.InvalidArgumentError('Invalid value for governanceBypass',retentionOpts.governanceBypass)
      }
      if (retentionOpts.mode && ![RETENTION_MODES.COMPLIANCE,RETENTION_MODES.GOVERNANCE].includes((retentionOpts.mode))) {
        throw new errors.InvalidArgumentError('Invalid object retention mode ', retentionOpts.mode)
      }
      if (retentionOpts.retainUntilDate && !isString(retentionOpts.retainUntilDate)) {
        throw new errors.InvalidArgumentError('Invalid value for retainUntilDate',retentionOpts.retainUntilDate)
      }
      if (retentionOpts.versionId && !isString(retentionOpts.versionId)) {
        throw new errors.InvalidArgumentError('Invalid value for versionId',retentionOpts.versionId)
      }
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    const method = 'PUT'
    let query = "retention"

    const headers = {}
    if(retentionOpts.governanceBypass){
      headers["X-Amz-Bypass-Governance-Retention"]=true
    }

    const builder = new xml2js.Builder({rootName:'Retention', renderOpts:{'pretty':false}, headless:true})
    const params ={}

    if(retentionOpts.mode){
      params.Mode =retentionOpts.mode
    }
    if(retentionOpts.retainUntilDate){
      params.RetainUntilDate =retentionOpts.retainUntilDate
    }
    if(retentionOpts.versionId){
      query += `&versionId=${retentionOpts.versionId}`
    }

    let payload = builder.buildObject(params)

    headers['Content-MD5'] = toMd5(payload)
    this.makeRequest({method, bucketName, objectName, query, headers}, payload, [200, 204], '', false, cb)
  }

  getObjectRetention(bucketName ,objectName, getOpts, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if(!isObject(getOpts)){
      throw new errors.InvalidArgumentError('callback should be of type "object"')
    }else if(getOpts.versionId && !isString(getOpts.versionId)){
      throw new errors.InvalidArgumentError('VersionID should be of type "string"')
    }
    if (cb && !isFunction(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"')
    }
    const method = 'GET'
    let query = "retention"
    if(getOpts.versionId){
      query += `&versionId=${getOpts.versionId}`
    }

    this.makeRequest({method, bucketName,objectName, query}, '', [200], '', true, (e, response) => {
      if (e) return cb(e)

      let retentionConfig = Buffer.from('')
      pipesetup(response, transformers.objectRetentionTransformer())
        .on('data', data => {
          retentionConfig = data
        })
        .on('error', cb)
        .on('end', () => {
          cb(null, retentionConfig)
        })
    })
  }


  setBucketEncryption(bucketName, encryptionConfig, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }

    if(isFunction(encryptionConfig)){
      cb= encryptionConfig
      encryptionConfig = null
    }

    if(!_.isEmpty(encryptionConfig) && encryptionConfig.Rule.length >1){
      throw new errors.InvalidArgumentError('Invalid Rule length. Only one rule is allowed.: ' + encryptionConfig.Rule)
    }
    if (cb && !isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    let encryptionObj =encryptionConfig
    if(_.isEmpty(encryptionConfig)) {
      encryptionObj={
      // Default MinIO Server Supported Rule
        Rule:[
          {
            ApplyServerSideEncryptionByDefault: {
              SSEAlgorithm:"AES256"
            }
          }
        ]

      }}

    let method = 'PUT'
    let query = "encryption"
    let builder = new xml2js.Builder({rootName:'ServerSideEncryptionConfiguration', renderOpts:{'pretty':false}, headless:true})
    let payload = builder.buildObject(encryptionObj)

    const headers = {}
    headers['Content-MD5'] =toMd5(payload)

    this.makeRequest({method, bucketName, query,headers}, payload, [200], '', false, cb)
  }

  getBucketEncryption(bucketName, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isFunction(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"')
    }
    const method = 'GET'
    const query = "encryption"

    this.makeRequest({method, bucketName, query}, '', [200], '', true, (e, response) => {
      if (e) return cb(e)

      let bucketEncConfig = Buffer.from('')
      pipesetup(response, transformers.bucketEncryptionTransformer())
        .on('data', data => {
          bucketEncConfig = data
        })
        .on('error', cb)
        .on('end', () => {
          cb(null, bucketEncConfig)
        })
    })
  }
  removeBucketEncryption(bucketName, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isFunction(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"')
    }
    const method = 'DELETE'
    const query = "encryption"

    this.makeRequest({method, bucketName, query}, '', [204], '', false, cb)
  }


  setBucketReplication(bucketName, replicationConfig={}, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isObject(replicationConfig)) {
      throw new errors.InvalidArgumentError('replicationConfig should be of type "object"')
    } else {
      if (_.isEmpty(replicationConfig.role)) {
        throw new errors.InvalidArgumentError('Role cannot be empty')
      }else if (replicationConfig.role && !isString(replicationConfig.role)) {
        throw new errors.InvalidArgumentError('Invalid value for role', replicationConfig.role)
      }
      if (_.isEmpty(replicationConfig.rules)) {
        throw new errors.InvalidArgumentError('Minimum one replication rule must be specified')
      }
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    const method = 'PUT'
    let query = "replication"
    const headers = {}

    const replicationParamsConfig = {
      ReplicationConfiguration: {
        Role: replicationConfig.role,
        Rule: replicationConfig.rules
      }
    }

    const builder =  new xml2js.Builder({ renderOpts:{'pretty':false},headless: true })

    let payload = builder.buildObject(replicationParamsConfig)

    headers['Content-MD5'] =toMd5(payload)

    this.makeRequest({method, bucketName,  query, headers}, payload, [200], '', false, cb)
  }

  getBucketReplication(bucketName, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isFunction(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"')
    }
    const method = 'GET'
    const query = "replication"

    this.makeRequest({method, bucketName, query}, '', [200], '', true, (e, response) => {
      if (e) return cb(e)

      let replicationConfig = Buffer.from('')
      pipesetup(response, transformers.replicationConfigTransformer())
        .on('data', data => {
          replicationConfig = data
        })
        .on('error', cb)
        .on('end', () => {
          cb(null, replicationConfig)
        })
    })
  }

  removeBucketReplication(bucketName, cb){
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    const method = 'DELETE'
    const query="replication"
    this.makeRequest({method, bucketName, query}, '', [200, 204], '', false, cb)
  }


  getObjectLegalHold(bucketName, objectName, getOpts={}, cb){
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }

    if(isFunction(getOpts)){
      cb= getOpts
      getOpts = {}
    }

    if (!isObject(getOpts))  {
      throw new TypeError('getOpts should be of type "Object"')
    } else if(Object.keys(getOpts).length> 0 && getOpts.versionId && !isString((getOpts.versionId))){
      throw new TypeError('versionId should be of type string.:',getOpts.versionId )
    }


    if (!isFunction(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"')
    }

    const method = 'GET'
    let query = "legal-hold"

    if (getOpts.versionId){
      query +=`&versionId=${getOpts.versionId}`
    }

    this.makeRequest({method, bucketName, objectName, query}, '', [200], '', true, (e, response) => {
      if (e) return cb(e)

      let legalHoldConfig = Buffer.from('')
      pipesetup(response, transformers.objectLegalHoldTransformer())
        .on('data', data => {
          legalHoldConfig = data
        })
        .on('error', cb)
        .on('end', () => {
          cb(null, legalHoldConfig)
        })
    })

  }

  setObjectLegalHold(bucketName, objectName, setOpts={}, cb){
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }

    const defaultOpts = {
      status:LEGAL_HOLD_STATUS.ENABLED
    }
    if(isFunction(setOpts)){
      cb= setOpts
      setOpts =defaultOpts
    }

    if (!isObject(setOpts)) {
      throw new TypeError('setOpts should be of type "Object"')
    }else {

      if(![LEGAL_HOLD_STATUS.ENABLED, LEGAL_HOLD_STATUS.DISABLED].includes((setOpts.status))){
        throw new TypeError('Invalid status: '+setOpts.status )
      }
      if(setOpts.versionId && !setOpts.versionId.length){
        throw new TypeError('versionId should be of type string.:'+ setOpts.versionId )
      }
    }

    if (!isFunction(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"')
    }

    if( _.isEmpty(setOpts)){
      setOpts={
        defaultOpts
      }
    }

    const method = 'PUT'
    let query = "legal-hold"

    if (setOpts.versionId){
      query +=`&versionId=${setOpts.versionId}`
    }

    let config={
      Status: setOpts.status
    }

    const builder = new xml2js.Builder({rootName:'LegalHold', renderOpts:{'pretty':false}, headless:true})
    const payload = builder.buildObject(config)
    const headers = {}
    headers['Content-MD5'] = toMd5(payload)

    this.makeRequest({method, bucketName, objectName, query, headers}, payload, [200], '', false, cb)
  }
  async setCredentialsProvider(credentialsProvider){
    if(!(credentialsProvider instanceof CredentialProvider)){
      throw new Error("Unable to get  credentials. Expected instance of CredentialProvider")
    }
    this.credentialsProvider = credentialsProvider
    await this.checkAndRefreshCreds()
  }

  async checkAndRefreshCreds(){
    if(this.credentialsProvider ) {
      return  await this.fetchCredentials()
    }
  }

  async fetchCredentials(){
    if(this.credentialsProvider ){
      const credentialsConf = await this.credentialsProvider.getCredentials()
      if(credentialsConf) {
        this.accessKey = credentialsConf.getAccessKey()
        this.secretKey = credentialsConf.getSecretKey()
        this.sessionToken = credentialsConf.getSessionToken()
      }else{
        throw new Error("Unable to get  credentials. Expected instance of BaseCredentialsProvider")
      }
    }else{
      throw new Error("Unable to get  credentials. Expected instance of BaseCredentialsProvider")
    }
  }

  /**
     * Internal Method to abort a multipart upload request in case of any errors.
     * @param bucketName __string__ Bucket Name
     * @param objectName __string__ Object Name
     * @param uploadId __string__ id of a multipart upload to cancel during compose object sequence.
     * @param cb __function__ callback function
     */
  abortMultipartUpload(bucketName, objectName, uploadId, cb){
    const method = 'DELETE'
    let query =`uploadId=${uploadId}`

    const requestOptions = { method, bucketName, objectName:objectName, query }
    this.makeRequest(requestOptions, '', [204], '', false, cb)
  }

  /**
     * Internal method to upload a part during compose object.
     * @param partConfig __object__ contains the following.
     *    bucketName __string__
     *    objectName __string__
     *    uploadID __string__
     *    partNumber __number__
     *    headers __object__
     * @param cb called with null incase of error.
     */
  uploadPartCopy  (partConfig , cb) {
    const {
      bucketName, objectName, uploadID, partNumber , headers
    } = partConfig

    const method = 'PUT'
    let query =`uploadId=${uploadID}&partNumber=${partNumber}`
    const requestOptions = { method, bucketName, objectName:objectName, query, headers }
    return this.makeRequest(requestOptions, '', [200], '', true,(e, response) => {
      let partCopyResult = Buffer.from('')
      if (e) return cb(e)
      pipesetup(response, transformers.uploadPartTransformer())
        .on('data', data => {
          partCopyResult = data
        })
        .on('error', cb)
        .on('end', () => {
          let uploadPartCopyRes = {
            etag:sanitizeETag(partCopyResult.ETag),
            key:objectName,
            part:partNumber
          }

          cb(null, uploadPartCopyRes)
        })
    }
    )
  }

  composeObject (destObjConfig={}, sourceObjList=[], cb){
    const me = this // many async flows. so store the ref.
    const sourceFilesLength = sourceObjList.length

    if(!(isArray(sourceObjList ))){
      throw new errors.InvalidArgumentError('sourceConfig should an array of CopySourceOptions ')
    }
    if(!(destObjConfig instanceof CopyDestinationOptions )){
      throw new errors.InvalidArgumentError('destConfig should of type CopyDestinationOptions ')
    }

    if (sourceFilesLength < 1 || sourceFilesLength > PART_CONSTRAINTS.MAX_PARTS_COUNT) {
      throw new errors.InvalidArgumentError(`"There must be as least one and up to ${PART_CONSTRAINTS.MAX_PARTS_COUNT} source objects.`)
    }

    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    for(let i=0;i<sourceFilesLength;i++){
      if(!sourceObjList[i].validate()){
        return false
      }
    }

    if(!destObjConfig.validate()){
      return false
    }

    const getStatOptions = (srcConfig) =>{
      let statOpts = {}
      if(!_.isEmpty(srcConfig.VersionID)) {
        statOpts= {
          versionId: srcConfig.VersionID
        }
      }
      return statOpts
    }
    const srcObjectSizes=[]
    let totalSize=0
    let totalParts=0

    const sourceObjStats = sourceObjList.map( (srcItem) =>  me.statObject(srcItem.Bucket, srcItem.Object, getStatOptions(srcItem))  )

    return  Promise.all(sourceObjStats).then(srcObjectInfos =>{

      const validatedStats =  srcObjectInfos.map( (resItemStat, index)=>{

        const srcConfig = sourceObjList[index]

        let srcCopySize =resItemStat.size
        // Check if a segment is specified, and if so, is the
        // segment within object bounds?
        if (srcConfig.MatchRange) {
          // Since range is specified,
          //    0 <= src.srcStart <= src.srcEnd
          // so only invalid case to check is:
          const srcStart = srcConfig.Start
          const srcEnd = srcConfig.End
          if (srcEnd >= srcCopySize || srcStart < 0 ){
            throw new errors.InvalidArgumentError(`CopySrcOptions ${index} has invalid segment-to-copy [${srcStart}, ${srcEnd}] (size is ${srcCopySize})`)
          }
          srcCopySize = srcEnd - srcStart + 1
        }

        // Only the last source may be less than `absMinPartSize`
        if (srcCopySize < PART_CONSTRAINTS.ABS_MIN_PART_SIZE && index < sourceFilesLength-1) {
          throw new errors.InvalidArgumentError(`CopySrcOptions ${index} is too small (${srcCopySize}) and it is not the last part.`)
        }

        // Is data to copy too large?
        totalSize += srcCopySize
        if (totalSize > PART_CONSTRAINTS.MAX_MULTIPART_PUT_OBJECT_SIZE) {
          throw new errors.InvalidArgumentError(`Cannot compose an object of size ${totalSize} (> 5TiB)`)
        }

        // record source size
        srcObjectSizes[index] = srcCopySize

        // calculate parts needed for current source
        totalParts += partsRequired(srcCopySize)
        // Do we need more parts than we are allowed?
        if (totalParts > PART_CONSTRAINTS.MAX_PARTS_COUNT  ){
          throw new errors.InvalidArgumentError(`Your proposed compose object requires more than ${PART_CONSTRAINTS.MAX_PARTS_COUNT} parts`)
        }

        return resItemStat

      })

      if ((totalParts === 1 && totalSize <= PART_CONSTRAINTS.MAX_PART_SIZE) || (totalSize === 0)) {
        return this.copyObject( sourceObjList[0], destObjConfig, cb) // use copyObjectV2
      }

      // preserve etag to avoid modification of object while copying.
      for(let i=0;i<sourceFilesLength;i++){
        sourceObjList[i].MatchETag = validatedStats[i].etag
      }

      const splitPartSizeList = validatedStats.map((resItemStat, idx)=>{
        const calSize = calculateEvenSplits(srcObjectSizes[idx], sourceObjList[idx])
        return calSize

      })

      function getUploadPartConfigList (uploadId) {
        const uploadPartConfigList = []

        splitPartSizeList.forEach((splitSize, splitIndex) => {

          const {
            startIndex: startIdx,
            endIndex: endIdx,
            objInfo: objConfig,
          } = splitSize

          let partIndex = splitIndex + 1 // part index starts from 1.
          const totalUploads = Array.from(startIdx)

          const headers = sourceObjList[splitIndex].getHeaders()

          totalUploads.forEach((splitStart, upldCtrIdx) => {
            let splitEnd = endIdx[upldCtrIdx]

            const sourceObj = `${objConfig.Bucket}/${objConfig.Object}`
            headers['x-amz-copy-source'] = `${sourceObj}`
            headers["x-amz-copy-source-range"] = `bytes=${splitStart}-${splitEnd}`

            const uploadPartConfig = {
              bucketName: destObjConfig.Bucket,
              objectName: destObjConfig.Object,
              uploadID: uploadId,
              partNumber: partIndex,
              headers: headers,
              sourceObj: sourceObj
            }

            uploadPartConfigList.push(uploadPartConfig)
          })

        })

        return uploadPartConfigList
      }

      const performUploadParts = (uploadId) =>{

        const uploadList = getUploadPartConfigList(uploadId)

        async.map(uploadList, me.uploadPartCopy.bind(me), (err, res)=>{
          if(err){
            return this.abortMultipartUpload(destObjConfig.Bucket, destObjConfig.Object, uploadId, cb)
          }
          const partsDone = res.map((partCopy)=>({etag:partCopy.etag, part:partCopy.part}))
          return me.completeMultipartUpload(destObjConfig.Bucket, destObjConfig.Object, uploadId, partsDone, cb)
        })

      }

      const newUploadHeaders = destObjConfig.getHeaders()

      me.initiateNewMultipartUpload(destObjConfig.Bucket, destObjConfig.Object, newUploadHeaders, (err, uploadId)=>{
        if(err){
          return cb(err, null)
        }
        performUploadParts(uploadId)
      })

    })
      .catch((error)=>{
        cb(error, null)
      })

  }
  selectObjectContent(bucketName, objectName, selectOpts={}, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if(!_.isEmpty(selectOpts)){

      if (!isString(selectOpts.expression)) {
        throw new TypeError('sqlExpression should be of type "string"')
      }
      if(!_.isEmpty(selectOpts.inputSerialization)) {
        if (!isObject(selectOpts.inputSerialization)) {
          throw new TypeError('inputSerialization should be of type "object"')
        }
      }else{
        throw new TypeError('inputSerialization is required')
      }
      if(!_.isEmpty(selectOpts.outputSerialization)) {
        if (!isObject(selectOpts.outputSerialization)) {
          throw new TypeError('outputSerialization should be of type "object"')
        }
      }else{
        throw new TypeError('outputSerialization is required')
      }

    }else{
      throw new TypeError('valid select configuration is required')
    }

    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    const method = 'POST'
    let query = `select`
    query += "&select-type=2"

    const config = [
      {
        "Expression": selectOpts.expression
      },
      {
        "ExpressionType":selectOpts.expressionType || "SQL"
      },
      {
        "InputSerialization": [selectOpts.inputSerialization]
      },
      {
        "OutputSerialization": [selectOpts.outputSerialization]
      }
    ]

    // Optional
    if(selectOpts.requestProgress){
      config.push(
        {"RequestProgress":selectOpts.requestProgress}
      )
    }
    // Optional
    if(selectOpts.scanRange){
      config.push(
        {"ScanRange": selectOpts.scanRange}

      )
    }


    const builder = new xml2js.Builder({rootName:'SelectObjectContentRequest', renderOpts:{'pretty':false}, headless:true})
    const payload = builder.buildObject(config)


    this.makeRequest({method, bucketName, objectName, query}, payload, [200], '', true, (e, response) => {
      if (e) return cb(e)

      let selectResult
      pipesetup(response, transformers.selectObjectContentTransformer())
        .on('data', data => {
          selectResult = parseSelectObjectContentResponse(data)
        })
        .on('error', cb)
        .on('end', () => {
          cb(null, selectResult)
        })
    })
  }

  get extensions() {
    if(!this.clientExtensions)
    {
      this.clientExtensions = new extensions(this)
    }
    return this.clientExtensions
  }
}

// Promisify various public-facing APIs on the Client module.
Client.prototype.makeBucket = promisify(Client.prototype.makeBucket)
Client.prototype.listBuckets = promisify(Client.prototype.listBuckets)
Client.prototype.bucketExists = promisify(Client.prototype.bucketExists)
Client.prototype.removeBucket = promisify(Client.prototype.removeBucket)

Client.prototype.getObject = promisify(Client.prototype.getObject)
Client.prototype.getPartialObject = promisify(Client.prototype.getPartialObject)
Client.prototype.fGetObject = promisify(Client.prototype.fGetObject)
Client.prototype.putObject = promisify(Client.prototype.putObject)
Client.prototype.fPutObject = promisify(Client.prototype.fPutObject)
Client.prototype.copyObject = promisify(Client.prototype.copyObject)
Client.prototype.statObject = promisify(Client.prototype.statObject)
Client.prototype.removeObject = promisify(Client.prototype.removeObject)
Client.prototype.removeObjects = promisify(Client.prototype.removeObjects)

Client.prototype.presignedUrl = promisify(Client.prototype.presignedUrl)
Client.prototype.presignedGetObject = promisify(Client.prototype.presignedGetObject)
Client.prototype.presignedPutObject = promisify(Client.prototype.presignedPutObject)
Client.prototype.presignedPostPolicy = promisify(Client.prototype.presignedPostPolicy)
Client.prototype.getBucketNotification = promisify(Client.prototype.getBucketNotification)
Client.prototype.setBucketNotification = promisify(Client.prototype.setBucketNotification)
Client.prototype.removeAllBucketNotification = promisify(Client.prototype.removeAllBucketNotification)
Client.prototype.getBucketPolicy = promisify(Client.prototype.getBucketPolicy)
Client.prototype.setBucketPolicy = promisify(Client.prototype.setBucketPolicy)
Client.prototype.removeIncompleteUpload = promisify(Client.prototype.removeIncompleteUpload)
Client.prototype.getBucketVersioning = promisify(Client.prototype.getBucketVersioning)
Client.prototype.setBucketVersioning=promisify(Client.prototype.setBucketVersioning)
Client.prototype.setBucketTagging=promisify(Client.prototype.setBucketTagging)
Client.prototype.removeBucketTagging=promisify(Client.prototype.removeBucketTagging)
Client.prototype.getBucketTagging=promisify(Client.prototype.getBucketTagging)
Client.prototype.setObjectTagging=promisify(Client.prototype.setObjectTagging)
Client.prototype.removeObjectTagging=promisify(Client.prototype.removeObjectTagging)
Client.prototype.getObjectTagging=promisify(Client.prototype.getObjectTagging)
Client.prototype.setBucketLifecycle=promisify(Client.prototype.setBucketLifecycle)
Client.prototype.getBucketLifecycle=promisify(Client.prototype.getBucketLifecycle)
Client.prototype.removeBucketLifecycle=promisify(Client.prototype.removeBucketLifecycle)
Client.prototype.setObjectLockConfig=promisify(Client.prototype.setObjectLockConfig)
Client.prototype.getObjectLockConfig=promisify(Client.prototype.getObjectLockConfig)
Client.prototype.putObjectRetention =promisify(Client.prototype.putObjectRetention)
Client.prototype.getObjectRetention =promisify(Client.prototype.getObjectRetention)
Client.prototype.setBucketEncryption = promisify(Client.prototype.setBucketEncryption)
Client.prototype.getBucketEncryption = promisify(Client.prototype.getBucketEncryption)
Client.prototype.removeBucketEncryption = promisify(Client.prototype.removeBucketEncryption)
Client.prototype.setBucketReplication =promisify(Client.prototype.setBucketReplication)
Client.prototype.getBucketReplication =promisify(Client.prototype.getBucketReplication)
Client.prototype.removeBucketReplication=promisify(Client.prototype.removeBucketReplication)
Client.prototype.setObjectLegalHold=promisify(Client.prototype.setObjectLegalHold)
Client.prototype.getObjectLegalHold=promisify(Client.prototype.getObjectLegalHold)
Client.prototype.composeObject = promisify(Client.prototype.composeObject)
Client.prototype.selectObjectContent=promisify(Client.prototype.selectObjectContent)

export class CopyConditions {
  constructor() {
    this.modified = ""
    this.unmodified = ""
    this.matchETag = ""
    this.matchETagExcept = ""
  }

  setModified(date) {
    if (!(date instanceof Date))
      throw new TypeError('date must be of type Date')

    this.modified = date.toUTCString()
  }

  setUnmodified(date) {
    if (!(date instanceof Date))
      throw new TypeError('date must be of type Date')

    this.unmodified = date.toUTCString()
  }

  setMatchETag(etag) {
    this.matchETag = etag
  }

  setMatchETagExcept(etag) {
    this.matchETagExcept = etag
  }
}

// Build PostPolicy object that can be signed by presignedPostPolicy
export class PostPolicy {
  constructor() {
    this.policy = {
      conditions: []
    }
    this.formData = {}
  }

  // set expiration date
  setExpires(date) {
    if (!date) {
      throw new errors.InvalidDateError('Invalid date : cannot be null')
    }
    this.policy.expiration = date.toISOString()
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
      throw new errors.InvalidPrefixError(`Invalid prefix : ${prefix}`)
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

  // set Content-Type prefix, i.e image/ allows any image
  setContentTypeStartsWith(prefix) {
    if (!prefix) {
      throw new Error('content-type cannot be null')
    }
    this.policy.conditions.push(['starts-with', '$Content-Type', prefix])
    this.formData['Content-Type'] = prefix
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

export * from './notification'
