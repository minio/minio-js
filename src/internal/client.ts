import * as http from 'node:http'
import * as https from 'node:https'
import type * as stream from 'node:stream'

import { isBrowser } from 'browser-or-node'
import _ from 'lodash'
import * as qs from 'query-string'
import xml2js from 'xml2js'

import { CredentialProvider } from '../CredentialProvider.ts'
import * as errors from '../errors.ts'
import { DEFAULT_REGION } from '../helpers.ts'
import { signV4 } from '../signing.ts'
import { Extensions } from './extensions.ts'
import {
  extractMetadata,
  getVersionId,
  isAmazonEndpoint,
  isBoolean,
  isDefined,
  isEmpty,
  isNumber,
  isObject,
  isReadableStream,
  isString,
  isValidBucketName,
  isValidEndpoint,
  isValidObjectName,
  isValidPort,
  isVirtualHostStyle,
  makeDateLong,
  sanitizeETag,
  toMd5,
  toSha256,
  uriEscape,
  uriResourceEscape,
} from './helper.ts'
import { request } from './request.ts'
import { drainResponse, readAsBuffer, readAsString } from './response.ts'
import type { Region } from './s3-endpoints.ts'
import { getS3Endpoint } from './s3-endpoints.ts'
import type {
  Binary,
  BucketItemFromList,
  BucketItemStat,
  IRequest,
  ReplicationConfig,
  ReplicationConfigOpts,
  RequestHeaders,
  ResponseHeader,
  ResultCallback,
  StatObjectOpts,
  Transport,
} from './type.ts'
import type { UploadedPart } from './xml-parser.ts'
import * as xmlParsers from './xml-parser.ts'
import { parseInitiateMultipart } from './xml-parser.ts'

// will be replaced by bundler.
const Package = { version: process.env.MINIO_JS_PACKAGE_VERSION || 'development' }

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
  transport?: Transport
  sessionToken?: string
  partSize?: number
  pathStyle?: boolean
  credentialsProvider?: CredentialProvider
  s3AccelerateEndpoint?: string
  transportAgent?: http.Agent
}

export type RequestOption = Partial<IRequest> & {
  method: string
  bucketName?: string
  objectName?: string
  query?: string
  pathStyle?: boolean
}

export type NoResultCallback = (error: unknown) => void

export interface RemoveOptions {
  versionId?: string
  governanceBypass?: boolean
  forceDelete?: boolean
}

export class TypedClient {
  protected transport: Transport
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
  protected maxObjectSize = 5 * 1024 * 1024 * 1024 * 1024
  public enableSHA256: boolean
  protected s3AccelerateEndpoint?: string
  protected reqOptions: Record<string, unknown>

