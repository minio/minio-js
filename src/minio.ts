import * as Stream from 'node:stream';
import xml2js from 'xml2js';

import * as errors from './errors.ts';
import { callbackify } from './internal/callbackify.js';
import { TypedClient } from './internal/client.ts';
import { CopyConditions } from './internal/copy-conditions.ts';
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
} from './internal/helper.ts';
import { PostPolicy } from './internal/post-policy.ts';
import { NotificationConfig, NotificationPoller } from './notification.ts';
import { promisify } from './promisify.js';
import * as transformers from './transformers.js';

export * from './errors.ts';
export * from './helpers.ts';
export * from './notification.ts';
export { CopyConditions, PostPolicy };

export class Client extends TypedClient {
  listObjectsV2Query(
    bucketName: string,
    prefix: string,
    continuationToken: string,
    delimiter: string,
    maxKeys: number,
    startAfter: string
  ): Stream.Transform {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`);
    }
    if (!isString(prefix)) {
      throw new TypeError('prefix should be of type "string"');
    }
    if (!isString(continuationToken)) {
      throw new TypeError('continuationToken should be of type "string"');
    }
    if (!isString(delimiter)) {
      throw new TypeError('delimiter should be of type "string"');
    }
    if (!isNumber(maxKeys)) {
      throw new TypeError('maxKeys should be of type "number"');
    }
    if (!isString(startAfter)) {
      throw new TypeError('startAfter should be of type "string"');
    }

    const queries: string[] = [];

    queries.push('list-type=2');
    queries.push('encoding-type=url');
    queries.push(`prefix=${uriEscape(prefix)}`);
    queries.push(`delimiter=${uriEscape(delimiter)}`);

    if (continuationToken) {
      queries.push(`continuation-token=${uriEscape(continuationToken)}`);
    }
    if (startAfter) {
      queries.push(`start-after=${uriEscape(startAfter)}`);
    }
    if (maxKeys) {
      queries.push(`max-keys=${Math.min(maxKeys, 1000)}`);
    }

    queries.sort();
    const query = queries.join('&');
    const method = 'GET';
    const transformer = transformers.getListObjectsV2Transformer();

    this.makeRequest({ method, bucketName, query }, '', [200], '', true, (e, response) => {
      if (e) {
        return transformer.emit('error', e);
      }
      pipesetup(response, transformer);
    });

    return transformer;
  }

  listObjectsV2(
    bucketName: string,
    prefix: string = '',
    recursive: boolean = false,
    startAfter: string = ''
  ): Stream.Readable {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`);
    }
    if (!isValidPrefix(prefix)) {
      throw new errors.InvalidPrefixError(`Invalid prefix: ${prefix}`);
    }
    if (!isString(prefix)) {
      throw new TypeError('prefix should be of type "string"');
    }
    if (!isBoolean(recursive)) {
      throw new TypeError('recursive should be of type "boolean"');
    }
    if (!isString(startAfter)) {
      throw new TypeError('startAfter should be of type "string"');
    }

    const delimiter = recursive ? '' : '/';
    let continuationToken = '';
    const objects: any[] = [];
    let ended = false;

    const readStream = new Stream.Readable({
      objectMode: true,
      read() {
        if (objects.length) {
          this.push(objects.shift());
          return;
        }
        if (ended) {
          this.push(null);
          return;
        }

        this.listObjectsV2Query(bucketName, prefix, continuationToken, delimiter, 1000, startAfter)
          .on('error', (e) => readStream.emit('error', e))
          .on('data', (result) => {
            if (result.isTruncated) {
              continuationToken = result.nextContinuationToken;
            } else {
              ended = true;
            }
            objects.push(...result.objects);
            readStream.read();
          });
      },
    });

    return readStream;
  }

  setBucketNotification(
    bucketName: string,
    config: NotificationConfig,
    cb: (err?: Error | null) => void
  ): void {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`);
    }
    if (!isObject(config)) {
      throw new TypeError('notification config should be of type "Object"');
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"');
    }

    const method = 'PUT';
    const query = 'notification';
    const builder = new xml2js.Builder({
      rootName: 'NotificationConfiguration',
      renderOpts: { pretty: false },
      headless: true,
    });
    const payload = builder.buildObject(config);
    this.makeRequest({ method, bucketName, query }, payload, [200], '', false, cb);
  }

  removeAllBucketNotification(bucketName: string, cb: (err?: Error | null) => void): void {
    this.setBucketNotification(bucketName, new NotificationConfig(), cb);
  }

  getBucketNotification(
    bucketName: string,
    cb: (err: Error | null, config?: NotificationConfig) => void
  ): void {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`);
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"');
    }

    const method = 'GET';
    const query = 'notification';
    this.makeRequest({ method, bucketName, query }, '', [200], '', true, (e, response) => {
      if (e) {
        return cb(e);
      }

      const transformer = transformers.getBucketNotificationTransformer();
      let bucketNotification: NotificationConfig | undefined;

      pipesetup(response, transformer)
        .on('data', (result) => (bucketNotification = result))
        .on('error', (err) => cb(err))
        .on('end', () => cb(null, bucketNotification));
    });
  }

  listenBucketNotification(
    bucketName: string,
    prefix: string,
    suffix: string,
    events: string[]
  ): NotificationPoller {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`);
    }
    if (!isString(prefix)) {
      throw new TypeError('prefix must be of type string');
    }
    if (!isString(suffix)) {
      throw new TypeError('suffix must be of type string');
    }
    if (!Array.isArray(events)) {
      throw new TypeError('events must be of type Array');
    }

    const listener = new NotificationPoller(this, bucketName, prefix, suffix, events);
    listener.start();
    return listener;
  }
}

Client.prototype.getBucketNotification = promisify(Client.prototype.getBucketNotification);
Client.prototype.setBucketNotification = promisify(Client.prototype.setBucketNotification);
Client.prototype.removeAllBucketNotification = promisify(Client.prototype.removeAllBucketNotification);

// Refactored API to use promises internally
Client.prototype.makeBucket = callbackify(Client.prototype.makeBucket);
Client.prototype.bucketExists = callbackify(Client.prototype.bucketExists);
Client.prototype.removeBucket = callbackify(Client.prototype.removeBucket);
Client.prototype.listBuckets = callbackify(Client.prototype.listBuckets);

Client.prototype.getObject = callbackify(Client.prototype.getObject);
Client.prototype.fGetObject = callbackify(Client.prototype.fGetObject);
Client.prototype.getPartialObject = callbackify(Client.prototype.getPartialObject);
Client.prototype.statObject = callbackify(Client.prototype.statObject);
Client.prototype.putObjectRetention = callbackify(Client.prototype.putObjectRetention);
Client.prototype.putObject = callbackify(Client.prototype.putObject);
Client.prototype.fPutObject = callbackify(Client.prototype.fPutObject);
Client.prototype.removeObject = callbackify(Client.prototype.removeObject);

Client.prototype.removeBucketReplication = callbackify(Client.prototype.removeBucketReplication);
Client.prototype.setBucketReplication = callbackify(Client.prototype.setBucketReplication);
Client.prototype.getBucketReplication = callbackify(Client.prototype.getBucketReplication);
Client.prototype.getObjectLegalHold = callbackify(Client.prototype.getObjectLegalHold);
Client.prototype.setObjectLegalHold = callbackify(Client.prototype.setObjectLegalHold);
Client.prototype.setObjectLockConfig = callbackify(Client.prototype.setObjectLockConfig);
Client.prototype.getObjectLockConfig = callbackify(Client.prototype.getObjectLockConfig);
Client.prototype.getBucketPolicy = callbackify(Client.prototype.getBucketPolicy);
Client.prototype.setBucketPolicy = callbackify(Client.prototype.setBucketPolicy);
Client.prototype.getBucketTagging = callbackify(Client.prototype.getBucketTagging);
Client.prototype.getObjectTagging = callbackify(Client.prototype.getObjectTagging);
Client.prototype.setBucketTagging = callbackify(Client.prototype.setBucketTagging);
Client.prototype.removeBucketTagging = callbackify(Client.prototype.removeBucketTagging);
Client.prototype.setObjectTagging = callbackify(Client.prototype.setObjectTagging);
Client.prototype.removeObjectTagging = callbackify(Client.prototype.removeObjectTagging);
Client.prototype.getBucketVersioning = callbackify(Client.prototype.getBucketVersioning);
Client.prototype.setBucketVersioning = callbackify(Client.prototype.setBucketVersioning);
Client.prototype.selectObjectContent = callbackify(Client.prototype.selectObjectContent);
Client.prototype.setBucketLifecycle = callbackify(Client.prototype.setBucketLifecycle);
Client.prototype.getBucketLifecycle = callbackify(Client.prototype.getBucketLifecycle);
Client.prototype.removeBucketLifecycle = callbackify(Client.prototype.removeBucketLifecycle);
Client.prototype.setBucketEncryption = callbackify(Client.prototype.setBucketEncryption);
Client.prototype.getBucketEncryption = callbackify(Client.prototype.getBucketEncryption);
Client.prototype.removeBucketEncryption = callbackify(Client.prototype.removeBucketEncryption);
Client.prototype.getObjectRetention = callbackify(Client.prototype.getObjectRetention);
Client.prototype.removeObjects = callbackify(Client.prototype.removeObjects);
Client.prototype.removeIncompleteUpload = callbackify(Client.prototype.removeIncompleteUpload);
Client.prototype.copyObject = callbackify(Client.prototype.copyObject);
Client.prototype.composeObject = callbackify(Client.prototype.composeObject);
Client.prototype.presignedUrl = callbackify(Client.prototype.presignedUrl);
Client.prototype.presignedGetObject = callbackify(Client.prototype.presignedGetObject);
Client.prototype.presignedPutObject = callbackify(Client.prototype.presignedPutObject);
Client.prototype.presignedPostPolicy = callbackify(Client.prototype.presignedPostPolicy);