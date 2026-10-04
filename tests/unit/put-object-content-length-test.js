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

import { once } from 'node:events'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as Stream from 'node:stream'

import { assert } from 'chai'

import { getContentLength } from '../../src/internal/helper.ts'
import * as Minio from '../../src/minio.ts'

// Regression tests for #1502: putObject must use the size of an fs.ReadStream when no size is
// given. The size probe used to be unreachable because `size` was overwritten with the maximum
// object size first, so every file stream went through a multipart upload (which needs the
// ListMultipartUploads permission), even a tiny one.
describe('putObject content length probe (#1502)', () => {
  const fileSize = 1000
  let dir
  let file

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'minio-js-content-length-'))
    file = path.join(dir, 'file.bin')
    fs.writeFileSync(file, Buffer.alloc(fileSize, 'x'))
  })

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  function makeClient() {
    return new Minio.Client({
      endPoint: 'localhost',
      port: 9000,
      useSSL: false,
      accessKey: 'accesskey',
      secretKey: 'secretkey',
    })
  }

  // Stub the uploads so we can observe which path putObject picks without a server.
  function instrument(client) {
    const record = { buffers: [], streams: 0 }
    client.uploadBuffer = async (bucketName, objectName, headers, buf) => {
      record.buffers.push(buf)
      return { etag: 'etag' }
    }
    client.uploadStream = async () => {
      record.streams += 1
      return { etag: 'etag' }
    }
    return record
  }

  it('uploads a small fs.ReadStream with no size as a single request', async () => {
    const client = makeClient()
    const record = instrument(client)

    await client.putObject('bucket', 'object', fs.createReadStream(file))

    assert.equal(record.streams, 0)
    assert.equal(record.buffers.length, 1)
    assert.equal(record.buffers[0].length, fileSize)
  })

  it('still uses a multipart upload for a stream whose size cannot be probed', async () => {
    const client = makeClient()
    const record = instrument(client)

    await client.putObject('bucket', 'object', Stream.Readable.from([Buffer.alloc(10)]))

    assert.equal(record.streams, 1)
    assert.equal(record.buffers.length, 0)
  })

  it('honours an explicit size over the size of the file', async () => {
    const client = makeClient()
    const record = instrument(client)
    const stream = fs.createReadStream(file)

    await client.putObject('bucket', 'object', stream, 200 * 1024 * 1024)
    stream.destroy()

    assert.equal(record.streams, 1)
    assert.equal(record.buffers.length, 0)
  })

  it('reads a file that reports a size of zero instead of uploading an empty object', async () => {
    const client = makeClient()
    const record = instrument(client)
    const empty = path.join(dir, 'empty.bin')
    fs.writeFileSync(empty, '')

    await client.putObject('bucket', 'object', fs.createReadStream(empty))

    assert.equal(record.streams, 1)
    assert.equal(record.buffers.length, 0)
  })
})

describe('getContentLength', () => {
  const fileSize = 1000
  let dir
  let file

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'minio-js-content-length-'))
    file = path.join(dir, 'file.bin')
    fs.writeFileSync(file, Buffer.alloc(fileSize, 'x'))
  })

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  async function measure(stream) {
    try {
      return await getContentLength(stream)
    } finally {
      stream.destroy()
    }
  }

  it('measures a whole file', async () => {
    assert.equal(await measure(fs.createReadStream(file)), fileSize)
  })

  it('measures the byte range of a partial read, not the file on disk', async () => {
    // `end` is inclusive: bytes 100 to 199 are 100 bytes
    assert.equal(await measure(fs.createReadStream(file, { start: 100, end: 199 })), 100)
    assert.equal(await measure(fs.createReadStream(file, { start: 900 })), 100)
    assert.equal(await measure(fs.createReadStream(file, { end: 49 })), 50)
    // a range that runs past the end of the file only covers what exists
    assert.equal(await measure(fs.createReadStream(file, { start: 990, end: 5000 })), 10)
  })

  it('measures the file a symbolic link points to, not the link', async function () {
    const link = path.join(dir, 'link.bin')
    try {
      fs.symlinkSync(file, link)
    } catch (err) {
      // creating symbolic links needs extra privileges on some systems
      this.skip()
    }

    assert.equal(await measure(fs.createReadStream(link)), fileSize)
  })

  it('returns null for a path that is not a regular file', async () => {
    // the size of a pipe, a device or a directory says nothing about what a stream can read from it
    assert.isNull(await measure(fs.createReadStream(dir)))
  })

  it('returns null for a file that reports a size of zero', async () => {
    // some regular files report no size although they have content (e.g. /proc files on Linux), so a
    // size of zero does not prove that the stream is empty
    const empty = path.join(dir, 'empty.bin')
    fs.writeFileSync(empty, '')

    assert.isNull(await measure(fs.createReadStream(empty)))
  })

  it('measures the file the stream opened, not the file the path names later', async function () {
    const swapped = path.join(dir, 'swapped.bin')
    fs.writeFileSync(swapped, Buffer.alloc(fileSize, 'x'))
    const stream = fs.createReadStream(swapped)
    await once(stream, 'open')
    try {
      fs.rmSync(swapped)
      fs.writeFileSync(swapped, Buffer.alloc(5, 'y'))
    } catch (err) {
      // some systems do not allow replacing a file that is open
      stream.destroy()
      this.skip()
    }

    assert.equal(await measure(stream), fileSize)
  })

  it('rejects when the file cannot be opened', async () => {
    let error
    try {
      await measure(fs.createReadStream(path.join(dir, 'missing.bin')))
    } catch (err) {
      error = err
    }

    assert.equal(error && error.code, 'ENOENT')
  })

  it('returns null for a stream that was destroyed before it opened', async () => {
    const stream = fs.createReadStream(file)
    stream.destroy()

    assert.isNull(await getContentLength(stream))
  })

  it('returns null for a stream it cannot measure', async () => {
    assert.isNull(await getContentLength(Stream.Readable.from([Buffer.alloc(10)])))
  })

  it('measures a Buffer and a string', async () => {
    assert.equal(await getContentLength(Buffer.alloc(7)), 7)
    assert.equal(await getContentLength('abc'), 3)
  })
})
