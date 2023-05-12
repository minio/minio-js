import * as http from 'node:http'
import * as https from 'node:https'
import { URL, URLSearchParams } from 'node:url'

import { CredentialProvider } from './CredentialProvider.ts'
import { Credentials } from './Credentials.ts'
import { makeDateLong, parseXml, toSha256 } from './internal/helper.ts'
import { request } from './internal/request.ts'
import { readAsString } from './internal/response.ts'
import { signV4ByServiceName } from './signing.ts'

/**
 * @see https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html
 */
type CredentialResponse = {
  ErrorResponse?: {
    Error?: {
      Code?: string
      Message?: string
    }
  }

  AssumeRoleResponse: {
    AssumeRoleResult: {
      Credentials: {
        AccessKeyId: string
        SecretAccessKey: string
        SessionToken: string
        Expiration: string
      }
    }
  }
}

export interface AssumeRoleProviderOptions {
  stsEndpoint: string
  accessKey: string
  secretKey: string
  durationSeconds?: number
  sessionToken?: string
  policy?: string
  region?: string
  roleArn?: string
  roleSessionName?: string
  externalId?: string
  token?: string
  webIdentityToken?: string
  action?: string
  transportAgent?: http.Agent | https.Agent
}

export class AssumeRoleProvider extends CredentialProvider {
  private readonly stsEndpoint: string
  private readonly accessKey: string
  private readonly secretKey: string
  private readonly durationSeconds: number
  private readonly policy?: string
  private readonly region: string
  private readonly roleArn?: string
  private readonly roleSessionName?: string
  private readonly externalId?: string
  private readonly token?: string
  private readonly webIdentityToken?: string
  private readonly action: string

  private _credentials: Credentials | null
  private expirySeconds: number | null
  private accessExpiresAt = ''
  private readonly transportAgent?: http.Agent

  constructor({
    stsEndpoint,
    accessKey,
    secretKey,
    durationSeconds = 900,
    sessionToken,
    policy,
    region = '',
    roleArn,
    roleSessionName,
    externalId,
    token,
    webIdentityToken,
    action = 'AssumeRole',
    transportAgent = undefined,
  }: AssumeRoleProviderOptions) {
    super({ accessKey, secretKey, sessionToken })

    this.stsEndpoint = stsEndpoint
    this.accessKey = accessKey
    this.secretKey = secretKey
    this.durationSeconds = durationSeconds
    this.policy = policy
    this.region = region
    this.roleArn = roleArn
    this.roleSessionName = roleSessionName
    this.externalId = externalId
    this.token = token
    this.webIdentityToken = webIdentityToken
    this.action = action

    // By default, nodejs uses a global agent if the 'agent' property
    // is set to undefined. Otherwise, it's okay to assume the users
    // know what they're doing if they specify a custom transport agent.
    this.transportAgent = transportAgent

    /**
     * Internal Tracking variables
     */
    this._credentials = null
    this.expirySeconds = null
  }

  getRequestConfig(): {
    isHttp: boolean
    requestOptions: http.RequestOptions
    requestData: string
  } {
    const url = new URL(this.stsEndpoint)
    const hostValue = url.hostname
    const portValue = url.port
    const isHttp = url.protocol === 'http:'
    const qryParams = new URLSearchParams({ Action: this.action, Version: '2011-06-15' })

    const defaultExpiry = 900
    let expirySeconds = parseInt(this.durationSeconds as unknown as string)
    if (expirySeconds < defaultExpiry) {
      expirySeconds = defaultExpiry
    }
    this.expirySeconds = expirySeconds // for calculating refresh of credentials.

    qryParams.set('DurationSeconds', this.expirySeconds.toString())

    if (this.policy) {
      qryParams.set('Policy', this.policy)
    }
    if (this.roleArn) {
      qryParams.set('RoleArn', this.roleArn)
    }

    if (this.roleSessionName != null) {
      qryParams.set('RoleSessionName', this.roleSessionName)
    }
    if (this.token != null) {
      qryParams.set('Token', this.token)
    }

    if (this.webIdentityToken) {
      qryParams.set('WebIdentityToken', this.webIdentityToken)
    }

    if (this.externalId) {
      qryParams.set('ExternalId', this.externalId)
    }

    const urlParams = qryParams.toString()
    const contentSha256 = toSha256(urlParams)

    const date = new Date()

    const requestOptions = {
      hostname: hostValue,
      port: portValue,
      path: '/',
      protocol: url.protocol,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'content-length': urlParams.length.toString(),
        host: hostValue,
        'x-amz-date': makeDateLong(date),
        'x-amz-content-sha256': contentSha256,
      } as Record<string, string>,
      agent: this.transportAgent,
    } satisfies http.RequestOptions

    requestOptions.headers.authorization = signV4ByServiceName(
      requestOptions,
      this.accessKey,
      this.secretKey,
      this.region,
      date,
      contentSha256,
      'sts',
    )

    return {
      requestOptions,
      requestData: urlParams,
      isHttp: isHttp,
    }
  }

  async performRequest(): Promise<CredentialResponse> {
    const reqObj = this.getRequestConfig()
    const requestOptions = reqObj.requestOptions
    const requestData = reqObj.requestData

    const isHttp = reqObj.isHttp

    const res = await request(isHttp ? http : https, requestOptions, requestData)

    const body = await readAsString(res)

    return parseXml(body)
  }

  parseCredentials(respObj: CredentialResponse) {
    if (respObj.ErrorResponse) {
      throw new Error(
        `Unable to obtain credentials: ${respObj.ErrorResponse?.Error?.Code} ${respObj.ErrorResponse?.Error?.Message}`,
        { cause: respObj },
      )
    }

    const {
      AssumeRoleResponse: {
        AssumeRoleResult: {
          Credentials: {
            AccessKeyId: accessKey,
            SecretAccessKey: secretKey,
            SessionToken: sessionToken,
            Expiration: expiresAt,
          },
        },
      },
    } = respObj

    this.accessExpiresAt = expiresAt

    const credentials = new Credentials({ accessKey, secretKey, sessionToken })

    this.setCredentials(credentials)
    return this._credentials
  }

  async refreshCredentials(): Promise<Credentials | null> {
    try {
      const assumeRoleCredentials = await this.performRequest()
      this._credentials = this.parseCredentials(assumeRoleCredentials)
    } catch (err) {
      this._credentials = null
    }
    return this._credentials
  }

  async getCredentials(): Promise<Credentials | null> {
    let credConfig: Credentials | null
    if (!this._credentials || (this._credentials && this.isAboutToExpire())) {
      credConfig = await this.refreshCredentials()
    } else {
      credConfig = this._credentials
    }
    return credConfig
  }

  isAboutToExpire() {
    const expiresAt = new Date(this.accessExpiresAt)
    const provisionalExpiry = new Date(Date.now() + 1000 * 10) // check before 10 seconds.
    return provisionalExpiry > expiresAt
  }
}

// deprecated default export, please use named exports.
// keep for backward compatibility.
// eslint-disable-next-line import/no-default-export
export default AssumeRoleProvider
