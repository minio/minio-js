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

import * as Stream from 'node:stream'

import xml2js from 'xml2js'

import * as errors from './errors.ts'
import { callbackify } from './internal/callbackify.js'
import { TypedClient } from './internal/client.ts'
import { CopyConditions } from './internal/copy-conditions.ts'
import {
  isBoolean,
  isFunction,
  isNumber,
  isObject,
  isString,
  isValidBucketName,
  isValidPrefix,
  pipesetup,
  uriEscape,
} from './internal/helper.ts'
import { PostPolicy } from './internal/post-policy.ts'
import { NotificationConfig, NotificationPoller } from './notification.ts'
import { promisify } from './promisify.js'
import * as transformers from './transformers.js'

export * from './errors.ts'
export * from './helpers.ts'
export * from './notification.ts'
export { CopyConditions, PostPolicy }

export class Client extends TypedClient {
  //
  // __Arguments__
  // * `appName` _string_ - Application name.
  // * `appVersion` _string_ - Application version.

  // list a batch of objects
  listObjectsQuery(bucketName, prefix, marker, listQueryOpts = {}) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isString(prefix)) {
      throw new TypeError('prefix should be of type "string"')
    }
    if (!isString(marker)) {
      throw new TypeError('marker should be of type "string"')
    }
    let { Delimiter, MaxKeys, IncludeVersion } = listQueryOpts

    if (!isObject(listQueryOpts)) {
      throw new TypeError('listQueryOpts should be of type "object"')
    }

    if (!isString(Delimiter)) {
      throw new TypeError('Delimiter should be of type "string"')
    }
    if (!isNumber(MaxKeys)) {
      throw new TypeError('MaxKeys should be of type "number"')
    }

    const queries = []
    // escape every value in query string, except maxKeys
    queries.push(`prefix=${uriEscape(prefix)}`)
    queries.push(`delimiter=${uriEscape(Delimiter)}`)
    queries.push(`encoding-type=url`)

    if (IncludeVersion) {
      queries.push(`versions`)
    }

    if (marker) {
      marker = uriEscape(marker)
      if (IncludeVersion) {
        queries.push(`key-marker=${marker}`)
      } else {
        queries.push(`marker=${marker}`)
      }
    }

    // no need to escape maxKeys
    if (MaxKeys) {
      if (MaxKeys >= 1000) {
        MaxKeys = 1000
      }
      queries.push(`max-keys=${MaxKeys}`)
    }
    queries.sort()
    var query = ''
    if (queries.length > 0) {
      query = `${queries.join('&')}`
    }

    var method = 'GET'
    var transformer = transformers.getListObjectsTransformer()
    this.makeRequest({ method, bucketName, query }, '', [200], '', true, (e, response) => {
      if (e) {
        return transformer.emit('error', e)
      }
      pipesetup(response, transformer)
    })
    return transformer
  }

  // List the objects in the bucket.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `prefix` _string_: the prefix of the objects that should be listed (optional, default `''`)
  // * `recursive` _bool_: `true` indicates recursive style listing and `false` indicates directory style listing delimited by '/'. (optional, default `false`)
  // * `listOpts _object_: query params to list object with below keys
  // *    listOpts.MaxKeys _int_ maximum number of keys to return
  // *    listOpts.IncludeVersion  _bool_ true|false to include versions.
  // __Return Value__
  // * `stream` _Stream_: stream emitting the objects in the bucket, the object is of the format:
  // * `obj.name` _string_: name of the object
  // * `obj.prefix` _string_: name of the object prefix
  // * `obj.size` _number_: size of the object
  // * `obj.etag` _string_: etag of the object
  // * `obj.lastModified` _Date_: modified time stamp
  // * `obj.isDeleteMarker` _boolean_: true if it is a delete marker
  // * `obj.versionId` _string_: versionId of the object
  listObjects(bucketName, prefix, recursive, listOpts = {}) {
    if (prefix === undefined) {
      prefix = ''
    }
    if (recursive === undefined) {
      recursive = false
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
    if (!isObject(listOpts)) {
      throw new TypeError('listOpts should be of type "object"')
    }
    var marker = ''
    const listQueryOpts = {
      Delimiter: recursive ? '' : '/', // if recursive is false set delimiter to '/'
      MaxKeys: 1000,
      IncludeVersion: listOpts.IncludeVersion,
    }
    var objects = []
    var ended = false
    var readStream = Stream.Readable({ objectMode: true })
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
      this.listObjectsQuery(bucketName, prefix, marker, listQueryOpts)
        .on('error', (e) => readStream.emit('error', e))
        .on('data', (result) => {
          if (result.isTruncated) {
            marker = result.nextMarker || result.versionIdMarker
          } else {
            ended = true
          }
          objects = result.objects
          readStream._read()
        })
    }
    return readStream
  }

  // listObjectsV2Query - (List Objects V2) - List some or all (up to 1000) of the objects in a bucket.
  //
  // You can use the request parameters as selection criteria to return a subset of the objects in a bucket.
  // request parameters :-
  // * `bucketName` _string_: name of the bucket
  // * `prefix` _string_: Limits the response to keys that begin with the specified prefix.
  // * `continuation-token` _string_: Used to continue iterating over a set of objects.
  // * `delimiter` _string_: A delimiter is a character you use to group keys.
  // * `max-keys` _number_: Sets the maximum number of keys returned in the response body.
  // * `start-after` _string_: Specifies the key to start after when listing objects in a bucket.
  listObjectsV2Query(bucketName, prefix, continuationToken, delimiter, maxKeys, startAfter) {
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
    var queries = []

    // Call for listing objects v2 API
    queries.push(`list-type=2`)
    queries.push(`encoding-type=url`)

    // escape every value in query string, except maxKeys
    queries.push(`prefix=${uriEscape(prefix)}`)
    queries.push(`delimiter=${uriEscape(delimiter)}`)

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
    var query = ''
    if (queries.length > 0) {
      query = `${queries.join('&')}`
    }
    var method = 'GET'
    var transformer = transformers.getListObjectsV2Transformer()
    this.makeRequest({ method, bucketName, query }, '', [200], '', true, (e, response) => {
      if (e) {
        return transformer.emit('error', e)
      }
      pipesetup(response, transformer)
    })
    return transformer
  }

  // List the objects in the bucket using S3 ListObjects V2
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
  listObjectsV2(bucketName, prefix, recursive, startAfter) {
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
    var delimiter = recursive ? '' : '/'
    var continuationToken = ''
    var objects = []
    var ended = false
    var readStream = Stream.Readable({ objectMode: true })
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
      this.listObjectsV2Query(bucketName, prefix, continuationToken, delimiter, 1000, startAfter)
        .on('error', (e) => readStream.emit('error', e))
        .on('data', (result) => {
          if (result.isTruncated) {
            continuationToken = result.nextContinuationToken
          } else {
            ended = true
          }
          objects = result.objects
          readStream._read()
        })
    }
    return readStream
  }

  // Remove all the notification configurations in the S3 provider
  setBucketNotification(bucketName, config, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isObject(config)) {
      throw new TypeError('notification config should be of type "Object"')
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    var method = 'PUT'
    var query = 'notification'
    var builder = new xml2js.Builder({
      rootName: 'NotificationConfiguration',
      renderOpts: { pretty: false },
      headless: true,
    })
    var payload = builder.buildObject(config)
    this.makeRequest({ method, bucketName, query }, payload, [200], '', false, cb)
  }

  removeAllBucketNotification(bucketName, cb) {
    this.setBucketNotification(bucketName, new NotificationConfig(), cb)
  }

  // Return the list of notification configurations stored
  // in the S3 provider
  getBucketNotification(bucketName, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    var method = 'GET'
    var query = 'notification'
    this.makeRequest({ method, bucketName, query }, '', [200], '', true, (e, response) => {
      if (e) {
        return cb(e)
      }
      var transformer = transformers.getBucketNotificationTransformer()
      var bucketNotification
      pipesetup(response, transformer)
        .on('data', (result) => (bucketNotification = result))
        .on('error', (e) => cb(e))
        .on('end', () => cb(null, bucketNotification))
    })
  }

  // Listens for bucket notifications. Returns an EventEmitter.
  listenBucketNotification(bucketName, prefix, suffix, events) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`)
    }
    if (!isString(prefix)) {
      throw new TypeError('prefix must be of type string')
    }
    if (!isString(suffix)) {
      throw new TypeError('suffix must be of type string')
    }
    if (!Array.isArray(events)) {
      throw new TypeError('events must be of type Array')
    }
    let listener = new NotificationPoller(this, bucketName, prefix, suffix, events)
    listener.start()

    return listener
  }
}

Client.prototype.getBucketNotification = promisify(Client.prototype.getBucketNotification)
Client.prototype.setBucketNotification = promisify(Client.prototype.setBucketNotification)
Client.prototype.removeAllBucketNotification = promisify(Client.prototype.removeAllBucketNotification)

// refactored API use promise internally
Client.prototype.makeBucket = callbackify(Client.prototype.makeBucket)
Client.prototype.bucketExists = callbackify(Client.prototype.bucketExists)
Client.prototype.removeBucket = callbackify(Client.prototype.removeBucket)
Client.prototype.listBuckets = callbackify(Client.prototype.listBuckets)

Client.prototype.getObject = callbackify(Client.prototype.getObject)
Client.prototype.fGetObject = callbackify(Client.prototype.fGetObject)
Client.prototype.getPartialObject = callbackify(Client.prototype.getPartialObject)
Client.prototype.statObject = callbackify(Client.prototype.statObject)
Client.prototype.putObjectRetention = callbackify(Client.prototype.putObjectRetention)
Client.prototype.putObject = callbackify(Client.prototype.putObject)
Client.prototype.fPutObject = callbackify(Client.prototype.fPutObject)
Client.prototype.removeObject = callbackify(Client.prototype.removeObject)

Client.prototype.removeBucketReplication = callbackify(Client.prototype.removeBucketReplication)
Client.prototype.setBucketReplication = callbackify(Client.prototype.setBucketReplication)
Client.prototype.getBucketReplication = callbackify(Client.prototype.getBucketReplication)
Client.prototype.getObjectLegalHold = callbackify(Client.prototype.getObjectLegalHold)
Client.prototype.setObjectLegalHold = callbackify(Client.prototype.setObjectLegalHold)
Client.prototype.setObjectLockConfig = callbackify(Client.prototype.setObjectLockConfig)
Client.prototype.getObjectLockConfig = callbackify(Client.prototype.getObjectLockConfig)
Client.prototype.getBucketPolicy = callbackify(Client.prototype.getBucketPolicy)
Client.prototype.setBucketPolicy = callbackify(Client.prototype.setBucketPolicy)
Client.prototype.getBucketTagging = callbackify(Client.prototype.getBucketTagging)
Client.prototype.getObjectTagging = callbackify(Client.prototype.getObjectTagging)
Client.prototype.setBucketTagging = callbackify(Client.prototype.setBucketTagging)
Client.prototype.removeBucketTagging = callbackify(Client.prototype.removeBucketTagging)
Client.prototype.setObjectTagging = callbackify(Client.prototype.setObjectTagging)
Client.prototype.removeObjectTagging = callbackify(Client.prototype.removeObjectTagging)
Client.prototype.getBucketVersioning = callbackify(Client.prototype.getBucketVersioning)
Client.prototype.setBucketVersioning = callbackify(Client.prototype.setBucketVersioning)
Client.prototype.selectObjectContent = callbackify(Client.prototype.selectObjectContent)
Client.prototype.setBucketLifecycle = callbackify(Client.prototype.setBucketLifecycle)
Client.prototype.getBucketLifecycle = callbackify(Client.prototype.getBucketLifecycle)
Client.prototype.removeBucketLifecycle = callbackify(Client.prototype.removeBucketLifecycle)
Client.prototype.setBucketEncryption = callbackify(Client.prototype.setBucketEncryption)
Client.prototype.getBucketEncryption = callbackify(Client.prototype.getBucketEncryption)
Client.prototype.removeBucketEncryption = callbackify(Client.prototype.removeBucketEncryption)
Client.prototype.getObjectRetention = callbackify(Client.prototype.getObjectRetention)
Client.prototype.removeObjects = callbackify(Client.prototype.removeObjects)
Client.prototype.removeIncompleteUpload = callbackify(Client.prototype.removeIncompleteUpload)
Client.prototype.copyObject = callbackify(Client.prototype.copyObject)
Client.prototype.composeObject = callbackify(Client.prototype.composeObject)
Client.prototype.presignedUrl = callbackify(Client.prototype.presignedUrl)
Client.prototype.presignedGetObject = callbackify(Client.prototype.presignedGetObject)
Client.prototype.presignedPutObject = callbackify(Client.prototype.presignedPutObject)
Client.prototype.presignedPostPolicy = callbackify(Client.prototype.presignedPostPolicy)
