import * as stream from 'node:stream'

import { TextEncoder } from 'web-encoding'
import xml2js from 'xml2js'

import { asCallback, asCallbackFn } from './as-callback.ts'
import {
  isBoolean,
  isEmpty,
  isFunction,
  isNumber,
  isObject,
  isOptionalFunction,
  isString,
  isValidDate,
} from './assert.ts'
import { fsp } from './async.ts'
import * as errors from './errors.ts'
import type { MetaData, SelectResults } from './helpers.ts'
import {
  getScope,
  insertContentType,
  isValidBucketName,
  isValidObjectName,
  isValidPrefix,
  LEGAL_HOLD_STATUS,
  makeDateLong,
  prependXAMZMeta,
  RETENTION_MODES,
  toMd5,
  uriEscape,
} from './helpers.ts'
import { PostPolicy } from './postPolicy.ts'
import { qs } from './qs.ts'
import { readAsBuffer } from './response.ts'
import { postPresignSignatureV4, presignSignatureV4 } from './signing.ts'
import * as transformers from './transformers.ts'
import type {
  BucketStream,
  Encryption,
  LegalHoldOptions,
  Lifecycle,
  ListObjectV1Opt,
  NoResultCallback,
  PostPolicyResult,
  RemoveOptions,
  RequestHeaders,
  ResultCallback,
  Retention,
  SelectOptions,
  Tag,
  TagList,
  UploadedObjectInfo,
  VersionConfigInput,
  VersionIdentification,
  VersioningConfig,
} from './type.ts'
import type { RequestMethod, RequestOption } from './typedBase.ts'
import { findCallback, TypedBase } from './typedBase.ts'
import type { S3ListObject } from './xml-parsers.ts'
import * as xmlParsers from './xml-parsers.ts'
import { parseSelectObjectContentResponse } from './xml-parsers.ts'

export class TypedClient extends TypedBase {
  getBucketVersioning(bucketName: string, callback: ResultCallback<VersioningConfig>): void
  getBucketVersioning(bucketName: string): Promise<VersioningConfig>

