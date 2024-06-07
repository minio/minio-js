/*
 * MinIO Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2015, 2016 MinIO, Inc.
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

import Through2 from 'through2'

import { isFunction } from './internal/helper.ts'
import * as xmlParsers from './xml-parsers.js'

// getConcater returns a stream that concatenates the input and emits
// the concatenated output when 'end' has reached. If an optional
// parser function is passed upon reaching the 'end' of the stream,
// `parser(concatenated_data)` will be emitted.
export function getConcater(parser, emitError) {
  var objectMode = false
  var bufs = []

  if (parser && !isFunction(parser)) {
    throw new TypeError('parser should be of type "function"')
  }

  if (parser) {
    objectMode = true
  }

  return Through2(
    { objectMode },
    function (chunk, enc, cb) {
      bufs.push(chunk)
      cb()
    },
    function (cb) {
      if (emitError) {
        cb(parser(Buffer.concat(bufs).toString()))
        // cb(e) would mean we have to emit 'end' by explicitly calling this.push(null)
        this.push(null)
        return
      }
      if (bufs.length) {
        if (parser) {
          this.push(parser(Buffer.concat(bufs).toString()))
        } else {
          this.push(Buffer.concat(bufs))
        }
      }
      cb()
    },
  )
}

// A through stream that calculates md5sum and sha256sum
export function getHashSummer(enableSHA256) {
  var md5 = Crypto.createHash('md5')
  var sha256 = Crypto.createHash('sha256')

  return Through2.obj(
    function (chunk, enc, cb) {
      if (enableSHA256) {
        sha256.update(chunk)
      } else {
        md5.update(chunk)
      }
      cb()
    },
    function (cb) {
      var md5sum = ''
      var sha256sum = ''
      if (enableSHA256) {
        sha256sum = sha256.digest('hex')
      } else {
        md5sum = md5.digest('base64')
      }
      var hashData = { md5sum, sha256sum }
      this.push(hashData)
      this.push(null)
      cb()
    },
  )
}

// Following functions return a stream object that parses XML
// and emits suitable Javascript objects.

// Parses listObjects response.
export function getListObjectsTransformer() {
  return getConcater(xmlParsers.parseListObjects)
}

// Parses listObjects response.
export function getListObjectsV2Transformer() {
  return getConcater(xmlParsers.parseListObjectsV2)
}

// Parses listObjects with metadata response.
export function getListObjectsV2WithMetadataTransformer() {
  return getConcater(xmlParsers.parseListObjectsV2WithMetadata)
}

// Parses GET/SET BucketNotification response
export function getBucketNotificationTransformer() {
  return getConcater(xmlParsers.parseBucketNotification)
}
