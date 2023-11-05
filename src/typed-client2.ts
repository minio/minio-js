import { promises as fsp } from 'node:fs'
import * as stream from 'node:stream'

import async from 'async'
import _ from 'lodash'
import xml2js from 'xml2js'

import * as errors from './errors.ts'
import { CopyDestinationOptions, CopySourceOptions } from './helpers.ts'
import { asCallback, asCallbackFn } from './internal/as-callback.ts'
import { fstat } from './internal/async.ts'
import { CopyConditions } from './internal/copy-conditions.ts'
import {
  calculateEvenSplits,
  extractMetadata,
  getSourceVersionId,
  getVersionId,
  isBoolean,
  isEmpty,
  isFunction,
  isNumber,
  isObject,
  isOptionalFunction,
  isReadableStream,
  isString,
  isValidBucketName,
  isValidObjectName,
  isValidPrefix,
  PART_CONSTRAINTS,
  partsRequired,
  pipesetup,
  prependXAMZMeta,
  readableStream,
  sanitizeETag,
  toMd5,
  uriEscape,
  uriResourceEscape,
} from './internal/helper.ts'
import { readAsBuffer } from './internal/response.ts'
import type {
  BucketItemCopy,
  NoResultCallback,
  ObjectMetaData,
  RequestHeaders,
  ResponseHeader,
  ResultCallback,
  SourceObjectStats,
  UploadedObjectInfo,
} from './internal/type.ts'
import { RETENTION_MODES, RETENTION_VALIDITY_UNITS } from './internal/type.ts'
import type { NotificationEvent } from './notification.ts'
import { NotificationConfig, NotificationPoller } from './notification.ts'
import * as transformers from './transformers.ts'
import { TypedClient } from './typed-client.ts'
import type { RequestOption } from './typedBase.ts'
import { findCallback, uploadStream } from './typedBase.ts'
import type { ObjectLockConfig, S3ListObject } from './xml-parsers.ts'
import * as xmlParsers from './xml-parsers.ts'

type PartConfig = {
  bucketName: string
  objectName: string
  uploadID: string
  partNumber: number
  headers: RequestHeaders
}

export class Client extends TypedClient {
  // * `callback(err, {etag, lastModified})` _function_: non null `err` indicates error, `etag` _string_ and `listModifed` _Date_ are respectively the etag and the last modified date of the newly copied object
  protected copyObjectV1(
    bucketName: string,
    objectName: string,
    srcObject: string,
    arg4: unknown,
    arg5: unknown,
  ): Promise<BucketItemCopy> | void {
    const [[conditions = null], cb] = findCallback<[CopyConditions | null], ResultCallback<BucketItemCopy>>([
      arg4,
      arg5,
    ])

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

    const headers: RequestHeaders = {}
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
      if (conditions.matchETagExcept !== '') {
        headers['x-amz-copy-source-if-none-match'] = conditions.matchETagExcept
      }
    }

