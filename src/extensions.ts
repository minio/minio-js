/*
 * MinIO Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2020 MinIO, Inc.
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

import * as stream from 'node:stream'

import { isBoolean, isNumber, isString } from './assert.ts'
import * as errors from './errors.ts'
import { isValidBucketName, isValidPrefix, pipesetup, uriEscape } from './helpers.ts'
import * as transformers from './transformers.ts'
import type { Client } from './typed-client2.ts'

// TODO
type S3Object = unknown

export class extensions {
  constructor(readonly client: Client) {}

  // List the objects in the bucket using S3 ListObjects V2 With Metadata
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `prefix` _string_: the prefix of the objects that should be listed (optional, default `''`)
  // * `recursive` _bool_: `true` indicates recursive style listing and `false` indicates directory style listing delimited by '/'. (optional, default `false`)
  // * `startAfter` _string_: Specifies the key to start after when listing objects in a bucket. (optional, default `''`)
  //
  // __Return Value__
  // * `stream` _Stream_: stream emitting the objects in the bucket, the object is of the format:
  //   * `obj.name` _string_: name of the object
  //   * `obj.prefix` _string_: name of the object prefix
  //   * `obj.size` _number_: size of the object
  //   * `obj.etag` _string_: etag of the object
  //   * `obj.lastModified` _Date_: modified time stamp
  //   * `obj.metadata` _object_: metadata of the object

  listObjectsV2WithMetadata(bucketName: string, prefix: string, recursive: boolean, startAfter: string) {
    if (prefix === undefined) {
      prefix = ''
    }
    if (recursive === undefined) {
      recursive = false
    }
    if (startAfter === undefined) {
      startAfter = ''
    }
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidPrefix(prefix)) {
      throw new errors.InvalidPrefixError(`Invalid prefix : ${prefix}`)
    }
    if (!isString(prefix)) {
      throw new TypeError('prefix should be of type "string"')
    }
    if (!isBoolean(recursive)) {
      throw new TypeError('recursive should be of type "boolean"')
    }
    if (!isString(startAfter)) {
      throw new TypeError('startAfter should be of type "string"')
    }
    // if recursive is false set delimiter to '/'
    const delimiter = recursive ? '' : '/'
    let continuationToken = ''
    let objects: S3Object[] = []
    let ended = false
    const readStream = new stream.Readable({ objectMode: true })
    readStream._read = () => {
      // push one object per _read()
      if (objects.length) {
        readStream.push(objects.shift())
        return
      }
      if (ended) {
        return readStream.push(null)
      }
      // if there are no objects to push do query for the next batch of objects
      this.listObjectsV2WithMetadataQuery(bucketName, prefix, continuationToken, delimiter, 1000, startAfter)
        .on('error', (e) => readStream.emit('error', e))
        .on('data', (result) => {
          if (result.isTruncated) {
            continuationToken = result.nextContinuationToken
          } else {
            ended = true
          }
          objects = result.objects
          // @ts-expect-error read more
          readStream._read()
        })
    }
    return readStream
  }

  // listObjectsV2WithMetadataQuery - (List Objects V2 with metadata) - List some or all (up to 1000) of the objects in a bucket.
  //
  // You can use the request parameters as selection criteria to return a subset of the objects in a bucket.
  // request parameters :-
  // * `bucketName` _string_: name of the bucket
  // * `prefix` _string_: Limits the response to keys that begin with the specified prefix.
  // * `continuation-token` _string_: Used to continue iterating over a set of objects.
  // * `delimiter` _string_: A delimiter is a character you use to group keys.
  // * `max-keys` _number_: Sets the maximum number of keys returned in the response body.
  // * `start-after` _string_: Specifies the key to start after when listing objects in a bucket.

  private listObjectsV2WithMetadataQuery(
    bucketName: string,
    prefix: string,
    continuationToken: string,
    delimiter: string,
    maxKeys: number,
    startAfter: string,
  ) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isString(prefix)) {
      throw new TypeError('prefix should be of type "string"')
    }
    if (!isString(continuationToken)) {
      throw new TypeError('continuationToken should be of type "string"')
    }
    if (!isString(delimiter)) {
      throw new TypeError('delimiter should be of type "string"')
    }
    if (!isNumber(maxKeys)) {
      throw new TypeError('maxKeys should be of type "number"')
    }
    if (!isString(startAfter)) {
      throw new TypeError('startAfter should be of type "string"')
    }
    const queries = []

    // Call for listing objects v2 API
    queries.push(`list-type=2`)
    queries.push(`encoding-type=url`)
    // escape every value in query string, except maxKeys
    queries.push(`prefix=${uriEscape(prefix)}`)
    queries.push(`delimiter=${uriEscape(delimiter)}`)
    queries.push(`metadata=true`)

    if (continuationToken) {
      continuationToken = uriEscape(continuationToken)
      queries.push(`continuation-token=${continuationToken}`)
    }
    // Set start-after
    if (startAfter) {
      startAfter = uriEscape(startAfter)
      queries.push(`start-after=${startAfter}`)
    }
    // no need to escape maxKeys
    if (maxKeys) {
      if (maxKeys >= 1000) {
        maxKeys = 1000
      }
      queries.push(`max-keys=${maxKeys}`)
    }
    queries.sort()
    let query = ''
    if (queries.length > 0) {
      query = `${queries.join('&')}`
    }
    const method = 'GET'
    const transformer = transformers.getListObjectsV2WithMetadataTransformer()
    this.client
      .makeRequestAsync({
        method,
        bucketName,
        query,
      })
      .then(
        (response) => {
          if (!response) {
            throw new Error('BUG: callback missing response argument')
          }
          pipesetup(response, transformer)
        },
        (e) => {
          return transformer.emit('error', e)
        },
      )
    return transformer
  }
}
