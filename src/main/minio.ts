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
import Stream, { Writable } from 'stream'
import BlockStream2 from 'block-stream2'
import Xml from 'xml'
import xml2js from 'xml2js'
import async from 'async'
import querystring from 'query-string'
import path from 'path'
import _ from 'lodash'
import { TextEncoder } from 'web-encoding'

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
  DEFAULT_REGION,
  SelectResults
} from './helpers.js'

import { signV4, presignSignatureV4, postPresignSignatureV4 } from './signing.js'

import ObjectUploader from './object-uploader'

import * as transformers from './transformers'

import * as errors from './errors.js'

import { getS3Endpoint } from './s3-endpoints.js'

import { NotificationConfig, NotificationPoller } from './notification'

import extensions from './extensions'
import CredentialProvider from './CredentialProvider'

import { parseSelectObjectContentResponse} from './xml-parsers'
import { Transport } from './transport.js'
import { MakeBucketOptions } from './types/bucket-options.js'
import { MakeRequestOptions } from './types/request-options.js'
import { GetObjectOptions } from './types/get-object-options.js'
import { CopyObjectV1Response } from './types/copy-object-options.js'
import { CopyConditions } from './copy-conditions.js'
import { ListQueryOptions } from './types/list-query-options.js'

const Package = require('../../package.json')

export type ClientOptions = {
  /**
   * @deprecated Use 'useSSL' instead
   */
  secure?: boolean,
  /**
   * If set to true, https is used instead of http. Default is true.
   */
  useSSL?: boolean,
  /**
   * TCP/IP port number. This input is optional. 
   * Default value set to 80 for HTTP and 443 for HTTPs.
   */
  port: number,
  /**
   * endPoint is a host name or an IP address.
   */
  endPoint: string,
  /**
   * Set this value to override region cache. (Optional)
   */
  region?: string,
  /**
   * Set this value to pass in a custom transport. (Optional)
   */
  transport?: Transport,
  /**
   * accessKey is like user-id that uniquely identifies your account.
   */
  accessKey: string,
  /**
   * secretKey is the password to your account.
   */
  secretKey: string,
  /**
   * Set this value to provide x-amz-security-token (AWS S3 specific).
   */
  sessionToken?: string,
  /**
   * Set this value to override default access behavior (path) for non AWS endpoints. Default is true. (Optional)
   */
  pathStyle?: boolean,
  credentialsProvider?: CredentialProvider,
  /**
   * Set this value to override default part size of 64MB for multipart uploads. (Optional)
   */
  partSize?: number,
  s3AccelerateEndpoint?: string
}

export class Client {
  private readonly transport: Transport
  private readonly host: string
  private readonly port: number
  private readonly protocol: string
  private readonly accessKey: string
  private readonly secretKey: string
  private readonly sessionToken?: string
  private userAgent: string
  private readonly pathStyle: boolean
  private readonly anonymous: boolean
  private readonly credentialsProvider?: CredentialProvider
  private readonly region?: string
  private readonly regionMap: Record<string, string>
  private readonly partSize: number
  private readonly overRidePartSize?: boolean
  private readonly maximumPartSize: number
  private readonly maxObjectSize: number
  private readonly enableSHA256: boolean
  private s3AccelerateEndpoint: string | null
  private readonly reqOptions?: object
  private logStream?: Writable


  constructor(params: ClientOptions) {
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
    if (!isBoolean(params.useSSL as never)) {
      throw new errors.InvalidArgumentError(`Invalid useSSL flag type : ${params.useSSL}, expected to be of type "boolean"`)
    }

    // Validate region only if its set.
    if (params.region != null && params.region !== '') {
      if (!isString(params.region as never)) {
        throw new errors.InvalidArgumentError(`Invalid region : ${params.region}`)
      }
    }

    const host = params.endPoint.toLowerCase()
    let port = params.port
    let protocol = ''
    let transport
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
      if (!isObject(params.transport as never)) {
        throw new errors.InvalidArgumentError('Invalid transport type : ${params.transport}, expected to be type "object"')
      }
      transport = params.transport
    }

    // User Agent should always following the below style.
    // Please open an issue to discuss any new changes here.
    //
    //       MinIO (OS; ARCH) LIB/VER APP/VER
    //
    const libraryComments = `(${process.platform}; ${process.arch})`
    const libraryAgent = `MinIO ${libraryComments} minio-js/${Package.version}`
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

    if (params.credentialsProvider) {
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
      throw new errors.InvalidArgumentError('Part size should be greater than 5MB')
    }
    if (this.partSize > 5*1024*1024*1024) {
      throw new errors.InvalidArgumentError('Part size should be less than 5GB')
    }

    this.maximumPartSize = 5*1024*1024*1024
    this.maxObjectSize = 5*1024*1024*1024*1024
    // SHA256 is enabled only for authenticated http requests. If the request is authenticated
    // and the connection is https we use x-amz-content-sha256=UNSIGNED-PAYLOAD
    // header for signature calculation.
    this.enableSHA256 = !this.anonymous && !params.useSSL