  getBucketVersioning(bucketName: string, cb?: ResultCallback<VersioningConfig>): void | Promise<VersioningConfig> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }

    const method = 'GET'
    const query = 'versioning'
    return asCallbackFn(cb, async () => {
      const res = await this.makeRequestAsync({ method, bucketName, query })
      const body = await readAsBuffer(res)
      return xmlParsers.parseBucketVersioningConfig(body.toString())
    })
  }

  setBucketVersioning(bucketName: string, versioningConfig: VersionConfigInput, callback: NoResultCallback): void
  setBucketVersioning(bucketName: string, versioningConfig: VersionConfigInput): Promise<void>
  setBucketVersioning(
    bucketName: string,
    versionConfig: VersionConfigInput,
    cb?: NoResultCallback,
  ): void | Promise<void> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!Object.keys(versionConfig).length) {
      throw new errors.InvalidArgumentError('versionConfig should be of type "object"')
    }

    const method = 'PUT'
    const query = 'versioning'
    const builder = new xml2js.Builder({
      rootName: 'VersioningConfiguration',
      renderOpts: { pretty: false },
      headless: true,
    })
    const payload = builder.buildObject(versionConfig)

    return asCallbackFn(cb, async () => {
      await this.makeRequestAsyncOmit({ method, bucketName, query }, payload)
    })
  }

  /**
   * Set the policy on a bucket or an object prefix.
   *
   * @param bucketName - name of the bucket
   * @param bucketPolicy - bucket policy (JSON stringify'ed)
   */
  setBucketPolicy(bucketName: string, bucketPolicy: string): Promise<void>
  setBucketPolicy(bucketName: string, bucketPolicy: string, callback: NoResultCallback): void

  setBucketPolicy(bucketName: string, policy: string, cb?: NoResultCallback): void | Promise<void> {
    // Validate arguments.
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`)
    }
    if (!isString(policy)) {
      throw new errors.InvalidBucketPolicyError(`Invalid bucket policy: ${policy} - must be "string"`)
    }

    let method: RequestMethod = 'DELETE'
    const query = 'policy'

    if (policy) {
      method = 'PUT'
    }

    return asCallbackFn(cb, async () => {
      await this.makeRequestAsyncOmit(
        {
          method,
          bucketName,
          query,
        },
        policy,
        [204],
        '',
      )
    })
  }

  /**
   * Set the policy on a bucket or an object prefix.
   */
  getBucketPolicy(bucketName: string, callback: ResultCallback<string>): void
  getBucketPolicy(bucketName: string): Promise<string>

  getBucketPolicy(bucketName: string, cb?: ResultCallback<string>): void | Promise<string> {
    // Validate arguments.
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`)
    }

    const method = 'GET'
    const query = 'policy'
    return asCallbackFn<string>(cb, async () => {
      const res = await this.makeRequestAsync({ method, bucketName, query }, '', [200], '')
      const body = await readAsBuffer(res)
      return body.toString()
    })
  }

  /**
   *  Get Tags associated with a Bucket
   */
  getBucketTagging(bucketName: string, callback: ResultCallback<Tag[]>): void
  getBucketTagging(bucketName: string): Promise<Tag[]>

  getBucketTagging(bucketName: string, cb?: ResultCallback<Tag[]>): void | Promise<Tag[]> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`)
    }

    const method = 'GET'
    const query = 'tagging'
    const requestOptions: RequestOption = { method, bucketName, query }

    return asCallbackFn(cb, async () => {
      const res = await this.makeRequestAsync(requestOptions)
      const body = await readAsBuffer(res)
      return xmlParsers.parseTagging(body.toString())
    })
  }

  /** Remove Tags on an Bucket/Object based on params
   * __Arguments__
   * bucketName _string_
   * objectName _string_ (optional)
   * removeOpts _object_ (Optional) e.g {versionId:"my-object-version-id"},
   * `cb(error)` _function_ - callback function with `err` as the error argument. `err` is null if the operation is successful.
   */
  protected async removeTagging({
    bucketName,
    objectName,
    removeOpts,
  }: {
    removeOpts?: { versionId?: string }
    bucketName: string
    objectName?: string
  }) {
    const method = 'DELETE'
    let query = 'tagging'

    if (removeOpts && removeOpts.versionId) {
      query = `${query}&versionId=${removeOpts.versionId}`
    }
    const requestOptions: RequestOption = { method, bucketName, objectName, query }

    if (objectName) {
      requestOptions['objectName'] = objectName
    }

    await this.makeRequestAsync(requestOptions, '', [200, 204], '')
  }

  /**
   * Remove Tags associated with a bucket
   */
  removeBucketTagging(bucketName: string, callback: NoResultCallback): void
  removeBucketTagging(bucketName: string): Promise<void>

  /** Remove Tags associated with a bucket
   *  __Arguments__
   * bucketName _string_
   * `cb(error)` _function_ - callback function with `err` as the error argument. `err` is null if the operation is successful.
   */
  removeBucketTagging(bucketName: string, cb?: NoResultCallback): void | Promise<void> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }

    return asCallback(cb, this.removeTagging({ bucketName }))
  }

  /**
   * Set Tags on a Bucket
   *
   */
  setBucketTagging(bucketName: string, tags: TagList, callback: NoResultCallback): void
  setBucketTagging(bucketName: string, tags: TagList): Promise<void>

  setBucketTagging(bucketName: string, tags: TagList, cb?: NoResultCallback): void | Promise<void> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isObject(tags)) {
      throw new errors.InvalidArgumentError('tags should be of type "object"')
    }
    if (Object.keys(tags).length > 10) {
      throw new errors.InvalidArgumentError('maximum tags allowed is 10"')
    }

    return asCallback(cb, this.setTagging({ bucketName, tags }))
  }

  getBucketLifecycle(bucketName: string, callback: ResultCallback<Lifecycle>): void
  getBucketLifecycle(bucketName: string): Promise<Lifecycle>

  /**
   *  Get lifecycle configuration on a bucket.
   */
  getBucketLifecycle(bucketName: string, cb?: ResultCallback<Lifecycle>) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    const method = 'GET'
    const query = 'lifecycle'
    const requestOptions: RequestOption = { method, bucketName, query }

    return asCallbackFn(cb, async () => {
      const res = await this.makeRequestAsync(requestOptions)
      const body = await readAsBuffer(res)
      return xmlParsers.parseLifecycleConfig(body.toString())
    })
  }

  removeBucketLifecycle(bucketName: string, callback: NoResultCallback): void
  removeBucketLifecycle(bucketName: string): Promise<void>

  /**
   *  Remove lifecycle configuration of a bucket.
   */
  removeBucketLifecycle(bucketName: string, cb?: NoResultCallback) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    const method = 'DELETE'
    const query = 'lifecycle'
    return asCallbackFn(cb, async () => {
      await this.makeRequestAsyncOmit({ method, bucketName, query }, '', [204])
    })
  }

  // presignedPostPolicy can be used in situations where we want more control on the upload than what
  // presignedPutObject() provides. i.e Using presignedPostPolicy we will be able to put policy restrictions

  // return PostPolicy object
  newPostPolicy() {
    return new PostPolicy()
  }

  /**
   * Put lifecycle configuration on a bucket.
   * Apply lifecycle configuration on a bucket.
   *
   * this method is not documented yet so it's marked as `protected`, ts will not emit it in type definition
   *
   * @param bucketName
   * @param policyConfig - a valid policy configuration object.
   */
  protected async applyBucketLifecycle(bucketName: string, policyConfig: Lifecycle): Promise<void> {
    const method = 'PUT'
    const query = 'lifecycle'

    const encoder = new TextEncoder()
    const builder = new xml2js.Builder({
      rootName: 'LifecycleConfiguration',
      headless: true,
      renderOpts: { pretty: false },
    })

    const payload = encoder.encode(builder.buildObject(policyConfig))
    const headers: RequestHeaders = { 'Content-MD5': toMd5(payload) }
    await this.makeRequestAsyncOmit({ method, bucketName, query, headers }, payload)
  }

  /** Set/Override lifecycle configuration on a bucket. if the configuration is empty, it removes the configuration.
   *
   * @param bucketName
   * @param lifecycleConfig - null or empty object will remove bucket life cycle
   * @param callback - if no callback, a promise will be returned
   */
  setBucketLifecycle(bucketName: string, lifecycleConfig: Lifecycle | null, callback: NoResultCallback): void
  setBucketLifecycle(bucketName: string, lifecycleConfig: Lifecycle | null): Promise<void>

  setBucketLifecycle(bucketName: string, lifeCycleConfig: Lifecycle | null = null, cb?: NoResultCallback) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    return asCallbackFn(cb, async () => {
      if (isEmpty(lifeCycleConfig)) {
        await this.removeBucketLifecycle(bucketName)
      } else {
        await this.applyBucketLifecycle(bucketName, lifeCycleConfig)
      }
    })
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

  listObjects(
    bucketName: string,
    prefix: string,
    recursive: boolean,
    listOpts: {
      MaxKeys?: number
      IncludeVersion?: boolean
    } = {},
  ): BucketStream<S3ListObject> {
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
    const listQueryOpts = {
      Delimiter: recursive ? '' : '/', // if recursive is false set delimiter to '/'
      MaxKeys: 1000,
      IncludeVersion: listOpts.IncludeVersion,
    }
    let objects: S3ListObject[] = []
    let ended = false
    const readStream = new stream.Readable({ objectMode: true })

    let marker = ''
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    readStream._read = async () => {
      // push one object per _read()
      if (objects.length) {
        readStream.push(objects.shift())
        return
      }
      if (ended) {
        return readStream.push(null)
      }

      try {
        const result = await this.listObjectsQuery(bucketName, prefix, marker, listQueryOpts)
        while (!ended) {
          if (result.isTruncated) {
            marker = result.nextMarker || (result.versionIdMarker as string)
          } else {
            ended = true
          }
          objects = result.objects
          // @ts-expect-error next read
          readStream._read()
        }
      } catch (e) {
        readStream.emit('error', e)
      }
    }

    return readStream
  }

  // list a batch of objects
  protected async listObjectsQuery(
    bucketName: string,
    prefix: string,
    marker: string,
    {
      Delimiter,
      MaxKeys,
      IncludeVersion,
    }: Partial<Pick<ListObjectV1Opt, 'IncludeVersion'>> & Required<Pick<ListObjectV1Opt, 'MaxKeys' | 'Delimiter'>>,
  ) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isString(prefix)) {
      throw new TypeError('prefix should be of type "string"')
    }
    if (!isString(marker)) {
      throw new TypeError('marker should be of type "string"')
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
    let query = ''
    if (queries.length > 0) {
      query = `${queries.join('&')}`
    }

    const method = 'GET'

    const res = await this.makeRequestAsync({ method, bucketName, query })
    const body = await readAsBuffer(res)

    return xmlParsers.parseListObjects(body.toString())
  }

  putObjectRetention(bucketName: string, objectName: string, callback: NoResultCallback): void
  putObjectRetention(
    bucketName: string,
    objectName: string,
    retentionOptions: Retention,
    callback: NoResultCallback,
  ): void
  putObjectRetention(bucketName: string, objectName: string, retentionOptions?: Retention): Promise<void>

  putObjectRetention(
    bucketName: string,
    objectName: string,
    retentionOptsOrCallback?: Retention | NoResultCallback,
    callback?: NoResultCallback,
  ): void | Promise<void> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }

    let retentionOpts: Retention = {}
    let cb: undefined | NoResultCallback
    if (isFunction(retentionOptsOrCallback)) {
      cb = retentionOptsOrCallback
    } else {
      retentionOpts = retentionOptsOrCallback as Retention
      cb = callback
    }

    if (!isObject(retentionOpts)) {
      throw new errors.InvalidArgumentError('retentionOpts should be of type "object"')
    } else {
      if (retentionOpts.governanceBypass && !isBoolean(retentionOpts.governanceBypass)) {
        throw new errors.InvalidArgumentError(`Invalid value for governanceBypass: ${retentionOpts.governanceBypass}`)
      }
      if (
        retentionOpts.mode &&
        ![RETENTION_MODES.COMPLIANCE, RETENTION_MODES.GOVERNANCE].includes(retentionOpts.mode)
      ) {
        throw new errors.InvalidArgumentError(`Invalid object retention mode: ${retentionOpts.mode}`)
      }
      if (retentionOpts.retainUntilDate && !isString(retentionOpts.retainUntilDate)) {
        throw new errors.InvalidArgumentError(`Invalid value for retainUntilDate: ${retentionOpts.retainUntilDate}`)
      }
      if (retentionOpts.versionId && !isString(retentionOpts.versionId)) {
        throw new errors.InvalidArgumentError(`Invalid value for versionId: ${retentionOpts.versionId}`)
      }
    }

    const method = 'PUT'
    let query = 'retention'

    const headers: RequestHeaders = {}
    if (retentionOpts.governanceBypass) {
      headers['X-Amz-Bypass-Governance-Retention'] = true
    }

    const builder = new xml2js.Builder({ rootName: 'Retention', renderOpts: { pretty: false }, headless: true })
    const params: Record<string, unknown> = {}

    if (retentionOpts.mode) {
      params.Mode = retentionOpts.mode
    }
    if (retentionOpts.retainUntilDate) {
      params.RetainUntilDate = retentionOpts.retainUntilDate
    }
    if (retentionOpts.versionId) {
      query += `&versionId=${retentionOpts.versionId}`
    }

    const payload = builder.buildObject(params)

    headers['Content-MD5'] = toMd5(payload)

    return asCallbackFn(cb, async () => {
      await this.makeRequestAsyncOmit(
        {
          method,
          bucketName,
          objectName,
          query,
          headers,
        },
        payload,
        [200, 204],
      )
    })
  }

  getBucketEncryption(bucketName: string, callback: ResultCallback<Encryption>): void
  getBucketEncryption(bucketName: string): Promise<Encryption>
  getBucketEncryption(bucketName: string, cb?: ResultCallback<Encryption>): void | Promise<Encryption> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isOptionalFunction(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"')
    }
    const method = 'GET'
    const query = 'encryption'

    return asCallbackFn(cb, async () => {
      const res = await this.makeRequestAsync({ method, bucketName, query })
      const body = await readAsBuffer(res)
      return xmlParsers.parseBucketEncryptionConfig(body.toString())
    })
  }

  setBucketEncryption(bucketName: string, encryptionConfig: Encryption, callback: NoResultCallback): void
  setBucketEncryption(bucketName: string, encryptionConfig: Encryption): Promise<void>
  setBucketEncryption(
    bucketName: string,
    encryptionConfigOrCallback: Encryption | NoResultCallback | undefined,
    callback?: NoResultCallback,
  ): void | Promise<void> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }

    let encryptionConfig: Encryption | undefined
    let cb: NoResultCallback | undefined

    if (isFunction(encryptionConfigOrCallback)) {
      cb = encryptionConfigOrCallback
      encryptionConfig = undefined
    } else {
      encryptionConfig = encryptionConfigOrCallback
      cb = callback
    }

    if (!isEmpty(encryptionConfig) && encryptionConfig.Rule.length > 1) {
      throw new errors.InvalidArgumentError('Invalid Rule length. Only one rule is allowed: ' + encryptionConfig.Rule)
    }
    if (!isOptionalFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    let encryptionObj = encryptionConfig
    if (isEmpty(encryptionConfig)) {
      encryptionObj = {
        // Default MinIO Server Supported Rule
        Rule: [
          {
            ApplyServerSideEncryptionByDefault: {
              SSEAlgorithm: 'AES256',
            },
          },
        ],
      }
    }

    const method = 'PUT'
    const query = 'encryption'
    const builder = new xml2js.Builder({
      rootName: 'ServerSideEncryptionConfiguration',
      renderOpts: { pretty: false },
      headless: true,
    })
    const payload = builder.buildObject(encryptionObj)

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

  /**
   * Remove the specified object.
   */
  removeObject(bucketName: string, objectName: string, removeOpts: RemoveOptions, callback: NoResultCallback): void
  removeObject(bucketName: string, objectName: string, callback: NoResultCallback): void
  removeObject(bucketName: string, objectName: string, removeOpts?: RemoveOptions): Promise<void>
  removeObject(
    bucketName: string,
    objectName: string,
    removeOptsOrCallback: RemoveOptions | NoResultCallback = {},
    callback?: NoResultCallback,
  ): void | Promise<void> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }

    let removeOpts: RemoveOptions = {}
    let cb: NoResultCallback | undefined

    // backward compatibility
    if (isFunction(removeOptsOrCallback)) {
      cb = removeOptsOrCallback
    } else {
      removeOpts = removeOptsOrCallback
      cb = callback
    }

    if (!isObject(removeOpts)) {
      throw new errors.InvalidArgumentError('removeOpts should be of type "object"')
    }
    if (!isOptionalFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    const method = 'DELETE'
    const queryParams: Record<string, string> = {}

    if (removeOpts.versionId) {
      queryParams.versionId = `${removeOpts.versionId}`
    }
    const headers: RequestHeaders = {}
    if (removeOpts.governanceBypass) {
      headers['X-Amz-Bypass-Governance-Retention'] = true
    }
    if (removeOpts.forceDelete) {
      headers['x-minio-force-delete'] = true
    }

    const query = qs(queryParams)

    const requestOptions: RequestOption = { method, bucketName, objectName, headers }
    if (query) {
      requestOptions['query'] = query
    }

    return asCallbackFn(cb, async () => {
      await this.makeRequestAsyncOmit(requestOptions, '', [200, 204])
    })
  }

  /**
   * Generate a generic pre-signed URL which can be used for HTTP methods GET, PUT, HEAD and DELETE
   *
   * @param httpMethod - name of the HTTP method
   * @param bucketName - name of the bucket
   * @param objectName - name of the object
   * @param expires - expiry in seconds (optional, default 7 days)
   * @param reqParams - request parameters (optional) e.g {versionId:"10fa9946-3f64-4137-a58f-888065c0732e"}
   * @param requestDate - A date object, the url will be issued at (optional)
   */
  presignedUrl(
    httpMethod: string,
    bucketName: string,
    objectName: string,
    expires?: number,
    reqParams?: Record<string, any>,
    requestDate?: Date,
  ): Promise<string>

  presignedUrl(httpMethod: string, bucketName: string, objectName: string, callback: ResultCallback<string>): void
  presignedUrl(
    httpMethod: string,
    bucketName: string,
    objectName: string,
    expiry: number,
    callback: ResultCallback<string>,
  ): void
  presignedUrl(
    httpMethod: string,
    bucketName: string,
    objectName: string,
    expiry: number,
    reqParams: Record<string, any>,
    callback: ResultCallback<string>,
  ): void
  presignedUrl(
    httpMethod: string,
    bucketName: string,
    objectName: string,
    expiry: number,
    reqParams: Record<string, any>,
    requestDate: Date,
    callback: ResultCallback<string>,
  ): void

  presignedUrl(
    method: 'GET' | 'DELETE' | 'PUT' | 'POST',
    bucketName: string,
    objectName: string,
    // expires?: number,
    // reqParams?: Record<string, any>,
    // requestDate?: Date,
    // callback?: ResultCallback<string>,
    ...originalArgs: unknown[]
  ): void | Promise<string> {
    if (this.anonymous) {
      throw new errors.AnonymousRequestError('Presigned ' + method + ' url cannot be generated for anonymous requests')
    }

    let [[expires, reqParams, requestDate], cb] = findCallback<
      [number, Record<string, any>, Date],
      ResultCallback<string>
    >(originalArgs)

    expires = expires ?? 24 * 60 * 60 * 7 // 7 days in seconds
    reqParams = reqParams ?? {}
    requestDate = requestDate ?? new Date()

    if (!isNumber(expires)) {
      throw new TypeError(`expires should be of type "number", got ${expires}`)
    }
    if (!isObject(reqParams)) {
      throw new TypeError(`reqParams should be of type "object", got ${reqParams}`)
    }
    if (!isValidDate(requestDate)) {
      throw new TypeError(`requestDate should be of type "Date" and valid, got ${requestDate}`)
    }
    if (!isOptionalFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }
    const query = qs(reqParams)
    return asCallbackFn(cb, async () => {
      const region = await this.getBucketRegionAsync(bucketName)

      const reqOptions = this.getRequestOptions({ method, region, bucketName, objectName, query })
      void this.checkAndRefreshCreds()
      return presignSignatureV4(
        reqOptions,
        this.accessKey,
        this.secretKey,
        this.sessionToken!,
        region,
        requestDate,
        expires,
      )
    })
  }

  /**
   * Generate a presigned URL for GET
   *
   * @param bucketName - name of the bucket
   * @param objectName - name of the object
   * @param expires - expiry in seconds (optional, default 7 days)
   * @param respHeaders - response headers to override or request params for query (optional) e.g {versionId:"10fa9946-3f64-4137-a58f-888065c0732e"}
   * @param requestDate - A date object, the url will be issued at (optional)
   */
  presignedGetObject(
    bucketName: string,
    objectName: string,
    expires?: number,
    respHeaders?: Record<string, any>,
    requestDate?: Date,
  ): Promise<string>

  presignedGetObject(bucketName: string, objectName: string, callback: ResultCallback<string>): void
  presignedGetObject(bucketName: string, objectName: string, expires: number, callback: ResultCallback<string>): void
  presignedGetObject(
    bucketName: string,
    objectName: string,
    expires: number,
    respHeaders: Record<string, any>,
    callback: ResultCallback<string>,
  ): void
  presignedGetObject(
    bucketName: string,
    objectName: string,
    expires: number,
    respHeaders: Record<string, any>,
    requestDate: Date,
    callback: ResultCallback<string>,
  ): void

  presignedGetObject(
    bucketName: string,
    objectName: string,
    expires?: unknown,
    respHeaders?: unknown,
    requestDate?: unknown,
    cb?: unknown,
  ): void | Promise<string> {
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

    const validRespHeaders = [
      'response-content-type',
      'response-content-language',
      'response-expires',
      'response-cache-control',
      'response-content-disposition',
      'response-content-encoding',
    ]
    validRespHeaders.forEach((header) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      if (respHeaders !== undefined && respHeaders[header] !== undefined && !isString(respHeaders[header])) {
        throw new TypeError(`response header ${header} should be of type "string"`)
      }
    })

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore presignedUrl will check type values, just leave it here for future refactor.
    return this.presignedUrl('GET', bucketName, objectName, expires as number, respHeaders, requestDate as Date, cb)
  }

  presignedPutObject(bucketName: string, objectName: string, callback: ResultCallback<string>): void
  presignedPutObject(bucketName: string, objectName: string, expiry: number, callback: ResultCallback<string>): void
  presignedPutObject(bucketName: string, objectName: string, expiry?: number): Promise<string>

  // * `expiry` _number_: expiry in seconds (optional, default 7 days)
  presignedPutObject(
    bucketName: string,
    objectName: string,
    expires?: number | ResultCallback<string>,
    cb?: ResultCallback<string>,
  ): void | Promise<string> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    return this.presignedUrl('PUT', bucketName, objectName, expires as number, cb)
  }

  presignedPostPolicy(policy: PostPolicy, callback: ResultCallback<PostPolicyResult>): void
  presignedPostPolicy(policy: PostPolicy): Promise<PostPolicyResult>
  presignedPostPolicy(postPolicy: PostPolicy, cb?: ResultCallback<PostPolicyResult>): void | Promise<PostPolicyResult> {
    return asCallbackFn(cb, async () => {
      if (this.anonymous) {
        throw new errors.AnonymousRequestError('Presigned POST policy cannot be generated for anonymous requests')
      }
      if (!isObject(postPolicy)) {
        throw new TypeError('postPolicy should be of type "object"')
      }
      if (!isOptionalFunction(cb)) {
        throw new TypeError('cb should be of type "function"')
      }
      // @ts-expect-error index check
      const region = await this.getBucketRegionAsync(postPolicy.formData.bucket)
      const date = new Date()
      const dateStr = makeDateLong(date)
      void this.checkAndRefreshCreds()

      if (!postPolicy.policy.expiration) {
        // 'expiration' is mandatory field for S3.
        // Set default expiration date of 7 days.
        const expires = new Date()
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

      const policyBase64 = Buffer.from(JSON.stringify(postPolicy.policy)).toString('base64')

      postPolicy.formData.policy = policyBase64

      postPolicy.formData['x-amz-signature'] = postPresignSignatureV4(region, date, this.secretKey, policyBase64)
      const opts: RequestOption = { method: 'POST', region: region, bucketName: postPolicy.formData.bucket }
      const reqOptions = this.getRequestOptions(opts)
      const portStr = this.port == 80 || this.port === 443 ? '' : `:${this.port.toString()}`
      const urlStr = `${reqOptions.protocol}//${reqOptions.host}${portStr}${reqOptions.path}`
      return { postURL: urlStr, formData: postPolicy.formData }
    })
  }

  setObjectTagging(bucketName: string, objectName: string, tags: TagList, callback: NoResultCallback): void
  setObjectTagging(
    bucketName: string,
    objectName: string,
    tags: TagList,
    putOptions: VersionIdentification,
    callback: NoResultCallback,
  ): void
  setObjectTagging(
    bucketName: string,
    objectName: string,
    tags: TagList,
    putOptions?: VersionIdentification,
  ): Promise<void>

  /** Set Tags on an Object
   * __Arguments__
   * bucketName _string_
   * objectName _string_
   *  * tags _object_ of the form {'<tag-key-1>':'<tag-value-1>','<tag-key-2>':'<tag-value-2>'}
   *  putOpts _object_ (Optional) e.g {versionId:"my-object-version-id"},
   * `cb(error)` _function_ - callback function with `err` as the error argument. `err` is null if the operation is successful.
   */
  setObjectTagging(
    bucketName: string,
    objectName: string,
    tagsArg: TagList,
    putOptsArg?: VersionIdentification | NoResultCallback,
    cbArg?: NoResultCallback,
  ): void | Promise<void> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidBucketNameError('Invalid object name: ' + objectName)
    }

    let [[tags, putOpts], cb] = findCallback<[TagList, VersionIdentification?], NoResultCallback>([
      tagsArg,
      putOptsArg,
      cbArg,
    ])
    putOpts = putOpts ?? {}

    if (!isObject(tags)) {
      throw new errors.InvalidArgumentError('tags should be of type "object"')
    }
    if (Object.keys(tags).length > 10) {
      throw new errors.InvalidArgumentError('Maximum tags allowed is 10"')
    }

    if (!isOptionalFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    return asCallback<void>(cb, this.setTagging({ bucketName, objectName, tags, putOpts }))
  }

  /** To set Tags on a bucket or object based on the params
   *  __Arguments__
   * taggingParams _object_ Which contains the following properties
   *  bucketName _string_,
   *  objectName _string_ (Optional),
   *  tags _object_ of the form {'<tag-key-1>':'<tag-value-1>','<tag-key-2>':'<tag-value-2>'}
   *  putOpts _object_ (Optional) e.g {versionId:"my-object-version-id"},
   *  cb(error)` _function_ - callback function with `err` as the error argument. `err` is null if the operation is successful.
   */
  async setTagging({
    bucketName,
    objectName,
    putOpts = {},
    tags,
  }: {
    tags: TagList
    putOpts?: VersionIdentification
    bucketName: string
    objectName?: string
  }): Promise<void> {
    const method = 'PUT'
    let query = 'tagging'

    if (putOpts && putOpts.versionId) {
      query = `${query}&versionId=${putOpts.versionId}`
    }
    const tagsList = []
    for (const [key, value] of Object.entries(tags)) {
      tagsList.push({ Key: key, Value: value })
    }
    const taggingConfig = {
      Tagging: {
        TagSet: {
          Tag: tagsList,
        },
      },
    }
    const encoder = new TextEncoder()
    const headers: RequestHeaders = {}
    const builder = new xml2js.Builder({ headless: true, renderOpts: { pretty: false } })
    const payload = encoder.encode(builder.buildObject(taggingConfig))
    headers['Content-MD5'] = toMd5(payload)
    const requestOptions: RequestOption = { method, bucketName, query, headers }

    if (objectName) {
      requestOptions['objectName'] = objectName
    }
    headers['Content-MD5'] = toMd5(payload)

    await this.makeRequestAsyncOmit(requestOptions, payload)
  }

  removeObjectTagging(bucketName: string, objectName: string, callback: NoResultCallback): void
  removeObjectTagging(
    bucketName: string,
    objectName: string,
    removeOptions: VersionIdentification,
    callback: NoResultCallback,
  ): void
  removeObjectTagging(bucketName: string, objectName: string, removeOptions?: VersionIdentification): Promise<void>

  /** Remove tags associated with an object
   * __Arguments__
   * bucketName _string_
   * objectName _string_
   * removeOpts _object_ (Optional) e.g. {VersionID:"my-object-version-id"}
   * `cb(error)` _function_ - callback function with `err` as the error argument. `err` is null if the operation is successful.
   */
  removeObjectTagging(
    bucketName: string,
    objectName: string,
    removeOptsArg?: VersionIdentification | NoResultCallback,
    cbArg?: NoResultCallback,
  ): Promise<void> | void {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidBucketNameError('Invalid object name: ' + objectName)
    }

    const [[removeOpts], cb] = findCallback<[VersionIdentification?], NoResultCallback>([removeOptsArg, cbArg])
    if (removeOpts && Object.keys(removeOpts).length && !isObject(removeOpts)) {
      throw new errors.InvalidArgumentError('removeOpts should be of type "object"')
    }

    if (!isOptionalFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    return asCallback(cb, this.removeTagging({ bucketName, objectName, removeOpts }))
  }

  selectObjectContent(
    bucketName: string,
    objectName: string,
    selectOpts: SelectOptions,
    callback: ResultCallback<SelectResults>,
  ): void
  selectObjectContent(bucketName: string, objectName: string, selectOpts: SelectOptions): Promise<SelectResults>

  selectObjectContent(
    bucketName: string,
    objectName: string,
    selectOpts: SelectOptions,
    cb?: ResultCallback<SelectResults>,
  ): void | Promise<SelectResults> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }
    if (!isEmpty(selectOpts)) {
      if (!isString(selectOpts.expression)) {
        throw new TypeError('sqlExpression should be of type "string"')
      }
      if (!isEmpty(selectOpts.inputSerialization)) {
        if (!isObject(selectOpts.inputSerialization)) {
          throw new TypeError('inputSerialization should be of type "object"')
        }
      } else {
        throw new TypeError('inputSerialization is required')
      }
      if (!isEmpty(selectOpts.outputSerialization)) {
        if (!isObject(selectOpts.outputSerialization)) {
          throw new TypeError('outputSerialization should be of type "object"')
        }
      } else {
        throw new TypeError('outputSerialization is required')
      }
    } else {
      throw new TypeError('valid select configuration is required')
    }

    if (!isOptionalFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    const method = 'POST'
    let query = `select`
    query += '&select-type=2'

    const config: unknown[] = [
      {
        Expression: selectOpts.expression,
      },
      {
        ExpressionType: selectOpts.expressionType || 'SQL',
      },
      {
        InputSerialization: [selectOpts.inputSerialization],
      },
      {
        OutputSerialization: [selectOpts.outputSerialization],
      },
    ]

    // Optional
    if (selectOpts.requestProgress) {
      config.push({ RequestProgress: selectOpts.requestProgress })
    }
    // Optional
    if (selectOpts.scanRange) {
      config.push({ ScanRange: selectOpts.scanRange })
    }

    const builder = new xml2js.Builder({
      rootName: 'SelectObjectContentRequest',
      renderOpts: { pretty: false },
      headless: true,
    })
    const payload = builder.buildObject(config)

    return asCallbackFn(cb, async () => {
      const res = await this.makeRequestAsync({ method, bucketName, objectName, query }, payload)
      return parseSelectObjectContentResponse(await readAsBuffer(res))
    })
  }

  getObjectRetention(
    bucketName: string,
    objectName: string,
    options: VersionIdentification,
    callback: ResultCallback<Retention>,
  ): void
  getObjectRetention(bucketName: string, objectName: string, options: VersionIdentification): Promise<Retention>

  getObjectRetention(
    bucketName: string,
    objectName: string,
    getOpts: VersionIdentification,
    cb?: ResultCallback<Retention>,
  ): Promise<Retention> | void {
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

    return asCallbackFn(cb, async (): Promise<Retention> => {
      const res = await this.makeRequestAsync({ method, bucketName, objectName, query })
      const body = await readAsBuffer(res)
      return xmlParsers.parseObjectRetentionConfig(body.toString())
    })
  }

  getObjectTagging(bucketName: string, objectName: string, callback: ResultCallback<Tag[]>): void
  getObjectTagging(
    bucketName: string,
    objectName: string,
    getOptions: VersionIdentification,
    callback: ResultCallback<Tag[]>,
  ): void
  getObjectTagging(bucketName: string, objectName: string, getOptions?: VersionIdentification): Promise<Tag[]>

  getObjectTagging(
    bucketName: string,
    objectName: string,
    getOptsArg?: VersionIdentification | ResultCallback<Tag[]>,
    cbArg?: ResultCallback<Tag[]>,
  ): void | Promise<Tag[]> {
    const method = 'GET'
    let query = 'tagging'

    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidBucketNameError('Invalid object name: ' + objectName)
    }

    const [[getOpts = {}], cb] = findCallback<[VersionIdentification | undefined], ResultCallback<Tag[]>>([
      getOptsArg,
      cbArg,
    ])

    if (!isObject(getOpts)) {
      throw new errors.InvalidArgumentError('getOpts should be of type "object"')
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    if (getOpts && getOpts.versionId) {
      query = `${query}&versionId=${getOpts.versionId}`
    }
    const requestOptions: RequestOption = { method, bucketName, query }
    if (objectName) {
      requestOptions['objectName'] = objectName
    }

    return asCallbackFn(cb, async () => {
      const res = await this.makeRequestAsync(requestOptions)
      const body = await readAsBuffer(res)
      return xmlParsers.parseTagging(body.toString())
    })
  }

  getObjectLegalHold(bucketName: string, objectName: string, callback: ResultCallback<LegalHoldOptions>): void
  getObjectLegalHold(
    bucketName: string,
    objectName: string,
    getOptions: VersionIdentification,
    callback: ResultCallback<LegalHoldOptions>,
  ): void
  getObjectLegalHold(
    bucketName: string,
    objectName: string,
    getOptions?: VersionIdentification,
  ): Promise<LegalHoldOptions>

  getObjectLegalHold(
    bucketName: string,
    objectName: string,
    getOptsArg?: VersionIdentification | ResultCallback<LegalHoldOptions>,
    cbArg?: ResultCallback<LegalHoldOptions>,
  ): void | Promise<LegalHoldOptions> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }

    const [[getOpts = {}], cb] = findCallback<[VersionIdentification], ResultCallback<LegalHoldOptions>>([
      getOptsArg,
      cbArg,
    ])

    if (!isObject(getOpts)) {
      throw new TypeError('getOpts should be of type "Object"')
    } else if (Object.keys(getOpts).length > 0 && getOpts.versionId && !isString(getOpts.versionId)) {
      throw new TypeError('versionId should be of type string.:', getOpts.versionId)
    }

    if (!isFunction(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"')
    }

    const method = 'GET'
    let query = 'legal-hold'

    if (getOpts.versionId) {
      query += `&versionId=${getOpts.versionId}`
    }

    return asCallbackFn(cb, async () => {
      const res = await this.makeRequestAsync({ method, bucketName, objectName, query })
      const body = await readAsBuffer(res)
      return xmlParsers.parseObjectLegalHoldConfig(body.toString())
    })
  }

  setObjectLegalHold(bucketName: string, objectName: string, callback: NoResultCallback): void
  setObjectLegalHold(
    bucketName: string,
    objectName: string,
    setOptions: LegalHoldOptions,
    callback: NoResultCallback,
  ): void
  setObjectLegalHold(bucketName: string, objectName: string, setOptions?: LegalHoldOptions): Promise<void>

  setObjectLegalHold(
    bucketName: string,
    objectName: string,
    setOptions?: LegalHoldOptions | NoResultCallback,
    callback?: NoResultCallback,
  ): void | Promise<void> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }

    const defaultOpts: LegalHoldOptions = {
      status: LEGAL_HOLD_STATUS.ENABLED,
    }

    let [[setOpts = defaultOpts], cb] = findCallback<[LegalHoldOptions], NoResultCallback>([setOptions, callback])

    if (!isObject(setOpts)) {
      throw new TypeError('setOpts should be of type "Object"')
    } else {
      if (![LEGAL_HOLD_STATUS.ENABLED, LEGAL_HOLD_STATUS.DISABLED].includes(setOpts.status)) {
        throw new TypeError('Invalid status: ' + setOpts.status)
      }
      if (setOpts.versionId && !setOpts.versionId.length) {
        throw new TypeError('versionId should be of type string.:' + setOpts.versionId)
      }
    }

    if (!isOptionalFunction(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"')
    }

    if (isEmpty(setOpts)) {
      setOpts = defaultOpts
    }

    const method = 'PUT'
    let query = 'legal-hold'

    if (setOpts.versionId) {
      query += `&versionId=${setOpts.versionId}`
    }

    const config = {
      Status: setOpts.status,
    }

    const builder = new xml2js.Builder({ rootName: 'LegalHold', renderOpts: { pretty: false }, headless: true })
    const payload = builder.buildObject(config)
    const headers = {
      'Content-MD5': toMd5(payload),
    }

    return asCallbackFn(cb, async () => {
      await this.makeRequestAsyncOmit(
        {
          method,
          bucketName,
          objectName,
          query,
          headers,
        },
        payload,
      )
    })
  }

  /**
   * Internal Method to abort a multipart upload request in case of any errors.
   * @param bucketName __string__ Bucket Name
   * @param objectName __string__ Object Name
   * @param uploadId __string__ id of a multipart upload to cancel during compose object sequence.
   */
  protected async abortMultipartUpload(bucketName: string, objectName: string, uploadId: string) {
    // TODO: type callback
    const method = 'DELETE'
    const query = `uploadId=${uploadId}`

    const requestOptions: RequestOption = { method, bucketName, objectName: objectName, query }
    await this.makeRequestAsyncOmit(requestOptions, '', [204])
  }

  removeObjects(
    bucketName: string,
    objectsList: Array<
      | string
      | {
          name: string
          versionId?: string
        }
    >,
    callback: NoResultCallback,
  ): void
  removeObjects(
    bucketName: string,
    objectsList: Array<
      | string
      | {
          name: string
          versionId?: string
        }
    >,
  ): Promise<void>

  removeObjects(
    bucketName: string,
    objectsList: Array<
      | string
      | {
          name: string
          versionId?: string
        }
    >,
    cb?: NoResultCallback,
  ): void | Promise<void> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!Array.isArray(objectsList)) {
      throw new errors.InvalidArgumentError('objectsList should be a list')
    }
    if (!isOptionalFunction(cb)) {
      throw new TypeError('callback should be of type "function"')
    }

    const maxEntries = 1000
    const query = 'delete'
    const method = 'POST'

    type O =
      | string
      | {
          name: string
          versionId?: string
        }

    const result = objectsList.reduce(
      (result, entry) => {
        result.list.push(entry)
        if (result.list.length === maxEntries) {
          result.listOfList.push(result.list)
          result.list = []
        }
        return result
      },
      { listOfList: [] as O[][], list: [] as O[] },
    )

    if (result.list.length > 0) {
      result.listOfList.push(result.list)
    }

    return asCallbackFn(cb, async () => {
      for (const list of result.listOfList) {
        const objects: { Key: string; VersionId?: string }[] = []
        list.forEach(function (value) {
          if (typeof value === 'string') {
            objects.push({ Key: value })
          } else {
            objects.push({ Key: value.name, VersionId: value.versionId })
          }
        })
        const deleteObjects = { Delete: { Quiet: true, Object: objects } }
        const builder = new xml2js.Builder({ headless: true })
        const payload = new TextEncoder().encode(builder.buildObject(deleteObjects))
        const headers = {
          ['Content-MD5']: toMd5(payload),
        }

        await this.makeRequestAsyncOmit(
          {
            method,
            bucketName,
            query,
            headers,
          },
          payload,
        )
      }
    })
  }
}

