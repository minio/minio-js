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

import * as Crypto from 'node:crypto'
import { Transform } from 'node:stream'

import * as querystring from 'query-string'

import { getVersionId, sanitizeETag } from './internal/helper.ts'

// We extend Transform because Writable does not implement ._flush().
export class ObjectUploader extends Transform {
  constructor(client, bucketName, objectName, partSize, metaData, callback) {
    super()
    this.emptyStream = true
    this.client = client
    this.bucketName = bucketName
    this.objectName = objectName
    // The size of each multipart, chunked by BlockStream2.
    this.partSize = partSize
    // This is the metadata for the object.
    this.metaData = metaData

    // Call like: callback(error, {etag, versionId}).
    this.callback = callback

    // We need to keep track of what number chunk/part we're on. This increments
    // each time _write() is called. Starts with 1, not 0.
    this.partNumber = 1

    // A list of the previously uploaded chunks, for resuming a file upload. This
    // will be null if we aren't resuming an upload.
    this.oldParts = null

    // Keep track of the etags for aggregating the chunks together later. Each
    // etag represents a single chunk of the file.
    this.etags = []

    // This is for the multipart upload request — if null, we're either not initiated
    // yet or we're flushing in one packet.
    this.id = null

    // Handle errors.
    this.on('error', (err) => {
      callback(err)
    })
  }

  _transform(chunk, encoding, callback) {
    this.emptyStream = false
    let method = 'PUT'
    let headers = { 'Content-Length': chunk.length }
    let md5digest = ''

    // Calculate and set Content-MD5 header if SHA256 is not set.
    // This will happen only when there is a secure connection to the s3 server.
    if (!this.client.enableSHA256) {
      md5digest = Crypto.createHash('md5').update(chunk).digest()
      headers['Content-MD5'] = md5digest.toString('base64')
    }
    // We can flush the object in one packet if it fits in one chunk. This is true
    // if the chunk size is smaller than the part size, signifying the end of the
    // stream.
    if (this.partNumber == 1 && chunk.length < this.partSize) {
      // PUT the chunk in a single request — use an empty query.
      let options = {
        method,
        // Set user metadata as this is not a multipart upload
        headers: Object.assign({}, this.metaData, headers),
        query: '',
        bucketName: this.bucketName,
        objectName: this.objectName,
      }

      this.client.makeRequest(options, chunk, [200], '', true, (err, response) => {
        if (err) {
          return callback(err)
        }
        let result = {
          etag: sanitizeETag(response.headers.etag),
          versionId: getVersionId(response.headers),
        }
        // Ignore the 'data' event so that the stream closes. (nodejs stream requirement)
        response.on('data', () => {})

        // Give the etag back, we're done!

        process.nextTick(() => {
          this.callback(null, result)
        })

        // Because we're sure the stream has ended, allow it to flush and end.
        callback()
      })

      return
    }

    // If we aren't flushing in one packet, we need to initiate the multipart upload,
    // if it hasn't already been done. The write will be buffered until the upload has been
    // initiated.
    if (this.id === null) {
      this.once('ready', () => {
        this._transform(chunk, encoding, callback)
      })

      // Check for an incomplete previous upload.
      this.client.findUploadId(this.bucketName, this.objectName, (err, id) => {
        if (err) {
          return this.emit('error', err)
        }

        // If no upload ID exists, initiate a new one.
        if (!id) {
          this.client.initiateNewMultipartUpload(this.bucketName, this.objectName, this.metaData).then(
            (id) => {
              this.id = id

              // We are now ready to accept new chunks — this will flush the buffered chunk.
              this.emit('ready')
            },
            (err) => callback(err),
          )

          return
        }

        this.id = id

        // Retrieve the pre-uploaded parts, if we need to resume the upload.
        this.client.listParts(this.bucketName, this.objectName, id).then(
          (etags) => {
            // It is possible for no parts to be already uploaded.
            if (!etags) {
              etags = []
            }

            // oldParts will become an object, allowing oldParts[partNumber].etag
            this.oldParts = etags.reduce(function (prev, item) {
              if (!prev[item.part]) {
                prev[item.part] = item
              }
              return prev
            }, {})

            this.emit('ready')
          },
          (err) => {
            return this.emit('error', err)
          },
        )
      })

      return
    }

    // Continue uploading various parts if we have initiated multipart upload.
    let partNumber = this.partNumber++

    // Check to see if we've already uploaded this chunk. If the hash sums match,
    // we can skip to the next chunk.
    if (this.oldParts) {
      let oldPart = this.oldParts[partNumber]

      // Calulcate the md5 hash, if it has not already been calculated.
      if (!md5digest) {
        md5digest = Crypto.createHash('md5').update(chunk).digest()
      }

      if (oldPart && md5digest.toString('hex') === oldPart.etag) {
        // The md5 matches, the chunk has already been uploaded.
        this.etags.push({ part: partNumber, etag: oldPart.etag })

        callback()
        return
      }
    }

    // Write the chunk with an uploader.
    let query = querystring.stringify({
      partNumber: partNumber,
      uploadId: this.id,
    })

    let options = {
      method,
      query,
      headers,
      bucketName: this.bucketName,
      objectName: this.objectName,
    }

    this.client.makeRequest(options, chunk, [200], '', true, (err, response) => {
      if (err) {
        return callback(err)
      }

      // In order to aggregate the parts together, we need to collect the etags.
      let etag = response.headers.etag
      if (etag) {
        etag = etag.replace(/^"/, '').replace(/"$/, '')
      }

      this.etags.push({ part: partNumber, etag })

      // Ignore the 'data' event so that the stream closes. (nodejs stream requirement)
      response.on('data', () => {})

      // We're ready for the next chunk.
      callback()
    })
  }

  _flush(callback) {
    if (this.emptyStream) {
      let method = 'PUT'
      let headers = Object.assign({}, this.metaData, { 'Content-Length': 0 })
      let options = {
        method,
        headers,
        query: '',
        bucketName: this.bucketName,
        objectName: this.objectName,
      }

      this.client.makeRequest(options, '', [200], '', true, (err, response) => {
        if (err) {
          return callback(err)
        }

        let result = {
          etag: sanitizeETag(response.headers.etag),
          versionId: getVersionId(response.headers),
        }

        // Ignore the 'data' event so that the stream closes. (nodejs stream requirement)
        response.on('data', () => {})

        // Give the etag back, we're done!
        process.nextTick(() => {
          this.callback(null, result)
        })

        // Because we're sure the stream has ended, allow it to flush and end.
        callback()
      })

      return
    }
    // If it has been uploaded in a single packet, we don't have to do anything.
    if (this.id === null) {
      return
    }

    // This is called when all of the chunks uploaded successfully, thus
    // completing the multipart upload.
    this.client.completeMultipartUpload(this.bucketName, this.objectName, this.id, this.etags, (err, etag) => {
      if (err) {
        return callback(err)
      }

      // Call our callback on the next tick to allow the streams infrastructure
      // to finish what its doing before we continue.
      process.nextTick(() => {
        this.callback(null, etag)
      })

      callback()
    })
  }
}

// deprecated default export, please use named exports.
// keep for backward compatibility.
// eslint-disable-next-line import/no-default-export
export default ObjectUploader
