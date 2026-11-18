/*
 * MinIO Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2026 MinIO, Inc.
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

import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as https from 'node:https'
import * as net from 'node:net'
import * as os from 'node:os'
import * as path from 'node:path'

import { assert } from 'chai'

import { IamAwsProvider } from '../../src/minio.ts'

const stsXml = `<AssumeRoleWithWebIdentityResponse><AssumeRoleWithWebIdentityResult><Credentials>
<AccessKeyId>AKID</AccessKeyId><SecretAccessKey>SECRET</SecretAccessKey><SessionToken>TOKEN</SessionToken>
<Expiration>2999-01-01T00:00:00Z</Expiration></Credentials></AssumeRoleWithWebIdentityResult></AssumeRoleWithWebIdentityResponse>`

const ENV_KEYS = [
  'AWS_WEB_IDENTITY_TOKEN_FILE',
  'AWS_REGION',
  'AWS_ROLE_ARN',
  'AWS_ENDPOINT_URL_STS',
  'AWS_ENDPOINT_URL',
  'AWS_IGNORE_CONFIGURED_ENDPOINT_URLS',
  'AWS_CA_BUNDLE',
  'NODE_TLS_REJECT_UNAUTHORIZED',
  'NODE_USE_ENV_PROXY',
  'HTTPS_PROXY',
  'https_proxy',
  'NO_PROXY',
  'no_proxy',
  'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI',
  'AWS_CONTAINER_CREDENTIALS_FULL_URI',
]

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
}

describe('IamAwsProvider STS endpoint and CA bundle', () => {
  let tmpDir
  const saved = {}
  const servers = []

  // Starts a server answering every request with the STS response and records the request URLs.
  async function startServer(createServer) {
    const urls = []
    const server = createServer((req, res) => {
      urls.push(req.url)
      res.end(stsXml)
    })
    servers.push(server)
    return { urls, port: await listen(server) }
  }

  // An agent that records the target of each request and aborts it before any connection is made.
  function recordingAgent(Base) {
    const requests = []
    class Recorder extends Base {
      addRequest(req, options) {
        requests.push({ host: options.hostname || options.host, path: req.path })
        process.nextTick(() => req.emit('error', new Error('stubbed: no network')))
      }
    }
    return { agent: new Recorder(), requests }
  }

  async function fails(provider) {
    try {
      await provider.getCredentials()
    } catch (e) {
      return e
    }
    assert.fail('expected getCredentials to fail')
  }

  // Records the endpoint the provider picks, without touching the network.
  async function chosen(options = {}) {
    const { agent, requests } = recordingAgent(https.Agent)
    await fails(new IamAwsProvider({ ...options, transportAgent: agent }))
    return requests
  }

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k]
      delete process.env[k]
    }
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iam-sts-'))
    const tokenFile = path.join(tmpDir, 'token')
    fs.writeFileSync(tokenFile, 'jwt')
    process.env.AWS_WEB_IDENTITY_TOKEN_FILE = tokenFile
  })

  afterEach(async () => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) {
        delete process.env[k]
      } else {
        process.env[k] = saved[k]
      }
    }
    fs.rmSync(tmpDir, { recursive: true, force: true })
    await Promise.all(servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve))))
  })

  it('T1: explicit stsEndpoint wins over AWS_ENDPOINT_URL_STS', async () => {
    const explicit = await startServer(http.createServer)
    const viaSts = await startServer(http.createServer)
    process.env.AWS_ENDPOINT_URL_STS = `http://127.0.0.1:${viaSts.port}`

    const creds = await new IamAwsProvider({ stsEndpoint: `http://127.0.0.1:${explicit.port}` }).getCredentials()

    assert.equal(creds.accessKey, 'AKID')
    assert.lengthOf(explicit.urls, 1)
    assert.lengthOf(viaSts.urls, 0)
  })

  it('T2: AWS_ENDPOINT_URL alone is ignored and the default host is used', async () => {
    process.env.AWS_ENDPOINT_URL = 'https://generic-env.example.com'
    process.env.AWS_REGION = 'eu-west-1'

    const reqs = await chosen()

    assert.deepEqual(
      reqs.map((r) => r.host),
      ['sts.eu-west-1.amazonaws.com'],
    )
  })

  it('T3: AWS_CA_BUNDLE is not read without AWS_ENDPOINT_URL_STS (explicit and default endpoint)', async () => {
    process.env.AWS_CA_BUNDLE = path.join(tmpDir, 'missing.pem')
    // No transportAgent: the request goes through the global agent, which is stubbed here.
    const seen = []
    const original = https.globalAgent.addRequest
    https.globalAgent.addRequest = function (req, options) {
      seen.push(options.hostname || options.host)
      process.nextTick(() => req.emit('error', new Error('stubbed: no network')))
    }
    try {
      for (const options of [{ stsEndpoint: 'https://explicit.example.com' }, {}]) {
        const err = await fails(new IamAwsProvider(options))
        // A missing bundle would have failed before the request was attempted.
        assert.notInclude(err.message, 'AWS_CA_BUNDLE')
      }
    } finally {
      https.globalAgent.addRequest = original
    }
    assert.deepEqual(seen, ['explicit.example.com', 'sts.amazonaws.com'])
  })

  it('T4: AWS_ENDPOINT_URL_STS wins over the AWS_REGION default', async () => {
    const viaSts = await startServer(http.createServer)
    process.env.AWS_REGION = 'eu-west-1'
    process.env.AWS_ENDPOINT_URL_STS = `http://127.0.0.1:${viaSts.port}`

    await new IamAwsProvider({}).getCredentials()

    assert.lengthOf(viaSts.urls, 1)
  })

  it('T5: ignore flag "true" skips AWS_ENDPOINT_URL_STS and picks the default host', async () => {
    process.env.AWS_ENDPOINT_URL_STS = 'https://sts-env.example.com'
    process.env.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS = 'true'
    process.env.AWS_REGION = 'eu-west-1'

    const reqs = await chosen()

    assert.deepEqual(
      reqs.map((r) => r.host),
      ['sts.eu-west-1.amazonaws.com'],
    )
  })

  it('T5b: ignore flag never overrides an explicit endpoint', async () => {
    process.env.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS = 'true'
    const reqs = await chosen({ stsEndpoint: 'https://explicit.example.com' })
    assert.deepEqual(
      reqs.map((r) => r.host),
      ['explicit.example.com'],
    )
  })

  it('T6: ignore flag "TRUE" also ignores; "false" does not', async () => {
    process.env.AWS_ENDPOINT_URL_STS = 'https://sts-env.example.com'

    process.env.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS = 'TRUE'
    assert.deepEqual(
      (await chosen()).map((r) => r.host),
      ['sts.amazonaws.com'],
    )

    process.env.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS = 'false'
    assert.deepEqual(
      (await chosen()).map((r) => r.host),
      ['sts-env.example.com'],
    )
  })

  it('T7: the URL path of AWS_ENDPOINT_URL_STS is preserved', async () => {
    process.env.AWS_ENDPOINT_URL_STS = 'https://sts.example.com/sts/ns/name'
    const reqs = await chosen()
    assert.equal(reqs[0].host, 'sts.example.com')
    assert.match(reqs[0].path, /^\/sts\/ns\/name\?.*Action=AssumeRoleWithWebIdentity/)
  })

  it('T8: the IMDS path ignores the environment variables', async () => {
    delete process.env.AWS_WEB_IDENTITY_TOKEN_FILE
    const envServer = await startServer(http.createServer)
    process.env.AWS_ENDPOINT_URL_STS = `http://127.0.0.1:${envServer.port}`
    process.env.AWS_ENDPOINT_URL = `http://127.0.0.1:${envServer.port}`
    const imds = await startServer(http.createServer)

    // The metadata server answers with the STS body, which is not a valid credentials
    // document, so the flow fails after talking to the metadata endpoint only.
    await fails(new IamAwsProvider({ customEndpoint: `http://127.0.0.1:${imds.port}` }))

    assert.include(imds.urls[0], '/latest/api/token')
    assert.lengthOf(envServer.urls, 0)
  })

  describe('AWS_CA_BUNDLE', () => {
    let tls
    let certFile

    // The certificate is generated at test time with the openssl CLI; no key is committed.
    // Skip, rather than fail, where the openssl CLI is not installed.
    before(function () {
      // Key generation runs an external process; allow for slow CI runners.
      this.timeout(30000)
      try {
        execFileSync('openssl', ['version'], { stdio: 'ignore' })
      } catch {
        this.skip()
      }
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iam-sts-cert-'))
      certFile = path.join(dir, 'cert.pem')
      const keyFile = path.join(dir, 'key.pem')
      // The SAN goes through a config file: `req -addext` needs OpenSSL 1.1.1 or newer.
      const cfgFile = path.join(dir, 'openssl.cnf')
      fs.writeFileSync(
        cfgFile,
        '[req]\ndistinguished_name = dn\nprompt = no\n[dn]\nCN = localhost\n[san]\nsubjectAltName = DNS:localhost,IP:127.0.0.1\n',
      )
      execFileSync(
        'openssl',
        [
          'req',
          '-x509',
          '-newkey',
          'ec',
          '-pkeyopt',
          'ec_paramgen_curve:prime256v1',
          '-nodes',
          '-keyout',
          keyFile,
          '-out',
          certFile,
          '-days',
          '2',
        ].concat(['-subj', '/CN=localhost', '-config', cfgFile, '-extensions', 'san']),
        { stdio: 'ignore' },
      )
      tls = { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) }
      fs.rmSync(keyFile)
    })

    after(() => {
      if (certFile) {
        fs.rmSync(path.dirname(certFile), { recursive: true, force: true })
      }
    })

    it('T9: trusts the certificates in the bundle when no agent is supplied', async () => {
      const srv = await startServer((handler) => https.createServer(tls, handler))
      process.env.AWS_ENDPOINT_URL_STS = `https://127.0.0.1:${srv.port}`
      process.env.AWS_CA_BUNDLE = certFile

      const creds = await new IamAwsProvider({}).getCredentials()

      assert.equal(creds.accessKey, 'AKID')
      assert.lengthOf(srv.urls, 1)
    })

    it('T10: the same server without AWS_CA_BUNDLE fails TLS verification', async () => {
      const srv = await startServer((handler) => https.createServer(tls, handler))
      process.env.AWS_ENDPOINT_URL_STS = `https://127.0.0.1:${srv.port}`

      const err = await fails(new IamAwsProvider({}))

      assert.match(String(err.cause?.code || err), /SELF_SIGNED|UNABLE_TO_VERIFY|DEPTH_ZERO/)
      assert.lengthOf(srv.urls, 0)
    })

    it('keeps proxy routing for the bundle agent when NODE_USE_ENV_PROXY is enabled', async function () {
      const [major, minor] = process.versions.node.split('.').map(Number)
      if (!((major === 22 && minor >= 21) || (major === 24 && minor >= 5) || major >= 25)) {
        this.skip() // proxyEnv is not supported by this Node version
      }
      const seen = []
      const proxy = net.createServer((sock) => {
        sock.once('data', (d) => {
          seen.push(String(d).split('\r\n')[0])
          sock.destroy()
        })
        sock.on('error', () => {})
      })
      servers.push(proxy)
      process.env.NODE_USE_ENV_PROXY = '1'
      process.env.HTTPS_PROXY = `http://127.0.0.1:${await listen(proxy)}`
      process.env.AWS_ENDPOINT_URL_STS = 'https://sts.example.com'
      process.env.AWS_CA_BUNDLE = certFile

      await fails(new IamAwsProvider({}))

      assert.match(seen[0], /^CONNECT sts\.example\.com:443 /)
    })

    it('T11: a caller-supplied agent is left unmodified and the bundle is ignored', async () => {
      const srv = await startServer((handler) => https.createServer(tls, handler))
      process.env.AWS_ENDPOINT_URL_STS = `https://127.0.0.1:${srv.port}`
      process.env.AWS_CA_BUNDLE = certFile
      let used = 0
      class CountingAgent extends https.Agent {
        addRequest(...args) {
          used++
          return super.addRequest(...args)
        }
      }
      const agent = new CountingAgent()
      const optionsBefore = { ...agent.options }

      await fails(new IamAwsProvider({ transportAgent: agent }))

      assert.equal(used, 1, 'the caller-supplied agent must carry the request')
      assert.deepEqual(agent.options, optionsBefore)
      assert.isUndefined(agent.options.ca)
      assert.lengthOf(srv.urls, 0)
    })
  })

  it('T12: a missing bundle file is an error naming AWS_CA_BUNDLE', async () => {
    process.env.AWS_ENDPOINT_URL_STS = 'https://sts.example.com'
    process.env.AWS_CA_BUNDLE = path.join(tmpDir, 'missing.pem')

    const err = await fails(new IamAwsProvider({}))

    assert.include(err.message, 'AWS_CA_BUNDLE')
  })

  it('T13: a bundle without parseable certificates is an error naming AWS_CA_BUNDLE', async () => {
    process.env.AWS_ENDPOINT_URL_STS = 'https://sts.example.com'
    const empty = path.join(tmpDir, 'empty.pem')
    process.env.AWS_CA_BUNDLE = empty

    fs.writeFileSync(empty, 'not a certificate\n')
    assert.include((await fails(new IamAwsProvider({}))).message, 'AWS_CA_BUNDLE')

    fs.writeFileSync(empty, '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n')
    assert.include((await fails(new IamAwsProvider({}))).message, 'AWS_CA_BUNDLE')
  })

  it('rejects an https agent with an http endpoint from the environment, naming the variable', async () => {
    process.env.AWS_ENDPOINT_URL_STS = 'http://sts.example.com:9000'
    const { agent, requests } = recordingAgent(https.Agent)

    const err = await fails(new IamAwsProvider({ transportAgent: agent }))

    assert.include(err.message, 'AWS_ENDPOINT_URL_STS')
    assert.include(err.message, 'http:')
    assert.include(err.message, 'AWS_IGNORE_CONFIGURED_ENDPOINT_URLS')
    assert.lengthOf(requests, 0)
  })

  it('rejects an http agent with an https stsEndpoint', async () => {
    const { agent, requests } = recordingAgent(http.Agent)

    const err = await fails(new IamAwsProvider({ stsEndpoint: 'https://sts.example.com', transportAgent: agent }))

    assert.include(err.message, 'stsEndpoint')
    // The ignore flag and the variable cannot change an explicit endpoint, so they are not suggested.
    assert.notInclude(err.message, 'AWS_IGNORE_CONFIGURED_ENDPOINT_URLS')
    assert.lengthOf(requests, 0)
  })

  it('accepts an http agent with an http endpoint', async () => {
    const srv = await startServer(http.createServer)
    process.env.AWS_ENDPOINT_URL_STS = `http://127.0.0.1:${srv.port}`

    await new IamAwsProvider({ transportAgent: new http.Agent() }).getCredentials()

    assert.lengthOf(srv.urls, 1)
  })

  it('strips the brackets of an IPv6 endpoint before connecting', async () => {
    const reqs = await chosen({ stsEndpoint: 'https://[::1]:9000/sts' })
    assert.equal(reqs[0].host, '::1')
    assert.match(reqs[0].path, /^\/sts\?/)
  })

  it('T14: a cn- region defaults to sts.<region>.amazonaws.com.cn', async () => {
    process.env.AWS_REGION = 'cn-north-1'
    assert.deepEqual(
      (await chosen()).map((r) => r.host),
      ['sts.cn-north-1.amazonaws.com.cn'],
    )
  })
})
