import * as fs from 'node:fs/promises'
import * as http from 'node:http'
import * as https from 'node:https'
import { URL, URLSearchParams } from 'node:url'

import { CredentialProvider } from './CredentialProvider.ts'
import { Credentials } from './Credentials.ts'
import { parseXml } from './internal/helper.ts'
import { request } from './internal/request.ts'
import { readAsString } from './internal/response.ts'

interface AssumeRoleResponse {
  AssumeRoleWithWebIdentityResponse: {
    AssumeRoleWithWebIdentityResult: {
      Credentials: {
        AccessKeyId: string
        SecretAccessKey: string
        SessionToken: string
        Expiration: string
      }
    }
  }
}

interface EcsCredentials {
  AccessKeyID: string
  SecretAccessKey: string
  Token: string
  Expiration: string
  Code: string
  Message: string
}

export interface IamAwsProviderOptions {
  customEndpoint?: string
  transportAgent?: http.Agent
}

export class IamAwsProvider extends CredentialProvider {
  private readonly customEndpoint?: string

  private _credentials: Credentials | null
  private readonly transportAgent?: http.Agent
  private accessExpiresAt = ''

  constructor({ customEndpoint = undefined, transportAgent = undefined }: IamAwsProviderOptions) {
    super({ accessKey: '', secretKey: '' })

    this.customEndpoint = customEndpoint
    this.transportAgent = transportAgent

    /**
     * Internal Tracking variables
     */
    this._credentials = null
  }

  async getCredentials(): Promise<Credentials> {
    if (!this._credentials || this.isAboutToExpire()) {
      this._credentials = await this.fetchCredentials()
    }
    return this._credentials
  }

  private async fetchCredentials(): Promise<Credentials> {
    try {
      // check for IRSA (https://docs.aws.amazon.com/eks/latest/userguide/iam-roles-for-service-accounts.html)
      const tokenFile = process.env.AWS_WEB_IDENTITY_TOKEN_FILE
      if (tokenFile) {
        return await this.fetchCredentialsUsingTokenFile(tokenFile)
      }

      // try with IAM role for EC2 instances (https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/iam-roles-for-amazon-ec2.html)
      let tokenHeader = 'Authorization'
      let token = process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN
      const relativeUri = process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI
      const fullUri = process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI
      let url: URL
      if (relativeUri) {
        url = new URL(relativeUri, 'http://169.254.170.2')
      } else if (fullUri) {
        url = new URL(fullUri)
      } else {
        token = await this.fetchImdsToken()
        tokenHeader = 'X-aws-ec2-metadata-token'
        url = await this.getIamRoleNamedUrl(token)
      }

      return this.requestCredentials(url, tokenHeader, token)
    } catch (err) {
      throw new Error(`Failed to get Credentials: ${err}`, { cause: err })
    }
  }

  private async fetchCredentialsUsingTokenFile(tokenFile: string): Promise<Credentials> {
    const token = await fs.readFile(tokenFile, { encoding: 'utf8' })
    const region = process.env.AWS_REGION
    const stsEndpoint = new URL(region ? `https://sts.${region}.amazonaws.com` : 'https://sts.amazonaws.com')

    const hostValue = stsEndpoint.hostname
    const portValue = stsEndpoint.port
    const qryParams = new URLSearchParams({
      Action: 'AssumeRoleWithWebIdentity',
      Version: '2011-06-15',
    })

    const roleArn = process.env.AWS_ROLE_ARN
    if (roleArn) {
      qryParams.set('RoleArn', roleArn)
      const roleSessionName = process.env.AWS_ROLE_SESSION_NAME
      qryParams.set('RoleSessionName', roleSessionName ? roleSessionName : Date.now().toString())
    }

    qryParams.set('WebIdentityToken', token)
    qryParams.sort()

    const requestOptions = {
      hostname: hostValue,
      port: portValue,
      path: `${stsEndpoint.pathname}?${qryParams.toString()}`,
      protocol: stsEndpoint.protocol,
      method: 'POST',
      headers: {},
      agent: this.transportAgent,
    } satisfies http.RequestOptions

    const transport = stsEndpoint.protocol === 'http:' ? http : https
    const res = await request(transport, requestOptions, null)
    const body = await readAsString(res)

    const assumeRoleResponse: AssumeRoleResponse = parseXml(body)
    const creds = assumeRoleResponse.AssumeRoleWithWebIdentityResponse.AssumeRoleWithWebIdentityResult.Credentials
    this.accessExpiresAt = creds.Expiration
    return new Credentials({
      accessKey: creds.AccessKeyId,
      secretKey: creds.SecretAccessKey,
      sessionToken: creds.SessionToken,
    })
  }