    this.s3AccelerateEndpoint = params.s3AccelerateEndpoint || null 
    this.reqOptions = {}
  }

  // This is s3 Specific and does not hold validity in any other Object storage.
  getAccelerateEndPointIfSet(bucketName: string, objectName: string) {
    if (this.s3AccelerateEndpoint !== null && this.s3AccelerateEndpoint !== '' && bucketName != null && bucketName !== '' && objectName != null && objectName !== '') {
      // http://docs.aws.amazon.com/AmazonS3/latest/dev/transfer-acceleration.html
      // Disable transfer acceleration for non-compliant bucket names.
      if (bucketName.indexOf('.')!== -1) {
        throw new Error(`Transfer Acceleration is not supported for non compliant bucket:${bucketName}`)
      }
      // If transfer acceleration is requested set new host.
      // For more details about enabling transfer acceleration read here.
      // http://docs.aws.amazon.com/AmazonS3/latest/dev/transfer-acceleration.html
      return this.s3AccelerateEndpoint
    }
    return false
  }

  /**
   * @param endPoint _string_ valid S3 acceleration end point
   */
  setS3TransferAccelerate(endPoint: string) {
    this.s3AccelerateEndpoint = endPoint
  }

  // Sets the supported request options.
  setRequestOptions(options: Record<string, unknown>) {
    if (!isObject(options as never)) {
      throw new TypeError('request options should be of type "object"')
    }
    this.reqOptions = _.pick(options, ['agent', 'ca', 'cert', 'ciphers', 'clientCertEngine', 'crl', 'dhparam', 'ecdhCurve', 'family', 'honorCipherOrder', 'key', 'passphrase', 'pfx', 'rejectUnauthorized', 'secureOptions', 'secureProtocol', 'servername', 'sessionIdContext'])
  }

  // returns *options* object that can be used with http.request()
  // Takes care of constructing virtual-host-style or path-style hostname
  getRequestOptions(opts: MakeRequestOptions) {
    const method = opts.method
    const region = opts.region
    const bucketName = opts.bucketName
    let objectName = opts.objectName
    let headers = opts.headers
    const query = opts.query

    let reqOptions: Http.RequestOptions = {method}
    reqOptions.headers = {}

    // Verify if virtual host supported.
    let virtualHostStyle
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
      } else {
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
      headers = Object.entries(headers).map((v: string, k: unknown) => reqOptions.headers[k.toLowerCase()] = v)
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
  setAppInfo(appName: string, appVersion: string) {
    if (!isString(appName as never)) {
      throw new TypeError(`Invalid appName: ${appName}`)
    }
    if (appName.trim() === '') {
      throw new errors.InvalidArgumentError('Input appName cannot be empty.')
    }
    if (!isString(appVersion as never)) {
      throw new TypeError(`Invalid appVersion: ${appVersion}`)
    }
    if (appVersion.trim() === '') {
      throw new errors.InvalidArgumentError('Input appVersion cannot be empty.')
    }
    this.userAgent = `${this.userAgent} ${appName}/${appVersion}`
  }

  // Calculate part size given the object size. Part size will be atleast this.partSize
  calculatePartSize(size: number): number {
    if (!isNumber(size as never)) {
      throw new TypeError('size should be of type "number"')
    }
    if (size > this.maxObjectSize) {
      throw new TypeError(`size should not be more than ${this.maxObjectSize}`)
    }
    if (this.overRidePartSize) {
      return this.partSize
    }
    let partSize = this.partSize
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
  logHTTP(reqOptions: { method: any; path?: any; headers?: any }, response?: Record<string, unknown> | null, err?: any) {
    // if no logstreamer available return.
    if (this.logStream === undefined) return
    if (!isObject(reqOptions as never)) {
      throw new TypeError('reqOptions should be of type "object"')
    }
    if (response && !isReadableStream(response as never)) {
      throw new TypeError('response should be of type "Stream"')
    }
    if (err && !(err instanceof Error)) {
      throw new TypeError('err should be of type "Error"')
    }
    const logHeaders = (headers: Record<string, unknown>) => {
      if (this.logStream === undefined) return
      Object.entries(headers).forEach(([v, k]) => {
        if (this.logStream === undefined) return
        if (k == 'authorization') {
          const redacter = new RegExp('Signature=([0-9a-f]+)')
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
      const errJSON = JSON.stringify(err, null, '\t')
      this.logStream.write(`${errJSON}\n`)
    }
  }

  // Enable tracing
  traceOn(stream?: Writable) {
    if (!stream) stream = process.stdout
    this.logStream = stream
  }

  // Disable tracing
  traceOff() {
    this.logStream = undefined
  }

  // makeRequest is the primitive used by the apis for making S3 requests.
  // payload can be empty string in case of no payload.
  // statusCode is the expected statusCode. If response.statusCode does not match
  // we parse the XML error and call the callback with the error message.
  // A valid region is passed by the calls - listBuckets, makeBucket and
  // getBucketRegion.
  makeRequest(options: MakeRequestOptions, payload: string | Buffer, statusCodes: number[], region: string, returnResponse: boolean, callback: (err: Error | null, response?: Http.IncomingMessage) => void) {
    if (!isObject(options as never)) {
      throw new TypeError('options should be of type "object"')
    }
    if (!isString(payload as never) && !isObject(payload as never)) {
      // Buffer is of type 'object'
      throw new TypeError('payload should be of type "string" or "Buffer"')
    }
    statusCodes.forEach(statusCode => {
      if (!isNumber(statusCode as never)) {
        throw new TypeError('statusCode should be of type "number"')
      }
    })
    if (!isString(region as never)) {
      throw new TypeError('region should be of type "string"')
    }
    if (!isBoolean(returnResponse as never)) {
      throw new TypeError('returnResponse should be of type "boolean"')
    }
    if (!isFunction(callback as never)) {
      throw new TypeError('callback should be of type "function"')
    }
    if (!options.headers) options.headers = {}
    if (options.method === 'POST' || options.method === 'PUT' || options.method === 'DELETE') {
      options.headers['content-length'] = payload.length
    }
    let sha256sum = ''
    if (this.enableSHA256) sha256sum = toSha256(payload)
    const stream = readableStream(payload)
    this.makeRequestStream(options, stream, sha256sum, statusCodes, region, returnResponse, callback)
  }

  // makeRequestStream will be used directly instead of makeRequest in case the payload
  // is available as a stream. for ex. putObject
  makeRequestStream(options: MakeRequestOptions, stream: Stream.Readable, sha256sum: string, statusCodes: number[], region: string, returnResponse: boolean, cb: (err: Error | null, response?: Http.IncomingMessage) => void) {
    if (!isObject(options as never)) {
      throw new TypeError('options should be of type "object"')
    }
    if (!isReadableStream(stream as never)) {
      throw new errors.InvalidArgumentError('stream should be a readable Stream')
    }
    if (!isString(sha256sum as never)) {
      throw new TypeError('sha256sum should be of type "string"')
    }
    statusCodes.forEach(statusCode => {
      if (!isNumber(statusCode as never)) {
        throw new TypeError('statusCode should be of type "number"')
      }
    })
    if (!isString(region as never)) {
      throw new TypeError('region should be of type "string"')
    }
    if (!isBoolean(returnResponse as never)) {
      throw new TypeError('returnResponse should be of type "boolean"')
    }
    if (!isFunction(cb as never)) {
      throw new TypeError('callback should be of type "function"')
    }

    // sha256sum will be empty for anonymous or https requests
    if (!this.enableSHA256 && sha256sum.length !== 0) {
      throw new errors.InvalidArgumentError('sha256sum expected to be empty for anonymous or https requests')
    }
    // sha256sum should be valid for non-anonymous http requests.
    if (this.enableSHA256 && sha256sum.length !== 64) {
      throw new errors.InvalidArgumentError(`Invalid sha256sum : ${sha256sum}`)
    }

    const _makeRequest = (e: Error | null, region?: string) => {
      if (e) return cb(e)
      options.region = region
      const reqOptions = this.getRequestOptions(options)
      if (!this.anonymous) {
        // For non-anonymous https requests sha256sum is 'UNSIGNED-PAYLOAD' for signature calculation.
        if (!this.enableSHA256) sha256sum = 'UNSIGNED-PAYLOAD'

        const date = new Date()

        reqOptions.headers['x-amz-date'] = makeDateLong(date)
        reqOptions.headers['x-amz-content-sha256'] = sha256sum
        if (this.sessionToken) {
          reqOptions.headers['x-amz-security-token'] = this.sessionToken
        }

        this.checkAndRefreshCreds()
        const authorization = signV4(reqOptions, this.accessKey, this.secretKey, region, date)
        reqOptions.headers.authorization = authorization
      }
      const req = this.transport.request(reqOptions, response => {
        if (response != null) {
          if (response?.statusCode !== undefined && !statusCodes.includes(response?.statusCode)) {
            // For an incorrect region, S3 server always sends back 400.
            // But we will do cache invalidation for all errors so that,
            // in future, if AWS S3 decides to send a different status code or
            // XML error code we will still work fine.
            if (options.bucketName != null) {
              delete this.regionMap[options.bucketName]
            }

            const errorTransformer = transformers.getErrorTransformer(response)
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
          response.on('data', () => {
            // do nothing
          })

          cb(null)
        }
      })
      const pipe = pipesetup(stream, req)
      pipe.on('error', e => {
        this.logHTTP(reqOptions, null, e)
        cb(e)
      })
    }
    if (region) return _makeRequest(null, region)
    this.getBucketRegion(options.bucketName, _makeRequest)
  }

  // gets the region of the bucket
  getBucketRegion(bucketName: string, callback: (err: Error | null, region?: string) => void) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`)
    }
    if (!isFunction(callback as never)) {
      throw new TypeError('callback should be of type "function"')
    }

    // Region is set with constructor, return the region right here.
    if (this.region) return callback(null, this.region)

    if (this.regionMap[bucketName]) return callback(null, this.regionMap[bucketName])
    const extractRegion = (response: Http.IncomingMessage) => {
      const transformer = transformers.getBucketRegionTransformer()
      let region = DEFAULT_REGION
      pipesetup(response, transformer)
        .on('error', callback)
        .on('data', data => {
          if (data) region = data
        })
        .on('end', () => {
          this.regionMap[bucketName] = region
          callback(null, region)
        })
    }

    const method = 'GET'
    const query = 'location'

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
    const pathStyle = this.pathStyle && typeof window === 'undefined'

    this.makeRequest({method, bucketName, query, pathStyle}, '', [200], DEFAULT_REGION, true, (e?: Error | null, response?: Http.IncomingMessage) => {
      if (e) {
        if (e.name === 'AuthorizationHeaderMalformed') {
          const region = e.Region
          if (!region) return callback(e)
          this.makeRequest({method, bucketName, query}, '', [200], region, true, (e?: Error | null, response?: Http.IncomingMessage) => {
            if (e) return callback(e)
            if (response == null) return callback(new errors.MisbehavingServerError('Expecting a Http.IncomingMessage response stream, got undefined'))
            extractRegion(response)
          })
          return
        }
        return callback(e)
      }

      if (response == null) return callback(new errors.MisbehavingServerError('Expecting a Http.IncomingMessage response stream, got undefined'))
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
  makeBucket(bucketName: string, callback: (err?: Error) => void): void
  makeBucket(bucketName: string, region: string, callback: (err?: Error) => void): void 
  makeBucket(bucketName: string, region: string, makeOpts: MakeBucketOptions, callback: (err?: Error) => void): void
  makeBucket(bucketName: string, ...rest: [(err?: Error) => void] | [string, (err?: Error) => void] | [string, MakeBucketOptions, (err?: Error) => void]): void {
    const [callback, makeOpts, region] =
            rest.length === 1 ? [rest[0], undefined, DEFAULT_REGION] :
              rest.length === 2 ? [rest[1], undefined, rest[0] ?? DEFAULT_REGION] :
                [rest[2], rest[1], rest[0] ?? DEFAULT_REGION]

    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }

    if (region != null && !isString(region as never)) {
      throw new TypeError('region should be of type "string"')
    }
    if (makeOpts != null && !isObject(makeOpts as never)) {
      throw new TypeError('makeOpts should be of type "object"')
    }
    if (callback != null && !isFunction(callback as never)) {
      throw new TypeError('callback should be of type "function"')
    }

    let payload = ''

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
      const createBucketConfiguration = []
      createBucketConfiguration.push({
        _attr: {
          xmlns: 'http://s3.amazonaws.com/doc/2006-03-01/'
        }
      })
      createBucketConfiguration.push({
        LocationConstraint: region
      })
      const payloadObject = {
        CreateBucketConfiguration: createBucketConfiguration
      }
      payload = Xml(payloadObject)
    }
    const method = 'PUT'
    const headers = {}

    if (makeOpts?.ObjectLocking) {
      headers['x-amz-bucket-object-lock-enabled']=true
    }

    const processWithRetry = (err?: Error) =>{
      if (err && (region === '' || region === DEFAULT_REGION)) {
        if (err.code === 'AuthorizationHeaderMalformed' && err.region !== '') {
          // Retry with region returned as part of error
          this.makeRequest({method, bucketName, headers}, payload, [200], err.region, false, cb)
        } else {
          return cb?.(err)
        }
      }
      return cb?.(err)
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
  listBuckets(callback: (err?: Error | null, buckets?: Bucket[]) => void): void {
    if (!isFunction(callback as never)) {
      throw new TypeError('callback should be of type "function"')
    }
    const method = 'GET'
    this.makeRequest({method}, '', [200], DEFAULT_REGION, true, (e, response) => {
      if (e) return callback(e)
      if (response == null) return callback(new errors.MisbehavingServerError('Expecting a Http.IncomingMessage response stream, got undefined'))

      const transformer = transformers.getListBucketTransformer()
      let buckets: Bucket[] = []
      pipesetup(response, transformer)
        .on('data', result => buckets = result)
        .on('error', e => callback(e))
        .on('end', () => callback(null, buckets))
    })
  }

  // Returns a stream that emits objects that are partially uploaded.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `prefix` _string_: prefix of the object names that are partially uploaded (optional, default `''`)
  // * `recursive` _bool_: directory style listing when false, recursive listing when true (optional, default `false`)
  //
  // __Return Value__
  // * `stream` _Stream_ : emits objects of the format:
  //   * `object.key` _string_: name of the object
  //   * `object.uploadId` _string_: upload ID of the object
  //   * `object.size` _Integer_: size of the partially uploaded object
  listIncompleteUploads(bucketName: string, prefix = '', recursive = false): Stream.Readable {
    if (prefix === undefined) prefix = ''
    if (recursive === undefined) recursive = false
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidPrefix(prefix)) {
      throw new errors.InvalidPrefixError(`Invalid prefix: ${prefix}`)
    }
    if (!isBoolean(recursive as never)) {
      throw new TypeError('recursive should be of type "boolean"')
    }
    const delimiter = recursive ? '' : '/'
    let keyMarker = ''
    let uploadIdMarker = ''
    const uploads: any[] = []
    let ended = false
    const readStream = new Stream.Readable({objectMode: true})
    readStream._read = () => {
      // push one upload info per _read()
      if (uploads.length) {
        return readStream.push(uploads.shift())
      }
      if (ended) return readStream.push(null)
      this.listIncompleteUploadsQuery(bucketName, prefix, keyMarker, uploadIdMarker, delimiter)
        .on('error', (e: any) => readStream.emit('error', e))
        .on('data', (result: { prefixes: any[]; uploads: any; isTruncated: any; nextKeyMarker: string; nextUploadIdMarker: string }) => {
          result.prefixes.forEach((prefix: any) => uploads.push(prefix))
          async.eachSeries(result.uploads, (upload: { key: any; uploadId: any; size: any }, cb: (arg0: undefined) => void) => {
            // for each incomplete upload add the sizes of its uploaded parts
            this.listParts(bucketName, upload.key, upload.uploadId, (err: any, parts: any[]) => {
              if (err) return cb(err)
              upload.size = parts.reduce((acc: any, item: { size: any }) => acc + item.size, 0)
              uploads.push(upload)
              cb()
            })
          }, (err: any) => {
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
            readStream.read()
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
  bucketExists(bucketName: string, callback: (err: Error | null, exists?: boolean) => void): void {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isFunction(callback as never)) {
      throw new TypeError('callback should be of type "function"')
    }
    const method = 'HEAD'
    this.makeRequest({method, bucketName}, '', [200], '', false, (err) => {
      if (err) {
        if (err?.code === 'NoSuchBucket' || err?.code === 'NotFound') return callback(null, false)
        return callback(err)
      }
      callback(null, true)
    })
  }

  // Remove a bucket.
  //
  // __Arguments__
  // * `bucketName` _string_ : name of the bucket
  // * `callback(err)` _function_ : `err` is `null` if the bucket is removed successfully.
  removeBucket(bucketName: string, callback: (err: Error | null) => void): void {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isFunction(callback as never)) {
      throw new TypeError('callback should be of type "function"')
    }
    const method = 'DELETE'
    this.makeRequest({method, bucketName}, '', [204], '', false, (e) => {
      // If the bucket was successfully removed, remove the region map entry.
      if (!e) delete this.regionMap[bucketName]
      callback(e)
    })
  }

  // Remove the partially uploaded object.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `callback(err)` _function_: callback function is called with non `null` value in case of error
  removeIncompleteUpload(bucketName: string, objectName: string, callback: (err: Error | null) => void): void {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isFunction(callback as never)) {
      throw new TypeError('callback should be of type "function"')
    }

    this.findUploadId(bucketName, objectName, (e: Error | null, uploadId?: string) => {
      if (e) return callback(e)
      if (uploadId == null) return callback(new errors.MisbehavingServerError('Expecting a response, instead got undefined uploadId'))
      const method = 'DELETE'
      const query = `uploadId=${uploadId}`
      this.makeRequest({method, bucketName, objectName, query}, '', [204], '', false, e => callback(e))
    })
  }

  // Callback is called with `error` in case of error or `null` in case of success
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `filePath` _string_: path to which the object data will be written to
  // * `getOpts` _object_: Version of the object in the form `{versionId:'my-uuid'}`. Default is `{}`. (optional)
  // * `callback(err)` _function_: callback is called with `err` in case of error.
  fGetObject(bucketName: string, objectName: string, filePath: string, callback: (err: Error | null) => void): void
  fGetObject(bucketName: string, objectName: string, filePath: string, getOpts: GetObjectOptions, callback: (err: Error | null) => void): void 
  fGetObject(bucketName: string, objectName: string, filePath: string, ...rest: [(err: Error | null) => void] | [GetObjectOptions, (err: Error | null) => void]): void {
    const [callback, getOpts] = 
      rest.length === 1 ? [rest[0], {}] : 
        [rest[1], rest[0]]

    // Input validation.
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isString(filePath as never)) {
      throw new TypeError('filePath should be of type "string"')
    }

    if (!isFunction(callback as never)) {
      throw new TypeError('callback should be of type "function"')
    }

    // Internal data.
    let partFile: fs.PathLike
    let partFileStream: Stream.Stream
    let objStat: { etag: any; size: number }

    // Rename wrapper.
    const rename = (err: Error | null) => {
      if (err) return callback(err)
      fs.rename(partFile, filePath, callback)
    }

    // TODO: make this into a normal callback without external library
    async.waterfall([
      (      cb: any) => this.statObject(bucketName, objectName, getOpts, cb),
      (result: any, cb: (err: NodeJS.ErrnoException | null, path?: string | undefined) => void) => {
        objStat = result
        // Create any missing top level directories.
        fs.mkdir(path.dirname(filePath), { recursive: true }, cb)
      },
      (ignore: any, cb: any) => {
        partFile = `${filePath}.${objStat.etag}.part.minio`
        fs.stat(partFile, (e, stats) => {
          let offset = 0
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
      (downloadStream: Stream.Stream, cb: (...args: any[]) => void) => {
        pipesetup(downloadStream, partFileStream)
          .on('error', e => cb(e))
          .on('finish', cb)
      },
      (      cb: (err: NodeJS.ErrnoException | null, stats: fs.Stats) => void) => fs.stat(partFile, cb),
      (stats: { size: any }, cb: (arg0: Error | undefined) => void) => {
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
  getObject(bucketName: string, objectName: string, callback: (err: Error | null) => void): void
  getObject(bucketName: string, objectName: string, getOpts: GetObjectOptions, callback: (err: Error | null) => void): void
  getObject(bucketName: string, objectName: string, ...rest: [(err: Error | null) => void] | [GetObjectOptions, (err: Error | null) => void]): void {
    const [callback, getOpts] = 
      rest.length === 1 ? [rest[0], {}] :
        rest.length === 2 ? [rest[1], rest[0] ?? {}] :
          [undefined, {}]

    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }


    if (!isFunction(callback as never)) {
      throw new TypeError('callback should be of type "function"')
    }

    if (callback == null) {
      throw new TypeError('callback should be of type "function"')
    }


    this.getPartialObject(bucketName, objectName, 0, 0, getOpts, callback)
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
  getPartialObject(bucketName: string, objectName: string, offset: number, callback: (err: Error | null, response?: Http.IncomingMessage) => void): void
  getPartialObject(bucketName: string, objectName: string, offset: number, length: number, callback: (err: Error | null, response?: Http.IncomingMessage) => void): void
  getPartialObject(bucketName: string, objectName: string, offset: number, length: number, getOpts: GetObjectOptions, callback: (err: Error | null, response?: Http.IncomingMessage | undefined) => void): void
  getPartialObject(bucketName: string, objectName: string, offset: number, ...rest: [(err: Error | null, response?: Http.IncomingMessage) => void] | [number, (err: Error | null, response?: Http.IncomingMessage) => void] |  [number, GetObjectOptions, (err: Error | null, response?: Http.IncomingMessage) => void]): void {
    const [callback, getOpts, length] = 
      rest.length === 1 ? [rest[0], {}, undefined] :
      rest.length === 2 ? [rest[1], {}, rest[0]] :
      [rest[2], rest[1], rest[0]]

    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isNumber(offset as never)) {
      throw new TypeError('offset should be of type "number"')
    }

    if (length != null) {
      if (!isNumber(length as never)) {
        throw new TypeError('length should be of type "number"')
      }
    }

    if (!isFunction(callback as never)) {
      throw new TypeError('callback should be of type "function"')
    }

    let range = ''
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

    const headers: Http.OutgoingHttpHeaders = {}
    if (range !== '') {
      headers.range = range
    }

    const expectedStatusCodes = [200]
    if (range) {
      expectedStatusCodes.push(206)
    }
    const method = 'GET'

    const query = querystring.stringify(getOpts)
    this.makeRequest({method, bucketName, objectName, headers, query}, '', expectedStatusCodes, '', true, callback)
  }

  // Uploads the object using contents from a file
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `filePath` _string_: file path of the file to be uploaded
  // * `metaData` _Javascript Object_: metaData assosciated with the object
  // * `callback(err, objInfo)` _function_: non null `err` indicates error, `objInfo` _object_ which contains versionId and etag.
  fPutObject(bucketName: string, objectName: string, filePath: fs.PathLike, callback: (err: Error | null, response: any) => void): void 
  fPutObject(bucketName: string, objectName: string, filePath: fs.PathLike, metaData: Record<string, string>, callback: (err: Error | null, response: any) => void): void
  fPutObject(bucketName: string, objectName: string, filePath: fs.PathLike, ...rest: [callback: (err: Error | null, response: any) => void] | [metaData: Record<string, string>, callback: (err: Error | null, response: any) => void]): void {
        const [callback, metaData] = 
          rest.length === 1 ? [rest[0], {}] :
            [rest[1], rest[0] ?? {}]

    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }

    if (!isString(filePath.toString() as never)) {
      throw new TypeError('filePath should be of type "string"')
    }

    if (!isObject(metaData as never)) {
      throw new TypeError('metaData should be of type "object"')
    }

    // Inserts correct `content-type` attribute based on metaData and filePath
    metaData = insertContentType(metaData, filePath)

    // Updates metaData to have the correct prefix if needed
    metaData = prependXAMZMeta(metaData)
    let size: number
    let partSize: number

    async.waterfall([
      (      cb: (err: NodeJS.ErrnoException | null, stats: fs.Stats) => void) => fs.stat(filePath, cb),
      (stats: { size: any }, cb: ((err: Error | null, uploadId?: string | undefined) => void) | ((arg0: boolean | Error) => void)) => {
        size = stats.size
        let cbTriggered = false
        const origCb = cb
        cb = function () {
          if (cbTriggered) {
            return
          }
          cbTriggered = true
          return origCb.apply(this, arguments)
        }
        if (size > this.maxObjectSize) {
          return cb(new Error(`${filePath} size : ${stats.size}, max allowed size : 5TB`))
        }
        if (size <= this.partSize) {
          // simple PUT request, no multipart
          const multipart = false
          const uploader = this.getUploader(bucketName, objectName, metaData, multipart)
          const hash = transformers.getHashSummer(this.enableSHA256)
          const start = 0
          let end = size - 1
          const autoClose = true
          if (size === 0) end = 0
          const options = {start, end, autoClose}
          pipesetup(fs.createReadStream(filePath, options), hash)
            .on('data', data => {
              const md5sum = data.md5sum
              const sha256sum = data.sha256sum
              const stream = fs.createReadStream(filePath, options)
              uploader(stream, size, sha256sum, md5sum, (err: any, objInfo: any) => {
                callback(err, objInfo)
                cb(true)
              })
            })
            .on('error', e => cb(e))
          return
        }
        this.findUploadId(bucketName, objectName, cb)
      },
      (uploadId: any, cb: (arg0: any, arg1: any, arg2: never[]) => any) => {
        // if there was a previous incomplete upload, fetch all its uploaded parts info
        if (uploadId) return this.listParts(bucketName, objectName, uploadId, (e: any, etags: any) => cb(e, uploadId, etags))
        // there was no previous upload, initiate a new one
        this.initiateNewMultipartUpload(bucketName, objectName, metaData, (e: any, uploadId: any) => cb(e, uploadId, []))
      },
      (uploadId: any, etags: any[], cb: (arg0: null, arg1: any[] | undefined, arg2: undefined) => void) => {
        partSize = this.calculatePartSize(size)
        const multipart = true
        const uploader = this.getUploader(bucketName, objectName, metaData, multipart)

        // convert array to object to make things easy
        const parts = etags.reduce(function(acc: { [x: string]: any }, item: { part: string | number }) {
          if (!acc[item.part]) {
            acc[item.part] = item
          }
          return acc
        }, {})
        const partsDone: { part: number; etag: any }[] = []
        let partNumber = 1
        let uploadedSize = 0
        async.whilst(
          (          cb: (arg0: null, arg1: boolean) => void) => { cb(null, uploadedSize < size) },
          (          cb: (arg0: undefined) => void) => {
            let cbTriggered = false
            const origCb = cb
            cb = function () {
              if (cbTriggered) {
                return
              }
              cbTriggered = true
              return origCb.apply(this, arguments)
            }
            const part = parts[partNumber]
            const hash = transformers.getHashSummer(this.enableSHA256)
            let length = partSize
            if (length > (size - uploadedSize)) {
              length = size - uploadedSize
            }
            const start = uploadedSize
            const end = uploadedSize + length - 1
            const autoClose = true
            const options = {autoClose, start, end}
            // verify md5sum of each part
            pipesetup(fs.createReadStream(filePath, options), hash)
              .on('data', data => {
                const md5sumHex = Buffer.from(data.md5sum, 'base64').toString('hex')
                if (part && (md5sumHex === part.etag)) {
                  // md5 matches, chunk already uploaded
                  partsDone.push({part: partNumber, etag: part.etag})
                  partNumber++
                  uploadedSize += length
                  return cb()
                }
                // part is not uploaded yet, or md5 mismatch
                const stream = fs.createReadStream(filePath, options)
                uploader(uploadId, partNumber, stream, length,
                         data.sha256sum, data.md5sum, (e: any, objInfo: { etag: any }) => {
                           if (e) return cb(e)
                           partsDone.push({part: partNumber, etag: objInfo.etag})
                           partNumber++
                           uploadedSize += length
                           return cb()
                         })
              })
              .on('error', e => cb(e))
          },
          (          e: any) => {
            if (e) return cb(e)
            cb(null, partsDone, uploadId)
          }
        )
      },
      // all parts uploaded, complete the multipart upload
      (etags: any, uploadId: any, cb: any) => this.completeMultipartUpload(bucketName, objectName, uploadId, etags, cb)
    ], (err: boolean, ...rest: any) => {
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
  putObject(bucketName: string, objectName: string, stream: Stream.Readable, size: number, metaData: {}, callback: any) {
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
    const chunker = new BlockStream2({size, zeroPadding: false})

    // This is a Writable stream that can be written to in order to upload
    // to the specified bucket and object automatically.
    const uploader = new ObjectUploader(this, bucketName, objectName, size, metaData, callback)
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
  copyObjectV1(bucketName: string, objectName: string, sourceObject: string, callback: (err: Error | null, response?: CopyObjectV1Response) => void): void
  copyObjectV1(bucketName: string, objectName: string, sourceObject: string, conditions: CopyConditions, callback: (err: Error | null, response?: CopyObjectV1Response) => void): void
  copyObjectV1(bucketName: string, objectName: string, sourceObject: string, ...rest: [callback: (err: Error | null, response?: CopyObjectV1Response) => void] | [conditions: CopyConditions, callback: (err: Error | null, response?: CopyObjectV1Response) => void]): void {
    const [callback, conditions] = 
      rest.length === 1 ? [rest[0], null] :
        [rest[1], rest[1] ?? null]

    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isString(sourceObject as never)) {
      throw new TypeError('srcObject should be of type "string"')
    }
    if (sourceObject === '') {
      throw new errors.InvalidPrefixError('Empty source prefix')
    }

    if (conditions !== null && !(conditions instanceof CopyConditions)) {
      throw new TypeError('conditions should be of type "CopyConditions"')
    }

    const headers: Http.OutgoingHttpHeaders = {}
    headers['x-amz-copy-source'] = uriResourceEscape(sourceObject)

    if (conditions !== null) {
      if (conditions.modified !== '') {
        headers['x-amz-copy-source-if-modified-since'] = conditions.modified
      }
      if (conditions.unmodified !== '') {
        headers['x-amz-copy-source-if-unmodified-since'] = conditions.unmodified
      }
      if (conditions.matchETag !== '') {
        headers['x-amz-copy-source-if-match'] = conditions.matchETag
      }
      if (conditions.matchETagExcept !== '') {
        headers['x-amz-copy-source-if-none-match'] = conditions.matchETagExcept
      }
    }

    const method = 'PUT'
    this.makeRequest({method, bucketName, objectName, headers}, '', [200], '', true, (e, response) => {
      if (e) return callback(e)
      if (response == null) return callback(new errors.MisbehavingServerError('Expecting a Http.IncomingMessage response stream, got undefined'))
      const transformer = transformers.getCopyObjectTransformer()
      pipesetup(response, transformer)
        .on('error', e => callback(e))
        .on('data', data => callback(null, data))
    })
  }

  /**
     * Internal Method to perform copy of an object.
     * @param sourceConfig __object__   instance of CopySourceOptions @link ./helpers/CopySourceOptions
     * @param destConfig  __object__   instance of CopyDestinationOptions @link ./helpers/CopyDestinationOptions
     * @param cb __function__ called with null if there is an error
     * @returns Promise if no callack is passed.
     */
  copyObjectV2(sourceConfig: { getHeaders: () => {} }, destConfig: { validate: () => any; getHeaders: () => {}; Bucket: any; Object: any } | undefined, cb: ((arg0: Error | null, arg1: { Bucket: any; Key: any; LastModified: any; MetaData: {}; VersionId: any; SourceVersionId: any; Etag: string; Size: number } | undefined) => void) | undefined) {

    if (!(sourceConfig instanceof CopySourceOptions )) {
      throw new errors.InvalidArgumentError('sourceConfig should of type CopySourceOptions ')
    }
    if (!(destConfig instanceof CopyDestinationOptions )) {
      throw new errors.InvalidArgumentError('destConfig should of type CopyDestinationOptions ')
    }
    if (!destConfig.validate()) {
      return false
    }
    if (!destConfig.validate()) {
      return false
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    const headers = Object.assign({}, sourceConfig.getHeaders(), destConfig.getHeaders())

    const bucketName = destConfig.Bucket
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

          return cb(null, copyObjResponse)
        })
    })
  }

  // Backward compatibility for Copy Object API.
  copyObject(...allArgs: CopyDestinationOptions[]) {
    if (allArgs[0] instanceof CopySourceOptions && allArgs[1] instanceof CopyDestinationOptions) {
      return this.copyObjectV2(...arguments)
    }
    return this.copyObjectV1(...arguments)
  }

  // list a batch of objects
  listObjectsQuery(bucketName: string, prefix: string, marker: string, listQueryOpts: ListQueryOptions) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isString(prefix as never)) {
      throw new TypeError('prefix should be of type "string"')
    }
    if (!isString(marker as never)) {
      throw new TypeError('marker should be of type "string"')
    }
    let {
      Delimiter,
      MaxKeys,
      IncludeVersion
    } = listQueryOpts

    if (!isObject(listQueryOpts as never)) {
      throw new TypeError('listQueryOpts should be of type "object"')
    }

    if (!isString(Delimiter as never)) {
      throw new TypeError('Delimiter should be of type "string"')
    }
    if (!isNumber(MaxKeys as never)) {
      throw new TypeError('MaxKeys should be of type "number"')
    }

    const queries: string[] = []
    // escape every value in query string, except maxKeys
    queries.push(`prefix=${uriEscape(prefix)}`)
    queries.push(`delimiter=${uriEscape(Delimiter)}`)
    queries.push('encoding-type=url')

    if (IncludeVersion) {
      queries.push('versions')
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
    let query = ''
    if (queries.length > 0) {
      query = `${queries.join('&')}`
    }

    const method = 'GET'
    const transformer = transformers.getListObjectsTransformer()
    this.makeRequest({method, bucketName, query}, '', [200], '', true, (e, response) => {
      if (e) return transformer.emit('error', e)
      if (response == null) return transformer.emit('error', new errors.MisbehavingServerError('Expecting a Http.IncomingMessage response stream, got undefined'))
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
  listObjects(bucketName: string, prefix: string | undefined, recursive: boolean | undefined, listOpts={}) {
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
    let marker = ''
    const listQueryOpts={
      Delimiter:recursive ? '' : '/', // if recursive is false set delimiter to '/'
      MaxKeys: 1000,
      IncludeVersion:listOpts.IncludeVersion
    }
    let objects: any[] = []
    let ended = false
    const readStream = Stream.Readable({objectMode: true})
    readStream._read = () => {
      // push one object per _read()
      if (objects.length) {
        readStream.push(objects.shift())
        return
      }
      if (ended) return readStream.push(null)
      // if there are no objects to push do query for the next batch of objects
      this.listObjectsQuery(bucketName, prefix, marker, listQueryOpts)
        .on('error', (e: any) => readStream.emit('error', e))
        .on('data', (result: { isTruncated: any; nextMarker: any; versionIdMarker: any; objects: any[] }) => {
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
  listObjectsV2Query(bucketName: string, prefix: string, continuationToken: string, delimiter: string, maxKeys: number, startAfter: string) {
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
    const queries = []

    // Call for listing objects v2 API
    queries.push('list-type=2')
    queries.push('encoding-type=url')

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
    let query = ''
    if (queries.length > 0) {
      query = `${queries.join('&')}`
    }
    const method = 'GET'
    const transformer = transformers.getListObjectsV2Transformer()
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
  listObjectsV2(bucketName: string, prefix: string | undefined, recursive: boolean | undefined, startAfter: string | undefined) {
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
    const delimiter = recursive ? '' : '/'
    let continuationToken = ''
    let objects: any[] = []
    let ended = false
    const readStream = Stream.Readable({objectMode: true})
    readStream._read = () => {
      // push one object per _read()
      if (objects.length) {
        readStream.push(objects.shift())
        return
      }
      if (ended) return readStream.push(null)
      // if there are no objects to push do query for the next batch of objects
      this.listObjectsV2Query(bucketName, prefix, continuationToken, delimiter, 1000, startAfter)
        .on('error', (e: any) => readStream.emit('error', e))
        .on('data', (result: { isTruncated: any; nextContinuationToken: string; objects: any[] }) => {
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
  statObject(bucketName: string, objectName: string, statOpts={}, cb: {} | undefined) {
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

    if (!isObject(statOpts)) {
      throw new errors.InvalidArgumentError('statOpts should be of type "object"')
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    const query = querystring.stringify(statOpts)
    const method = 'HEAD'
    this.makeRequest({method, bucketName, objectName, query}, '', [200], '', true, (e, response) => {
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
  // * `removeOpts` _object_: Version of the object in the form `{versionId:'my-uuid', governanceBypass:true|false, forceDelete:true|false}`. Default is `{}`. (optional)
  // * `callback(err)` _function_: callback function is called with non `null` value in case of error
  removeObject(bucketName: string, objectName: string, removeOpts={}, cb: (err: Error | null, response?: Http.IncomingMessage | undefined) => void) {
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

    if (!isObject(removeOpts)) {
      throw new errors.InvalidArgumentError('removeOpts should be of type "object"')
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    const method = 'DELETE'
    const queryParams = {}

    if (removeOpts.versionId) {
      queryParams.versionId=`${removeOpts.versionId}`
    }
    const headers = {}
    if (removeOpts.governanceBypass) {
      headers['X-Amz-Bypass-Governance-Retention']=true
    }
    if (removeOpts.forceDelete) {
      headers['x-minio-force-delete']=true
    }

    const query = querystring.stringify( queryParams )

    const requestOptions = {method, bucketName, objectName, headers}
    if (query) {
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

  removeObjects(bucketName: string, objectsList: any[], cb: any) {
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

    const result = objectsList.reduce((result: { list: any[]; listOfList: any[] }, entry: any) => {
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

    async.eachSeries(result.listOfList, (list: any[], callback: (arg0: Error | null) => void) => {
      const objects: { Key: any; VersionId?: any }[]=[]
      list.forEach(function(value: { name: any; versionId: any }) {
        if (isObject(value)) {
          objects.push({'Key': value.name, 'VersionId': value.versionId})
        } else {
          objects.push({'Key': value})
        }
      })
      const deleteObjects = {'Delete': {'Quiet': true, 'Object': objects}}
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
  getBucketPolicy(bucketName: string, cb: ((...args: any[]) => void) | ((arg0: Error | null, arg1: string | undefined) => void)) {
    // Validate arguments.
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`)
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    const method = 'GET'
    const query = 'policy'
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
  setBucketPolicy(bucketName: string, policy: string | Buffer, cb: (err: Error | null, response?: Http.IncomingMessage | undefined) => void) {
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
    const query = 'policy'

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
  presignedUrl(method: string, bucketName: string, objectName: any, expires: number, reqParams: Record<string, any>, requestDate: unknown, cb: ((arg0: unknown, arg1: string | undefined) => void) | undefined) {
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
    const query = querystring.stringify(reqParams)
    this.getBucketRegion(bucketName, (e, region) => {
      if (e) return cb(e)
      // This statement is added to ensure that we send error through
      // callback on presign failure.
      let url
      const reqOptions = this.getRequestOptions({method,
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
  presignedGetObject(bucketName: string, objectName: string, expires: any, respHeaders: { [x: string]: any } | undefined, requestDate: Date, cb: any) {
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

    const validRespHeaders = ['response-content-type', 'response-content-language', 'response-expires', 'response-cache-control',
                              'response-content-disposition', 'response-content-encoding']
    validRespHeaders.forEach(header => {
      if (respHeaders !== undefined && respHeaders[header] !== undefined && !isString(respHeaders[header])) {
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
  presignedPutObject(bucketName: string, objectName: string, expires: any, cb: any) {
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
  // on the object's `name` `bucket` `expiry` `Content-Type` `Content-Disposition` `metaData`
  presignedPostPolicy(postPolicy: { formData: { [x: string]: string; bucket: string; policy: string }; policy: { expiration: any; conditions: string[][] }; setExpires: (arg0: Date) => void }, cb: (arg0: Error | null, arg1: { postURL: string; formData: any } | undefined) => void) {
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
      const date = new Date()
      const dateStr = makeDateLong(date)

      this.checkAndRefreshCreds()

      if (!postPolicy.policy.expiration) {
        // 'expiration' is mandatory field for S3.
        // Set default expiration date of 7 days.
        const expires = new Date()
        expires.setSeconds(24 * 60 * 60 * 7)
        postPolicy.setExpires(expires)
      }

      postPolicy.policy.conditions.push(['eq', '$x-amz-date', dateStr])
      postPolicy.formData['x-amz-date'] = dateStr

      postPolicy.policy.conditions.push(['eq', '$x-amz-algorithm', 'AWS4-HMAC-SHA256'])
      postPolicy.formData['x-amz-algorithm'] = 'AWS4-HMAC-SHA256'

      postPolicy.policy.conditions.push(['eq', '$x-amz-credential', this.accessKey + '/' + getScope(region, date)])
      postPolicy.formData['x-amz-credential'] = this.accessKey + '/' + getScope(region, date)

      if (this.sessionToken) {
        postPolicy.policy.conditions.push(['eq', '$x-amz-security-token', this.sessionToken])
        postPolicy.formData['x-amz-security-token'] = this.sessionToken
      }

      const policyBase64 = Buffer.from(JSON.stringify(postPolicy.policy)).toString('base64')

      postPolicy.formData.policy = policyBase64

      const signature = postPresignSignatureV4(region, date, this.secretKey, policyBase64)

      postPolicy.formData['x-amz-signature'] = signature
      const opts = {}
      opts.region = region
      opts.bucketName = postPolicy.formData.bucket
      const reqOptions = this.getRequestOptions(opts)
      const portStr = this.port == 80 || this.port === 443 ? '' : `:${this.port.toString()}`
      const urlStr = `${reqOptions.protocol}//${reqOptions.host}${portStr}${reqOptions.path}`
      cb(null, {postURL: urlStr, formData: postPolicy.formData})
    })
  }

  // Calls implemented below are related to multipart.

  // Initiate a new multipart upload.
  initiateNewMultipartUpload(bucketName: string, objectName: string, metaData: {}, cb: { (e: any, uploadId: any): any; (err: any, uploadId: any): any; (arg0: Error | null, arg1: undefined): void }) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isObject(metaData)) {
      throw new errors.InvalidObjectNameError('contentType should be of type "object"')
    }
    const method = 'POST'
    const headers = Object.assign({}, metaData)
    const query = 'uploads'
    this.makeRequest({method, bucketName, objectName, query, headers}, '', [200], '', true, (e, response) => {
      if (e) return cb(e)
      const transformer = transformers.getInitiateMultipartTransformer()
      pipesetup(response, transformer)
        .on('error', e => cb(e))
        .on('data', uploadId => cb(null, uploadId))
    })
  }

  // Complete the multipart upload. After all the parts are uploaded issuing
  // this call will aggregate the parts on the server into a single object.
  completeMultipartUpload(bucketName: string, objectName: string, uploadId: string, etags: any[], cb: (arg0: Error | null, arg1: { etag: any; versionId: any } | undefined) => void) {
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

    const method = 'POST'
    const query = `uploadId=${uriEscape(uploadId)}`

    const parts: { Part: ({ PartNumber: any; ETag?: undefined } | { ETag: any; PartNumber?: undefined })[] }[] = []

    etags.forEach((element: { part: any; etag: any }) => {
      parts.push({
        Part: [{
          PartNumber: element.part
        }, {
          ETag: element.etag
        }]
      })
    })

    const payloadObject = {CompleteMultipartUpload: parts}
    const payload = Xml(payloadObject)

    this.makeRequest({method, bucketName, objectName, query}, payload, [200], '', true, (e, response) => {
      if (e) return cb(e)
      const transformer = transformers.getCompleteMultipartTransformer()
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
  listParts(bucketName: string, objectName: string, uploadId: any, cb: { (err: any, parts: any): any; (e: any, etags: any): any; (arg0: null, arg1: any[] | undefined): void }) {
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
    let parts: any[] = []
    var listNext = (marker: number) => {
      this.listPartsQuery(bucketName, objectName, uploadId, marker, (e: any, result: { parts: any; isTruncated: any; marker: any }) => {
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
  listPartsQuery(bucketName: string, objectName: string, uploadId: string, marker: number, cb: { (e: any, result: any): void; (arg0: Error | null, arg1: undefined): void }) {
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
    let query = ''
    if (marker && marker !== 0) {
      query += `part-number-marker=${marker}&`
    }
    query += `uploadId=${uriEscape(uploadId)}`

    const method = 'GET'
    this.makeRequest({method, bucketName, objectName, query}, '', [200], '', true, (e, response) => {
      if (e) return cb(e)
      const transformer = transformers.getListPartsTransformer()
      pipesetup(response, transformer)
        .on('error', e => cb(e))
        .on('data', data => cb(null, data))
    })
  }

  // Called by listIncompleteUploads to fetch a batch of incomplete uploads.
  listIncompleteUploadsQuery(bucketName: string, prefix: string, keyMarker: string, uploadIdMarker: string, delimiter: string) {
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
    const queries = []
    queries.push(`prefix=${uriEscape(prefix)}`)
    queries.push(`delimiter=${uriEscape(delimiter)}`)

    if (keyMarker) {
      keyMarker = uriEscape(keyMarker)
      queries.push(`key-marker=${keyMarker}`)
    }
    if (uploadIdMarker) {
      queries.push(`upload-id-marker=${uploadIdMarker}`)
    }

    const maxUploads = 1000
    queries.push(`max-uploads=${maxUploads}`)
    queries.sort()
    queries.unshift('uploads')
    let query = ''
    if (queries.length > 0) {
      query = `${queries.join('&')}`
    }
    const method = 'GET'
    const transformer = transformers.getListMultipartTransformer()
    this.makeRequest({method, bucketName, query}, '', [200], '', true, (e, response) => {
      if (e) return transformer.emit('error', e)
      pipesetup(response, transformer)
    })
    return transformer
  }

  // Find uploadId of an incomplete upload.
  findUploadId(bucketName: string, objectName: string, cb: (err: Error | null, uploadId?: string) => void) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isFunction(cb)) {
      throw new TypeError('cb should be of type "function"')
    }
    let latestUpload: string
    var listNext = (keyMarker: string, uploadIdMarker: string) => {
      this.listIncompleteUploadsQuery(bucketName, objectName, keyMarker, uploadIdMarker, '')
        .on('error', (e: Error | null) => cb(e))
        .on('data', (result: { uploads: any[]; isTruncated: any; nextKeyMarker: any; nextUploadIdMarker: any }) => {
          result.uploads.forEach((upload: string) => {
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
  getUploader(bucketName: string, objectName: string, metaData: any, multipart: boolean) {
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

    const validate = (stream: any, length: undefined, sha256sum: undefined, md5sum: undefined, cb: undefined) => {
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
    const simpleUploader = (...args: any[]) => {
      validate(...args)
      const query = ''
      upload(query, ...args)
    }
    const multipartUploader = (uploadId: string, partNumber: any, ...rest: any[]) => {
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
      const query = `partNumber=${partNumber}&uploadId=${uriEscape(uploadId)}`
      upload(query, ...rest)
    }
    var upload = (query: string, stream: Stream.Readable, length: undefined, sha256sum: string | undefined, md5sum: undefined, cb: ((arg0: Error | null, arg1: { etag: string; versionId: any } | undefined) => void) | undefined) => {
      const method = 'PUT'
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
  setBucketNotification(bucketName: string, config: NotificationConfig, cb: (err: Error | null, response?: Http.IncomingMessage | undefined) => void) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isObject(config)) {
      throw new TypeError('notification config should be of type "Object"')
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    const method = 'PUT'
    const query = 'notification'
    const builder = new xml2js.Builder({rootName:'NotificationConfiguration', renderOpts:{'pretty':false}, headless:true})
    const payload = builder.buildObject(config)
    this.makeRequest({method, bucketName, query}, payload, [200], '', false, cb)
  }

  removeAllBucketNotification(bucketName: any, cb: any) {
    this.setBucketNotification(bucketName, new NotificationConfig(), cb)
  }

  // Return the list of notification configurations stored
  // in the S3 provider
  getBucketNotification(bucketName: string, cb: (arg0: Error | null, arg1: undefined) => void) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    const method = 'GET'
    const query = 'notification'
    this.makeRequest({method, bucketName, query}, '', [200], '', true, (e, response) => {
      if (e) return cb(e)
      const transformer = transformers.getBucketNotificationTransformer()
      let bucketNotification: any
      pipesetup(response, transformer)
        .on('data', result => bucketNotification = result)
        .on('error', e => cb(e))
        .on('end', () => cb(null, bucketNotification))
    })
  }

  // Listens for bucket notifications. Returns an EventEmitter.
  listenBucketNotification(bucketName: string, prefix: any, suffix: any, events: any) {
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
    const listener = new NotificationPoller(this, bucketName, prefix, suffix, events)
    listener.start()

    return listener
  }

  getBucketVersioning(bucketName: string, cb: ((...args: any[]) => void) | ((arg0: Error | null, arg1: Buffer | undefined) => void)) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isFunction(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"')
    }
    const method = 'GET'
    const query = 'versioning'

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

  setBucketVersioning(bucketName: string, versionConfig: {}, cb: (err: Error | null, response?: Http.IncomingMessage | undefined) => void) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!Object.keys(versionConfig).length) {
      throw new errors.InvalidArgumentError('versionConfig should be of type "object"')
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    const method = 'PUT'
    const query = 'versioning'
    const builder = new xml2js.Builder({rootName:'VersioningConfiguration', renderOpts:{'pretty':false}, headless:true})
    const payload = builder.buildObject(versionConfig)

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
  setTagging(taggingParams: { bucketName: any; tags: any; cb: any; objectName?: any; putOpts?: any }) {

    const { bucketName, objectName, tags, putOpts={}, cb} = taggingParams
    const method = 'PUT'
    let query ='tagging'

    if (putOpts && putOpts.versionId) {
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
    const builder = new xml2js.Builder({ headless:true, renderOpts:{'pretty':false}})
    let payload = builder.buildObject(taggingConfig)
    payload = encoder.encode(payload)
    headers['Content-MD5'] = toMd5(payload)
    const requestOptions = { method, bucketName, query, headers }

    if (objectName) {
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
  setBucketTagging(bucketName: string, tags: {}, cb: any) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isObject(tags)) {
      throw new errors.InvalidArgumentError('tags should be of type "object"')
    }
    if (Object.keys(tags).length > 10) {
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
  setObjectTagging(bucketName: string, objectName: string, tags: {}, putOpts={}, cb: {}) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidBucketNameError('Invalid object name: ' + objectName)
    }

    if (isFunction(putOpts)) {
      cb=putOpts
      putOpts={}
    }

    if (!isObject(tags)) {
      throw new errors.InvalidArgumentError('tags should be of type "object"')
    }
    if (Object.keys(tags).length > 10) {
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
  removeTagging({bucketName, objectName, removeOpts, cb}) {
    const method = 'DELETE'
    let query ='tagging'

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
  removeBucketTagging(bucketName: string, cb: any) {
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
  removeObjectTagging(bucketName: string, objectName: string, removeOpts: {}, cb: any) {

    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidBucketNameError('Invalid object name: ' + objectName)
    }
    if (isFunction(removeOpts)) {
      cb=removeOpts
      removeOpts={}
    }
    if (removeOpts && Object.keys(removeOpts).length && !isObject(removeOpts)) {
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
  getBucketTagging(bucketName: any, cb: (arg0: Error | null, arg1: undefined) => void) {
    const method = 'GET'
    const query ='tagging'
    const requestOptions = { method, bucketName, query }

    this.makeRequest(requestOptions, '', [200], '', true, (e, response) => {
      const transformer = transformers.getTagsTransformer()
      if (e) return cb(e)
      let tagsList: any
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
  getObjectTagging(bucketName: string, objectName: string, getOpts={}, cb=()=>false) {
    const method = 'GET'
    let query ='tagging'

    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidBucketNameError('Invalid object name: ' + objectName)
    }
    if (isFunction(getOpts)) {
      cb=getOpts
      getOpts={}
    }
    if (!isObject(getOpts)) {
      throw new errors.InvalidArgumentError('getOpts should be of type "object"')
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    if (getOpts && getOpts.versionId) {
      query =`${query}&versionId=${getOpts.versionId}`
    }
    const requestOptions = { method, bucketName, query }
    if (objectName) {
      requestOptions['objectName']=objectName
    }

    this.makeRequest(requestOptions, '', [200], '', true, (e, response) => {
      const transformer = transformers.getTagsTransformer()
      if (e) return cb(e)
      let tagsList: any
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
  applyBucketLifecycle(bucketName: string, policyConfig: string | null, cb: { (err: Error | null): void; (err: Error | null, response?: Http.IncomingMessage | undefined): void }) {
    const method = 'PUT'
    const query='lifecycle'

    const encoder = new TextEncoder()
    const headers ={}
    const builder = new xml2js.Builder({ rootName:'LifecycleConfiguration', headless:true, renderOpts:{'pretty':false}})
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
  removeBucketLifecycle(bucketName: string, cb: (err: Error | null) => void) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    const method = 'DELETE'
    const query='lifecycle'
    this.makeRequest({method, bucketName, query}, '', [204], '', false, cb)
  }

  /** Set/Override lifecycle configuration on a bucket. if the configuration is empty, it removes the configuration.
   * bucketName _string_
   * lifeCycleConfig _object_ one of the following values: (null or '') to remove the lifecycle configuration. or a valid lifecycle configuration
   * `cb(error)` _function_ - callback function with `err` as the error argument. `err` is null if the operation is successful.
   */
  setBucketLifecycle(bucketName: string, lifeCycleConfig: string | null = null, cb: (err: Error | null) => void) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (lifeCycleConfig != null && lifeCycleConfig !== '') {
      this.removeBucketLifecycle(bucketName, cb)
    } else {
      this.applyBucketLifecycle(bucketName, lifeCycleConfig, cb)
    }
  }

  /** Get lifecycle configuration on a bucket.
   * bucketName _string_
   * `cb(config)` _function_ - callback function with lifecycle configuration as the error argument.
   */
  getBucketLifecycle(bucketName: string, cb: (arg0: Error | null, arg1: undefined) => void) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    const method = 'GET'
    const query ='lifecycle'
    const requestOptions = { method, bucketName, query }

    this.makeRequest(requestOptions, '', [200], '', true, (e, response) => {
      const transformer = transformers.lifecycleTransformer()
      if (e) return cb(e)
      let lifecycleConfig: any
      pipesetup(response, transformer)
        .on('data', result => lifecycleConfig = result)
        .on('error', e => cb(e))
        .on('end', () => cb(null, lifecycleConfig))
    })

  }

  setObjectLockConfig(bucketName: string, lockConfigOpts={}, cb: (err: Error | null, response?: Http.IncomingMessage | undefined) => void) {

    const retentionModes = [RETENTION_MODES.COMPLIANCE, RETENTION_MODES.GOVERNANCE]
    const validUnits = [RETENTION_VALIDITY_UNITS.DAYS, RETENTION_VALIDITY_UNITS.YEARS]

    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }

    if (lockConfigOpts.mode && !retentionModes.includes(lockConfigOpts.mode)) {
      throw new TypeError(`lockConfigOpts.mode should be one of ${retentionModes}`)
    }
    if (lockConfigOpts.unit && !validUnits.includes(lockConfigOpts.unit)) {
      throw new TypeError(`lockConfigOpts.unit should be one of ${validUnits}`)
    }
    if (lockConfigOpts.validity && !isNumber(lockConfigOpts.validity)) {
      throw new TypeError('lockConfigOpts.validity should be a number')
    }

    const method = 'PUT'
    const query = 'object-lock'

    const config={
      ObjectLockEnabled:'Enabled'
    }
    const configKeys = Object.keys(lockConfigOpts)
    // Check if keys are present and all keys are present.
    if (configKeys.length > 0) {
      if (_.difference(configKeys, ['unit', 'mode', 'validity']).length !== 0) {
        throw new TypeError('lockConfigOpts.mode,lockConfigOpts.unit,lockConfigOpts.validity all the properties should be specified.')
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

  getObjectLockConfig(bucketName: string, cb: ((...args: any[]) => void) | ((arg0: Error | null, arg1: Buffer | undefined) => void)) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isFunction(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"')
    }
    const method = 'GET'
    const query = 'object-lock'

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

  putObjectRetention(bucketName: string, objectName: string, retentionOpts={}, cb: (err: Error | null, response?: Http.IncomingMessage | undefined) => void) {
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
        throw new errors.InvalidArgumentError('Invalid value for governanceBypass', retentionOpts.governanceBypass)
      }
      if (retentionOpts.mode && ![RETENTION_MODES.COMPLIANCE, RETENTION_MODES.GOVERNANCE].includes(retentionOpts.mode)) {
        throw new errors.InvalidArgumentError('Invalid object retention mode ', retentionOpts.mode)
      }
      if (retentionOpts.retainUntilDate && !isString(retentionOpts.retainUntilDate)) {
        throw new errors.InvalidArgumentError('Invalid value for retainUntilDate', retentionOpts.retainUntilDate)
      }
      if (retentionOpts.versionId && !isString(retentionOpts.versionId)) {
        throw new errors.InvalidArgumentError('Invalid value for versionId', retentionOpts.versionId)
      }
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    const method = 'PUT'
    let query = 'retention'

    const headers = {}
    if (retentionOpts.governanceBypass) {
      headers['X-Amz-Bypass-Governance-Retention']=true
    }

    const builder = new xml2js.Builder({rootName:'Retention', renderOpts:{'pretty':false}, headless:true})
    const params ={}

    if (retentionOpts.mode) {
      params.Mode =retentionOpts.mode
    }
    if (retentionOpts.retainUntilDate) {
      params.RetainUntilDate =retentionOpts.retainUntilDate
    }
    if (retentionOpts.versionId) {
      query += `&versionId=${retentionOpts.versionId}`
    }

    const payload = builder.buildObject(params)

    headers['Content-MD5'] = toMd5(payload)
    this.makeRequest({method, bucketName, objectName, query, headers}, payload, [200, 204], '', false, cb)
  }

  getObjectRetention(bucketName: string, objectName: string, getOpts: { versionId: any }, cb: ((...args: any[]) => void) | ((arg0: Error | null, arg1: Buffer | undefined) => void)) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isObject(getOpts)) {
      throw new errors.InvalidArgumentError('callback should be of type "object"')
    } else if (getOpts.versionId && !isString(getOpts.versionId)) {
      throw new errors.InvalidArgumentError('VersionID should be of type "string"')
    }
    if (cb && !isFunction(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"')
    }
    const method = 'GET'
    let query = 'retention'
    if (getOpts.versionId) {
      query += `&versionId=${getOpts.versionId}`
    }

    this.makeRequest({method, bucketName, objectName, query}, '', [200], '', true, (e, response) => {
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


  setBucketEncryption(bucketName: string, encryptionConfig: { Rule: string | any[] } | null, cb: (err: Error | null, response?: Http.IncomingMessage | undefined) => void) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }

    if (isFunction(encryptionConfig)) {
      cb= encryptionConfig
      encryptionConfig = null
    }

    if (!_.isEmpty(encryptionConfig) && encryptionConfig.Rule.length >1) {
      throw new errors.InvalidArgumentError('Invalid Rule length. Only one rule is allowed.: ' + encryptionConfig.Rule)
    }
    if (cb && !isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    let encryptionObj =encryptionConfig
    if (_.isEmpty(encryptionConfig)) {
      encryptionObj={
      // Default MinIO Server Supported Rule
        Rule:[
          {
            ApplyServerSideEncryptionByDefault: {
              SSEAlgorithm:'AES256'
            }
          }
        ]

      }}

    const method = 'PUT'
    const query = 'encryption'
    const builder = new xml2js.Builder({rootName:'ServerSideEncryptionConfiguration', renderOpts:{'pretty':false}, headless:true})
    const payload = builder.buildObject(encryptionObj)

    const headers = {}
    headers['Content-MD5'] =toMd5(payload)

    this.makeRequest({method, bucketName, query, headers}, payload, [200], '', false, cb)
  }

  getBucketEncryption(bucketName: string, cb: ((...args: any[]) => void) | ((arg0: Error | null, arg1: Buffer | undefined) => void)) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isFunction(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"')
    }
    const method = 'GET'
    const query = 'encryption'

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
  removeBucketEncryption(bucketName: string, cb: (err: Error | null, response?: Http.IncomingMessage | undefined) => void) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isFunction(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"')
    }
    const method = 'DELETE'
    const query = 'encryption'

    this.makeRequest({method, bucketName, query}, '', [204], '', false, cb)
  }


  setBucketReplication(bucketName: string, replicationConfig={}, cb: (err: Error | null, response?: Http.IncomingMessage | undefined) => void) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isObject(replicationConfig)) {
      throw new errors.InvalidArgumentError('replicationConfig should be of type "object"')
    } else {
      if (_.isEmpty(replicationConfig.role)) {
        throw new errors.InvalidArgumentError('Role cannot be empty')
      } else if (replicationConfig.role && !isString(replicationConfig.role)) {
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
    const query = 'replication'
    const headers = {}

    const replicationParamsConfig = {
      ReplicationConfiguration: {
        Role: replicationConfig.role,
        Rule: replicationConfig.rules
      }
    }

    const builder = new xml2js.Builder({ renderOpts:{'pretty':false}, headless: true })

    const payload = builder.buildObject(replicationParamsConfig)

    headers['Content-MD5'] =toMd5(payload)

    this.makeRequest({method, bucketName, query, headers}, payload, [200], '', false, cb)
  }

  getBucketReplication(bucketName: string, cb: ((...args: any[]) => void) | ((arg0: Error | null, arg1: Buffer | undefined) => void)) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isFunction(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"')
    }
    const method = 'GET'
    const query = 'replication'

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

  removeBucketReplication(bucketName: string, cb: (err: Error | null, response?: Http.IncomingMessage | undefined) => void) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    const method = 'DELETE'
    const query='replication'
    this.makeRequest({method, bucketName, query}, '', [200, 204], '', false, cb)
  }


  getObjectLegalHold(bucketName: string, objectName: string, getOpts={}, cb: {}) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }

    if (isFunction(getOpts)) {
      cb= getOpts
      getOpts = {}
    }

    if (!isObject(getOpts)) {
      throw new TypeError('getOpts should be of type "Object"')
    } else if (Object.keys(getOpts).length> 0 && getOpts.versionId && !isString(getOpts.versionId)) {
      throw new TypeError('versionId should be of type string.:', getOpts.versionId )
    }


    if (!isFunction(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"')
    }

    const method = 'GET'
    let query = 'legal-hold'

    if (getOpts.versionId) {
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

  setObjectLegalHold(bucketName: string, objectName: string, setOpts={}, cb: (err: Error | null, response?: Http.IncomingMessage | undefined) => void) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }

    const defaultOpts = {
      status:LEGAL_HOLD_STATUS.ENABLED
    }
    if (isFunction(setOpts)) {
      cb= setOpts
      setOpts =defaultOpts
    }

    if (!isObject(setOpts)) {
      throw new TypeError('setOpts should be of type "Object"')
    } else {

      if (![LEGAL_HOLD_STATUS.ENABLED, LEGAL_HOLD_STATUS.DISABLED].includes(setOpts.status)) {
        throw new TypeError('Invalid status: '+setOpts.status )
      }
      if (setOpts.versionId && !setOpts.versionId.length) {
        throw new TypeError('versionId should be of type string.:'+ setOpts.versionId )
      }
    }

    if (!isFunction(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"')
    }

    if ( _.isEmpty(setOpts)) {
      setOpts={
        defaultOpts
      }
    }

    const method = 'PUT'
    let query = 'legal-hold'

    if (setOpts.versionId) {
      query +=`&versionId=${setOpts.versionId}`
    }

    const config={
      Status: setOpts.status
    }

    const builder = new xml2js.Builder({rootName:'LegalHold', renderOpts:{'pretty':false}, headless:true})
    const payload = builder.buildObject(config)
    const headers = {}
    headers['Content-MD5'] = toMd5(payload)

    this.makeRequest({method, bucketName, objectName, query, headers}, payload, [200], '', false, cb)
  }
  async setCredentialsProvider(credentialsProvider: any) {
    if (!(credentialsProvider instanceof CredentialProvider)) {
      throw new Error('Unable to get  credentials. Expected instance of CredentialProvider')
    }
    this.credentialsProvider = credentialsProvider
    await this.checkAndRefreshCreds()
  }

  async checkAndRefreshCreds() {
    if (this.credentialsProvider ) {
      return await this.fetchCredentials()
    }
  }

  async fetchCredentials() {
    if (this.credentialsProvider ) {
      const credentialsConf = await this.credentialsProvider.getCredentials()
      if (credentialsConf) {
        this.accessKey = credentialsConf.accessKey()
        this.secretKey = credentialsConf.secretKey()
        this.sessionToken = credentialsConf.sessionToken()
      } else {
        throw new Error('Unable to get  credentials. Expected instance of BaseCredentialsProvider')
      }
    } else {
      throw new Error('Unable to get  credentials. Expected instance of BaseCredentialsProvider')
    }
  }

  /**
     * Internal Method to abort a multipart upload request in case of any errors.
     * @param bucketName __string__ Bucket Name
     * @param objectName __string__ Object Name
     * @param uploadId __string__ id of a multipart upload to cancel during compose object sequence.
     * @param cb __function__ callback function
     */
  abortMultipartUpload(bucketName: any, objectName: any, uploadId: any, cb: (err: Error | null, response?: Http.IncomingMessage | undefined) => void) {
    const method = 'DELETE'
    const query =`uploadId=${uploadId}`

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
  uploadPartCopy (partConfig: { bucketName: any; objectName: any; uploadID: any; partNumber: any; headers: any }, cb: ((...args: any[]) => void) | ((arg0: Error | null, arg1: { etag: string; key: any; part: any } | undefined) => void)) {
    const {
      bucketName, objectName, uploadID, partNumber, headers
    } = partConfig

    const method = 'PUT'
    const query =`uploadId=${uploadID}&partNumber=${partNumber}`
    const requestOptions = { method, bucketName, objectName:objectName, query, headers }
    return this.makeRequest(requestOptions, '', [200], '', true, (e, response) => {
      let partCopyResult = Buffer.from('')
      if (e) return cb(e)
      pipesetup(response, transformers.uploadPartTransformer())
        .on('data', data => {
          partCopyResult = data
        })
        .on('error', cb)
        .on('end', () => {
          const uploadPartCopyRes = {
            etag:sanitizeETag(partCopyResult.ETag),
            key:objectName,
            part:partNumber
          }

          cb(null, uploadPartCopyRes)
        })
    }
    )
  }

  composeObject (destObjConfig={}, sourceObjList=[], cb: (arg0: any, arg1: null) => void) {
    const me = this // many async flows. so store the ref.
    const sourceFilesLength = sourceObjList.length

    if (!isArray(sourceObjList )) {
      throw new errors.InvalidArgumentError('sourceConfig should an array of CopySourceOptions ')
    }
    if (!(destObjConfig instanceof CopyDestinationOptions )) {
      throw new errors.InvalidArgumentError('destConfig should of type CopyDestinationOptions ')
    }

    if (sourceFilesLength < 1 || sourceFilesLength > PART_CONSTRAINTS.MAX_PARTS_COUNT) {
      throw new errors.InvalidArgumentError(`"There must be as least one and up to ${PART_CONSTRAINTS.MAX_PARTS_COUNT} source objects.`)
    }

    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    for (let i=0; i<sourceFilesLength; i++) {
      if (!sourceObjList[i].validate()) {
        return false
      }
    }

    if (!destObjConfig.validate()) {
      return false
    }

    const getStatOptions = (srcConfig: never) =>{
      let statOpts = {}
      if (!_.isEmpty(srcConfig.VersionID)) {
        statOpts= {
          versionId: srcConfig.VersionID
        }
      }
      return statOpts
    }
    const srcObjectSizes: any[]=[]
    let totalSize=0
    let totalParts=0

    const sourceObjStats = sourceObjList.map( (srcItem) => me.statObject(srcItem.Bucket, srcItem.Object, getStatOptions(srcItem)) )

    return Promise.all(sourceObjStats).then(srcObjectInfos =>{

      const validatedStats = srcObjectInfos.map( (resItemStat, index)=>{

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
          if (srcEnd >= srcCopySize || srcStart < 0 ) {
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
        if (totalParts > PART_CONSTRAINTS.MAX_PARTS_COUNT ) {
          throw new errors.InvalidArgumentError(`Your proposed compose object requires more than ${PART_CONSTRAINTS.MAX_PARTS_COUNT} parts`)
        }

        return resItemStat

      })

      if ((totalParts === 1 && totalSize <= PART_CONSTRAINTS.MAX_PART_SIZE) || (totalSize === 0)) {
        return this.copyObject( sourceObjList[0], destObjConfig, cb) // use copyObjectV2
      }

      // preserve etag to avoid modification of object while copying.
      for (let i=0; i<sourceFilesLength; i++) {
        sourceObjList[i].MatchETag = validatedStats[i].etag
      }

      const splitPartSizeList = validatedStats.map((resItemStat, idx)=>{
        const calSize = calculateEvenSplits(srcObjectSizes[idx], sourceObjList[idx])
        return calSize

      })

      function getUploadPartConfigList (uploadId: any) {
        const uploadPartConfigList: { bucketName: any; objectName: any; uploadID: any; partNumber: number; headers: any; sourceObj: string }[] = []

        splitPartSizeList.forEach((splitSize, splitIndex) => {

          const {
            startIndex: startIdx,
            endIndex: endIdx,
            objInfo: objConfig
          } = splitSize

          const partIndex = splitIndex + 1 // part index starts from 1.
          const totalUploads = Array.from(startIdx)

          const headers = sourceObjList[splitIndex].getHeaders()

          totalUploads.forEach((splitStart, upldCtrIdx) => {
            const splitEnd = endIdx[upldCtrIdx]

            const sourceObj = `${objConfig.Bucket}/${objConfig.Object}`
            headers['x-amz-copy-source'] = `${sourceObj}`
            headers['x-amz-copy-source-range'] = `bytes=${splitStart}-${splitEnd}`

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

      const performUploadParts = (uploadId: any) =>{

        const uploadList = getUploadPartConfigList(uploadId)

        async.map(uploadList, me.uploadPartCopy.bind(me), (err: any, res: any[])=>{
          if (err) {
            return this.abortMultipartUpload(destObjConfig.Bucket, destObjConfig.Object, uploadId, cb)
          }
          const partsDone = res.map((partCopy: { etag: any; part: any })=>({etag:partCopy.etag, part:partCopy.part}))
          return me.completeMultipartUpload(destObjConfig.Bucket, destObjConfig.Object, uploadId, partsDone, cb)
        })

      }

      const newUploadHeaders = destObjConfig.getHeaders()

      me.initiateNewMultipartUpload(destObjConfig.Bucket, destObjConfig.Object, newUploadHeaders, (err: any, uploadId: any)=>{
        if (err) {
          return cb(err, null)
        }
        performUploadParts(uploadId)
      })

    })
      .catch((error)=>{
        cb(error, null)
      })

  }
  selectObjectContent(bucketName: string, objectName: string, selectOpts={}, cb: ((...args: any[]) => void) | ((arg0: Error | null, arg1: undefined) => void)) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!_.isEmpty(selectOpts)) {

      if (!isString(selectOpts.expression)) {
        throw new TypeError('sqlExpression should be of type "string"')
      }
      if (!_.isEmpty(selectOpts.inputSerialization)) {
        if (!isObject(selectOpts.inputSerialization)) {
          throw new TypeError('inputSerialization should be of type "object"')
        }
      } else {
        throw new TypeError('inputSerialization is required')
      }
      if (!_.isEmpty(selectOpts.outputSerialization)) {
        if (!isObject(selectOpts.outputSerialization)) {
          throw new TypeError('outputSerialization should be of type "object"')
        }
      } else {
        throw new TypeError('outputSerialization is required')
      }

    } else {
      throw new TypeError('valid select configuration is required')
    }

    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    const method = 'POST'
    let query = 'select'
    query += '&select-type=2'

    const config = [
      {
        'Expression': selectOpts.expression
      },
      {
        'ExpressionType':selectOpts.expressionType || 'SQL'
      },
      {
        'InputSerialization': [selectOpts.inputSerialization]
      },
      {
        'OutputSerialization': [selectOpts.outputSerialization]
      }
    ]

    // Optional
    if (selectOpts.requestProgress) {
      config.push(
        {'RequestProgress':selectOpts.requestProgress}
      )
    }
    // Optional
    if (selectOpts.scanRange) {
      config.push(
        {'ScanRange': selectOpts.scanRange}

      )
    }


    const builder = new xml2js.Builder({rootName:'SelectObjectContentRequest', renderOpts:{'pretty':false}, headless:true})
    const payload = builder.buildObject(config)


    this.makeRequest({method, bucketName, objectName, query}, payload, [200], '', true, (e, response) => {
      if (e) return cb(e)

      let selectResult: SelectResults | undefined
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
    if (!this.clientExtensions)
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

export * from './notification'
export * from './helpers'
