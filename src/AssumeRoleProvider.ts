import * as http from 'node:http'
import * as https from 'node:https'
import { URL, URLSearchParams } from 'node:url'

import { CredentialProvider } from './CredentialProvider.ts'
import { Credentials } from './Credentials.ts'
import { makeDateLong, parseXml, toSha256 } from './internal/helper.ts'
import { request } from './internal/request.ts'
import { readAsString } from './internal/response.ts'
import type { Transport } from './internal/type.ts'
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
  transportAgent?: http.Agent
}

const defaultExpirySeconds = 900

export class AssumeRoleProvider extends CredentialProvider {
  private readonly stsEndpoint: URL
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
  private readonly expirySeconds: number
  private accessExpiresAt = ''
  private readonly transportAgent?: http.Agent

  private readonly transport: Transport

  constructor({
    stsEndpoint,
    accessKey,
    secretKey,
    durationSeconds = defaultExpirySeconds,
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

    this.stsEndpoint = new URL(stsEndpoint)
    this.accessKey = accessKey
    this.secretKey = secretKey
    this.policy = policy
    this.region = region
    this.roleArn = roleArn
    this.roleSessionName = roleSessionName
    this.externalId = externalId
    this.token = token
    this.webIdentityToken = webIdentityToken
    this.action = action

    this.durationSeconds = parseInt(durationSeconds as unknown as string)

    let expirySeconds = this.durationSeconds
    if (this.durationSeconds < defaultExpirySeconds) {
      expirySeconds = defaultExpirySeconds
    }
    this.expirySeconds = expirySeconds // for calculating refresh of credentials.

    // By default, nodejs uses a global agent if the 'agent' property
    // is set to undefined. Otherwise, it's okay to assume the users
    // know what they're doing if they specify a custom transport agent.
    this.transportAgent = transportAgent
    const isHttp: boolean = this.stsEndpoint.protocol === 'http:'
    this.transport = isHttp ? http : https

    /**
     * Internal Tracking variables
     */
    this._credentials = null
  }

  getRequestConfig(): {
    requestOptions: http.RequestOptions
    requestData: string
  } {
    const hostValue = this.stsEndpoint.hostname
    const portValue = this.stsEndpoint.port
    const qryParams = new URLSearchParams({ Action: this.action, Version: '2011-06-15' })

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
      protocol: this.stsEndpoint.protocol,
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
    }
  }

  async performRequest(): Promise<CredentialResponse> {
    const { requestOptions, requestData } = this.getRequestConfig()

    const res = await request(this.transport, requestOptions, requestData)

    const body = await readAsString(res)

    return parseXml(body)
  }

  parseCredentials(respObj: CredentialResponse): Credentials {
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

    return new Credentials({ accessKey, secretKey, sessionToken })
  }

  async refreshCredentials(): Promise<Credentials> {
    try {
      const assumeRoleCredentials = await this.performRequest()
      this._credentials = this.parseCredentials(assumeRoleCredentials)
    } catch (err) {
      throw new Error(`Failed to get Credentials: ${err}`, { cause: err })
    }

    return this._credentials
  }

  async getCredentials(): Promise<Credentials> {
    if (this._credentials && !this.isAboutToExpire()) {
      return this._credentials
    }

    this._credentials = await this.refreshCredentials()
    return this._credentials
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
