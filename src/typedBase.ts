import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import type { IncomingMessage } from 'node:http'
import * as http from 'node:http'
import * as https from 'node:https'
import * as path from 'node:path'
import * as stream from 'node:stream'

import async from 'async'
import BlockStream2 from 'block-stream2'
import { isBrowser } from 'browser-or-node'
import _ from 'lodash'
import { mkdirp } from 'mkdirp'
import * as querystring from 'query-string'
import xml2js from 'xml2js'

import { asCallback, asCallbackFn } from './as-callback.ts'
import type { AnyFunction } from './assert.ts'
import {
  isBoolean,
  isDefined,
  isEmpty,
  isFunction,
  isNumber,
  isObject,
  isOptionalFunction,
  isReadableStream,
  isString,
} from './assert.ts'
import { fsp, streamPromise } from './async.ts'
import { CredentialProvider } from './CredentialProvider.ts'
import * as errors from './errors.ts'
import { S3Error } from './errors.ts'
import { extensions } from './extensions.ts'
import { DEFAULT_REGION } from './helpers.ts'
import {
  extractMetadata,
  getVersionId,
  insertContentType,
  isAmazonEndpoint,
  isValidBucketName,
  isValidEndpoint,
  isValidObjectName,
  isValidPort,
  isValidPrefix,
  isVirtualHostStyle,
  makeDateLong,
  pipesetup,
  prependXAMZMeta,
  readableStream,
  sanitizeETag,
  toSha256,
  uriEscape,
  uriResourceEscape,
} from './internal/helper.ts'
import type { Region } from './internal/s3-endpoints.ts'
import { getS3Endpoint } from './internal/s3-endpoints.ts'
import type { Binary, ObjectMetaData, ResponseHeader } from './internal/type.ts'
import { qs } from './qs.ts'
import { drainResponse, readAsBuffer, readAsString } from './response.ts'
import { signV4 } from './signing.ts'
import * as transformers from './transformers.ts'
import type {
  BucketItemFromList,
  BucketItemStat,
  GetObjectOpt,
  IRequest,
  MakeBucketOpt,
  NoResultCallback,
  RequestHeaders,
  ResultCallback,
  StatObjectOpts,
  UploadedObjectInfo,
} from './type.ts'
import type { Part } from './xml-parsers.ts'
import * as xmlParsers from './xml-parsers.ts'

const requestOptionProperties = [
  'agent',
  'ca',
  'cert',
  'ciphers',
  'clientCertEngine',
  'crl',
  'dhparam',
  'ecdhCurve',
  'family',
  'honorCipherOrder',
  'key',
  'passphrase',
  'pfx',
  'rejectUnauthorized',
  'secureOptions',
  'secureProtocol',
  'servername',
  'sessionIdContext',
] as const

export interface ClientOptions {
  endPoint: string
  accessKey: string
  secretKey: string
  useSSL?: boolean
  port?: number
  region?: Region
  transport?: typeof http | typeof https
  sessionToken?: string
  partSize?: number
  pathStyle?: boolean
  credentialsProvider?: CredentialProvider
  s3AccelerateEndpoint?: string
  transportAgent?: http.Agent
}

// will be replaced by rollup plugin
const version = process.env.MINIO_JS_PACKAGE_VERSION || 'development'
const Package = { version }

export type RequestMethod = 'HEAD' | 'GET' | 'POST' | 'DELETE' | 'PUT'
export type RequestOption = Partial<IRequest> & {
  method: RequestMethod
  bucketName?: string
  objectName?: string
  region?: string
  query?: string
  pathStyle?: boolean
}

/**
 * @internal
 */
export function findCallback<A extends unknown[], T extends AnyFunction>(args: unknown[]): [A, T | undefined] {
  const index = args.findIndex((v) => isFunction(v))
  if (index === -1) {
    return [args as A, undefined]
  }

  return [args.slice(0, index) as A, args[index] as T]
}

export class TypedBase {
  protected transport: typeof http | typeof https
  protected host: string
  protected port: number
  protected protocol: string
  protected accessKey: string
  protected secretKey: string
  protected sessionToken?: string
  protected userAgent: string
  protected anonymous: boolean
  protected pathStyle: boolean
  protected regionMap: Record<string, string>
  public region?: string
  protected credentialsProvider?: CredentialProvider
  partSize: number = 64 * 1024 * 1024
  protected overRidePartSize?: boolean

  protected maximumPartSize = 5 * 1024 * 1024 * 1024
  maxObjectSize = 5 * 1024 * 1024 * 1024 * 1024
  public enableSHA256: boolean
  protected s3AccelerateEndpoint?: string
  protected reqOptions: Record<string, unknown>

  private readonly clientExtensions: extensions
  private logStream?: stream.Writable
  private transportAgent: http.Agent