  private async fetchImdsToken() {
    const endpoint = this.customEndpoint ? this.customEndpoint : 'http://169.254.169.254'
    const url = new URL('/latest/api/token', endpoint)

    const requestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      protocol: url.protocol,
      method: 'PUT',
      headers: {
        'X-aws-ec2-metadata-token-ttl-seconds': '21600',
      },
      agent: this.transportAgent,
    } satisfies http.RequestOptions

    const transport = url.protocol === 'http:' ? http : https
    const res = await request(transport, requestOptions, null)
    return await readAsString(res)
  }

  private async getIamRoleNamedUrl(token: string) {
    const endpoint = this.customEndpoint ? this.customEndpoint : 'http://169.254.169.254'
    const url = new URL('latest/meta-data/iam/security-credentials/', endpoint)

    const roleName = await this.getIamRoleName(url, token)
    return new URL(`${url.pathname}/${encodeURIComponent(roleName)}`, url.origin)
  }

  private async getIamRoleName(url: URL, token: string): Promise<string> {
    const requestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      protocol: url.protocol,
      method: 'GET',
      headers: {
        'X-aws-ec2-metadata-token': token,
      },
      agent: this.transportAgent,
    } satisfies http.RequestOptions

    const transport = url.protocol === 'http:' ? http : https
    const res = await request(transport, requestOptions, null)
    const body = await readAsString(res)
    const roleNames = body.split(/\r\n|[\n\r\u2028\u2029]/)
    if (roleNames.length === 0) {
      throw new Error(`No IAM roles attached to EC2 service ${url}`)
    }
    return roleNames[0] as string
  }

  private async requestCredentials(url: URL, tokenHeader: string, token: string | undefined): Promise<Credentials> {
    const headers: Record<string, string> = {}
    if (token) {
      headers[tokenHeader] = token
    }
    const requestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      protocol: url.protocol,
      method: 'GET',
      headers: headers,
      agent: this.transportAgent,
    } satisfies http.RequestOptions

    const transport = url.protocol === 'http:' ? http : https
    const res = await request(transport, requestOptions, null)
    const body = await readAsString(res)
    const ecsCredentials = JSON.parse(body) as EcsCredentials
    if (!ecsCredentials.Code || ecsCredentials.Code != 'Success') {
      throw new Error(`${url} failed with code ${ecsCredentials.Code} and message ${ecsCredentials.Message}`)
    }

    this.accessExpiresAt = ecsCredentials.Expiration
    return new Credentials({
      accessKey: ecsCredentials.AccessKeyID,
      secretKey: ecsCredentials.SecretAccessKey,
      sessionToken: ecsCredentials.Token,
    })
  }

  private isAboutToExpire() {
    const expiresAt = new Date(this.accessExpiresAt)
    const provisionalExpiry = new Date(Date.now() + 1000 * 10) // 10 seconds leeway
    return provisionalExpiry > expiresAt
  }
}

// deprecated default export, please use named exports.
// keep for backward compatibility.
// eslint-disable-next-line import/no-default-export
export default IamAwsProvider
