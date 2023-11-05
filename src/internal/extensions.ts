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

import * as errors from '../errors.ts'
import type { TypedClient } from './client.ts'
import { isBoolean, isString, isValidBucketName, isValidPrefix, uriEscape } from './helper.ts'
import { readAsString } from './response.ts'
import type { BucketItemWithMetadata, BucketStream } from './type.ts'
import { parseListObjectsV2WithMetadata } from './xml-parser.ts'

export class Extensions {
  constructor(private readonly client: TypedClient) {}

  /**
   * List the objects in the bucket using S3 ListObjects V2 With Metadata
   *
   * @param bucketName - name of the bucket
   * @param prefix - the prefix of the objects that should be listed (optional, default `''`)
   * @param recursive - `true` indicates recursive style listing and `false` indicates directory style listing delimited by '/'. (optional, default `false`)
   * @param startAfter - Specifies the key to start after when listing objects in a bucket. (optional, default `''`)
   * @returns stream emitting the objects in the bucket, the object is of the format:
   */
  public listObjectsV2WithMetadata(
    bucketName: string,
    prefix?: string,
    recursive?: boolean,
    startAfter?: string,
  ): BucketStream<BucketItemWithMetadata> {
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
    return stream.Readable.from(this.listObjectsV2WithMetadataGen(bucketName, prefix, delimiter, startAfter), {
      objectMode: true,
    })
  }

  private async *listObjectsV2WithMetadataGen(
    bucketName: string,
    prefix: string,
    delimiter: string,
    startAfter: string,
  ): AsyncIterable<BucketItemWithMetadata> {
    let ended = false
    let continuationToken = ''
    do {
      const result = await this.listObjectsV2WithMetadataQuery(
        bucketName,
        prefix,
        continuationToken,
        delimiter,
        startAfter,
      )
      ended = !result.isTruncated
      continuationToken = result.nextContinuationToken
      for (const obj of result.objects) {
        yield obj
      }
    } while (!ended)
  }

  private async listObjectsV2WithMetadataQuery(
    bucketName: string,
    prefix: string,
    continuationToken: string,
    delimiter: string,
    startAfter: string,
  ) {
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
    queries.push(`max-keys=1000`)
    queries.sort()
    let query = ''
    if (queries.length > 0) {
      query = `${queries.join('&')}`
    }
    const method = 'GET'
    const res = await this.client.makeRequestAsync({ method, bucketName, query })
    return parseListObjectsV2WithMetadata(await readAsString(res))
  }
}
