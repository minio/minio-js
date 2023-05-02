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

import * as crypto from 'node:crypto'
import type { ServerResponse } from 'node:http'
import type * as stream from 'node:stream'

import Through2 from 'through2'

import * as errors from './errors.ts'
import { isFunction } from './helpers.ts'
import * as xmlParsers from './xml-parsers.ts'

// getConcater returns a stream that concatenates the input and emits
// the concatenated output when 'end' has reached. If an optional
// parser function is passed upon reaching the 'end' of the stream,
// `parser(concatenated_data)` will be emitted.
export function getConcater(parser?: undefined | ((xml: string) => any), emitError?: boolean): stream.Transform {
  let objectMode = false
  const bufs: Buffer[] = []

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
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        cb(parser(Buffer.concat(bufs).toString()))
        // cb(e) would mean we have to emit 'end' by explicitly calling this.push(null)
        this.push(null)
        return
      }
      if (bufs.length) {
        if (parser) {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          this.push(parser(Buffer.concat(bufs).toString()))
        } else {
          this.push(Buffer.concat(bufs))
        }
      }
      cb()
    },
  )
}

// Generates an Error object depending on http statusCode and XML body
export function getErrorTransformer(response: ServerResponse) {
  const statusCode = response.statusCode
  let code: string, message: string
  if (statusCode === 301) {
    code = 'MovedPermanently'
    message = 'Moved Permanently'
  } else if (statusCode === 307) {
    code = 'TemporaryRedirect'
    message = 'Are you using the correct endpoint URL?'
  } else if (statusCode === 403) {
    code = 'AccessDenied'
    message = 'Valid and authorized credentials required'
  } else if (statusCode === 404) {
    code = 'NotFound'
    message = 'Not Found'
  } else if (statusCode === 405) {
    code = 'MethodNotAllowed'
    message = 'Method Not Allowed'
  } else if (statusCode === 501) {
    code = 'MethodNotAllowed'
    message = 'Method Not Allowed'
  } else {
    code = 'UnknownError'
    message = `${statusCode}`
  }

  const headerInfo: Record<string, string | undefined | null> = {}
  // A value created by S3 compatible server that uniquely identifies the request.
  headerInfo.amzRequestid = response.headersSent ? (response.getHeader('x-amz-request-id') as string | undefined) : null
  // A special token that helps troubleshoot API replies and issues.
  headerInfo.amzId2 = response.headersSent ? (response.getHeader('x-amz-id-2') as string | undefined) : null
  // Region where the bucket is located. This header is returned only
  // in HEAD bucket and ListObjects response.
  headerInfo.amzBucketRegion = response.headersSent
    ? (response.getHeader('x-amz-bucket-region') as string | undefined)
    : null

  return getConcater((xmlString) => {
    const getError = () => {
      // Message should be instantiated for each S3Errors.
      const e = new errors.S3Error(message, { cause: headerInfo })
      // S3 Error code.
      e.code = code
      Object.entries(headerInfo).forEach(([key, value]) => {
        // @ts-expect-error force set error properties
        e[key] = value
      })
      return e
    }
    if (!xmlString) {
      return getError()
    }
    let e
    try {
      e = xmlParsers.parseError(xmlString, headerInfo)
    } catch (ex) {
      return getError()
    }
    return e
  }, true)
}

export function hashBinary(buf: Buffer, enableSHA256: boolean) {
  let sha256sum = ''
  if (enableSHA256) {
    sha256sum = crypto.createHash('sha256').update(buf).digest('hex')
  }
  const md5sum = crypto.createHash('md5').update(buf).digest('base64')

  return { md5sum, sha256sum }
}

// Following functions return a stream object that parses XML
// and emits suitable Javascript objects.

// Parses listMultipartUploads response.
export function getListMultipartTransformer() {
  return getConcater(xmlParsers.parseListMultipart)
}

// Parses listObjects response.
export function getListObjectsV2Transformer() {
  return getConcater(xmlParsers.parseListObjectsV2)
}

// Parses listObjects with metadata response.
export function getListObjectsV2WithMetadataTransformer() {
  return getConcater(xmlParsers.parseListObjectsV2WithMetadata)
}
