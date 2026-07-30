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

import { CopyDestinationOptions, CopySourceOptions } from '../../src/helpers.ts'
import * as Minio from '../../src/minio.ts'

const FIVE_MIB = 5 * 1024 * 1024

// Regression test for https://github.com/minio/minio-js/issues/1385
// composeObject()'s multipart copy path set `x-amz-copy-source` from the raw
// `bucket/object` string. When the source object name contained non-ASCII
// characters (e.g. Chinese), Node's http `setHeader` threw `ERR_INVALID_CHAR`,
// so the copy-part PUTs were never sent and the upload was aborted.
describe('composeObject() #1385 — non-ASCII source object names', () => {
  let server
  let port
  const copySourceHeaders = []

  beforeEach(() => {
    copySourceHeaders.length = 0
  })

  before((done) => {
    server = http.createServer((req, res) => {
      const url = req.url
      const method = req.method
      if (req.headers['x-amz-copy-source']) {
        copySourceHeaders.push(req.headers['x-amz-copy-source'])
      }
      req.on('data', () => {})
      req.on('end', () => {
        if (method === 'HEAD') {
          res.setHeader('content-length', String(FIVE_MIB))
          res.setHeader('etag', '"d41d8cd98f00b204e9800998ecf8427e"')
          res.setHeader('last-modified', new Date('2024-01-01T00:00:00Z').toUTCString())
          res.statusCode = 200
          return res.end()
        }
        if (method === 'GET' && /location/.test(url)) {
          res.statusCode = 200
          return res.end('<LocationConstraint>us-east-1</LocationConstraint>')
        }
        if (method === 'POST' && /uploads/.test(url)) {
          res.statusCode = 200
          return res.end(
            '<InitiateMultipartUploadResult><Bucket>b</Bucket><Key>k</Key><UploadId>UP-ID-1</UploadId></InitiateMultipartUploadResult>',
          )
        }
        if (method === 'PUT') {
          res.setHeader('etag', '"abc123"')
          res.statusCode = 200
          return res.end(
            '<CopyPartResult><ETag>"abc123"</ETag><LastModified>2024-01-01T00:00:00Z</LastModified></CopyPartResult>',
          )
        }
        if (method === 'POST' && /uploadId/.test(url)) {
          res.statusCode = 200
          return res.end(
            '<CompleteMultipartUploadResult><Location>l</Location><Bucket>b</Bucket><Key>k</Key><ETag>"final"</ETag></CompleteMultipartUploadResult>',
          )
        }
        if (method === 'DELETE') {
          res.statusCode = 204
          return res.end()
        }
        res.statusCode = 200
        res.end()
      })
    })
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port
      done()
    })
  })

  after((done) => server.close(done))

  it('escapes x-amz-copy-source so non-ASCII names do not throw ERR_INVALID_CHAR', async () => {
    const client = new Minio.Client({
      endPoint: '127.0.0.1',
      port,
      accessKey: 'accesskey',
      secretKey: 'secretkey',
      useSSL: false,
      region: 'us-east-1',
    })

    const bucket = 'test-bucket'
    const src1 = '目录/对象-甲.txt'
    const src2 = '目录/对象-乙.txt'

    const sources = [
      new CopySourceOptions({ Bucket: bucket, Object: src1 }),
      new CopySourceOptions({ Bucket: bucket, Object: src2 }),
    ]
    const dest = new CopyDestinationOptions({ Bucket: bucket, Object: '合并结果.txt' })

    const result = await client.composeObject(dest, sources)

    // Both copy-part PUTs must have been sent (the bug aborted the upload before any PUT).
    assert.strictEqual(copySourceHeaders.length, 2, 'expected 2 copy-part PUTs')
    // The header must be URI-escaped — no raw non-ASCII byte may reach setHeader.
    for (const h of copySourceHeaders) {
      assert.ok(
        [...h].every((ch) => ch.charCodeAt(0) <= 127),
        `x-amz-copy-source must be escaped, got: ${h}`,
      )
    }
    // composeObject() sends the copy-part PUTs concurrently, so the observed
    // order is not deterministic — compare as a set.
    assert.deepStrictEqual(
      [...copySourceHeaders].sort(),
      [encodeURI(`${bucket}/${src1}`), encodeURI(`${bucket}/${src2}`)].sort(),
    )
    assert.ok(result && result.etag, 'composeObject should resolve to a result')
  })

  // composeObject() now leaves x-amz-copy-source as CopySourceOptions.getHeaders()
  // prepared it. That value carries the ?versionId selector for a pinned source
  // version, which the old overwrite silently dropped.
  it('preserves the ?versionId selector (and escaping) on the copy source', async () => {
    const client = new Minio.Client({
      endPoint: '127.0.0.1',
      port,
      accessKey: 'accesskey',
      secretKey: 'secretkey',
      useSSL: false,
      region: 'us-east-1',
    })

    const bucket = 'test-bucket'
    const versionedSrc = '目录/带版本-甲.txt'
    const versionId = '3f9d1c2a-1111-2222-3333-444455556666'
    const plainSrc = '目录/对象-乙.txt'

    // Two sources force the multipart UploadPartCopy path; a single small source
    // would short-circuit to copyObject() and never exercise this code.
    const sources = [
      new CopySourceOptions({ Bucket: bucket, Object: versionedSrc, VersionID: versionId }),
      new CopySourceOptions({ Bucket: bucket, Object: plainSrc }),
    ]
    const dest = new CopyDestinationOptions({ Bucket: bucket, Object: '版本结果.txt' })

    await client.composeObject(dest, sources)

    assert.strictEqual(copySourceHeaders.length, 2, 'expected 2 copy-part PUTs')
    for (const h of copySourceHeaders) {
      assert.ok(
        [...h].every((ch) => ch.charCodeAt(0) <= 127),
        `x-amz-copy-source must be escaped, got: ${h}`,
      )
    }
    assert.deepStrictEqual(
      [...copySourceHeaders].sort(),
      [`${encodeURI(`${bucket}/${versionedSrc}`)}?versionId=${versionId}`, encodeURI(`${bucket}/${plainSrc}`)].sort(),
    )
  })
})
