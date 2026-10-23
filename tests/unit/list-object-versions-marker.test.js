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

import { parseListObjects } from '../../src/internal/xml-parser.ts'
import * as Minio from '../../src/minio.ts'

// Regression test for the versioned listing (listObjects with IncludeVersion).
// The second and later pages are requested with key-marker / version-id-marker.
// Those were put into the query string unescaped, while the signature is
// computed over the escaped query, so any marker containing a '/' (every key
// inside a "directory") made the server answer SignatureDoesNotMatch after the
// first 1000 versions. The markers must be escaped like `marker` is for the
// plain listing, and NextKeyMarker must be decoded like keys are, because the
// listing is requested with encoding-type=url.
describe('listObjects() with IncludeVersion — markers of the next page', () => {
  let server
  let port
  const requests = []

  const page1 = `<?xml version="1.0" encoding="UTF-8"?>
<ListVersionsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Name>bucket</Name><Prefix>dir%2F</Prefix><KeyMarker></KeyMarker><VersionIdMarker></VersionIdMarker>
  <MaxKeys>1000</MaxKeys><Delimiter>%2F</Delimiter><EncodingType>url</EncodingType><IsTruncated>true</IsTruncated>
  <NextKeyMarker>dir/a%20b%5Bx%5D</NextKeyMarker><NextVersionIdMarker>v/1</NextVersionIdMarker>
  <Version><Key>dir/a%20b%5Bx%5D</Key><VersionId>v/1</VersionId><IsLatest>true</IsLatest>
    <LastModified>2025-01-01T00:00:00.000Z</LastModified><ETag>"e1"</ETag><Size>1</Size></Version>
</ListVersionsResult>`
  const page2 = `<?xml version="1.0" encoding="UTF-8"?>
<ListVersionsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Name>bucket</Name><Prefix>dir%2F</Prefix><MaxKeys>1000</MaxKeys><Delimiter>%2F</Delimiter>
  <EncodingType>url</EncodingType><IsTruncated>false</IsTruncated>
  <Version><Key>dir/c</Key><VersionId>v2</VersionId><IsLatest>true</IsLatest>
    <LastModified>2025-01-01T00:00:00.000Z</LastModified><ETag>"e2"</ETag><Size>2</Size></Version>
</ListVersionsResult>`

  before((done) => {
    server = http.createServer((req, res) => {
      requests.push(req.url)
      res.setHeader('content-type', 'application/xml')
      res.end(requests.length === 1 ? page1 : page2)
    })
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port
      done()
    })
  })

  after((done) => {
    server.close(done)
  })

  it('sends key-marker and version-id-marker escaped, decoded from the previous page', async () => {
    const client = new Minio.Client({
      endPoint: '127.0.0.1',
      port,
      useSSL: false,
      accessKey: 'accesskey',
      secretKey: 'secretkey',
      region: 'us-east-1',
    })
    const names = []
    for await (const obj of client.listObjects('bucket', 'dir/', false, { IncludeVersion: true })) {
      names.push(obj.name)
    }
    assert.deepStrictEqual(names, ['dir/a b[x]', 'dir/c'])
    assert.strictEqual(requests.length, 2)
    const query = new URL(requests[1], 'http://x').search
    assert.ok(query.includes('&key-marker=dir%2Fa%20b%5Bx%5D&'), `key-marker not escaped: ${query}`)
    assert.ok(query.includes('&version-id-marker=v%2F1&'), `version-id-marker not escaped: ${query}`)
  })

  it('parseListObjects decodes NextKeyMarker of an encoding-type=url listing', () => {
    const result = parseListObjects(page1)
    assert.strictEqual(result.isTruncated, true)
    assert.strictEqual(result.keyMarker, 'dir/a b[x]')
    assert.strictEqual(result.versionIdMarker, 'v/1')
    assert.strictEqual(result.objects[0].name, 'dir/a b[x]')
  })
})
