/*
 * MinIO Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2016 MinIO, Inc.
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

import { expect, use } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import Nock from 'nock'

import { IamAwsProvider } from '../../src/IamAwsProvider.ts'

use(chaiAsPromised)

const credentialEnvKeys = [
  'AWS_WEB_IDENTITY_TOKEN_FILE',
  'AWS_CONTAINER_AUTHORIZATION_TOKEN',
  'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI',
  'AWS_CONTAINER_CREDENTIALS_FULL_URI',
]

const credentialsResponse = {
  AccessKeyID: 'access-key',
  SecretAccessKey: 'secret-key',
  Token: 'session-token',
  Expiration: '2099-01-01T00:00:00Z',
  Code: 'Success',
  Message: '',
}

describe('IamAwsProvider container credential URI validation', () => {
  const originalEnv = {}

  beforeEach(() => {
    for (const key of credentialEnvKeys) {
      originalEnv[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    Nock.cleanAll()
    for (const key of credentialEnvKeys) {
      if (originalEnv[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = originalEnv[key]
      }
    }
  })

  for (const relativeUri of ['http://127.0.0.1/credentials', '//127.0.0.1/credentials', String.raw`\evil.test`]) {
    it(`rejects non-relative AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ${relativeUri}`, async () => {
      process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI = relativeUri

      const provider = new IamAwsProvider({})
      await expect(provider.getCredentials()).to.be.rejectedWith(
        'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI must be a relative path',
      )
    })
  }

  it('rejects a relative URI that resolves outside the ECS credentials endpoint', async () => {
    process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI = '/\t/127.0.0.1:1234/credentials'

    const provider = new IamAwsProvider({})
    await expect(provider.getCredentials()).to.be.rejectedWith(
      'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI must resolve to the ECS credentials endpoint',
    )
  })

  it('rejects an HTTP full URI outside ECS and loopback hosts', async () => {
    process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI = 'http://10.0.0.1/credentials'

    const provider = new IamAwsProvider({})
    await expect(provider.getCredentials()).to.be.rejectedWith(
      'HTTP container credentials URI must use an ECS or loopback host',
    )
  })

  it('rejects unsupported full URI protocols', async () => {
    process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI = 'file:///credentials'

    const provider = new IamAwsProvider({})
    await expect(provider.getCredentials()).to.be.rejectedWith('Container credentials URI must use HTTP or HTTPS')
  })

  for (const fullUri of ['https://user:password@example.com/credentials', 'https://example.com/credentials#token']) {
    it(`rejects a full URI containing user information or a fragment: ${fullUri}`, async () => {
      process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI = fullUri

      const provider = new IamAwsProvider({})
      await expect(provider.getCredentials()).to.be.rejectedWith(
        'Container credentials URI must not contain user information or a fragment',
      )
    })
  }

  it('uses the ECS endpoint for a relative URI', async () => {
    process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI = '/v2/credentials/id'
    process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN = 'authorization-token'
    const request = Nock('http://169.254.170.2', {
      reqheaders: { Authorization: 'authorization-token' },
    })
      .get('/v2/credentials/id')
      .reply(200, credentialsResponse)

    const credentials = await new IamAwsProvider({}).getCredentials()

    expect(credentials.getAccessKey()).to.equal(credentialsResponse.AccessKeyID)
    expect(credentials.getSecretKey()).to.equal(credentialsResponse.SecretAccessKey)
    expect(credentials.getSessionToken()).to.equal(credentialsResponse.Token)
    expect(request.isDone()).to.equal(true)
  })

  it('allows the EKS Pod Identity credentials endpoint', async () => {
    process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI = 'http://169.254.170.23/v1/credentials'
    const request = Nock('http://169.254.170.23').get('/v1/credentials').reply(200, credentialsResponse)

    await new IamAwsProvider({}).getCredentials()

    expect(request.isDone()).to.equal(true)
  })

  it('allows an HTTPS full URI', async () => {
    process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI = 'https://credentials.example.test/v1/credentials'
    const request = Nock('https://credentials.example.test').get('/v1/credentials').reply(200, credentialsResponse)

    await new IamAwsProvider({}).getCredentials()

    expect(request.isDone()).to.equal(true)
  })
})
