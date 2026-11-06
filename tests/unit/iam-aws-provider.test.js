/*
 * Copyright (c) 2015-2025 MinIO, Inc.
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

import * as assert from 'node:assert'
import * as http from 'node:http'

import { IamAwsProvider } from '../../src/IamAwsProvider.ts'

const ENV_VARS = [
  'AWS_WEB_IDENTITY_TOKEN_FILE',
  'AWS_CONTAINER_AUTHORIZATION_TOKEN',
  'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI',
  'AWS_CONTAINER_CREDENTIALS_FULL_URI',
]

const baseCredentials = {
  SecretAccessKey: 'fake-secret-key',
  Token: 'fake-session-token',
  Expiration: '2099-01-01T00:00:00Z',
}

// Regression test for https://github.com/minio/minio-js/issues/1515
// requestCredentials() read `AccessKeyID`, while AWS returns `AccessKeyId`, so the
// access key was undefined. It also required a `Code` field, which EC2 instance
// metadata returns but the ECS and EKS Pod Identity endpoints do not.
describe('IamAwsProvider #1515 — credential response parsing', () => {
  let server
  let endpoint
  let credentialsResponse
  const savedEnv = {}

  before((done) => {
    server = http.createServer((req, res) => {
      if (req.method === 'PUT' && req.url === '/latest/api/token') {
        res.end('fake-imds-token')
      } else if (req.url === '/latest/meta-data/iam/security-credentials/') {
        res.end('fake-role')
      } else {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(credentialsResponse))
      }
    })
    server.listen(0, '127.0.0.1', () => {
      endpoint = `http://127.0.0.1:${server.address().port}`
      done()
    })
  })

  after((done) => {
    server.close(done)
  })

  beforeEach(() => {
    for (const name of ENV_VARS) {
      savedEnv[name] = process.env[name]
      delete process.env[name]
    }
  })

  afterEach(() => {
    for (const name of ENV_VARS) {
      if (savedEnv[name] === undefined) {
        delete process.env[name]
      } else {
        process.env[name] = savedEnv[name]
      }
    }
  })

  it('reads AccessKeyId from an EC2 instance metadata response', async () => {
    credentialsResponse = { ...baseCredentials, Code: 'Success', AccessKeyId: 'fake-access-key' }

    const credentials = await new IamAwsProvider({ customEndpoint: endpoint }).getCredentials()

    assert.strictEqual(credentials.getAccessKey(), 'fake-access-key')
    assert.strictEqual(credentials.getSecretKey(), 'fake-secret-key')
    assert.strictEqual(credentials.getSessionToken(), 'fake-session-token')
  })

  it('accepts a container credentials response without a Code field', async () => {
    process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI = `${endpoint}/credentials`
    credentialsResponse = { ...baseCredentials, AccessKeyId: 'fake-access-key' }

    const credentials = await new IamAwsProvider({}).getCredentials()

    assert.strictEqual(credentials.getAccessKey(), 'fake-access-key')
  })

  it('still accepts the AccessKeyID casing from custom endpoints', async () => {
    process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI = `${endpoint}/credentials`
    credentialsResponse = { ...baseCredentials, Code: 'Success', AccessKeyID: 'fake-access-key' }

    const credentials = await new IamAwsProvider({}).getCredentials()

    assert.strictEqual(credentials.getAccessKey(), 'fake-access-key')
  })

  it('rejects a response whose Code is not Success', async () => {
    process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI = `${endpoint}/credentials`
    credentialsResponse = {
      ...baseCredentials,
      AccessKeyId: 'fake-access-key',
      Code: 'AssumeRoleUnauthorizedAccess',
      Message: 'denied',
    }

    await assert.rejects(new IamAwsProvider({}).getCredentials(), /failed with code AssumeRoleUnauthorizedAccess/)
  })

  it('rejects a response whose Code is empty', async () => {
    process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI = `${endpoint}/credentials`
    credentialsResponse = { ...baseCredentials, AccessKeyId: 'fake-access-key', Code: '' }

    await assert.rejects(new IamAwsProvider({}).getCredentials(), /failed with code/)
  })

  it('rejects a response without an access key', async () => {
    process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI = `${endpoint}/credentials`
    credentialsResponse = {}

    await assert.rejects(new IamAwsProvider({}).getCredentials(), /failed with code/)
  })
})
