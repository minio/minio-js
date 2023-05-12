import * as http from 'node:http'
import * as https from 'node:https'

import _ from 'lodash'

import type { CredentialProvider } from '../CredentialProvider.ts'
import * as errors from '../errors.ts'
import {
  isAmazonEndpoint,
  isBoolean,
  isDefined,
  isEmpty,
  isObject,
  isString,
  isValidEndpoint,
  isValidPort,
  isVirtualHostStyle,
  uriResourceEscape,
} from './helper.ts'
import type { Region } from './s3-endpoints.ts'
import { getS3Endpoint } from './s3-endpoints.ts'
import type { IRequest, RequestHeaders, Transport } from './type.ts'

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
  region?: string
  query?: string
  pathStyle?: boolean
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
      objectName = uriResourceEscape(objectName)
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

  private async checkAndRefreshCreds() {
    if (this.credentialsProvider) {
      return await this.fetchCredentials()
    }
  }

  private async fetchCredentials() {
    if (this.credentialsProvider) {
      const credentialsConf = await this.credentialsProvider.getCredentials()
      if (credentialsConf) {
        this.accessKey = credentialsConf.getAccessKey()
        this.secretKey = credentialsConf.getSecretKey()
        this.sessionToken = credentialsConf.getSessionToken()
      } else {
        throw new Error('Unable to get  credentials. Expected instance of BaseCredentialsProvider')
      }
    } else {
      throw new Error('Unable to get  credentials. Expected instance of BaseCredentialsProvider')
    }
  }
}
