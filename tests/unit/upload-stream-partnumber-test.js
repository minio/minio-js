/*
 * MinIO Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2015 MinIO, Inc.
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

import * as Crypto from 'node:crypto'
import * as Stream from 'node:stream'

import { assert } from 'chai'

import * as Minio from '../../src/minio.ts'

// Regression tests for #1482: uploadStream must assign multipart part numbers
// consistently between the resume-skip branch and the upload branch. It used to
// increment partNumber *before* uploading, so a fresh upload started at part 2
// and a resumed upload numbered re-uploaded chunks off-by-one relative to the
// parts it skipped, corrupting the completed multipart upload.
describe('uploadStream multipart part numbering (#1482)', () => {
  const partSize = 64

  // A byte-mode stream that emits `count` chunks of `partSize` bytes, one per
  // event-loop tick, so BlockStream2 yields them individually to uploadStream.
  function bodyStream(count) {
    const readable = new Stream.Readable({ read() {} })
    ;(async () => {
      for (let i = 0; i < count; i++) {
        readable.push(Buffer.alloc(partSize, 'x'))
        await new Promise(setImmediate)
      }
      readable.push(null)
    })()
    return readable
  }

  function makeClient() {
    return new Minio.Client({
      endPoint: 'localhost',
      port: 9000,
      useSSL: false,
      accessKey: 'accesskey',
      secretKey: 'secretkey',
    })
  }

  // Stub the network-touching internals so we can observe the part numbers
  // uploadStream assigns without talking to a server.
  function instrument(client, oldParts = []) {
    const record = { sentPartNumbers: [], completedParts: null }
    client.findUploadId = async () => (oldParts.length ? 'existing-upload-id' : undefined)
    client.initiateNewMultipartUpload = async () => 'new-upload-id'
    client.listParts = async () => oldParts
    client.makeRequestAsyncOmit = async (options) => {
      const partNumber = Number(new URLSearchParams(options.query).get('partNumber'))
      record.sentPartNumbers.push(partNumber)
      return { headers: { etag: `"etag-${partNumber}"` } }
    }
    client.completeMultipartUpload = async (bucketName, objectName, uploadId, eTags) => {
      record.completedParts = eTags.map((e) => e.part)
      return { etag: 'final-etag' }
    }
    return record
  }

  it('numbers a fresh multipart upload starting at part 1', async () => {
    const client = makeClient()
    const record = instrument(client)

    await client.uploadStream('bucket', 'object', {}, bodyStream(3), partSize)

    assert.deepEqual(record.sentPartNumbers, [1, 2, 3])
    assert.deepEqual(record.completedParts, [1, 2, 3])
  })

  it('numbers re-uploaded parts consistently with skipped parts when resuming', async () => {
    const client = makeClient()

    // A prior upload already stored the first two (identical) chunks as parts 1 and 2.
    const chunkETag = Crypto.createHash('md5').update(Buffer.alloc(partSize, 'x')).digest('hex')
    const oldParts = [
      { part: 1, etag: chunkETag },
      { part: 2, etag: chunkETag },
    ]
    const record = instrument(client, oldParts)

    await client.uploadStream('bucket', 'object', {}, bodyStream(3), partSize)

    // parts 1 and 2 are skipped; only the third chunk is uploaded, as part 3.
    assert.deepEqual(record.sentPartNumbers, [3])
    assert.deepEqual(record.completedParts, [1, 2, 3])
  })
})