export class Helper {
  constructor(private readonly client: TypedBase) {}

  async MultipleFileUpload(
    bucketName: string,
    objectName: string,
    filePath: string,
    metaData: MetaData = {},
  ): Promise<UploadedObjectInfo> {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName)
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`)
    }

    if (!isString(filePath)) {
      throw new TypeError('filePath should be of type "string"')
    }

    if (!isObject(metaData)) {
      throw new TypeError('metaData should be of type "object"')
    }

    // Inserts correct `content-type` attribute based on metaData and filePath
    metaData = insertContentType(metaData, filePath)

    // Updates metaData to have the correct prefix if needed
    metaData = prependXAMZMeta(metaData)
    type Part = {
      part: number
      etag: string
    }

    const executor = async (fd: number) => {
      const stats = await fsp.fstat(fd)
      const fileSize = stats.size
      if (fileSize > this.client.maxObjectSize) {
        throw new Error(`${filePath} size : ${stats.size}, max allowed size: 5TB`)
      }

      if (fileSize <= this.client.partSize) {
        // simple PUT request, no multipart
        const uploader = this.client.getUploader(bucketName, objectName, metaData, false)
        const buf = await fsp.readfile(fd)
        const { md5sum, sha256sum } = transformers.hashBinary(buf, this.client.enableSHA256)
        return await uploader(buf, fileSize, sha256sum, md5sum)
      }

      const previousUploadId = await this.client.findUploadId(bucketName, objectName)
      let eTags: Part[] = []
      // if there was a previous incomplete upload, fetch all its uploaded parts info
      let uploadId: string
      if (previousUploadId) {
        eTags = await this.client.listParts(bucketName, objectName, previousUploadId)
        uploadId = previousUploadId
      } else {
        // there was no previous upload, initiate a new one
        uploadId = await this.client.initiateNewMultipartUpload(bucketName, objectName, metaData)
      }

      {
        const partSize = this.client.calculatePartSize(fileSize)
        const uploader = this.client.getUploader(bucketName, objectName, metaData, true)
        // convert array to object to make things easy
        const parts = eTags.reduce(function (acc, item) {
          if (!acc[item.part]) {
            acc[item.part] = item
          }
          return acc
        }, {} as Record<number, Part>)
        const partsDone: { part: number; etag: string }[] = []
        let partNumber = 1
        let uploadedSize = 0

        // will be reused for hashing and uploading
        // don't worry it's "unsafe", we will read data from fs to fill it
        const buf = Buffer.allocUnsafe(this.client.partSize)
        while (uploadedSize < fileSize) {
          const part = parts[partNumber]
          let length = partSize
          if (length > fileSize - uploadedSize) {
            length = fileSize - uploadedSize
          }

          await fsp.read(fd, buf, 0, length, 0)
          const { md5sum, sha256sum } = transformers.hashBinary(buf.subarray(0, length), this.client.enableSHA256)

          const md5sumHex = Buffer.from(md5sum, 'base64').toString('hex')

          if (part && md5sumHex === part.etag) {
            // md5 matches, chunk already uploaded
            partsDone.push({ part: partNumber, etag: part.etag })
            partNumber++
            uploadedSize += length
            continue
          }

          const objInfo = await uploader(uploadId, partNumber, buf.subarray(0, length), length, sha256sum, md5sum)
          partsDone.push({ part: partNumber, etag: objInfo.etag })
          partNumber++
          uploadedSize += length
        }
        eTags = partsDone
      }

      // at last, finish uploading
      return this.client.completeMultipartUpload(bucketName, objectName, uploadId, eTags)
    }

    const ensureFileClose = async <T>(executor: (fd: number) => Promise<T>) => {
      let fd
      try {
        fd = await fsp.open(filePath, 'r')
      } catch (e) {
        throw new Error(`failed to open file ${filePath}: err ${e}`, { cause: e })
      }

      try {
        // make sure to keep await, otherwise file will be closed early.
        return await executor(fd)
      } finally {
        await fsp.fclose(fd)
      }
    }

    return ensureFileClose(executor)
  }
}