  constructor(params: ClientOptions) {
    // @ts-expect-error deprecated property
    if (params.secure !== undefined) {
      throw new Error('"secure" option deprecated, "useSSL" should be used instead')
    }
    // Default values if not specified.
    if (params.useSSL === undefined) {
      params.useSSL = true
    }
    if (!params.port) {
      params.port = 0
    }
    // Validate input params.
    if (!isValidEndpoint(params.endPoint)) {
      throw new errors.InvalidEndpointError(`Invalid endPoint : ${params.endPoint}`)
    }
    if (!isValidPort(params.port)) {
      throw new errors.InvalidArgumentError(`Invalid port : ${params.port}`)
    }
    if (!isBoolean(params.useSSL)) {
      throw new errors.InvalidArgumentError(
        `Invalid useSSL flag type : ${params.useSSL}, expected to be of type "boolean"`,
      )
    }

    // Validate region only if its set.
    if (params.region) {
      if (!isString(params.region)) {
        throw new errors.InvalidArgumentError(`Invalid region : ${params.region}`)
      }
    }

    const host = params.endPoint.toLowerCase()
    let port = params.port
    let protocol: string
    let transport
    let transportAgent: http.Agent
    // Validate if configuration is not using SSL
    // for constructing relevant endpoints.
    if (params.useSSL) {
      // Defaults to secure.
      transport = https
      protocol = 'https:'
      port = port || 443
      transportAgent = https.globalAgent
    } else {
      transport = http
      protocol = 'http:'
      port = port || 80
      transportAgent = http.globalAgent
    }

    // if custom transport is set, use it.
    if (params.transport) {
      if (!isObject(params.transport)) {
        throw new errors.InvalidArgumentError(
          `Invalid transport type : ${params.transport}, expected to be type "object"`,
        )
      }
      transport = params.transport
    }

    // if custom transport agent is set, use it.
    if (params.transportAgent) {
      if (!isObject(params.transportAgent)) {
        throw new errors.InvalidArgumentError(
          `Invalid transportAgent type: ${params.transportAgent}, expected to be type "object"`,
        )
      }

      transportAgent = params.transportAgent
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
    this.transportAgent = transportAgent
    this.host = host
    this.port = port
    this.protocol = protocol
    this.userAgent = `${libraryAgent}`

    // Default path style is true
    if (params.pathStyle === undefined) {
      this.pathStyle = true
    } else {
      this.pathStyle = params.pathStyle
    }

    this.accessKey = params.accessKey ?? ''
    this.secretKey = params.secretKey ?? ''
    this.sessionToken = params.sessionToken
    this.anonymous = !this.accessKey || !this.secretKey

    if (params.credentialsProvider) {
      this.credentialsProvider = params.credentialsProvider
      void this.checkAndRefreshCreds()
    }

    this.regionMap = {}
    if (params.region) {
      this.region = params.region
    }

    if (params.partSize) {
      this.partSize = params.partSize
      this.overRidePartSize = true
    }
    if (this.partSize < 5 * 1024 * 1024) {
      throw new errors.InvalidArgumentError(`Part size should be greater than 5MB`)
    }
    if (this.partSize > 5 * 1024 * 1024 * 1024) {
      throw new errors.InvalidArgumentError(`Part size should be less than 5GB`)
    }

    // SHA256 is enabled only for authenticated http requests. If the request is authenticated
    // and the connection is https we use x-amz-content-sha256=UNSIGNED-PAYLOAD
    // header for signature calculation.
    this.enableSHA256 = !this.anonymous && !params.useSSL

    this.s3AccelerateEndpoint = params.s3AccelerateEndpoint || undefined
    this.reqOptions = {}

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    this.clientExtensions = new extensions(this)
  }

  /**
   *  This is s3 Specific and does not hold validity in any other Object storage.
   */
  private getAccelerateEndPointIfSet(bucketName: string, objectName?: string) {
    if (!isEmpty(this.s3AccelerateEndpoint) && !isEmpty(bucketName) && !isEmpty(objectName)) {
      // http://docs.aws.amazon.com/AmazonS3/latest/dev/transfer-acceleration.html
      // Disable transfer acceleration for non-compliant bucket names.
      if (bucketName.includes('.')) {
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
   * @param endPoint - valid S3 acceleration end point
   */
  public setS3TransferAccelerate(endPoint: string) {
    this.s3AccelerateEndpoint = endPoint
  }

  /**
   * Sets the supported request options.
   */
  public setRequestOptions(options: Pick<https.RequestOptions, (typeof requestOptionProperties)[number]>) {
    // TODO: add options type details
    if (!isObject(options)) {
      throw new TypeError('request options should be of type "object"')
    }
    this.reqOptions = _.pick(options, requestOptionProperties)
  }

  /**
   * returns options object that can be used with http.request()
   * Takes care of constructing virtual-host-style or path-style hostname
   */
  protected getRequestOptions(opts: RequestOption): IRequest & { host: string; headers: Record<string, string> } {
    const method = opts.method
    const region = opts.region
    const bucketName = opts.bucketName
    let objectName = opts.objectName
    const headers = opts.headers
    const query = opts.query

    let reqOptions = {
      method,
      headers: {} as RequestHeaders,
      protocol: this.protocol,
      // If custom transportAgent was supplied earlier, we'll inject it here
      agent: this.transportAgent,
    }

    // Verify if virtual host supported.
    let virtualHostStyle
    if (bucketName) {
      virtualHostStyle = isVirtualHostStyle(this.host, this.protocol, bucketName, this.pathStyle)
    }

    let path = '/'
    let host = this.host

    let port: undefined | number
    if (this.port) {
      port = this.port
    }

    if (objectName) {
      objectName = `${uriResourceEscape(objectName)}`
    }

    // For Amazon S3 endpoint, get endpoint based on region.
    if (isAmazonEndpoint(host)) {
      const accelerateEndPoint = this.getAccelerateEndPointIfSet(bucketName!, objectName)
      if (accelerateEndPoint) {
        host = `${accelerateEndPoint}`
      } else {
        host = getS3Endpoint(region!)
      }
    }

    if (virtualHostStyle && !opts.pathStyle) {
      // For all hosts which support virtual host style, `bucketName`
      // is part of the hostname in the following format:
      //
      //  var host = 'bucketName.example.com'
      //
      if (bucketName) {
        host = `${bucketName}.${host}`
      }
      if (objectName) {
        path = `/${objectName}`
      }
    } else {
      // For all S3 compatible storage services we will fallback to
      // path style requests, where `bucketName` is part of the URI
      // path.
      if (bucketName) {
        path = `/${bucketName}`
      }
      if (objectName) {
        path = `/${bucketName}/${objectName}`
      }
    }

    if (query) {
      path += `?${query}`
    }
    reqOptions.headers.host = host
    if ((reqOptions.protocol === 'http:' && port !== 80) || (reqOptions.protocol === 'https:' && port !== 443)) {
      reqOptions.headers.host = `${host}:${port}`
    }
    reqOptions.headers['user-agent'] = this.userAgent
    if (headers) {
      // have all header keys in lower case - to make signing easy
      for (const [k, v] of Object.entries(headers)) {
        reqOptions.headers[k.toLowerCase()] = v
      }
    }

    // Use any request option specified in minioClient.setRequestOptions()
    reqOptions = Object.assign({}, this.reqOptions, reqOptions)

    return {
      ...reqOptions,
      headers: _.mapValues(_.pickBy(reqOptions.headers, isDefined), (v) => v.toString()),
      host,
      port,
      path,
    } satisfies https.RequestOptions
  }

  /**
   * Set application specific information.
   *
   * Generates User-Agent in the following style.
   *
   *    MinIO (OS; ARCH) LIB/VER APP/VER
   *
   * @param appName - Application name.
   * @param appVersion - Application version.
   */
  public setAppInfo(appName: string, appVersion: string) {
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

  /**
   * Calculate part size given the object size. Part size will be at least this.partSize
   *
   * @param size - total size
   *
   * @internal
   */
  public calculatePartSize(size: number) {
    if (!isNumber(size)) {
      throw new TypeError('size should be of type "number"')
    }
    if (size > this.maxObjectSize) {
      throw new TypeError(`size should not be more than ${this.maxObjectSize}`)
    }
    if (this.overRidePartSize) {
      return this.partSize
    }
    let partSize = this.partSize
    for (;;) {
      // while(true) {...} throws linting error.
      // If partSize is big enough to accomodate the object size, then use it.
      if (partSize * 10000 > size) {
        return partSize
      }
      // Try part sizes as 64MB, 80MB, 96MB etc.
      partSize += 16 * 1024 * 1024
    }
  }

  /**
   * log the request, response, error
   */
  private logHTTP(reqOptions: IRequest, response: http.IncomingMessage | null, err?: unknown) {
    // if no logStream available return.
    if (!this.logStream) {
      return
    }
    if (!isObject(reqOptions)) {
      throw new TypeError('reqOptions should be of type "object"')
    }
    if (response && !isReadableStream(response)) {
      throw new TypeError('response should be of type "Stream"')
    }
    if (err && !(err instanceof Error)) {
      throw new TypeError('err should be of type "Error"')
    }
    const logStream = this.logStream
    const logHeaders = (headers: RequestHeaders) => {
      Object.entries(headers).forEach(([k, v]) => {
        if (k == 'authorization') {
          if (isString(v)) {
            const redactor = new RegExp('Signature=([0-9a-f]+)')
            v = v.replace(redactor, 'Signature=**REDACTED**')
          }
        }
        logStream.write(`${k}: ${v}\n`)
      })
      logStream.write('\n')
    }
    logStream.write(`REQUEST: ${reqOptions.method} ${reqOptions.path}\n`)
    logHeaders(reqOptions.headers)
    if (response) {
      this.logStream.write(`RESPONSE: ${response.statusCode}\n`)
      logHeaders(response.headers as RequestHeaders)
    }
    if (err) {
      logStream.write('ERROR BODY:\n')
      const errJSON = JSON.stringify(err, null, '\t')
      logStream.write(`${errJSON}\n`)
    }
  }

  /**
   * Enable tracing
   */
  public traceOn(stream?: stream.Writable) {
    if (!stream) {
      stream = process.stdout
    }
    this.logStream = stream
  }

  /**
   * Disable tracing
   */
  public traceOff() {
    this.logStream = undefined
  }

  /**
   * makeRequest is the primitive used by the apis for making S3 requests.
   * payload can be empty string in case of no payload.
   * statusCode is the expected statusCode. If response.statusCode does not match
   * we parse the XML error and call the callback with the error message.
   *
   * A valid region is passed by the calls - listBuckets, makeBucket and getBucketRegion.
   *
   * @internal
   */
  makeRequestAsync(
    options: RequestOption,
    payload: Binary = '',
    expectedCodes: number[] = [200],
    region = '',
    returnResponse = true,
  ): Promise<IncomingMessage> {
    if (!isObject(options)) {
      throw new TypeError('options should be of type "object"')
    }
    if (!isString(payload) && !isObject(payload)) {
      // Buffer is of type 'object'
      throw new TypeError('payload should be of type "string" or "Buffer"')
    }
    expectedCodes.forEach((statusCode) => {
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
    if (!options.headers) {
      options.headers = {}
    }
    if (options.method === 'POST' || options.method === 'PUT' || options.method === 'DELETE') {
      options.headers['content-length'] = payload.length.toString()
    }

    const sha256sum = this.enableSHA256 ? toSha256(payload) : ''
    const stream = readableStream(payload)
    return this.makeRequestStreamAsync(options, stream, sha256sum, expectedCodes, region, returnResponse)
  }

  /**
   * new request with promise
   *
   * No need to drain response, response body is not valid
   */
  async makeRequestAsyncOmit(
    options: RequestOption,
    payload: Binary = '',
    statusCodes: number[] = [200],
    region = '',
  ): Promise<Omit<IncomingMessage, 'on'>> {
    return await this.makeRequestAsync(options, payload, statusCodes, region, false)
  }

  /**
   * makeRequestStream will be used directly instead of makeRequest in case the payload
   * is available as a stream. for ex. putObject
   *
   * @internal
   */
  async makeRequestStreamAsync(
    options: RequestOption,
    stream: stream.Readable | Buffer,
    sha256sum: string,
    statusCodes: number[] = [200],
    region = '',
    returnResponse = true,
  ) {
    if (!isObject(options)) {
      throw new TypeError('options should be of type "object"')
    }
    if (!(Buffer.isBuffer(stream) || isReadableStream(stream))) {
      throw new errors.InvalidArgumentError('stream should be a Buffer or readable Stream')
    }
    if (!isString(sha256sum)) {
      throw new TypeError('sha256sum should be of type "string"')
    }
    statusCodes.forEach((statusCode) => {
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

    // sha256sum will be empty for anonymous or https requests
    if (!this.enableSHA256 && sha256sum.length !== 0) {
      throw new errors.InvalidArgumentError(`sha256sum expected to be empty for anonymous or https requests`)
    }
    // sha256sum should be valid for non-anonymous http requests.
    if (this.enableSHA256 && sha256sum.length !== 64) {
      throw new errors.InvalidArgumentError(`Invalid sha256sum : ${sha256sum}`)
    }

    const regionPromise = region ? Promise.resolve(region) : this.getBucketRegionAsync(options.bucketName!)

    void this.checkAndRefreshCreds()

    return regionPromise.then(
      (finalRegion) =>
        new Promise<http.IncomingMessage>((resolve, reject) => {
          options.region = finalRegion
          const reqOptions = this.getRequestOptions(options)
          if (!this.anonymous) {
            // For non-anonymous https requests sha256sum is 'UNSIGNED-PAYLOAD' for signature calculation.
            if (!this.enableSHA256) {
              sha256sum = 'UNSIGNED-PAYLOAD'
            }

            const date = new Date()

            reqOptions.headers['x-amz-date'] = makeDateLong(date)
            reqOptions.headers['x-amz-content-sha256'] = sha256sum
            if (this.sessionToken) {
              reqOptions.headers['x-amz-security-token'] = this.sessionToken
            }

            reqOptions.headers.authorization = signV4(reqOptions, this.accessKey, this.secretKey, finalRegion, date)
          }

          const req = this.transport.request(reqOptions, (response) => {
            if (!response.statusCode) {
              return reject(new Error("BUG: response doesn't have a statusCode"))
            }

            if (!statusCodes.includes(response.statusCode)) {
              // For an incorrect region, S3 server always sends back 400.
              // But we will do cache invalidation for all errors so that,
              // in future, if AWS S3 decides to send a different status code or
              // XML error code we will still work fine.
              delete this.regionMap[options.bucketName!]
              // @ts-expect-error looks like `getErrorTransformer` want a `http.ServerResponse`,
              // but we only have a http.IncomingMessage here
              const errorTransformer = transformers.getErrorTransformer(response)
              pipesetup(response, errorTransformer).on('error', (e) => {
                this.logHTTP(reqOptions, response, e)
                reject(e)
              })
              return
            }
            this.logHTTP(reqOptions, response)
            if (returnResponse) {
              return resolve(response)
            }
            // We drain the socket so that the connection gets closed. Note that this
            // is not expensive as the socket will not have any data.
            drainResponse(response).then(() => resolve(response), reject)
          })

          req.on('error', (e) => {
            this.logHTTP(reqOptions, null, e)
            reject(e)
          })

          if (Buffer.isBuffer(stream)) {
            req.end(stream)
          } else {
            pipesetup(stream, req)
          }
        }),
    )
  }

  /// Bucket operations

  /**
   * Creates the bucket `bucketName`.
   *
   * @param bucketName - Name of the bucket
   * @param region - region, see ts types for valid values, or use empty string.
   * @param makeOpts - Options to create a bucket.
   * @param callback? - if no callback. will return a promise.
   */
  makeBucket(bucketName: string, region: Region, makeOpts: MakeBucketOpt, callback: NoResultCallback): void
  makeBucket(bucketName: string, region: Region, callback: NoResultCallback): void
  makeBucket(bucketName: string, callback: NoResultCallback): void
  makeBucket(bucketName: string, region?: Region, makeOpts?: MakeBucketOpt): Promise<void>

  // there is also a deprecated Backward Compatibility sign
  // makeBucket(bucketName: string, makeOpts: MakeBucketOpt, callback: NoResultCallback): void

  makeBucket(
    bucketName: string,
    regionOrCallback?: string | NoResultCallback | MakeBucketOpt, // MakeBucketOpt as second params is deprecated
    makeOptsOrCallback?: MakeBucketOpt | NoResultCallback,
    callback?: NoResultCallback,
  ): void | Promise<void> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`)
    }

    let [[region = '', makeOpts = {}], cb] = findCallback<
      [string, MakeBucketOpt] | [MakeBucketOpt, string],
      NoResultCallback
    >([regionOrCallback, makeOptsOrCallback, callback])
    if (isObject(region)) {
      // Backward Compatibility
      // makeBucket(bucketName: string, makeOpts: MakeBucketOpt, callback: NoResultCallback): void
      makeOpts = region
      region = ''
    }

    if (!isString(region)) {
      throw new TypeError('region should be of type "string"')
    }
    if (!isObject(makeOpts)) {
      throw new TypeError('makeOpts should be of type "object"')
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
      const builder = new xml2js.Builder({})

      payload = builder.buildObject({
        CreateBucketConfiguration: {
          $: {
            xmlns: 'http://s3.amazonaws.com/doc/2006-03-01/',
          },
          LocationConstraint: region,
        },
      })
    }
    const method = 'PUT'
    const headers: RequestHeaders = {}
    if (makeOpts.ObjectLocking) {
      headers['x-amz-bucket-object-lock-enabled'] = true
    }
    if (!region) {
      region = DEFAULT_REGION
    }
    const finalRegion = region // type narrow
    const requestOpt: RequestOption = { method, bucketName, headers }
    return asCallbackFn(cb, async () => {
      try {
        await this.makeRequestAsyncOmit(requestOpt, payload, [200], finalRegion)
      } catch (err: unknown) {
        if (region === '' || region === DEFAULT_REGION) {
          if (err instanceof S3Error) {
            const errCode = err.code
            const errRegion = err.region
            if (errCode === 'AuthorizationHeaderMalformed' && errRegion !== '') {
              // Retry with region returned as part of error
              await this.makeRequestAsyncOmit(requestOpt, payload, [200], errCode)
            }
          }
        }
        throw err
      }
    })
  }

  /**
   * List of buckets created.
   */
  listBuckets(): Promise<BucketItemFromList[]>
  listBuckets(callback: ResultCallback<BucketItemFromList[]>): void
  listBuckets(cb?: ResultCallback<BucketItemFromList[]>): void | Promise<BucketItemFromList[]> {
    const method = 'GET'
    return asCallbackFn(cb, async () => {
      const response = await this.makeRequestAsync({ method }, '', [200], DEFAULT_REGION)
      const body = await readAsBuffer(response)
      return xmlParsers.parseListBucket(body.toString())
    })
  }

  listIncompleteUploads(bucket: string, prefix: string, recursive: boolean): stream.Readable {
    if (prefix === undefined) {
      prefix = ''
    }
    if (recursive === undefined) {
      recursive = false
    }
    if (!isValidBucketName(bucket)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucket)
    }
    if (!isValidPrefix(prefix)) {
      throw new errors.InvalidPrefixError(`Invalid prefix : ${prefix}`)
    }
    if (!isBoolean(recursive)) {
      throw new TypeError('recursive should be of type "boolean"')
    }
    const delimiter = recursive ? '' : '/'
    let keyMarker = ''
    let uploadIdMarker = ''
    const uploads: unknown[] = []
    let ended = false
    const readStream = new stream.Readable({ objectMode: true })
    readStream._read = () => {
      // push one upload info per _read()
      if (uploads.length) {
        return readStream.push(uploads.shift())
      }
      if (ended) {
        return readStream.push(null)
      }
      this.listIncompleteUploadsQuery(bucket, prefix, keyMarker, uploadIdMarker, delimiter)
        .on('error', (e) => readStream.emit('error', e))
        .on('data', (result) => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          result.prefixes.forEach((prefix) => uploads.push(prefix))
          async.eachSeries(
            result.uploads,
            (upload, cb) => {
              // for each incomplete upload add the sizes of its uploaded parts
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore
              this.listParts(bucket, upload.key, upload.uploadId).then(
                (parts: any) => {
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-ignore
                  upload.size = parts.reduce((acc, item) => acc + item.size, 0)
                  uploads.push(upload)
                  cb()
                },
                (err: any) => cb(err),
              )
            },
            (err) => {
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

              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore
              readStream._read()
            },
          )
        })
    }
    return readStream
  }

  /**
   * Remove a bucket.
   *
   * @param bucketName - name of the bucket
   */
  bucketExists(bucketName: string, callback: ResultCallback<boolean>): void
  bucketExists(bucketName: string): Promise<boolean>

  // * `callback(err)` _function_ : `err` is `null` if the bucket exists
  bucketExists(bucketName: string, cb?: ResultCallback<boolean>): void | Promise<boolean> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    const method = 'HEAD'

    return asCallbackFn(cb, async () => {
      try {
        await this.makeRequestAsyncOmit({ method, bucketName }, '', [200], '')
      } catch (err) {
        if (err instanceof S3Error) {
          if (err.code == 'NoSuchBucket' || err.code == 'NotFound') {
            return false
          }
        }

        throw err
      }

      return true
    })
  }

  /**
   * Remove a bucket
   *
   * @param bucketName - name of the bucket
   * @param callback
   */
  removeBucket(bucketName: string, callback: NoResultCallback): void
  removeBucket(bucketName: string): Promise<void>

  // * `callback(err)` _function_ : `err` is `null` if the bucket is removed successfully.
  removeBucket(bucketName: string, cb?: NoResultCallback): void | Promise<void> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }

    const method = 'DELETE'
    return asCallbackFn(cb, async () => {
      await this.makeRequestAsyncOmit({ method, bucketName }, '', [204], '')
      delete this.regionMap[bucketName]
    })
  }

  /**
   * Remove the partially uploaded object.
   *
   * @param bucketName - name of the bucket
   * @param objectName -  name of the object
   * @param callback - callback function is called with non `null` value in case of error
   */
  removeIncompleteUpload(bucketName: string, objectName: string, callback: NoResultCallback): void
  removeIncompleteUpload(bucketName: string, objectName: string): Promise<void>

  removeIncompleteUpload(bucketName: string, objectName: string, cb?: NoResultCallback): void | Promise<void> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.IsValidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isOptionalFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    return asCallbackFn(cb, async () => {
      const uploadId = await this.findUploadId(bucketName, objectName)
      if (!uploadId) {
        return
      }
      const method = 'DELETE'
      const query = `uploadId=${uploadId}`
      await this.makeRequestAsync(
        {
          method,
          bucketName,
          objectName,
          query,
        },
        '',
        [204],
        '',
        false,
      )
    })
  }

  fGetObject(bucketName: string, objectName: string, filePath: string, callback: NoResultCallback): void
  fGetObject(
    bucketName: string,
    objectName: string,
    filePath: string,
    getOpts: GetObjectOpt,
    callback: NoResultCallback,
  ): void
  /**
   * Callback is called with `error` in case of error or `null` in case of success
   *
   * @param bucketName - name of the bucket
   * @param objectName - name of the object
   * @param filePath - path to which the object data will be written to
   * @param getOpts? - Optional object get option
   */
  fGetObject(bucketName: string, objectName: string, filePath: string, getOpts?: GetObjectOpt): Promise<void>

  fGetObject(
    bucketName: string,
    objectName: string,
    filePath: string,
    getOptsOrCallback?: GetObjectOpt | NoResultCallback,
    callback?: NoResultCallback,
  ) {
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

    const [[getOpts = {}], cb] = findCallback<[GetObjectOpt], NoResultCallback>([getOptsOrCallback, callback])

    if (!isOptionalFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    const executor = async (): Promise<string> => {
      let partFileStream: stream.Writable
      const objStat = await this.statObject(bucketName, objectName, getOpts)
      const partFile = `${filePath}.${objStat.etag}.part.minio`

      await mkdirp(path.dirname(filePath))

      let offset = 0
      try {
        const stats = await fsp.stat(partFile)
        if (objStat.size === stats.size) {
          return partFile
        }
        offset = stats.size
        partFileStream = fs.createWriteStream(partFile, { flags: 'a' })
      } catch (e) {
        if (e instanceof Error && (e as unknown as { code: string }).code === 'ENOENT') {
          // file not exist
          partFileStream = fs.createWriteStream(partFile, { flags: 'w' })
        } else {
          // other error, maybe access deny
          throw e
        }
      }

      const downloadStream = await this.getPartialObject(bucketName, objectName, offset, 0, getOpts)

      await streamPromise.pipeline(downloadStream, partFileStream)
      const stats = await fsp.stat(partFile)
      if (stats.size === objStat.size) {
        return partFile
      }

      throw new Error('Size mismatch between downloaded file and the object')
    }

    return asCallback(
      cb,
      executor().then((partFile) => fsp.rename(partFile, filePath)),
    )
  }

  getObject(
    bucketName: string,
    objectName: string,
    getOpts: GetObjectOpt,
    callback: ResultCallback<stream.Readable>,
  ): void
  getObject(bucketName: string, objectName: string, callback: ResultCallback<stream.Readable>): void

  /**
   * Get Objects. return a readable stream of the object content by callback or promise.
   *
   * @param bucketName - name of the bucket
   * @param objectName - name of the object
   * @param getOpts
   */
  getObject(bucketName: string, objectName: string, getOpts?: GetObjectOpt): Promise<stream.Readable>

  getObject(
    bucketName: string,
    objectName: string,
    getOpts_Callback?: GetObjectOpt | ResultCallback<stream.Readable>, // getOpts
    callback?: ResultCallback<stream.Readable>, // callback
  ): void | Promise<stream.Readable> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }

    const [[getOpts = {}], cb] = findCallback<[GetObjectOpt], ResultCallback<stream.Readable>>([
      getOpts_Callback,
      callback,
    ])

    return asCallback(cb, this.getPartialObject(bucketName, objectName, 0, 0, getOpts))
  }

  /**
   * Callback is called with readable stream of the partial object content.
   */
  getPartialObject(
    bucketName: string,
    objectName: string,
    offset: number,
    length?: number,
    getOpts?: GetObjectOpt,
  ): Promise<stream.Readable>

  getPartialObject(
    bucketName: string,
    objectName: string,
    offset: number,
    callback: ResultCallback<stream.Readable>,
  ): void
  getPartialObject(
    bucketName: string,
    objectName: string,
    offset: number,
    length: number,
    callback: ResultCallback<stream.Readable>,
  ): void
  getPartialObject(
    bucketName: string,
    objectName: string,
    offset: number,
    length: number,
    getOpts: GetObjectOpt,
    callback: ResultCallback<stream.Readable>,
  ): void

  getPartialObject(
    bucketName: string,
    objectName: string,
    offset: number,
    length_callback?: number | ResultCallback<stream.Readable>, // length
    getOpts_callback?: GetObjectOpt | ResultCallback<stream.Readable>, // get opt
    callback?: ResultCallback<stream.Readable>, // callback
  ): void | Promise<stream.Readable> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isNumber(offset)) {
      throw new TypeError('offset should be of type "number"')
    }

    const [[length = 0, getOpts = {}], cb] = findCallback<[number, GetObjectOpt], ResultCallback<stream.Readable>>([
      length_callback,
      getOpts_callback,
      callback,
    ])

    if (!isNumber(length)) {
      throw new TypeError(`length should be of type "number"`)
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
        range += `${+length + offset - 1}`
      }
    }

    const headers: RequestHeaders = {}
    if (range !== '') {
      headers.range = range
    }

    const expectedStatusCodes = [200]
    if (range) {
      expectedStatusCodes.push(206)
    }

    const method = 'GET'
    const query = qs(getOpts)
    return asCallback(
      cb,
      this.makeRequestAsync({ method, bucketName, objectName, headers, query }, '', expectedStatusCodes),
    )
  }

  /**
   * Uploads the object.
   *
   * Uploading a stream
   * __Arguments__
   * * `bucketName` _string_: name of the bucket
   * * `objectName` _string_: name of the object
   * * `stream` _Stream_: Readable stream
   * * `size` _number_: size of the object (optional)
   * * `callback(err, etag)` _function_: non null `err` indicates error, `etag` _string_ is the etag of the object uploaded.
   *
   * Uploading "Buffer" or "string"
   * __Arguments__
   * * `bucketName` _string_: name of the bucket
   * * `objectName` _string_: name of the object
   * * `string or Buffer` _string_ or _Buffer_: string or buffer
   * * `callback(err, objInfo)` _function_: `err` is `null` in case of success and `info` will have the following object details:
   *   * `etag` _string_: etag of the object
   * * `callback(err, objInfo)` _function_: non null `err` indicates error, `objInfo` _object_ which contains versionId and etag.
   */
  fPutObject(
    bucketName: string,
    objectName: string,
    filePath: string,
    metaDataOrCallback?: ObjectMetaData,
    maybeCallback?: NoResultCallback,
  ) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }

    if (!isString(filePath)) {
      throw new TypeError('filePath should be of type "string"')
    }

    let [[metaData = {}], callback] = findCallback<[ObjectMetaData], NoResultCallback>([
      metaDataOrCallback,
      maybeCallback,
    ])

    if (!isObject(metaData)) {
      throw new TypeError('metaData should be of type "object"')
    }

    // Inserts correct `content-type` attribute based on metaData and filePath
    metaData = insertContentType(metaData, filePath)

    // Updates metaData to have the correct prefix if needed
    metaData = prependXAMZMeta(metaData)
    const apiCallback = callback

    type Part = {
      part: number
      etag: string
    }

    const executor = async (fd: number) => {
      const stats = await fsp.fstat(fd)
      const fileSize = stats.size
      if (fileSize > this.maxObjectSize) {
        throw new Error(`${filePath} size : ${stats.size}, max allowed size: 5TB`)
      }

      if (fileSize <= this.partSize) {
        // simple PUT request, no multipart
        const uploader = this.getUploader(bucketName, objectName, metaData, false)
        const buf = await fsp.readfile(fd)
        const { md5sum, sha256sum } = transformers.hashBinary(buf, this.enableSHA256)
        return await uploader(buf, fileSize, sha256sum, md5sum)
      }

      const previousUploadId = await this.findUploadId(bucketName, objectName)
      let eTags: Part[] = []
      // if there was a previous incomplete upload, fetch all its uploaded parts info
      let uploadId: string
      if (previousUploadId) {
        eTags = await this.listParts(bucketName, objectName, previousUploadId)
        uploadId = previousUploadId
      } else {
        // there was no previous upload, initiate a new one
        uploadId = await this.initiateNewMultipartUpload(bucketName, objectName, metaData)
      }

      {
        const partSize = this.calculatePartSize(fileSize)
        const uploader = this.getUploader(bucketName, objectName, metaData, true)
        // convert array to object to make things easy
        const parts = eTags.reduce(function (acc, item) {
          if (!acc[item.part]) {
            acc[item.part] = item
          }
          return acc
        }, {} as Record<number, Part>)
        const partsDone: { part: number; etag: string }[] = []
        let partNumber = 1
        let uploadedSize = 0

        // will be reused for hashing and uploading
        // don't worry it's "unsafe", we will read data from fs to fill it
        const buf = Buffer.allocUnsafe(this.partSize)
        while (uploadedSize < fileSize) {
          const part = parts[partNumber]
          let length = partSize
          if (length > fileSize - uploadedSize) {
            length = fileSize - uploadedSize
          }

          await fsp.read(fd, buf, 0, length, 0)
          const { md5sum, sha256sum } = transformers.hashBinary(buf.subarray(0, length), this.enableSHA256)

          const md5sumHex = Buffer.from(md5sum, 'base64').toString('hex')

          if (part && md5sumHex === part.etag) {
            // md5 matches, chunk already uploaded
            partsDone.push({ part: partNumber, etag: part.etag })
            partNumber++
            uploadedSize += length
            continue
          }

          const objInfo = await uploader(uploadId, partNumber, buf.subarray(0, length), length, sha256sum, md5sum)
          partsDone.push({ part: partNumber, etag: objInfo.etag })
          partNumber++
          uploadedSize += length
        }
        eTags = partsDone
      }

      // at last, finish uploading
      return this.completeMultipartUpload(bucketName, objectName, uploadId, eTags)
    }

    const ensureFileClose = async <T>(executor: (fd: number) => Promise<T>) => {
      let fd
      try {
        fd = await fsp.open(filePath, 'r')
      } catch (e) {
        throw new Error(`failed to open file ${filePath}: err ${e}`, { cause: e })
      }

      try {
        // make sure to keep await, otherwise file will be closed early.
        return await executor(fd)
      } finally {
        await fsp.fclose(fd)
      }
    }

    return asCallback(apiCallback, ensureFileClose(executor))
  }

  // ====================================================== //
  // ====================================================== //
  // ====================================================== //
  // ====================================================== //
  // ====================================================== //
  // ====================================================== //
  // ====================================================== //
  // ====================================================== //
  /* eslint-disable @typescript-eslint/ban-ts-comment */

  completeMultipartUpload(
    bucketName: string,
    objectName: string,
    uploadId: string,
    etags: {
      part: number
      etag?: string
    }[],
  ): Promise<{ etag: string; versionId: string | null }>

  completeMultipartUpload(
    bucketName: string,
    objectName: string,
    uploadId: string,
    etags: {
      part: number
      etag?: string
    }[],
    cb: ResultCallback<{ etag: string; versionId: string | null }>,
  ): void

  // this call will aggregate the parts on the server into a single object.
  completeMultipartUpload(
    bucketName: string,
    objectName: string,
    uploadId: string,
    etags: {
      part: number
      etag?: string
    }[],
    cb?: ResultCallback<{ etag: string; versionId: string | null }>,
  ) {
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
    if (!isOptionalFunction(cb)) {
      throw new TypeError('cb should be of type "function"')
    }

    if (!uploadId) {
      throw new errors.InvalidArgumentError('uploadId cannot be empty')
    }

    const method = 'POST'
    const query = `uploadId=${uriEscape(uploadId)}`

    const builder = new xml2js.Builder()
    const payload = builder.buildObject({
      CompleteMultipartUpload: {
        $: {
          xmlns: 'http://s3.amazonaws.com/doc/2006-03-01/',
        },
        Part: etags.map((etag) => {
          return {
            PartNumber: etag.part,
            ETag: etag.etag,
          }
        }),
      },
    })

    return asCallbackFn(cb, async () => {
      const res = await this.makeRequestAsync({ method, bucketName, objectName, query }, payload)
      const body = await readAsBuffer(res)
      const result = xmlParsers.parseCompleteMultipart(body.toString())
      if (!result) {
        throw new Error('BUG: failed to parse server response')
      }

      if (result.errCode) {
        // Multipart Complete API returns an error XML after a 200 http status
        throw new errors.S3Error(result.errMessage)
      }

      return {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        etag: result.etag as string,
        versionId: getVersionId(res.headers as ResponseHeader),
      }
    })
  }

  // Called by listIncompleteUploads to fetch a batch of incomplete uploads.
  listIncompleteUploadsQuery(
    bucketName: string,
    prefix: string,
    keyMarker: string,
    uploadIdMarker: string,
    delimiter: string,
  ): stream.Transform {
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
    this.makeRequestAsync({ method, bucketName, query }, '', [200], '', true).then(
      (response) => {
        if (!response) {
          throw new Error('BUG: no response')
        }

        pipesetup(response, transformer)
      },
      (e) => {
        return transformer.emit('error', e)
      },
    )
    return transformer
  }

  public get extensions() {
    return this.clientExtensions
  }

  public async setCredentialsProvider(credentialsProvider: CredentialProvider) {
    if (!(credentialsProvider instanceof CredentialProvider)) {
      throw new Error('Unable to get  credentials. Expected instance of CredentialProvider')
    }
    this.credentialsProvider = credentialsProvider
    await this.checkAndRefreshCreds()
  }

  private async fetchCredentials() {
    if (this.credentialsProvider) {
      const credential = await this.credentialsProvider.getCredentials()
      if (credential) {
        this.accessKey = credential.getAccessKey()
        this.secretKey = credential.getSecretKey()
        this.sessionToken = credential.getSessionToken()
      } else {
        throw new Error(`Unable to get credentials. Expected instance of BaseCredentialsProvider, get ${credential}`)
      }
    } else {
      throw new Error('Unable to get credentials. Expected instance of BaseCredentialsProvider')
    }
  }

  /**
   * Initiate a new multipart upload.
   * @internal
   */
  async initiateNewMultipartUpload(bucketName: string, objectName: string, headers: RequestHeaders): Promise<string> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isObject(headers)) {
      throw new errors.InvalidObjectNameError('contentType should be of type "object"')
    }
    const method = 'POST'
    const query = 'uploads'
    const res = await this.makeRequestAsync({ method, bucketName, objectName, query, headers })
    const body = await readAsBuffer(res)
    return xmlParsers.parseInitiateMultipart(body.toString())
  }

  // TODO: this method some times will fail, and cause unhandled rejection error.
  protected async checkAndRefreshCreds() {
    if (this.credentialsProvider) {
      return await this.fetchCredentials()
    }
  }

  /**
   * gets the region of the bucket
   *
   * @param bucketName
   *
   * @internal
   */
  protected async getBucketRegionAsync(bucketName: string): Promise<string> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name : ${bucketName}`)
    }

    const me = this

    const executor = async (): Promise<string> => {
      // Region is set with constructor, return the region right here.
      if (this.region) {
        return this.region
      }

      const cached = this.regionMap[bucketName]
      if (cached) {
        return cached
      }

      const extractRegionAsync = async (response: IncomingMessage) => {
        const body = await readAsString(response)
        const region = xmlParsers.parseBucketRegion(body)
        this.regionMap[bucketName] = region
        return region
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
      const pathStyle = this.pathStyle && !isBrowser

      let region: string

      try {
        const res = await me.makeRequestAsync({ method, bucketName, query, pathStyle }, '', [200], DEFAULT_REGION)
        return extractRegionAsync(res)
      } catch (e) {
        if (!(e instanceof Error && e.name === 'AuthorizationHeaderMalformed')) {
          throw e
        }
        // @ts-expect-error we set extra properties on error object
        region = e.Region as string
        if (!region) {
          throw e
        }
      }

      const res = await me.makeRequestAsync({ method, bucketName, query, pathStyle }, '', [200], region)
      return extractRegionAsync(res)
    }

    return executor()
  }

  findUploadId(bucketName: string, objectName: string, cb: ResultCallback<string | undefined>): void
  findUploadId(bucketName: string, objectName: string): Promise<string | undefined>
  findUploadId(
    bucketName: string,
    objectName: string,
    cb?: ResultCallback<string | undefined>,
  ): void | Promise<string | undefined> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isOptionalFunction(cb)) {
      throw new TypeError('cb should be of type "function"')
    }
    return asCallback(
      cb,
      new Promise((resolve, reject) => {
        let latestUpload: string | undefined
        const listNext = (keyMarker: string, uploadIdMarker: string) => {
          this.listIncompleteUploadsQuery(bucketName, objectName, keyMarker, uploadIdMarker, '')
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            .on('error', (e) => reject(e))
            .on('data', (result) => {
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore
              result.uploads.forEach((upload) => {
                if (upload.key === objectName) {
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-ignore
                  if (!latestUpload || upload.initiated.getTime() > latestUpload.initiated.getTime()) {
                    latestUpload = upload
                    return
                  }
                }
              })
              if (result.isTruncated) {
                listNext(result.nextKeyMarker as string, result.nextUploadIdMarker as string)
                return
              }
              if (latestUpload) {
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                return resolve(latestUpload.uploadId as string)
              }
              resolve(undefined)
            })
        }
        listNext('', '')
      }),
    )
  }

  // Stat information of the object.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `statOpts`  _object_ : Version of the object in the form `{versionId:'my-uuid'}`. Default is `{}`. (optional).

  statObject(
    bucketName: string,
    objectName: string,
    statOpts: StatObjectOpts,
    callback: ResultCallback<BucketItemStat>,
  ): void
  statObject(bucketName: string, objectName: string, callback: ResultCallback<BucketItemStat>): void
  statObject(bucketName: string, objectName: string, statOpts?: StatObjectOpts): Promise<BucketItemStat>

  statObject(
    bucketName: string,
    objectName: string,
    statOptsOrCallback: StatObjectOpts | ResultCallback<BucketItemStat> = {},
    callback?: ResultCallback<BucketItemStat>,
  ): void | Promise<BucketItemStat> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }

    let statOpts: StatObjectOpts = {}
    let cb: ResultCallback<BucketItemStat> | undefined

    // backward compatibility
    if (typeof statOptsOrCallback === 'function') {
      // statObject(bucketName, objectName, callback): void
      statOpts = {}
      cb = statOptsOrCallback
    } else {
      // statObject(bucketName, objectName, statOpts, callback): void
      statOpts = statOptsOrCallback
      cb = callback
    }

    if (!isObject(statOpts)) {
      throw new errors.InvalidArgumentError('statOpts should be of type "object"')
    }
    if (!isOptionalFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    const query = querystring.stringify(statOpts)
    const method = 'HEAD'
    return asCallbackFn(cb, async () => {
      const res = await this.makeRequestAsync({ method, bucketName, objectName, query })

      // We drain the socket so that the connection gets closed. Note that this
      // is not expensive as the socket will not have any data.
      // HEAD request doesn't expect to have many response body
      await drainResponse(res)

      const result: BucketItemStat = {
        size: parseInt(res.headers['content-length'] as string),
        metaData: extractMetadata(res.headers as ResponseHeader),
        lastModified: new Date(res.headers['last-modified'] as string),
        versionId: getVersionId(res.headers as ResponseHeader),
        etag: sanitizeETag(res.headers.etag),
      }

      return result
    })
  }

  getUploader(
    bucketName: string,
    objectName: string,
    extraHeaders: RequestHeaders,
    multipart: false,
  ): (buf: Buffer, length: number, sha256sum: string, md5sum: string) => Promise<UploadedObjectInfo>
  getUploader(
    bucketName: string,
    objectName: string,
    extraHeaders: RequestHeaders,
    multipart: true,
  ): (
    uploadId: string,
    partNumber: number,
    buf: Buffer,
    length: number,
    sha256sum: string,
    md5sum: string,
  ) => Promise<UploadedObjectInfo>

  // a part of the multipart.
  getUploader(bucketName: string, objectName: string, extraHeaders: RequestHeaders, multipart: boolean) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isBoolean(multipart)) {
      throw new TypeError('multipart should be of type "boolean"')
    }
    if (!isObject(extraHeaders)) {
      throw new TypeError('metadata should be of type "object"')
    }

    const validate = (stream: stream.Readable | Buffer, length: number, sha256sum: string, md5sum: string) => {
      if (!(Buffer.isBuffer(stream) || isReadableStream(stream))) {
        throw new TypeError('stream should be of type "Stream" or Buffer')
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
    }

    const simpleUploader = (buf: Buffer, length: number, sha256sum: string, md5sum: string) => {
      validate(buf, length, sha256sum, md5sum)
      return upload('', buf, length, sha256sum, md5sum)
    }

    const multipartUploader = (
      uploadId: string,
      partNumber: number,
      buf: Buffer,
      length: number,
      sha256sum: string,
      md5sum: string,
    ) => {
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
      validate(buf, length, sha256sum, md5sum)
      const query = `partNumber=${partNumber}&uploadId=${uriEscape(uploadId)}`
      return upload(query, buf, length, sha256sum, md5sum)
    }

    const upload = async (query: string, stream: Buffer, length: number, sha256sum: string, md5sum: string) => {
      const method = 'PUT'
      let headers: RequestHeaders = { 'Content-Length': length }

      if (!multipart) {
        headers = Object.assign({}, extraHeaders, headers)
      }

      if (!this.enableSHA256) {
        headers['Content-MD5'] = md5sum
      }

      const response = await this.makeRequestStreamAsync(
        {
          method,
          bucketName,
          objectName,
          query,
          headers,
        },
        stream,
        sha256sum,
        [200],
        '',
        false,
      )
      return {
        etag: sanitizeETag(response.headers.etag),
        versionId: getVersionId(response.headers as ResponseHeader),
      }
    }
    if (multipart) {
      return multipartUploader
    }
    return simpleUploader
  }

  // Get part-info of all parts of an incomplete upload specified by uploadId.
  listParts(bucketName: string, objectName: string, uploadId: string): Promise<Part[]> {
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
    return new Promise<Part[]>((resolve, reject) => {
      let parts: Part[] = []
      const listNext = (marker?: number) => {
        this.listPartsQuery(bucketName, objectName, uploadId, marker)
          .then((result) => {
            parts = parts.concat(result.parts)
            if (result.isTruncated) {
              listNext(result.marker)
              return
            }
            resolve(parts)
          })
          .catch((e) => reject(e))
      }
      listNext(0)
    })
  }

  // Called by listParts to fetch a batch of part-info
  async listPartsQuery(bucketName: string, objectName: string, uploadId: string, marker?: number) {
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
    if (!uploadId) {
      throw new errors.InvalidArgumentError('uploadId cannot be empty')
    }
    let query = ''
    if (marker && marker !== 0) {
      query += `part-number-marker=${marker}&`
    }
    query += `uploadId=${uriEscape(uploadId)}`

    const method = 'GET'

    const res = await this.makeRequestAsync({ method, bucketName, objectName, query })
    const body = await readAsBuffer(res)
    return xmlParsers.parseListParts(body.toString())
  }
}

export async function uploadStream({
  client,
  bucketName,
  objectName,
  headers,
  stream: source,
  partSize,
}: {
  client: TypedBase
  bucketName: string
  objectName: string
  headers: RequestHeaders
  stream: stream.Readable
  partSize: number
}): Promise<UploadedObjectInfo> {
  // A map of the previously uploaded chunks, for resuming a file upload. This
  // will be null if we aren't resuming an upload.
  const oldParts: Record<number, Part> = {}

  // Keep track of the etags for aggregating the chunks together later. Each
  // etag represents a single chunk of the file.
  const eTags: Part[] = []

  const previousUploadId = await client.findUploadId(bucketName, objectName)
  let uploadId: string
  if (!previousUploadId) {
    uploadId = await client.initiateNewMultipartUpload(bucketName, objectName, headers)
  } else {
    uploadId = previousUploadId
    const oldTags = await client.listParts(bucketName, objectName, previousUploadId)
    oldTags.forEach((e) => {
      oldTags[e.part] = e
    })
  }

  const chunkier = new BlockStream2({ size: partSize, zeroPadding: false })

  const [_, o] = await Promise.all([
    new Promise((resolve, reject) => {
      source.pipe(chunkier)
      chunkier.on('end', resolve)
      source.on('error', reject)
      chunkier.on('error', reject)
    }),
    (async () => {
      let partNumber = 1

      for await (const chunk of chunkier) {
        const md5 = crypto.createHash('md5').update(chunk).digest()

        const oldPart = oldParts[partNumber]
        if (oldPart) {
          if (oldPart.etag === md5.toString('hex')) {
            eTags.push({ part: partNumber, etag: oldPart.etag })
            partNumber++
            continue
          }
        }

        partNumber++

        // now start to upload missing part
        const options: RequestOption = {
          method: 'PUT',
          query: qs({ partNumber, uploadId }),
          headers: {
            'Content-Length': chunk.length,
            'Content-MD5': md5.toString('base64'),
          },
          bucketName,
          objectName,
        }

        const response = await client.makeRequestAsyncOmit(options, chunk)

        let etag = response.headers.etag
        if (etag) {
          etag = etag.replace(/^"/, '').replace(/"$/, '')
        } else {
          etag = ''
        }

        eTags.push({ part: partNumber, etag })
      }

      return await client.completeMultipartUpload(bucketName, objectName, uploadId, eTags)
    })(),
  ])

  return o
}