    const method = 'PUT'
    return asCallbackFn(cb, async () => {
      const res = await this.makeRequestAsync({ method, bucketName, objectName, headers })
      const body = await readAsBuffer(res)
      return xmlParsers.parseCopyObject(body.toString())
    })
  }

  /**
   * Internal Method to perform copy of an object.
   * @param sourceConfig __object__   instance of CopySourceOptions @link ./helpers/CopySourceOptions
   * @param destConfig  __object__   instance of CopyDestinationOptions @link ./helpers/CopyDestinationOptions
   * @param cb __function__ called with null if there is an error
   * @returns Promise if no callack is passed.
   */
  protected copyObjectV2(
    sourceConfig: CopySourceOptions,
    destConfig: CopyDestinationOptions,
    cb?: ResultCallback<BucketItemCopy>,
  ): Promise<BucketItemCopy> | void | false {
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
    return asCallbackFn(cb, async () => {
      const res = await this.makeRequestAsync({ method, bucketName, objectName, headers })
      const body = await readAsBuffer(res)
      const data = xmlParsers.parseCopyObject(body.toString())

      const resHeaders = res.headers

      return {
        Bucket: destConfig.Bucket,
        Key: destConfig.Object,
        LastModified: data.lastModified,
        lastModified: data.lastModified,
        MetaData: extractMetadata(resHeaders as ResponseHeader),
        VersionId: getVersionId(resHeaders as ResponseHeader),
        SourceVersionId: getSourceVersionId(resHeaders as ResponseHeader),
        Etag: sanitizeETag(resHeaders.etag),
        etag: sanitizeETag(resHeaders.etag),
        Size: parseInt(resHeaders['content-length']!),
      } as BucketItemCopy
    })
  }

  copyObject(
    bucketName: string,
    objectName: string,
    sourceObject: string,
    conditions: CopyConditions,
    callback: ResultCallback<BucketItemCopy>,
  ): void
  copyObject(
    bucketName: string,
    objectName: string,
    sourceObject: string,
    conditions: CopyConditions,
  ): Promise<BucketItemCopy>

  // Backward compatibility for Copy Object API.
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  copyObject(...allArgs): Promise<BucketItemCopy> | void | false {
    if (allArgs[0] instanceof CopySourceOptions && allArgs[1] instanceof CopyDestinationOptions) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      return this.copyObjectV2(...allArgs)
    }
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return this.copyObjectV1(...allArgs)
  }

  async uploadPartCopy(partConfig: PartConfig) {
    const { bucketName, objectName, uploadID, partNumber, headers } = partConfig

    const method = 'PUT'
    const query = `uploadId=${uploadID}&partNumber=${partNumber}`
    const requestOptions: RequestOption = { method, bucketName, objectName: objectName, query, headers }

    const res = await this.makeRequestAsync(requestOptions)

    const body = await readAsBuffer(res)

    const data = xmlParsers.uploadPartParser(body.toString())

    return {
      etag: sanitizeETag(data.ETag),
      key: objectName,
      part: partNumber,
    }
  }

  // composeObject(
  //   destObjConfig: CopyDestinationOptions,
  //   sourceObjList: CopySourceOptions[],
  //   callback: ResultCallback<SourceObjectStats>,
  // ): void
  // composeObject(destObjConfig: CopyDestinationOptions, sourceObjList: CopySourceOptions[]): Promise<SourceObjectStats>

  composeObject(
    destObjConfig: CopyDestinationOptions,
    sourceObjList: CopySourceOptions[],
    cb?: ResultCallback<SourceObjectStats>,
  ): unknown {
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

    if (!isOptionalFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    for (let i = 0; i < sourceFilesLength; i++) {
      // @ts-expect-error index check
      if (!sourceObjList[i].validate()) {
        return false
      }
    }

    if (!destObjConfig.validate()) {
      return false
    }

    const getStatOptions = (srcConfig: CopySourceOptions) => {
      let statOpts = {}
      if (!isEmpty(srcConfig.VersionID)) {
        statOpts = {
          versionId: srcConfig.VersionID,
        }
      }
      return statOpts
    }
    const srcObjectSizes: number[] = []
    let totalSize = 0
    let totalParts = 0

    const sourceObjStats = sourceObjList.map((srcItem) =>
      me.statObject(srcItem.Bucket, srcItem.Object, getStatOptions(srcItem)),
    )

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return asCallback(cb, async () => {
      const srcObjectInfos = await Promise.all(sourceObjStats)
      const validatedStats = srcObjectInfos.map((resItemStat, index) => {
        const srcConfig = sourceObjList[index]

        let srcCopySize = resItemStat.size
        // Check if a segment is specified, and if so, is the
        // segment within object bounds?
        // @ts-expect-error index check
        if (srcConfig.MatchRange) {
          // Since range is specified,
          //    0 <= src.srcStart <= src.srcEnd
          // so only invalid case to check is:
          // @ts-expect-error index check
          const srcStart = srcConfig.Start
          // @ts-expect-error index check
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
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        return this.copyObject(sourceObjList[0], destObjConfig) // use copyObjectV2
      }

      // preserve etag to avoid modification of object while copying.
      for (let i = 0; i < sourceFilesLength; i++) {
        // @ts-expect-error index check
        sourceObjList[i].MatchETag = validatedStats[i].etag
      }

      const newUploadHeaders = destObjConfig.getHeaders()

      const uploadId = await me.initiateNewMultipartUpload(destObjConfig.Bucket, destObjConfig.Object, newUploadHeaders)

      const uploadList = validatedStats
        .map((resItemStat, idx) => {
          // @ts-expect-error index check
          return calculateEvenSplits<CopySourceOptions>(srcObjectSizes[idx], sourceObjList[idx])
        })
        .flatMap((splitSize, splitIndex) => {
          if (splitSize === null) {
            throw new Error('BUG: splitSize === 0')
          }

          const { startIndex: startIdx, endIndex: endIdx, objInfo: objConfig } = splitSize

          const partIndex = splitIndex + 1 // part index starts from 1.
          const totalUploads = Array.from(startIdx)

          // @ts-expect-error index check
          const headers = sourceObjList[splitIndex].getHeaders()

          return totalUploads.map((splitStart, upldCtrIdx) => {
            const splitEnd = endIdx[upldCtrIdx]

            const sourceObj = `${objConfig.Bucket}/${objConfig.Object}`
            headers['x-amz-copy-source'] = `${sourceObj}`
            headers['x-amz-copy-source-range'] = `bytes=${splitStart}-${splitEnd}`

            return {
              bucketName: destObjConfig.Bucket,
              objectName: destObjConfig.Object,
              uploadID: uploadId,
              partNumber: partIndex,
              headers: headers,
              sourceObj: sourceObj,
            } as PartConfig
          })
        })

      try {
        const rr = await async.map(uploadList, async (o: PartConfig) => me.uploadPartCopy(o))
        const partsDone = rr.map((partCopy) => ({ etag: partCopy.etag, part: partCopy.part }))
        return me.completeMultipartUpload(destObjConfig.Bucket, destObjConfig.Object, uploadId, partsDone)
      } catch (e) {
        await this.abortMultipartUpload(destObjConfig.Bucket, destObjConfig.Object, uploadId)
        throw e
      }
    })
  }

  setObjectLockConfig(
    bucketName: string,
    lockConfigOpts: ObjectLockConfig = {},
    cb?: NoResultCallback,
  ): void | Promise<void> {
    const retentionModes = [RETENTION_MODES.COMPLIANCE, RETENTION_MODES.GOVERNANCE]
    const validUnits: RETENTION_VALIDITY_UNITS[] = [RETENTION_VALIDITY_UNITS.DAYS, RETENTION_VALIDITY_UNITS.YEARS]

    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }

    if (lockConfigOpts.mode && !retentionModes.includes(lockConfigOpts.mode)) {
      throw new TypeError(`lockConfigOpts.mode should be one of ${retentionModes}`)
    }
    if (lockConfigOpts.unit && !validUnits.includes(lockConfigOpts.unit)) {
      throw new TypeError(`lockConfigOpts.unit should be one of ${validUnits}`)
    }
    if (lockConfigOpts.validity && !isNumber(lockConfigOpts.validity)) {
      throw new TypeError(`lockConfigOpts.validity should be a number`)
    }

    const method = 'PUT'
    const query = 'object-lock'

    const config: { ObjectLockEnabled: string; Rule?: { DefaultRetention: Record<string, any> } } = {
      ObjectLockEnabled: 'Enabled',
    }
    const configKeys = Object.keys(lockConfigOpts)
    // Check if keys are present and all keys are present.
    if (configKeys.length > 0) {
      if (_.difference(configKeys, ['unit', 'mode', 'validity']).length !== 0) {
        throw new TypeError(
          `lockConfigOpts.mode,lockConfigOpts.unit,lockConfigOpts.validity all the properties should be specified.`,
        )
      } else {
        config.Rule = {
          DefaultRetention: {},
        }
        if (lockConfigOpts.mode) {
          config.Rule.DefaultRetention.Mode = lockConfigOpts.mode
        }
        if (lockConfigOpts.unit === RETENTION_VALIDITY_UNITS.DAYS) {
          config.Rule.DefaultRetention.Days = lockConfigOpts.validity
        } else if (lockConfigOpts.unit === RETENTION_VALIDITY_UNITS.YEARS) {
          config.Rule.DefaultRetention.Years = lockConfigOpts.validity
        }
      }
    }

    const builder = new xml2js.Builder({
      rootName: 'ObjectLockConfiguration',
      renderOpts: { pretty: false },
      headless: true,
    })
    const payload = builder.buildObject(config)

    const headers: RequestHeaders = {}
    headers['Content-MD5'] = toMd5(payload)

    return asCallbackFn(cb, async () => {
      await this.makeRequestAsyncOmit(
        {
          method,
          bucketName,
          query,
          headers,
        },
        payload,
      )
    })
  }

  getObjectLockConfig(
    bucketName: string,
    cb?: ResultCallback<ObjectLockConfig | undefined>,
  ): void | Promise<ObjectLockConfig | undefined> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isFunction(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"')
    }
    const method = 'GET'
    const query = 'object-lock'

    return asCallbackFn(cb, async () => {
      const res = await this.makeRequestAsync({ method, bucketName, query })
      const body = await readAsBuffer(res)
      return xmlParsers.parseObjectLockConfig(body.toString())
    })
  }

  removeBucketEncryption(bucketName: string, cb: NoResultCallback): void | Promise<void> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isFunction(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"')
    }
    const method = 'DELETE'
    const query = 'encryption'
    return asCallbackFn(cb, async () => {
      await this.makeRequestAsyncOmit({ method, bucketName, query }, '', [204])
    })
  }

  setBucketReplication(
    bucketName: string,
    replicationConfig: {
      role?: string
      rules?: unknown
    } = {},
    cb?: NoResultCallback,
  ): void | Promise<void> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isObject(replicationConfig)) {
      throw new errors.InvalidArgumentError('replicationConfig should be of type "object"')
    } else {
      if (isEmpty(replicationConfig.role)) {
        throw new errors.InvalidArgumentError('Role cannot be empty')
      } else if (replicationConfig.role && !isString(replicationConfig.role)) {
        throw new errors.InvalidArgumentError('Invalid value for role', replicationConfig.role)
      }
      if (isEmpty(replicationConfig.rules)) {
        throw new errors.InvalidArgumentError('Minimum one replication rule must be specified')
      }
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    const method = 'PUT'
    const query = 'replication'
    const headers: RequestHeaders = {}

    const replicationParamsConfig = {
      ReplicationConfiguration: {
        Role: replicationConfig.role,
        Rule: replicationConfig.rules,
      },
    }

    const builder = new xml2js.Builder({ renderOpts: { pretty: false }, headless: true })

    const payload = builder.buildObject(replicationParamsConfig)

    headers['Content-MD5'] = toMd5(payload)
    return asCallbackFn(cb, async () => {
      await this.makeRequestAsyncOmit(
        {
          method,
          bucketName,
          query,
          headers,
        },
        payload,
      )
    })
  }

  getBucketReplication(bucketName: string, cb?: ResultCallback<unknown>): void | Promise<unknown> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isFunction(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"')
    }
    const method = 'GET'
    const query = 'replication'

    return asCallbackFn(cb, async () => {
      const res = await this.makeRequestAsync({ method, bucketName, query })
      const body = await readAsBuffer(res)
      return xmlParsers.parseReplicationConfig(body.toString())
    })
  }

  removeBucketReplication(bucketName: string, cb?: NoResultCallback): void | Promise<void> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    const method = 'DELETE'
    const query = 'replication'
    return asCallbackFn(cb, async () => {
      await this.makeRequestAsyncOmit(
        {
          method,
          bucketName,
          query,
        },
        '',
        [200, 204],
      )
    })
  }

  removeAllBucketNotification(bucketName: string, cb?: NoResultCallback) {
    return this.setBucketNotification(bucketName, new NotificationConfig(), cb)
  }

  // in the S3 provider
  getBucketNotification(bucketName: string, cb?: ResultCallback<unknown>): void | Promise<unknown> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    const method = 'GET'
    const query = 'notification'
    return asCallbackFn(cb, async () => {
      const res = await this.makeRequestAsync({ method, bucketName, query })
      const body = await readAsBuffer(res)
      return xmlParsers.parseBucketNotification(body.toString())
    })
  }

  // Listens for bucket notifications. Returns an EventEmitter.
  listenBucketNotification(bucketName: string, prefix: string, suffix: string, events: NotificationEvent[]) {
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
    const listener = new NotificationPoller(this, bucketName, prefix, suffix, events)
    listener.start()

    return listener
  }

  // Remove all the notification configurations in the S3 provider
  setBucketNotification(bucketName: string, config: NotificationConfig, cb?: NoResultCallback): void | Promise<void> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isObject(config)) {
      throw new TypeError('notification config should be of type "Object"')
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    const method = 'PUT'
    const query = 'notification'
    const builder = new xml2js.Builder({
      rootName: 'NotificationConfiguration',
      renderOpts: { pretty: false },
      headless: true,
    })
    const payload = builder.buildObject(config)
    return asCallbackFn(cb, async () => {
      await this.makeRequestAsyncOmit({ method, bucketName, query }, payload)
    })
  }

  //   * `obj.lastModified` _Date_: modified time stamp
  listObjectsV2(bucketName: string, prefix: string, recursive?: boolean, startAfter?: string) {
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
    let objects: S3ListObject[] = []
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
      this.listObjectsV2Query(bucketName, prefix, continuationToken, delimiter, 1000, startAfter!)
        .on('error', (e) => readStream.emit('error', e))
        .on('data', (result) => {
          if (result.isTruncated) {
            continuationToken = result.nextContinuationToken
          } else {
            ended = true
          }
          objects = result.objects
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          readStream._read()
        })
    }
    return readStream
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

  // * `start-after` _string_: Specifies the key to start after when listing objects in a bucket.
  listObjectsV2Query(
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
    const transformer = transformers.getListObjectsV2Transformer()
    this.makeRequestAsync({ method, bucketName, query }, '', [200], '', true).then(
      (response) => {
        pipesetup(response, transformer)
      },
      (e) => {
        return transformer.emit('error', e)
      },
    )
    return transformer
  }

  // Copy the object.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `srcObject` _string_: path of the source object to be copied
  // * `conditions` _CopyConditions_: copy conditions that needs to be satisfied (optional, default `null`)

  //   * `versionId` _string_: versionId of the object
  putObject(
    bucketName: string,
    objectName: string,
    stream: string | Buffer | stream.Readable,
    sizeArg?: number,
    metaDataArg?: ObjectMetaData,
    callbackArg?: ResultCallback<UploadedObjectInfo>,
  ): void | Promise<UploadedObjectInfo> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }

    let [[size, metaData = {}], callback] = findCallback<
      [number | undefined, ObjectMetaData],
      ResultCallback<UploadedObjectInfo>
    >([sizeArg, metaDataArg, callbackArg])

    // We'll need to shift arguments to the left because of metaData
    // and size being optional.
    if (isObject(size)) {
      metaData = size
      size = undefined
    }

    // Ensures Metadata has appropriate prefix for A3 API
    const headers = prependXAMZMeta(metaData)
    if (typeof stream === 'string' || stream instanceof Buffer) {
      // Adapts the non-stream interface into a stream.
      if (size !== undefined) {
        if (size !== Buffer.from(stream).length) {
          throw new errors.InvalidArgumentError(
            `size input and object length mismatch, object has length ${stream.length} but input size is ${size}`,
          )
        }
      }
      size = Buffer.from(stream).length
    } else if (!isReadableStream(stream)) {
      throw new TypeError('third argument should be of type "stream.Readable" or "Buffer" or "string"')
    }

    if (!isOptionalFunction(callback)) {
      throw new TypeError('callback should be of type "function"')
    }

    if (isNumber(size) && size < 0) {
      throw new errors.InvalidArgumentError(`size cannot be negative, given size: ${size}`)
    }

    if (isNumber(size) && size > this.maxObjectSize) {
      throw new TypeError(`size should not be more than ${this.maxObjectSize}`)
    }

    const executor = async () => {
      // Get the part size and forward that to the BlockStream. Default to the
      // largest block size possible if necessary.
      if (size === undefined) {
        const statSize = await getContentLength(stream)
        if (statSize !== null) {
          size = statSize
        }
      }

      if (!isNumber(size)) {
        // Backward compatibility
        size = this.maxObjectSize
      }

      const partSize = this.calculatePartSize(size)

      if (typeof stream === 'string' || Buffer.isBuffer(stream) || size <= this.partSize) {
        const uploader = this.getUploader(bucketName, objectName, headers, false)
        const buf = isReadableStream(stream) ? await readAsBuffer(stream) : Buffer.from(stream)
        const { md5sum, sha256sum } = transformers.hashBinary(buf, this.enableSHA256)
        return uploader(buf, buf.length, sha256sum, md5sum)
      }

      return uploadStream({
        client: this,
        stream: isReadableStream(stream) ? stream : readableStream(stream),
        partSize,
        bucketName,
        objectName,
        headers,
      })
    }

    return asCallback(callback, executor())
  }
}

async function getContentLength(s: stream.Readable | Buffer | string): Promise<number | null> {
  const length = (s as unknown as Record<string, unknown>).length as number | undefined
  if (isNumber(length)) {
    return length
  }

  // property of fs.ReadStream
  const filePath = (s as unknown as Record<string, unknown>).path as string | undefined
  if (filePath) {
    const stat = await fsp.lstat(filePath)
    return stat.size
  }

  // property of fs.ReadStream
  const fd = (s as unknown as Record<string, unknown>).fd as number | null | undefined

  if (fd) {
    const stat = await fstat(fd)
    return stat.size
  }

  return null
}
