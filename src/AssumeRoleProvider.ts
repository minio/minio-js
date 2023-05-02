import type http from 'node:http'
import { URL, URLSearchParams } from 'node:url'

import { CredentialProvider } from './CredentialProvider.ts'
import { Credentials } from './Credentials.ts'
import { makeDateLong, parseXml, toSha256 } from './helpers.ts'
import { request } from './request.ts'
import { readAsString } from './response.ts'
import { signV4ByServiceName } from './signing.ts'

type CredentialResponse = {
  ErrorResponse?: {
    Error?: {
      Code?: string
      Message?: string
    }
  }

  AssumeRoleResponse?: {
    AssumeRoleResult?: {
      Credentials?: {
        AccessKeyId: string | undefined
        SecretAccessKey: string | undefined
        SessionToken: string | undefined
        Expiration: string | undefined
      }
    }
  }
}

export class AssumeRoleProvider extends CredentialProvider {
  private stsEndpoint: string
  private accessKey: string
  private secretKey: string
  private durationSeconds: number
  private sessionToken: string
  private policy: string
  private region: string
  private roleArn: string
  private roleSessionName: string
  private externalId: string
  private token: string
  private webIdentityToken: string
  private action: string

  private _credentials: Credentials | null
  private expirySeconds: number | null
  private accessExpiresAt: string | null
  private transportAgent?: http.Agent

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
  }: {
    stsEndpoint: string
    accessKey: string
    secretKey: string
    durationSeconds: number
    sessionToken: string
    policy: string
    region?: string
    roleArn: string
    roleSessionName: string
    externalId: string
    token: string
    webIdentityToken: string
    action?: string
    transportAgent?: http.Agent
  }) {
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
    this.sessionToken = sessionToken

    // By default, nodejs uses a global agent if the 'agent' property
    // is set to undefined. Otherwise, it's okay to assume the users
    // know what they're doing if they specify a custom transport agent.
    this.transportAgent = transportAgent

    /**
     * Internal Tracking variables
     */
    this._credentials = null
    this.expirySeconds = null
    this.accessExpiresAt = null
  }

  getRequestConfig(): {
    isHttp: boolean
    requestOptions: http.RequestOptions
    requestData: string
  } {
    const url = new URL(this.stsEndpoint)
    const hostValue = url.hostname
    const portValue = url.port
    const isHttp = url.protocol.includes('http:')
    const qryParams = new URLSearchParams()
    qryParams.set('Action', this.action)
    qryParams.set('Version', '2011-06-15')

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

    const res = await request(requestOptions, isHttp, requestData)

    const body = await readAsString(res)

    return parseXml(body)
  }

  parseCredentials(respObj: CredentialResponse = {}) {
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
            AccessKeyId: accessKey = undefined,
            SecretAccessKey: secretKey = undefined,
            SessionToken: sessionToken = undefined,
            Expiration: expiresAt = null,
          } = {},
        } = {},
      } = {},
    } = respObj

    this.accessExpiresAt = expiresAt

    // @ts-expect-error not sure if this could be undefined
    const newCreds = new Credentials({ accessKey, secretKey, sessionToken })

    this.setCredentials(newCreds)
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
    const expiresAt = new Date(this.accessExpiresAt!)
    const provisionalExpiry = new Date(Date.now() + 1000 * 10) // check before 10 seconds.
    return provisionalExpiry > expiresAt
  }
}
