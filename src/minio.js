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

import async from 'async'
import _ from 'lodash'
import * as querystring from 'query-string'
import { TextEncoder } from 'web-encoding'
import xml2js from 'xml2js'

import * as errors from './errors.ts'
import { CopyDestinationOptions, CopySourceOptions } from './helpers.ts'
import { callbackify } from './internal/callbackify.js'
import { TypedClient } from './internal/client.ts'
import { CopyConditions } from './internal/copy-conditions.ts'
import {
  calculateEvenSplits,
  extractMetadata,
  getScope,
  getSourceVersionId,
  getVersionId,
  isBoolean,
  isFunction,
  isNumber,
  isObject,
  isString,
  isValidBucketName,
  isValidDate,
  isValidObjectName,
  isValidPrefix,
  makeDateLong,
  PART_CONSTRAINTS,
  partsRequired,
  pipesetup,
  sanitizeETag,
  toMd5,
  uriEscape,
  uriResourceEscape,
} from './internal/helper.ts'
import { PostPolicy } from './internal/post-policy.ts'
import { NotificationConfig, NotificationPoller } from './notification.ts'
import { promisify } from './promisify.js'
import { postPresignSignatureV4, presignSignatureV4 } from './signing.ts'
import * as transformers from './transformers.js'

export * from './errors.ts'
export * from './helpers.ts'
export * from './notification.ts'
export { CopyConditions, PostPolicy }

export class Client extends TypedClient {
  // Set application specific information.
  //
  // Generates User-Agent in the following style.
  //
  //       MinIO (OS; ARCH) LIB/VER APP/VER
  //
  // __Arguments__
  // * `appName` _string_ - Application name.
  // * `appVersion` _string_ - Application version.
  setAppInfo(appName, appVersion) {
    if (!isString(appName)) {
      throw new TypeError(`Invalid appName: ${appName}`)
    }
    if (appName.trim() === '') {
      throw new errors.InvalidArgumentError('Input appName cannot be empty.')
    }
    if (!isString(appVersion)) {
      throw new TypeError(`Invalid appVersion: ${appVersion}`)
    }
    if (appVersion.trim() === '') {
      throw new errors.InvalidArgumentError('Input appVersion cannot be empty.')
    }
    this.userAgent = `${this.userAgent} ${appName}/${appVersion}`
  }

  // Remove the partially uploaded object.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `callback(err)` _function_: callback function is called with non `null` value in case of error
  removeIncompleteUpload(bucketName, objectName, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.IsValidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    var removeUploadId
    async.during(
      (cb) => {
        this.findUploadId(bucketName, objectName).then((uploadId) => {
          removeUploadId = uploadId
          cb(null, uploadId)
        }, cb)
      },
      (cb) => {
        var method = 'DELETE'
        var query = `uploadId=${removeUploadId}`
        this.makeRequest({ method, bucketName, objectName, query }, '', [204], '', false, (e) => cb(e))
      },
      cb,
    )
  }

  // Copy the object.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `srcObject` _string_: path of the source object to be copied
  // * `conditions` _CopyConditions_: copy conditions that needs to be satisfied (optional, default `null`)
  // * `callback(err, {etag, lastModified})` _function_: non null `err` indicates error, `etag` _string_ and `listModifed` _Date_ are respectively the etag and the last modified date of the newly copied object
  copyObjectV1(arg1, arg2, arg3, arg4, arg5) {
    var bucketName = arg1
    var objectName = arg2
    var srcObject = arg3
    var conditions, cb
    if (typeof arg4 == 'function' && arg5 === undefined) {
      conditions = null
      cb = arg4
    } else {
      conditions = arg4
      cb = arg5
    }
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isString(srcObject)) {
      throw new TypeError('srcObject should be of type "string"')
    }
    if (srcObject === '') {
      throw new errors.InvalidPrefixError(`Empty source prefix`)
    }

    if (conditions !== null && !(conditions instanceof CopyConditions)) {
      throw new TypeError('conditions should be of type "CopyConditions"')
    }

    var headers = {}
    headers['x-amz-copy-source'] = uriResourceEscape(srcObject)