  protected transportAgent: http.Agent
  private readonly clientExtensions: Extensions

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
    this.clientExtensions = new Extensions(this)
  }

  /**
   * Minio extensions that aren't necessary present for Amazon S3 compatible storage servers
   */
  get extensions() {
    return this.clientExtensions
  }

  /**
   * @param endPoint - valid S3 acceleration end point
   */
  setS3TransferAccelerate(endPoint: string) {
    this.s3AccelerateEndpoint = endPoint
  }

  /**
   * Sets the supported request options.
   */
  public setRequestOptions(options: Pick<https.RequestOptions, (typeof requestOptionProperties)[number]>) {
    if (!isObject(options)) {
      throw new TypeError('request options should be of type "object"')
    }
    this.reqOptions = _.pick(options, requestOptionProperties)
  }

  /**
   *  This is s3 Specific and does not hold validity in any other Object storage.
   */
  private getAccelerateEndPointIfSet(bucketName?: string, objectName?: string) {
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
   * returns options object that can be used with http.request()
   * Takes care of constructing virtual-host-style or path-style hostname
   */
  protected getRequestOptions(
    opts: RequestOption & { region: string },
  ): IRequest & { host: string; headers: Record<string, string> } {
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
      objectName = uriResourceEscape(objectName)
    }

    // For Amazon S3 endpoint, get endpoint based on region.
    if (isAmazonEndpoint(host)) {
      const accelerateEndPoint = this.getAccelerateEndPointIfSet(bucketName, objectName)
      if (accelerateEndPoint) {
        host = `${accelerateEndPoint}`
      } else {
        host = getS3Endpoint(region)
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

  public async setCredentialsProvider(credentialsProvider: CredentialProvider) {
    if (!(credentialsProvider instanceof CredentialProvider)) {
      throw new Error('Unable to get credentials. Expected instance of CredentialProvider')
    }
    this.credentialsProvider = credentialsProvider
    await this.checkAndRefreshCreds()
  }

  private async checkAndRefreshCreds() {
    if (this.credentialsProvider) {
      try {
        const credentialsConf = await this.credentialsProvider.getCredentials()
        this.accessKey = credentialsConf.getAccessKey()
        this.secretKey = credentialsConf.getSecretKey()
        this.sessionToken = credentialsConf.getSessionToken()
      } catch (e) {
        throw new Error(`Unable to get credentials: ${e}`, { cause: e })
      }
    }
  }

  private logStream?: stream.Writable

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
  async makeRequestAsync(
    options: RequestOption,
    payload: Binary = '',
    expectedCodes: number[] = [200],
    region = '',
  ): Promise<http.IncomingMessage> {
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
    if (!options.headers) {
      options.headers = {}
    }
    if (options.method === 'POST' || options.method === 'PUT' || options.method === 'DELETE') {
      options.headers['content-length'] = payload.length.toString()
    }
    const sha256sum = this.enableSHA256 ? toSha256(payload) : ''
    return this.makeRequestStreamAsync(options, payload, sha256sum, expectedCodes, region)
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
  ): Promise<Omit<http.IncomingMessage, 'on'>> {
    const res = await this.makeRequestAsync(options, payload, statusCodes, region)
    await drainResponse(res)
    return res
  }

  /**
   * makeRequestStream will be used directly instead of makeRequest in case the payload
   * is available as a stream. for ex. putObject
   *
   * @internal
   */
  async makeRequestStreamAsync(
    options: RequestOption,
    body: stream.Readable | Binary,
    sha256sum: string,
    statusCodes: number[],
    region: string,
  ): Promise<http.IncomingMessage> {
    if (!isObject(options)) {
      throw new TypeError('options should be of type "object"')
    }
    if (!(Buffer.isBuffer(body) || typeof body === 'string' || isReadableStream(body))) {
      throw new errors.InvalidArgumentError(
        `stream should be a Buffer, string or readable Stream, got ${typeof body} instead`,
      )
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
    // sha256sum will be empty for anonymous or https requests
    if (!this.enableSHA256 && sha256sum.length !== 0) {
      throw new errors.InvalidArgumentError(`sha256sum expected to be empty for anonymous or https requests`)
    }
    // sha256sum should be valid for non-anonymous http requests.
    if (this.enableSHA256 && sha256sum.length !== 64) {
      throw new errors.InvalidArgumentError(`Invalid sha256sum : ${sha256sum}`)
    }

    await this.checkAndRefreshCreds()

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    region = region || (await this.getBucketRegionAsync(options.bucketName!))

    const reqOptions = this.getRequestOptions({ ...options, region })
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
      reqOptions.headers.authorization = signV4(reqOptions, this.accessKey, this.secretKey, region, date, sha256sum)
    }

    const response = await request(this.transport, reqOptions, body)
    if (!response.statusCode) {
      throw new Error("BUG: response doesn't have a statusCode")
    }

    if (!statusCodes.includes(response.statusCode)) {
      // For an incorrect region, S3 server always sends back 400.
      // But we will do cache invalidation for all errors so that,
      // in future, if AWS S3 decides to send a different status code or
      // XML error code we will still work fine.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      delete this.regionMap[options.bucketName!]

      const err = await xmlParsers.parseResponseError(response)
      this.logHTTP(reqOptions, response, err)
      throw err
    }

    this.logHTTP(reqOptions, response)

    return response
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

    // Region is set with constructor, return the region right here.
    if (this.region) {
      return this.region
    }

    const cached = this.regionMap[bucketName]
    if (cached) {
      return cached
    }

    const extractRegionAsync = async (response: http.IncomingMessage) => {
      const body = await readAsString(response)
      const region = xmlParsers.parseBucketRegion(body) || DEFAULT_REGION
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
      const res = await this.makeRequestAsync({ method, bucketName, query, pathStyle }, '', [200], DEFAULT_REGION)
      return extractRegionAsync(res)
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      if (!(e.name === 'AuthorizationHeaderMalformed')) {
        throw e
      }
      // @ts-expect-error we set extra properties on error object
      region = e.Region as string
      if (!region) {
        throw e
      }
    }

    const res = await this.makeRequestAsync({ method, bucketName, query, pathStyle }, '', [200], region)
    return await extractRegionAsync(res)
  }

  /**
   * makeRequest is the primitive used by the apis for making S3 requests.
   * payload can be empty string in case of no payload.
   * statusCode is the expected statusCode. If response.statusCode does not match
   * we parse the XML error and call the callback with the error message.
   * A valid region is passed by the calls - listBuckets, makeBucket and
   * getBucketRegion.
   *
   * @deprecated use `makeRequestAsync` instead
   */
  makeRequest(
    options: RequestOption,
    payload: Binary = '',
    expectedCodes: number[] = [200],
    region = '',
    returnResponse: boolean,
    cb: (cb: unknown, result: http.IncomingMessage) => void,
  ) {
    let prom: Promise<http.IncomingMessage>
    if (returnResponse) {
      prom = this.makeRequestAsync(options, payload, expectedCodes, region)
    } else {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error compatible for old behaviour
      prom = this.makeRequestAsyncOmit(options, payload, expectedCodes, region)
    }

    prom.then(
      (result) => cb(null, result),
      (err) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        cb(err)
      },
    )
  }

  /**
   * makeRequestStream will be used directly instead of makeRequest in case the payload
   * is available as a stream. for ex. putObject
   *
   * @deprecated use `makeRequestStreamAsync` instead
   */
  makeRequestStream(
    options: RequestOption,
    stream: stream.Readable | Buffer,
    sha256sum: string,
    statusCodes: number[],
    region: string,
    returnResponse: boolean,
    cb: (cb: unknown, result: http.IncomingMessage) => void,
  ) {
    const executor = async () => {
      const res = await this.makeRequestStreamAsync(options, stream, sha256sum, statusCodes, region)
      if (!returnResponse) {
        await drainResponse(res)
      }

      return res
    }

    executor().then(
      (result) => cb(null, result),
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      (err) => cb(err),
    )
  }

  /**
   * @deprecated use `getBucketRegionAsync` instead
   */
  getBucketRegion(bucketName: string, cb: (err: unknown, region: string) => void) {
    return this.getBucketRegionAsync(bucketName).then(
      (result) => cb(null, result),
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      (err) => cb(err),
    )
  }

  async removeBucket(bucketName: string): Promise<void>

  /**
   * @deprecated use promise style API
   */
  removeBucket(bucketName: string, callback: NoResultCallback): void

  async removeBucket(bucketName: string): Promise<void> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    const method = 'DELETE'
    await this.makeRequestAsyncOmit({ method, bucketName }, '', [204])
    delete this.regionMap[bucketName]
  }

  /**
   * Stat information of the object.
   */
  async statObject(bucketName: string, objectName: string, statOpts: StatObjectOpts = {}): Promise<BucketItemStat> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }

    if (!isObject(statOpts)) {
      throw new errors.InvalidArgumentError('statOpts should be of type "object"')
    }

    const query = qs.stringify(statOpts)
    const method = 'HEAD'
    const res = await this.makeRequestAsyncOmit({ method, bucketName, objectName, query })

    return {
      size: parseInt(res.headers['content-length'] as string),
      metaData: extractMetadata(res.headers as ResponseHeader),
      lastModified: new Date(res.headers['last-modified'] as string),
      versionId: getVersionId(res.headers as ResponseHeader),
      etag: sanitizeETag(res.headers.etag),
    }
  }

  /**
   * Remove the specified object.
   * @deprecated use new promise style API
   */
  removeObject(bucketName: string, objectName: string, removeOpts: RemoveOptions, callback: NoResultCallback): void
  /**
   * @deprecated use new promise style API
   */
  // @ts-ignore
  removeObject(bucketName: string, objectName: string, callback: NoResultCallback): void
  async removeObject(bucketName: string, objectName: string, removeOpts?: RemoveOptions): Promise<void>

  async removeObject(bucketName: string, objectName: string, removeOpts: RemoveOptions = {}): Promise<void> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }

    if (!isObject(removeOpts)) {
      throw new errors.InvalidArgumentError('removeOpts should be of type "object"')
    }

    const method = 'DELETE'

    const headers: RequestHeaders = {}
    if (removeOpts.governanceBypass) {
      headers['X-Amz-Bypass-Governance-Retention'] = true
    }
    if (removeOpts.forceDelete) {
      headers['x-minio-force-delete'] = true
    }

    const queryParams: Record<string, string> = {}
    if (removeOpts.versionId) {
      queryParams.versionId = `${removeOpts.versionId}`
    }
    const query = qs.stringify(queryParams)

    await this.makeRequestAsyncOmit({ method, bucketName, objectName, headers, query }, '', [200, 204])
  }

  // Calls implemented below are related to multipart.

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
    return parseInitiateMultipart(body.toString())
  }

  /**
   * Internal Method to abort a multipart upload request in case of any errors.
   *
   * @param bucketName - Bucket Name
   * @param objectName - Object Name
   * @param uploadId - id of a multipart upload to cancel during compose object sequence.
   */
  async abortMultipartUpload(bucketName: string, objectName: string, uploadId: string): Promise<void> {
    const method = 'DELETE'
    const query = `uploadId=${uploadId}`

    const requestOptions = { method, bucketName, objectName: objectName, query }
    await this.makeRequestAsyncOmit(requestOptions, '', [204])
  }

  /**
   * Get part-info of all parts of an incomplete upload specified by uploadId.
   */
  protected async listParts(bucketName: string, objectName: string, uploadId: string): Promise<UploadedPart[]> {
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

    const parts: UploadedPart[] = []
    let marker = 0
    let result
    do {
      result = await this.listPartsQuery(bucketName, objectName, uploadId, marker)
      marker = result.marker
      parts.push(...result.parts)
    } while (result.isTruncated)

    return parts
  }

  /**
   * Called by listParts to fetch a batch of part-info
   */
  private async listPartsQuery(bucketName: string, objectName: string, uploadId: string, marker: number) {
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

    let query = `uploadId=${uriEscape(uploadId)}`
    if (marker) {
      query += `&part-number-marker=${marker}`
    }

    const method = 'GET'
    const res = await this.makeRequestAsync({ method, bucketName, objectName, query })
    return xmlParsers.parseListParts(await readAsString(res))
  }

  async listBuckets(): Promise<BucketItemFromList[]> {
    const method = 'GET'
    const httpRes = await this.makeRequestAsync({ method }, '', [200], DEFAULT_REGION)
    const xmlResult = await readAsString(httpRes)
    return xmlParsers.parseListBucket(xmlResult)
  }

  async removeBucketReplication(bucketName: string): Promise<void>
  removeBucketReplication(bucketName: string, callback: NoResultCallback): void
  async removeBucketReplication(bucketName: string): Promise<void> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    const method = 'DELETE'
    const query = 'replication'
    await this.makeRequestAsyncOmit({ method, bucketName, query }, '', [200, 204], '')
  }

  setBucketReplication(bucketName: string, replicationConfig: ReplicationConfigOpts, callback: NoResultCallback): void
  async setBucketReplication(bucketName: string, replicationConfig: ReplicationConfigOpts): Promise<void>
  async setBucketReplication(bucketName: string, replicationConfig: ReplicationConfigOpts) {
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
    const method = 'PUT'
    const query = 'replication'
    const headers: Record<string, string> = {}

    const replicationParamsConfig = {
      ReplicationConfiguration: {
        Role: replicationConfig.role,
        Rule: replicationConfig.rules,
      },
    }

    const builder = new xml2js.Builder({ renderOpts: { pretty: false }, headless: true })
    const payload = builder.buildObject(replicationParamsConfig)
    headers['Content-MD5'] = toMd5(payload)
    await this.makeRequestAsyncOmit({ method, bucketName, query, headers }, payload)
  }

  getBucketReplication(bucketName: string, callback: ResultCallback<ReplicationConfig>): void
  async getBucketReplication(bucketName: string): Promise<ReplicationConfig>
  async getBucketReplication(bucketName: string) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    const method = 'GET'
    const query = 'replication'

    const httpRes = await this.makeRequestAsync({ method, bucketName, query }, '', [200, 204])
    const xmlResult = await readAsString(httpRes)
    return xmlParsers.parseReplicationConfig(xmlResult)
  }
}
