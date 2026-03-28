# MinIO JavaScript Library for Amazon S3 Compatible Cloud Storage [![Slack](https://slack.min.io/slack?type=svg)](https://slack.min.io)

[![NPM](https://nodei.co/npm/minio.png)](https://nodei.co/npm/minio/)

The MinIO JavaScript Client SDK provides high level APIs to access any Amazon S3 compatible object storage server.

This guide will show you how to install the client SDK and execute an example JavaScript program.
For a complete list of APIs and examples, please take a look at the [JavaScript Client API Reference](https://docs.min.io/enterprise/aistor-object-store/developers/sdk/javascript/api/) documentation.

This document presumes you have a working [Node.js](http://nodejs.org/) development environment, LTS versions v16, v18 or v20.

## Download from NPM

```sh
npm install --save minio
```

## Download from Source

```sh
git clone https://github.com/minio/minio-js
cd minio-js
npm install
npm run build
npm install -g
```

## Using with TypeScript

`minio>7.1.0` is shipped with builtin type definition, `@types/minio` is no longer needed.

## Initialize MinIO Client

The following parameters are needed to connect to a MinIO object storage server:

| Parameter   | Description                                                                  |
| :---------- | :--------------------------------------------------------------------------- |
| `endPoint`  | Hostname of the object storage service.                                      |
| `port`      | TCP/IP port number. Optional, defaults to `80` for HTTP and `443` for HTTPs. |
| `accessKey` | Access key (user ID) of an account in the S3 service.                        |
| `secretKey` | Secret key (password) of an account in the S3 service.                       |
| `useSSL`    | Optional, set to 'true' to enable secure (HTTPS) access.                     |

```js
import * as Minio from 'minio'

const minioClient = new Minio.Client({
  endPoint: 'play.min.io',
  port: 9000,
  useSSL: true,
  accessKey: 'Q3AM3UQ867SPQQA43P2F',
  secretKey: 'zuf+tfteSlswRu7BJ86wekitnifILbZam1KYY3TG',
})
```

## Quick Start Example - File Uploader

This example connects to an object storage server, creates a bucket, and uploads a file to the bucket.
It uses the MinIO `play` server, a public MinIO cluster located at [https://play.min.io](https://play.min.io).

The `play` server runs the latest stable version of MinIO and may be used for testing and development.
The access credentials shown in this example are open to the public.
All data uploaded to `play` should be considered public and non-protected.

#### file-uploader.mjs

```js
import * as Minio from 'minio'

// Instantiate the MinIO client with the object store service
// endpoint and an authorized user's credentials
// play.min.io is the MinIO public test cluster
const minioClient = new Minio.Client({
  endPoint: 'play.min.io',
  port: 9000,
  useSSL: true,
  accessKey: 'Q3AM3UQ867SPQQA43P2F',
  secretKey: 'zuf+tfteSlswRu7BJ86wekitnifILbZam1KYY3TG',
})

// File to upload
const sourceFile = '/tmp/test-file.txt'

// Destination bucket
const bucket = 'js-test-bucket'

// Destination object name
const destinationObject = 'my-test-file.txt'

// Check if the bucket exists
// If it doesn't, create it
const exists = await minioClient.bucketExists(bucket)
if (exists) {
  console.log('Bucket ' + bucket + ' exists.')
} else {
  await minioClient.makeBucket(bucket, 'us-east-1')
  console.log('Bucket ' + bucket + ' created in "us-east-1".')
}

// Set the object metadata
var metaData = {
  'Content-Type': 'text/plain',
  'X-Amz-Meta-Testing': 1234,
  example: 5678,
}

// Upload the file with fPutObject
// If an object with the same name exists,
// it is updated with new data
await minioClient.fPutObject(bucket, destinationObject, sourceFile, metaData)
console.log('File ' + sourceFile + ' uploaded as object ' + destinationObject + ' in bucket ' + bucket)
```

#### Run the File Uploader

```sh
node file-uploader.mjs
Bucket js-test-bucket created successfully in "us-east-1".
File /tmp/test-file.txt uploaded successfully as my-test-file.txt to bucket js-test-bucket
```

Verify the object was created with [`mc`](https://min.io/docs/minio/linux/reference/minio-mc.html):

```
mc ls play/js-test-bucket
[2023-11-10 17:52:20 UTC]  20KiB STANDARD my-test-file.txt
```

## API Reference

The complete API Reference is available here:

- [MinIO JavaScript API Reference](https://min.io/docs/minio/linux/developers/javascript/API.html)

### Bucket Operations

- [`makeBucket`](https://min.io/docs/minio/linux/developers/javascript/API.html#makeBucket)
- [`listBuckets`](https://min.io/docs/minio/linux/developers/javascript/API.html#listBuckets)
- [`bucketExists`](https://min.io/docs/minio/linux/developers/javascript/API.html#bucketExists)
- [`removeBucket`](https://min.io/docs/minio/linux/developers/javascript/API.html#removeBucket)
- [`listObjects`](https://min.io/docs/minio/linux/developers/javascript/API.html#listObjects)
- [`listObjectsV2`](https://min.io/docs/minio/linux/developers/javascript/API.html#listObjectsV2)
- [`listObjectsV2WithMetadata`](https://min.io/docs/minio/linux/developers/javascript/API.html#listObjectsV2WithMetadata) (Extension)
- [`listIncompleteUploads`](https://min.io/docs/minio/linux/developers/javascript/API.html#listIncompleteUploads)
- [`getBucketVersioning`](https://min.io/docs/minio/linux/developers/javascript/API.html#getBucketVersioning)
- [`setBucketVersioning`](https://min.io/docs/minio/linux/developers/javascript/API.html#setBucketVersioning)
- [`setBucketLifecycle`](https://min.io/docs/minio/linux/developers/javascript/API.html#setBucketLifecycle)
- [`getBucketLifecycle`](https://min.io/docs/minio/linux/developers/javascript/API.html#getBucketLifecycle)
- [`removeBucketLifecycle`](https://min.io/docs/minio/linux/developers/javascript/API.html#removeBucketLifecycle)
- [`getObjectLockConfig`](https://min.io/docs/minio/linux/developers/javascript/API.html#getObjectLockConfig)
- [`setObjectLockConfig`](https://min.io/docs/minio/linux/developers/javascript/API.html#setObjectLockConfig)

### File Object Operations

- [`fPutObject`](https://min.io/docs/minio/linux/developers/javascript/API.html#fPutObject)
- [`fGetObject`](https://min.io/docs/minio/linux/developers/javascript/API.html#fGetObject)

### Object Operations

- [`getObject`](https://min.io/docs/minio/linux/developers/javascript/API.html#getObject)
- [`putObject`](https://min.io/docs/minio/linux/developers/javascript/API.html#putObject)
- [`copyObject`](https://min.io/docs/minio/linux/developers/javascript/API.html#copyObject)
- [`statObject`](https://min.io/docs/minio/linux/developers/javascript/API.html#statObject)
- [`removeObject`](https://min.io/docs/minio/linux/developers/javascript/API.html#removeObject)
- [`removeObjects`](https://min.io/docs/minio/linux/developers/javascript/API.html#removeObjects)
- [`removeIncompleteUpload`](https://min.io/docs/minio/linux/developers/javascript/API.html#removeIncompleteUpload)
- [`selectObjectContent`](https://min.io/docs/minio/linux/developers/javascript/API.html#selectObjectContent)

### Presigned Operations

- [`presignedUrl`](https://min.io/docs/minio/linux/developers/javascript/API.html#presignedUrl)
- [`presignedGetObject`](https://min.io/docs/minio/linux/developers/javascript/API.html#presignedGetObject)
- [`presignedPutObject`](https://min.io/docs/minio/linux/developers/javascript/API.html#presignedPutObject)
- [`presignedPostPolicy`](https://min.io/docs/minio/linux/developers/javascript/API.html#presignedPostPolicy)

### Bucket Notification Operations

- [`getBucketNotification`](https://min.io/docs/minio/linux/developers/javascript/API.html#getBucketNotification)
- [`setBucketNotification`](https://min.io/docs/minio/linux/developers/javascript/API.html#setBucketNotification)
- [`removeAllBucketNotification`](https://min.io/docs/minio/linux/developers/javascript/API.html#removeAllBucketNotification)
- [`listenBucketNotification`](https://min.io/docs/minio/linux/developers/javascript/API.html#listenBucketNotification) (MinIO Extension)

### Bucket Policy Operations

- [`getBucketPolicy`](https://min.io/docs/minio/linux/developers/javascript/API.html#getBucketPolicy)
- [`setBucketPolicy`](https://min.io/docs/minio/linux/developers/javascript/API.html#setBucketPolicy)

## Examples

#### Bucket Operations

- [list-buckets.mjs](https://github.com/minio/minio-js/blob/master/examples/list-buckets.mjs)
- [list-objects.mjs](https://github.com/minio/minio-js/blob/master/examples/list-objects.mjs)
- [list-objects-v2.mjs](https://github.com/minio/minio-js/blob/master/examples/list-objects-v2.mjs)
- [list-objects-v2-with-metadata.mjs](https://github.com/minio/minio-js/blob/master/examples/list-objects-v2-with-metadata.mjs) (Extension)
- [bucket-exists.mjs](https://github.com/minio/minio-js/blob/master/examples/bucket-exists.mjs)
- [make-bucket.mjs](https://github.com/minio/minio-js/blob/master/examples/make-bucket.mjs)
- [remove-bucket.mjs](https://github.com/minio/minio-js/blob/master/examples/remove-bucket.mjs)
- [list-incomplete-uploads.mjs](https://github.com/minio/minio-js/blob/master/examples/list-incomplete-uploads.mjs)
- [get-bucket-versioning.mjs](https://github.com/minio/minio-js/blob/master/examples/get-bucket-versioning.mjs)
- [set-bucket-versioning.mjs](https://github.com/minio/minio-js/blob/master/examples/set-bucket-versioning.mjs)
- [set-bucket-tagging.mjs](https://github.com/minio/minio-js/blob/master/examples/set-bucket-tagging.mjs)
- [get-bucket-tagging.mjs](https://github.com/minio/minio-js/blob/master/examples/get-bucket-tagging.mjs)
- [remove-bucket-tagging.mjs](https://github.com/minio/minio-js/blob/master/examples/remove-bucket-tagging.mjs)
- [set-bucket-lifecycle.mjs](https://github.com/minio/minio-js/blob/master/examples/set-bucket-lifecycle.mjs)
- [get-bucket-lifecycle.mjs](https://github.com/minio/minio-js/blob/master/examples/get-bucket-lifecycle.mjs)
- [remove-bucket-lifecycle.mjs](https://github.com/minio/minio-js/blob/master/examples/remove-bucket-lifecycle.mjs)
- [get-object-lock-config.mjs](https://github.com/minio/minio-js/blob/master/examples/get-object-lock-config.mjs)
- [set-object-lock-config.mjs](https://github.com/minio/minio-js/blob/master/examples/set-object-lock-config.mjs)
- [set-bucket-replication.mjs](https://github.com/minio/minio-js/blob/master/examples/set-bucket-replication.mjs)
- [get-bucket-replication.mjs](https://github.com/minio/minio-js/blob/master/examples/get-bucket-replication.mjs)
- [remove-bucket-replication.mjs](https://github.com/minio/minio-js/blob/master/examples/remove-bucket-replication.mjs)
- [set-bucket-encryption.mjs](https://github.com/minio/minio-js/blob/master/examples/set-bucket-encryption.mjs)
- [get-bucket-encryption.mjs](https://github.com/minio/minio-js/blob/master/examples/get-bucket-encryption.mjs)
- [remove-bucket-encryption.mjs](https://github.com/minio/minio-js/blob/master/examples/remove-bucket-encryption.mjs)

#### File Object Operations

- [fput-object.mjs](https://github.com/minio/minio-js/blob/master/examples/fput-object.mjs)
- [fget-object.mjs](https://github.com/minio/minio-js/blob/master/examples/fget-object.mjs)

#### Object Operations

- [put-object.mjs](https://github.com/minio/minio-js/blob/master/examples/put-object.mjs)
- [get-object.mjs](https://github.com/minio/minio-js/blob/master/examples/get-object.mjs)
- [copy-object.mjs](https://github.com/minio/minio-js/blob/master/examples/copy-object.mjs)
- [get-partialobject.mjs](https://github.com/minio/minio-js/blob/master/examples/get-partialobject.mjs)
- [remove-object.mjs](https://github.com/minio/minio-js/blob/master/examples/remove-object.mjs)
- [remove-incomplete-upload.mjs](https://github.com/minio/minio-js/blob/master/examples/remove-incomplete-upload.mjs)
- [stat-object.mjs](https://github.com/minio/minio-js/blob/master/examples/stat-object.mjs)
- [get-object-retention.mjs](https://github.com/minio/minio-js/blob/master/examples/get-object-retention.mjs)
- [put-object-retention.mjs](https://github.com/minio/minio-js/blob/master/examples/put-object-retention.mjs)
- [set-object-tagging.mjs](https://github.com/minio/minio-js/blob/master/examples/set-object-tagging.mjs)
- [get-object-tagging.mjs](https://github.com/minio/minio-js/blob/master/examples/get-object-tagging.mjs)
- [remove-object-tagging.mjs](https://github.com/minio/minio-js/blob/master/examples/remove-object-tagging.mjs)
- [set-object-legal-hold.mjs](https://github.com/minio/minio-js/blob/master/examples/set-object-legal-hold.mjs)
- [get-object-legal-hold.mjs](https://github.com/minio/minio-js/blob/master/examples/get-object-legal-hold.mjs)
- [compose-object.mjs](https://github.com/minio/minio-js/blob/master/examples/compose-object.mjs)
- [select-object-content.mjs](https://github.com/minio/minio-js/blob/master/examples/select-object-content.mjs)

#### Presigned Operations

- [presigned-getobject.mjs](https://github.com/minio/minio-js/blob/master/examples/presigned-getobject.mjs)
- [presigned-putobject.mjs](https://github.com/minio/minio-js/blob/master/examples/presigned-putobject.mjs)
- [presigned-postpolicy.mjs](https://github.com/minio/minio-js/blob/master/examples/presigned-postpolicy.mjs)

#### Bucket Notification Operations

- [get-bucket-notification.mjs](https://github.com/minio/minio-js/blob/master/examples/get-bucket-notification.mjs)
- [set-bucket-notification.mjs](https://github.com/minio/minio-js/blob/master/examples/set-bucket-notification.mjs)
- [remove-all-bucket-notification.mjs](https://github.com/minio/minio-js/blob/master/examples/remove-all-bucket-notification.mjs)
- [listen-bucket-notification.mjs](https://github.com/minio/minio-js/blob/master/examples/minio/listen-bucket-notification.mjs) (MinIO Extension)

#### Bucket Policy Operations

- [get-bucket-policy.mjs](https://github.com/minio/minio-js/blob/master/examples/get-bucket-policy.mjs)
- [set-bucket-policy.mjs](https://github.com/minio/minio-js/blob/master/examples/set-bucket-policy.mjs)

## Custom Settings

- [setAccelerateEndPoint](https://github.com/minio/minio-js/blob/master/examples/set-accelerate-end-point.mjs)

## Explore Further

- [Complete Documentation](https://min.io/docs/minio/kubernetes/upstream/index.html)
- [MinIO JavaScript Client SDK API Reference](https://min.io/docs/minio/linux/developers/javascript/API.html)

## Contribute

- [Contributors Guide](https://github.com/minio/minio-js/blob/master/CONTRIBUTING.md)

![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/minio/minio-js/nodejs.yml)
