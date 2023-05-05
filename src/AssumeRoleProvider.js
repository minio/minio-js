import * as Http from 'node:http'
import * as Https from 'node:https'
import { URL, URLSearchParams } from 'node:url'

import { CredentialProvider } from './CredentialProvider.js'
import { Credentials } from './Credentials.js'
import { makeDateLong, parseXml, toSha256 } from './helpers.ts'
import { signV4ByServiceName } from './signing.ts'

export class AssumeRoleProvider extends CredentialProvider {
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
  }) {
    super({})

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
    this.credentials = null
    this.expirySeconds = null
    this.accessExpiresAt = null
  }

  getRequestConfig() {
    const url = new URL(this.stsEndpoint)
    const hostValue = url.hostname
    const portValue = url.port
    const isHttp = url.protocol.includes('http:')
    const qryParams = new URLSearchParams()
    qryParams.set('Action', this.action)
    qryParams.set('Version', '2011-06-15')

    const defaultExpiry = 900
    let expirySeconds = parseInt(this.durationSeconds)
    if (expirySeconds < defaultExpiry) {
      expirySeconds = defaultExpiry
    }
    this.expirySeconds = expirySeconds // for calculating refresh of credentials.

    qryParams.set('DurationSeconds', this.expirySeconds)

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

    /**
     * Nodejs's Request Configuration.
     */
    const requestOptions = {
      hostname: hostValue,
      port: portValue,
      path: '/',
      protocol: url.protocol,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'content-length': urlParams.length,
        host: hostValue,
        'x-amz-date': makeDateLong(date),
        'x-amz-content-sha256': contentSha256,
      },
      agent: this.transportAgent,
    }

    const authorization = signV4ByServiceName(requestOptions, this.accessKey, this.secretKey, this.region, date, 'sts')
    requestOptions.headers.authorization = authorization

    return {
      requestOptions,
      requestData: urlParams,
      isHttp: isHttp,
    }
  }

  async performRequest() {
    const reqObj = this.getRequestConfig()
    const requestOptions = reqObj.requestOptions
    const requestData = reqObj.requestData

    const isHttp = reqObj.isHttp
    const Transport = isHttp ? Http : Https

    const promise = new Promise((resolve, reject) => {
      const requestObj = Transport.request(requestOptions, (resp) => {
        let resChunks = []
        resp.on('data', (rChunk) => {
          resChunks.push(rChunk)
        })
        resp.on('end', () => {
          let body = Buffer.concat(resChunks).toString()
          const xmlobj = parseXml(body)
          resolve(xmlobj)
        })
        resp.on('error', (err) => {
          reject(err)
        })
      })
      requestObj.on('error', (e) => {
        reject(e)
      })
      requestObj.write(requestData)
      requestObj.end()
    })
    return promise
  }

  parseCredentials(respObj = {}) {
    if (respObj.ErrorResponse) {
      throw new Error('Unable to obtain credentials:', respObj)
    }
    const {
      AssumeRoleResponse: {
        AssumeRoleResult: {
          Credentials: {
            AccessKeyId: accessKey,
            SecretAccessKey: secretKey,
            SessionToken: sessionToken,
            Expiration: expiresAt,
          } = {},
        } = {},
      } = {},
    } = respObj

    this.accessExpiresAt = expiresAt

    const newCreds = new Credentials({
      accessKey,
      secretKey,
      sessionToken,
    })

    this.setCredentials(newCreds)
    return this.credentials
  }

  async refreshCredentials() {
    try {
      const assumeRoleCredentials = await this.performRequest()
      this.credentials = this.parseCredentials(assumeRoleCredentials)
    } catch (err) {
      this.credentials = null
    }
    return this.credentials
  }

  async getCredentials() {
    let credConfig
    if (!this.credentials || (this.credentials && this.isAboutToExpire())) {
      credConfig = await this.refreshCredentials()
    } else {
      credConfig = this.credentials
    }
    return credConfig
  }

  isAboutToExpire() {
    const expiresAt = new Date(this.accessExpiresAt)
    const provisionalExpiry = new Date(Date.now() + 1000 * 10) // check before 10 seconds.
    const isAboutToExpire = provisionalExpiry > expiresAt
    return isAboutToExpire
  }
}

// deprecated default export, please use named exports.
// keep for backward compatibility.
// eslint-disable-next-line import/no-default-export
export default AssumeRoleProvider
