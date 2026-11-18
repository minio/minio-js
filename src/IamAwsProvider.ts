import { X509Certificate } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as http from 'node:http'
import * as https from 'node:https'
import * as tls from 'node:tls'
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
  /** Endpoint of the instance metadata service. Not used for the web-identity (STS) flow. */
  customEndpoint?: string
  /**
   * Endpoint of the STS service used for the web-identity flow (AWS_WEB_IDENTITY_TOKEN_FILE).
   * Takes precedence over AWS_ENDPOINT_URL_STS. The URL path is preserved. AWS_CA_BUNDLE does not apply to it.
   * http and https endpoints are accepted; a `transportAgent` must match the scheme (see there).
   */
  stsEndpoint?: string
  /**
   * Agent used for every request. For the web-identity (STS) flow its protocol must match the
   * STS endpoint's scheme: an `https.Agent` for an https endpoint, an `http.Agent` for an http
   * endpoint. A mismatch, for example an `http:` AWS_ENDPOINT_URL_STS together with an `https.Agent`,
   * is rejected with an error; the agent is never replaced silently.
   */
  transportAgent?: http.Agent
}

/**
 * Resolve the opt-in STS endpoint from AWS_ENDPOINT_URL_STS. It is skipped when
 * AWS_IGNORE_CONFIGURED_ENDPOINT_URLS is "true" (case-insensitive). The global
 * AWS_ENDPOINT_URL is deliberately not read: it usually points at S3.
 * https://docs.aws.amazon.com/sdkref/latest/guide/feature-ss-endpoints.html
 */
function stsEndpointFromEnv(): string | undefined {
  if (process.env.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS?.toLowerCase() === 'true') {
    return undefined
  }
  return process.env.AWS_ENDPOINT_URL_STS || undefined
}

/**
 * Build an https agent that trusts the PEM certificates in `caBundle` in addition to
 * the default trust store.
 * https://docs.aws.amazon.com/sdkref/latest/guide/feature-gen-config.html
 */
async function agentWithCaBundle(caBundle: string): Promise<https.Agent> {
  let pem: string
  try {
    pem = await fs.readFile(caBundle, { encoding: 'utf8' })
  } catch (err) {
    throw new Error(`unable to read AWS_CA_BUNDLE ${caBundle}: ${err}`, { cause: err })
  }
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g)
  if (!blocks) {
    throw new Error(`AWS_CA_BUNDLE ${caBundle} contains no PEM certificates`)
  }
  for (const block of blocks) {
    try {
      new X509Certificate(block)
    } catch (err) {
      throw new Error(`AWS_CA_BUNDLE ${caBundle} contains an invalid PEM certificate: ${err}`, { cause: err })
    }
  }
  // getCACertificates('default') also includes NODE_EXTRA_CA_CERTS; it is missing before Node 22.15.
  const getCACertificates = (tls as { getCACertificates?: (type: 'default') => string[] }).getCACertificates
  const defaults = getCACertificates ? getCACertificates('default') : tls.rootCertificates
  // On Node versions that honor NODE_USE_ENV_PROXY, keep the proxy routing the global agent would use.
  const proxyEnv = process.env.NODE_USE_ENV_PROXY === '1' ? { proxyEnv: process.env } : {}
  return new https.Agent({ ca: [...defaults, ...blocks], ...proxyEnv })
}

export class IamAwsProvider extends CredentialProvider {
  private readonly customEndpoint?: string
  private readonly stsEndpointOption?: string

  private _credentials: Credentials | null
  private readonly transportAgent?: http.Agent
  private accessExpiresAt = ''

  constructor({
    customEndpoint = undefined,
    stsEndpoint = undefined,
    transportAgent = undefined,
  }: IamAwsProviderOptions) {
    super({ accessKey: '', secretKey: '' })

    this.customEndpoint = customEndpoint
    this.stsEndpointOption = stsEndpoint
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
    // explicit option > AWS_ENDPOINT_URL_STS > default AWS endpoint
    const envEndpoint = this.stsEndpointOption ? undefined : stsEndpointFromEnv()
    const stsEndpoint = new URL(
      this.stsEndpointOption ||
        envEndpoint ||
        (region
          ? `https://sts.${region}.amazonaws.com${region.startsWith('cn-') ? '.cn' : ''}`
          : 'https://sts.amazonaws.com'),
    )

    // Node refuses to send a request through an agent of the other protocol. Fail with a message
    // that names the source of the endpoint instead of substituting the caller's agent.
    const agentProtocol = (this.transportAgent as { protocol?: string } | undefined)?.protocol
    if (agentProtocol && agentProtocol !== stsEndpoint.protocol) {
      let source = 'the default STS endpoint'
      let advice = 'supply a matching transportAgent'
      if (this.stsEndpointOption) {
        source = 'stsEndpoint'
        advice = 'change stsEndpoint or supply a matching transportAgent'
      } else if (envEndpoint) {
        source = 'AWS_ENDPOINT_URL_STS'
        advice =
          'supply a matching transportAgent, unset AWS_ENDPOINT_URL_STS, or set AWS_IGNORE_CONFIGURED_ENDPOINT_URLS=true'
      }
      throw new Error(
        `transportAgent is for ${agentProtocol} but the STS endpoint from ${source} uses ${stsEndpoint.protocol} (${stsEndpoint.origin}); ${advice}`,
      )
    }

    // URL keeps the brackets of IPv6 literals, but http.request options expect the bare address.
    const hostValue = stsEndpoint.hostname.replace(/^\[|\]$/g, '')
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

    // Opt-in: AWS_CA_BUNDLE is read only for an endpoint taken from AWS_ENDPOINT_URL_STS, and then
    // extends the default trust store. A caller-supplied agent is never modified.
    const caBundle = envEndpoint ? process.env.AWS_CA_BUNDLE : undefined
    const ownAgent = !this.transportAgent && caBundle && stsEndpoint.protocol === 'https:'
    const agent = ownAgent ? await agentWithCaBundle(caBundle) : this.transportAgent

    const requestOptions = {
      hostname: hostValue,
      port: portValue,
      path: `${stsEndpoint.pathname}?${qryParams.toString()}`,
      protocol: stsEndpoint.protocol,
      method: 'POST',
      headers: {},
      agent,
    } satisfies http.RequestOptions

    let body: string
    try {
      const transport = stsEndpoint.protocol === 'http:' ? http : https
      const res = await request(transport, requestOptions, null)
      body = await readAsString(res)
    } finally {
      if (ownAgent) {
        agent?.destroy()
      }
    }

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
