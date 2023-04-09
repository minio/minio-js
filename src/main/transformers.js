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

import Crypto from "crypto"
import JSONParser from "json-stream"
import * as _ from "lodash"
import Through2 from "through2"

import * as errors from "./errors"
import { isFunction } from "./helpers"
import * as xmlParsers from "./xml-parsers"

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
    }
  )
}

// Generates an Error object depending on http statusCode and XML body
export function getErrorTransformer(response) {
  var statusCode = response.statusCode
  var code, message
  if (statusCode === 301) {
    code = "MovedPermanently"
    message = "Moved Permanently"
  } else if (statusCode === 307) {
    code = "TemporaryRedirect"
    message = "Are you using the correct endpoint URL?"
  } else if (statusCode === 403) {
    code = "AccessDenied"
    message = "Valid and authorized credentials required"
  } else if (statusCode === 404) {
    code = "NotFound"
    message = "Not Found"
  } else if (statusCode === 405) {
    code = "MethodNotAllowed"
    message = "Method Not Allowed"
  } else if (statusCode === 501) {
    code = "MethodNotAllowed"
    message = "Method Not Allowed"
  } else {
    code = "UnknownError"
    message = `${statusCode}`
  }

  var headerInfo = {}
  // A value created by S3 compatible server that uniquely identifies
  // the request.
  headerInfo.amzRequestid = response.headersSent ? response.getHeader("x-amz-request-id") : null
  // A special token that helps troubleshoot API replies and issues.
  headerInfo.amzId2 = response.headersSent ? response.getHeader("x-amz-id-2") : null
  // Region where the bucket is located. This header is returned only
  // in HEAD bucket and ListObjects response.
  headerInfo.amzBucketRegion = response.headersSent ? response.getHeader("x-amz-bucket-region") : null

  return getConcater((xmlString) => {
    let getError = () => {
      // Message should be instantiated for each S3Errors.
      var e = new errors.S3Error(message)
      // S3 Error code.
      e.code = code
      _.each(headerInfo, (value, key) => {
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

// A through stream that calculates md5sum and sha256sum
export function getHashSummer(enableSHA256) {
  var md5 = Crypto.createHash("md5")
  var sha256 = Crypto.createHash("sha256")

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
      var md5sum = ""
      var sha256sum = ""
      if (enableSHA256) {
        sha256sum = sha256.digest("hex")
      } else {
        md5sum = md5.digest("base64")
      }
      var hashData = { md5sum, sha256sum }
      this.push(hashData)
      this.push(null)
      cb()
    }
  )
}

// Following functions return a stream object that parses XML
// and emits suitable Javascript objects.

// Parses CopyObject response.
export function getCopyObjectTransformer() {
  return getConcater(xmlParsers.parseCopyObject)
}

// Parses listBuckets response.
export function getListBucketTransformer() {
  return getConcater(xmlParsers.parseListBucket)
}

// Parses listMultipartUploads response.
export function getListMultipartTransformer() {
  return getConcater(xmlParsers.parseListMultipart)
}

// Parses listParts response.
export function getListPartsTransformer() {
  return getConcater(xmlParsers.parseListParts)
}

// Parses initMultipartUpload response.
export function getInitiateMultipartTransformer() {
  return getConcater(xmlParsers.parseInitiateMultipart)
}

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

// Parses completeMultipartUpload response.
export function getCompleteMultipartTransformer() {
  return getConcater(xmlParsers.parseCompleteMultipart)
}

// Parses getBucketLocation response.
export function getBucketRegionTransformer() {
  return getConcater(xmlParsers.parseBucketRegion)
}

// Parses GET/SET BucketNotification response
export function getBucketNotificationTransformer() {
  return getConcater(xmlParsers.parseBucketNotification)
}

// Parses a notification.
export function getNotificationTransformer() {
  // This will parse and return each object.
  return new JSONParser()
}

export function bucketVersioningTransformer() {
  return getConcater(xmlParsers.parseBucketVersioningConfig)
}

export function getTagsTransformer() {
  return getConcater(xmlParsers.parseTagging)
}

export function lifecycleTransformer() {
  return getConcater(xmlParsers.parseLifecycleConfig)
}

export function objectLockTransformer() {
  return getConcater(xmlParsers.parseObjectLockConfig)
}

export function objectRetentionTransformer() {
  return getConcater(xmlParsers.parseObjectRetentionConfig)
}
export function bucketEncryptionTransformer() {
  return getConcater(xmlParsers.parseBucketEncryptionConfig)
}

export function replicationConfigTransformer() {
  return getConcater(xmlParsers.parseReplicationConfig)
}

export function objectLegalHoldTransformer() {
  return getConcater(xmlParsers.parseObjectLegalHoldConfig)
}

export function uploadPartTransformer() {
  return getConcater(xmlParsers.uploadPartParser)
}
export function selectObjectContentTransformer() {
  return getConcater()
}

export function removeObjectsTransformer() {
  return getConcater(xmlParsers.removeObjectsParser)
}