    if (conditions !== null) {
      if (conditions.modified !== '') {
        headers['x-amz-copy-source-if-modified-since'] = conditions.modified
      }
      if (conditions.unmodified !== '') {
        headers['x-amz-copy-source-if-unmodified-since'] = conditions.unmodified
      }
      if (conditions.matchETag !== '') {
        headers['x-amz-copy-source-if-match'] = conditions.matchETag
      }
      if (conditions.matchEtagExcept !== '') {
        headers['x-amz-copy-source-if-none-match'] = conditions.matchETagExcept
      }
    }

    var method = 'PUT'
    this.makeRequest({ method, bucketName, objectName, headers }, '', [200], '', true, (e, response) => {
      if (e) {
        return cb(e)
      }
      var transformer = transformers.getCopyObjectTransformer()
      pipesetup(response, transformer)
        .on('error', (e) => cb(e))
        .on('data', (data) => cb(null, data))
    })
  }

  /**
   * Internal Method to perform copy of an object.
   * @param sourceConfig __object__   instance of CopySourceOptions @link ./helpers/CopySourceOptions
   * @param destConfig  __object__   instance of CopyDestinationOptions @link ./helpers/CopyDestinationOptions
   * @param cb __function__ called with null if there is an error
   * @returns Promise if no callack is passed.
   */
  copyObjectV2(sourceConfig, destConfig, cb) {
    if (!(sourceConfig instanceof CopySourceOptions)) {
      throw new errors.InvalidArgumentError('sourceConfig should of type CopySourceOptions ')
    }
    if (!(destConfig instanceof CopyDestinationOptions)) {
      throw new errors.InvalidArgumentError('destConfig should of type CopyDestinationOptions ')
    }
    if (!destConfig.validate()) {
      return false
    }
    if (!destConfig.validate()) {
      return false
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    const headers = Object.assign({}, sourceConfig.getHeaders(), destConfig.getHeaders())

    const bucketName = destConfig.Bucket
    const objectName = destConfig.Object

    const method = 'PUT'
    this.makeRequest({ method, bucketName, objectName, headers }, '', [200], '', true, (e, response) => {
      if (e) {
        return cb(e)
      }
      const transformer = transformers.getCopyObjectTransformer()
      pipesetup(response, transformer)
        .on('error', (e) => cb(e))
        .on('data', (data) => {
          const resHeaders = response.headers

          const copyObjResponse = {
            Bucket: destConfig.Bucket,
            Key: destConfig.Object,
            LastModified: data.LastModified,
            MetaData: extractMetadata(resHeaders),
            VersionId: getVersionId(resHeaders),
            SourceVersionId: getSourceVersionId(resHeaders),
            Etag: sanitizeETag(resHeaders.etag),
            Size: +resHeaders['content-length'],
          }

          return cb(null, copyObjResponse)
        })
    })
  }

  // Backward compatibility for Copy Object API.
  copyObject(...allArgs) {
    if (allArgs[0] instanceof CopySourceOptions && allArgs[1] instanceof CopyDestinationOptions) {
      return this.copyObjectV2(...arguments)
    }
    return this.copyObjectV1(...arguments)
  }

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

  // Remove all the objects residing in the objectsList.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectsList` _array_: array of objects of one of the following:
  // *         List of Object names as array of strings which are object keys:  ['objectname1','objectname2']
  // *         List of Object name and versionId as an object:  [{name:"objectname",versionId:"my-version-id"}]

  removeObjects(bucketName, objectsList, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!Array.isArray(objectsList)) {
      throw new errors.InvalidArgumentError('objectsList should be a list')
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    const maxEntries = 1000
    const query = 'delete'
    const method = 'POST'

    let result = objectsList.reduce(
      (result, entry) => {
        result.list.push(entry)
        if (result.list.length === maxEntries) {
          result.listOfList.push(result.list)
          result.list = []
        }
        return result
      },
      { listOfList: [], list: [] },
    )

    if (result.list.length > 0) {
      result.listOfList.push(result.list)
    }

    const encoder = new TextEncoder()
    const batchResults = []

    async.eachSeries(
      result.listOfList,
      (list, batchCb) => {
        var objects = []
        list.forEach(function (value) {
          if (isObject(value)) {
            objects.push({ Key: value.name, VersionId: value.versionId })
          } else {
            objects.push({ Key: value })
          }
        })
        let deleteObjects = { Delete: { Quiet: true, Object: objects } }
        const builder = new xml2js.Builder({ headless: true })
        let payload = builder.buildObject(deleteObjects)
        payload = Buffer.from(encoder.encode(payload))
        const headers = {}

        headers['Content-MD5'] = toMd5(payload)

        let removeObjectsResult
        this.makeRequest({ method, bucketName, query, headers }, payload, [200], '', true, (e, response) => {
          if (e) {
            return batchCb(e)
          }
          pipesetup(response, transformers.removeObjectsTransformer())
            .on('data', (data) => {
              removeObjectsResult = data
            })
            .on('error', (e) => {
              return batchCb(e, null)
            })
            .on('end', () => {
              batchResults.push(removeObjectsResult)
              return batchCb(null, removeObjectsResult)
            })
        })
      },
      () => {
        cb(null, _.flatten(batchResults))
      },
    )
  }

  // Generate a generic presigned URL which can be
  // used for HTTP methods GET, PUT, HEAD and DELETE
  //
  // __Arguments__
  // * `method` _string_: name of the HTTP method
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `expiry` _number_: expiry in seconds (optional, default 7 days)
  // * `reqParams` _object_: request parameters (optional) e.g {versionId:"10fa9946-3f64-4137-a58f-888065c0732e"}
  // * `requestDate` _Date_: A date object, the url will be issued at (optional)
  presignedUrl(method, bucketName, objectName, expires, reqParams, requestDate, cb) {
    if (this.anonymous) {
      throw new errors.AnonymousRequestError('Presigned ' + method + ' url cannot be generated for anonymous requests')
    }
    if (isFunction(requestDate)) {
      cb = requestDate
      requestDate = new Date()
    }
    if (isFunction(reqParams)) {
      cb = reqParams
      reqParams = {}
      requestDate = new Date()
    }
    if (isFunction(expires)) {
      cb = expires
      reqParams = {}
      expires = 24 * 60 * 60 * 7 // 7 days in seconds
      requestDate = new Date()
    }
    if (!isNumber(expires)) {
      throw new TypeError('expires should be of type "number"')
    }
    if (!isObject(reqParams)) {
      throw new TypeError('reqParams should be of type "object"')
    }
    if (!isValidDate(requestDate)) {
      throw new TypeError('requestDate should be of type "Date" and valid')
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    var query = querystring.stringify(reqParams)
    this.getBucketRegion(bucketName, (e, region) => {
      if (e) {
        return cb(e)
      }
      // This statement is added to ensure that we send error through
      // callback on presign failure.
      var url
      var reqOptions = this.getRequestOptions({ method, region, bucketName, objectName, query })

      this.checkAndRefreshCreds()
      try {
        url = presignSignatureV4(
          reqOptions,
          this.accessKey,
          this.secretKey,
          this.sessionToken,
          region,
          requestDate,
          expires,
        )
      } catch (pe) {
        return cb(pe)
      }
      cb(null, url)
    })
  }

  // Generate a presigned URL for GET
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `expiry` _number_: expiry in seconds (optional, default 7 days)
  // * `respHeaders` _object_: response headers to override or request params for query (optional) e.g {versionId:"10fa9946-3f64-4137-a58f-888065c0732e"}
  // * `requestDate` _Date_: A date object, the url will be issued at (optional)
  presignedGetObject(bucketName, objectName, expires, respHeaders, requestDate, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }

    if (isFunction(respHeaders)) {
      cb = respHeaders
      respHeaders = {}
      requestDate = new Date()
    }

    var validRespHeaders = [
      'response-content-type',
      'response-content-language',
      'response-expires',
      'response-cache-control',
      'response-content-disposition',
      'response-content-encoding',
    ]
    validRespHeaders.forEach((header) => {
      if (respHeaders !== undefined && respHeaders[header] !== undefined && !isString(respHeaders[header])) {
        throw new TypeError(`response header ${header} should be of type "string"`)
      }
    })
    return this.presignedUrl('GET', bucketName, objectName, expires, respHeaders, requestDate, cb)
  }

  // Generate a presigned URL for PUT. Using this URL, the browser can upload to S3 only with the specified object name.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `expiry` _number_: expiry in seconds (optional, default 7 days)
  presignedPutObject(bucketName, objectName, expires, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    return this.presignedUrl('PUT', bucketName, objectName, expires, cb)
  }

  // return PostPolicy object
  newPostPolicy() {
    return new PostPolicy()
  }

  // presignedPostPolicy can be used in situations where we want more control on the upload than what
  // presignedPutObject() provides. i.e Using presignedPostPolicy we will be able to put policy restrictions
  // on the object's `name` `bucket` `expiry` `Content-Type` `Content-Disposition` `metaData`
  presignedPostPolicy(postPolicy, cb) {
    if (this.anonymous) {
      throw new errors.AnonymousRequestError('Presigned POST policy cannot be generated for anonymous requests')
    }
    if (!isObject(postPolicy)) {
      throw new TypeError('postPolicy should be of type "object"')
    }
    if (!isFunction(cb)) {
      throw new TypeError('cb should be of type "function"')
    }
    this.getBucketRegion(postPolicy.formData.bucket, (e, region) => {
      if (e) {
        return cb(e)
      }
      var date = new Date()
      var dateStr = makeDateLong(date)

      this.checkAndRefreshCreds()

      if (!postPolicy.policy.expiration) {
        // 'expiration' is mandatory field for S3.
        // Set default expiration date of 7 days.
        var expires = new Date()
        expires.setSeconds(24 * 60 * 60 * 7)
        postPolicy.setExpires(expires)
      }

      postPolicy.policy.conditions.push(['eq', '$x-amz-date', dateStr])
      postPolicy.formData['x-amz-date'] = dateStr

      postPolicy.policy.conditions.push(['eq', '$x-amz-algorithm', 'AWS4-HMAC-SHA256'])
      postPolicy.formData['x-amz-algorithm'] = 'AWS4-HMAC-SHA256'

      postPolicy.policy.conditions.push(['eq', '$x-amz-credential', this.accessKey + '/' + getScope(region, date)])
      postPolicy.formData['x-amz-credential'] = this.accessKey + '/' + getScope(region, date)

      if (this.sessionToken) {
        postPolicy.policy.conditions.push(['eq', '$x-amz-security-token', this.sessionToken])
        postPolicy.formData['x-amz-security-token'] = this.sessionToken
      }

      var policyBase64 = Buffer.from(JSON.stringify(postPolicy.policy)).toString('base64')

      postPolicy.formData.policy = policyBase64

      var signature = postPresignSignatureV4(region, date, this.secretKey, policyBase64)

      postPolicy.formData['x-amz-signature'] = signature
      var opts = {}
      opts.region = region
      opts.bucketName = postPolicy.formData.bucket
      var reqOptions = this.getRequestOptions(opts)
      var portStr = this.port == 80 || this.port === 443 ? '' : `:${this.port.toString()}`
      var urlStr = `${reqOptions.protocol}//${reqOptions.host}${portStr}${reqOptions.path}`
      cb(null, { postURL: urlStr, formData: postPolicy.formData })
    })
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

  getObjectRetention(bucketName, objectName, getOpts, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isObject(getOpts)) {
      throw new errors.InvalidArgumentError('callback should be of type "object"')
    } else if (getOpts.versionId && !isString(getOpts.versionId)) {
      throw new errors.InvalidArgumentError('VersionID should be of type "string"')
    }
    if (cb && !isFunction(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"')
    }
    const method = 'GET'
    let query = 'retention'
    if (getOpts.versionId) {
      query += `&versionId=${getOpts.versionId}`
    }

    this.makeRequest({ method, bucketName, objectName, query }, '', [200], '', true, (e, response) => {
      if (e) {
        return cb(e)
      }

      let retentionConfig = Buffer.from('')
      pipesetup(response, transformers.objectRetentionTransformer())
        .on('data', (data) => {
          retentionConfig = data
        })
        .on('error', cb)
        .on('end', () => {
          cb(null, retentionConfig)
        })
    })
  }

  /**
   * Internal method to upload a part during compose object.
   * @param partConfig __object__ contains the following.
   *    bucketName __string__
   *    objectName __string__
   *    uploadID __string__
   *    partNumber __number__
   *    headers __object__
   * @param cb called with null incase of error.
   */
  uploadPartCopy(partConfig, cb) {
    const { bucketName, objectName, uploadID, partNumber, headers } = partConfig

    const method = 'PUT'
    let query = `uploadId=${uploadID}&partNumber=${partNumber}`
    const requestOptions = { method, bucketName, objectName: objectName, query, headers }
    return this.makeRequest(requestOptions, '', [200], '', true, (e, response) => {
      let partCopyResult = Buffer.from('')
      if (e) {
        return cb(e)
      }
      pipesetup(response, transformers.uploadPartTransformer())
        .on('data', (data) => {
          partCopyResult = data
        })
        .on('error', cb)
        .on('end', () => {
          let uploadPartCopyRes = {
            etag: sanitizeETag(partCopyResult.ETag),
            key: objectName,
            part: partNumber,
          }

          cb(null, uploadPartCopyRes)
        })
    })
  }

  composeObject(destObjConfig = {}, sourceObjList = [], cb) {
    const me = this // many async flows. so store the ref.
    const sourceFilesLength = sourceObjList.length

    if (!Array.isArray(sourceObjList)) {
      throw new errors.InvalidArgumentError('sourceConfig should an array of CopySourceOptions ')
    }
    if (!(destObjConfig instanceof CopyDestinationOptions)) {
      throw new errors.InvalidArgumentError('destConfig should of type CopyDestinationOptions ')
    }

    if (sourceFilesLength < 1 || sourceFilesLength > PART_CONSTRAINTS.MAX_PARTS_COUNT) {
      throw new errors.InvalidArgumentError(
        `"There must be as least one and up to ${PART_CONSTRAINTS.MAX_PARTS_COUNT} source objects.`,
      )
    }

    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    for (let i = 0; i < sourceFilesLength; i++) {
      if (!sourceObjList[i].validate()) {
        return false
      }
    }

    if (!destObjConfig.validate()) {
      return false
    }

    const getStatOptions = (srcConfig) => {
      let statOpts = {}
      if (!_.isEmpty(srcConfig.VersionID)) {
        statOpts = {
          versionId: srcConfig.VersionID,
        }
      }
      return statOpts
    }
    const srcObjectSizes = []
    let totalSize = 0
    let totalParts = 0

    const sourceObjStats = sourceObjList.map((srcItem) =>
      me.statObject(srcItem.Bucket, srcItem.Object, getStatOptions(srcItem)),
    )

    return Promise.all(sourceObjStats)
      .then((srcObjectInfos) => {
        const validatedStats = srcObjectInfos.map((resItemStat, index) => {
          const srcConfig = sourceObjList[index]

          let srcCopySize = resItemStat.size
          // Check if a segment is specified, and if so, is the
          // segment within object bounds?
          if (srcConfig.MatchRange) {
            // Since range is specified,
            //    0 <= src.srcStart <= src.srcEnd
            // so only invalid case to check is:
            const srcStart = srcConfig.Start
            const srcEnd = srcConfig.End
            if (srcEnd >= srcCopySize || srcStart < 0) {
              throw new errors.InvalidArgumentError(
                `CopySrcOptions ${index} has invalid segment-to-copy [${srcStart}, ${srcEnd}] (size is ${srcCopySize})`,
              )
            }
            srcCopySize = srcEnd - srcStart + 1
          }

          // Only the last source may be less than `absMinPartSize`
          if (srcCopySize < PART_CONSTRAINTS.ABS_MIN_PART_SIZE && index < sourceFilesLength - 1) {
            throw new errors.InvalidArgumentError(
              `CopySrcOptions ${index} is too small (${srcCopySize}) and it is not the last part.`,
            )
          }

          // Is data to copy too large?
          totalSize += srcCopySize
          if (totalSize > PART_CONSTRAINTS.MAX_MULTIPART_PUT_OBJECT_SIZE) {
            throw new errors.InvalidArgumentError(`Cannot compose an object of size ${totalSize} (> 5TiB)`)
          }

          // record source size
          srcObjectSizes[index] = srcCopySize

          // calculate parts needed for current source
          totalParts += partsRequired(srcCopySize)
          // Do we need more parts than we are allowed?
          if (totalParts > PART_CONSTRAINTS.MAX_PARTS_COUNT) {
            throw new errors.InvalidArgumentError(
              `Your proposed compose object requires more than ${PART_CONSTRAINTS.MAX_PARTS_COUNT} parts`,
            )
          }

          return resItemStat
        })

        if ((totalParts === 1 && totalSize <= PART_CONSTRAINTS.MAX_PART_SIZE) || totalSize === 0) {
          return this.copyObject(sourceObjList[0], destObjConfig, cb) // use copyObjectV2
        }

        // preserve etag to avoid modification of object while copying.
        for (let i = 0; i < sourceFilesLength; i++) {
          sourceObjList[i].MatchETag = validatedStats[i].etag
        }

        const splitPartSizeList = validatedStats.map((resItemStat, idx) => {
          const calSize = calculateEvenSplits(srcObjectSizes[idx], sourceObjList[idx])
          return calSize
        })

        function getUploadPartConfigList(uploadId) {
          const uploadPartConfigList = []

          splitPartSizeList.forEach((splitSize, splitIndex) => {
            const { startIndex: startIdx, endIndex: endIdx, objInfo: objConfig } = splitSize

            let partIndex = splitIndex + 1 // part index starts from 1.
            const totalUploads = Array.from(startIdx)

            const headers = sourceObjList[splitIndex].getHeaders()

            totalUploads.forEach((splitStart, upldCtrIdx) => {
              let splitEnd = endIdx[upldCtrIdx]

              const sourceObj = `${objConfig.Bucket}/${objConfig.Object}`
              headers['x-amz-copy-source'] = `${sourceObj}`
              headers['x-amz-copy-source-range'] = `bytes=${splitStart}-${splitEnd}`

              const uploadPartConfig = {
                bucketName: destObjConfig.Bucket,
                objectName: destObjConfig.Object,
                uploadID: uploadId,
                partNumber: partIndex,
                headers: headers,
                sourceObj: sourceObj,
              }

              uploadPartConfigList.push(uploadPartConfig)
            })
          })

          return uploadPartConfigList
        }

        const performUploadParts = (uploadId) => {
          const uploadList = getUploadPartConfigList(uploadId)

          async.map(uploadList, me.uploadPartCopy.bind(me), (err, res) => {
            if (err) {
              this.abortMultipartUpload(destObjConfig.Bucket, destObjConfig.Object, uploadId).then(
                () => cb(),
                (err) => cb(err),
              )
              return
            }
            const partsDone = res.map((partCopy) => ({ etag: partCopy.etag, part: partCopy.part }))
            return me.completeMultipartUpload(destObjConfig.Bucket, destObjConfig.Object, uploadId, partsDone).then(
              (result) => cb(null, result),
              (err) => cb(err),
            )
          })
        }

        const newUploadHeaders = destObjConfig.getHeaders()

        me.initiateNewMultipartUpload(destObjConfig.Bucket, destObjConfig.Object, newUploadHeaders).then(
          (uploadId) => {
            performUploadParts(uploadId)
          },
          (err) => {
            cb(err, null)
          },
        )
      })
      .catch((error) => {
        cb(error, null)
      })
  }
}

// Promisify various public-facing APIs on the Client module.
Client.prototype.copyObject = promisify(Client.prototype.copyObject)
Client.prototype.removeObjects = promisify(Client.prototype.removeObjects)

Client.prototype.presignedUrl = promisify(Client.prototype.presignedUrl)
Client.prototype.presignedGetObject = promisify(Client.prototype.presignedGetObject)
Client.prototype.presignedPutObject = promisify(Client.prototype.presignedPutObject)
Client.prototype.presignedPostPolicy = promisify(Client.prototype.presignedPostPolicy)
Client.prototype.getBucketNotification = promisify(Client.prototype.getBucketNotification)
Client.prototype.setBucketNotification = promisify(Client.prototype.setBucketNotification)
Client.prototype.removeAllBucketNotification = promisify(Client.prototype.removeAllBucketNotification)
Client.prototype.removeIncompleteUpload = promisify(Client.prototype.removeIncompleteUpload)
Client.prototype.getObjectRetention = promisify(Client.prototype.getObjectRetention)
Client.prototype.composeObject = promisify(Client.prototype.composeObject)

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
