# MinIO JavaScript Library for Amazon S3 Compatible Cloud Storage [![Slack](https://slack.min.io/slack?type=svg)](https://slack.min.io)

[![NPM](https://nodei.co/npm/minio.png)](https://nodei.co/npm/minio/)

The MinIO JavaScript Client SDK provides simple APIs to access any Amazon S3 compatible object storage server.

This quickstart guide will show you how to install the client SDK and execute an example JavaScript program. For a complete list of APIs and examples, please take a look at the [JavaScript Client API Reference](https://min.io/docs/minio/linux/developers/javascript/API.html) documentation.

This document assumes that you have a working [nodejs](http://nodejs.org/) setup in place.

## Download from NPM

```sh
npm install --save minio
```

## Download from Source

```sh
git clone https://github.com/minio/minio-js
cd minio-js
npm install
npm install -g
```

## Using with TypeScript

`minio>7.1.0` is shipped with builtin type definition, `@types/minio` is no longer needed.

## Initialize MinIO Client

You need five items in order to connect to MinIO object storage server.

| Params    | Description                                                                                         |
| :-------- | :-------------------------------------------------------------------------------------------------- |
| endPoint  | URL to object storage service.                                                                      |
| port      | TCP/IP port number. This input is optional. Default value set to `80` for HTTP and `443` for HTTPs. |
| accessKey | Access key is like user ID that uniquely identifies your account.                                   |
| secretKey | Secret key is the password to your account.                                                         |
| useSSL    | Set this value to 'true' to enable secure (HTTPS) access                                            |

```js
var Minio = require('minio')

var minioClient = new Minio.Client({
  endPoint: 'play.min.io',
  port: 9000,
  useSSL: true,
  accessKey: 'Q3AM3UQ867SPQQA43P2F',
  secretKey: 'zuf+tfteSlswRu7BJ86wekitnifILbZam1KYY3TG',
})
```

## Quick Start Example - File Uploader

This example program connects to an object storage server, makes a bucket on the server and then uploads a file to the bucket.

We will use the MinIO server running at [https://play.min.io](https://play.min.io) in this example. Feel free to use this service for testing and development. Access credentials shown in this example are open to the public.

#### file-uploader.js

```js
var Minio = require('minio')

// Instantiate the minio client with the endpoint
// and access keys as shown below.
var minioClient = new Minio.Client({
  endPoint: 'play.min.io',
  port: 9000,
  useSSL: true,
  accessKey: 'Q3AM3UQ867SPQQA43P2F',
  secretKey: 'zuf+tfteSlswRu7BJ86wekitnifILbZam1KYY3TG',
})

// File that needs to be uploaded.
var file = '/tmp/photos-europe.tar'

// Make a bucket called europetrip.
minioClient.makeBucket('europetrip', 'us-east-1', function (err) {
  if (err) return console.log(err)

  console.log('Bucket created successfully in "us-east-1".')

  var metaData = {
    'Content-Type': 'application/octet-stream',
    'X-Amz-Meta-Testing': 1234,
    example: 5678,
  }
  // Using fPutObject API upload your file to the bucket europetrip.
  minioClient.fPutObject('europetrip', 'photos-europe.tar', file, metaData, function (err, etag) {
    if (err) return console.log(err)
    console.log('File uploaded successfully.')
  })
})
```

#### Run file-uploader

```sh
node file-uploader.js
Bucket created successfully in "us-east-1".

mc ls play/europetrip/
[2016-05-25 23:49:50 PDT]  17MiB photos-europe.tar
```

## API Reference

The full API Reference is available here.

- [Complete API Reference](https://min.io/docs/minio/linux/developers/javascript/API.html)

### API Reference : Bucket Operations

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

### API Reference : File Object Operations

- [`fPutObject`](https://min.io/docs/minio/linux/developers/javascript/API.html#fPutObject)
- [`fGetObject`](https://min.io/docs/minio/linux/developers/javascript/API.html#fGetObject)

### API Reference : Object Operations

- [`getObject`](https://min.io/docs/minio/linux/developers/javascript/API.html#getObject)
- [`putObject`](https://min.io/docs/minio/linux/developers/javascript/API.html#putObject)
- [`copyObject`](https://min.io/docs/minio/linux/developers/javascript/API.html#copyObject)
- [`statObject`](https://min.io/docs/minio/linux/developers/javascript/API.html#statObject)
- [`removeObject`](https://min.io/docs/minio/linux/developers/javascript/API.html#removeObject)
- [`removeObjects`](https://min.io/docs/minio/linux/developers/javascript/API.html#removeObjects)
- [`removeIncompleteUpload`](https://min.io/docs/minio/linux/developers/javascript/API.html#removeIncompleteUpload)
- [`selectObjectContent`](https://min.io/docs/minio/linux/developers/javascript/API.html#selectObjectContent)

### API Reference : Presigned Operations

- [`presignedGetObject`](https://min.io/docs/minio/linux/developers/javascript/API.html#presignedGetObject)
- [`presignedPutObject`](https://min.io/docs/minio/linux/developers/javascript/API.html#presignedPutObject)
- [`presignedPostPolicy`](https://min.io/docs/minio/linux/developers/javascript/API.html#presignedPostPolicy)

### API Reference : Bucket Notification Operations

- [`getBucketNotification`](https://min.io/docs/minio/linux/developers/javascript/API.html#getBucketNotification)
- [`setBucketNotification`](https://min.io/docs/minio/linux/developers/javascript/API.html#setBucketNotification)
- [`removeAllBucketNotification`](https://min.io/docs/minio/linux/developers/javascript/API.html#removeAllBucketNotification)
- [`listenBucketNotification`](https://min.io/docs/minio/linux/developers/javascript/API.html#listenBucketNotification) (MinIO Extension)

### API Reference : Bucket Policy Operations

- [`getBucketPolicy`](https://min.io/docs/minio/linux/developers/javascript/API.html#getBucketPolicy)
- [`setBucketPolicy`](https://min.io/docs/minio/linux/developers/javascript/API.html#setBucketPolicy)

## Full Examples

#### Full Examples : Bucket Operations

- [list-buckets.mjs](https://github.com/minio/minio-js/blob/master/examples/list-buckets.mjs)
- [list-objects.js](https://github.com/minio/minio-js/blob/master/examples/list-objects.js)
- [list-objects-v2.js](https://github.com/minio/minio-js/blob/master/examples/list-objects-v2.js)
- [list-objects-v2-with-metadata.js](https://github.com/minio/minio-js/blob/master/examples/list-objects-v2-with-metadata.js) (Extension)
- [bucket-exists.js](https://github.com/minio/minio-js/blob/master/examples/bucket-exists.js)
- [make-bucket.js](https://github.com/minio/minio-js/blob/master/examples/make-bucket.js)
- [remove-bucket.mjs](https://github.com/minio/minio-js/blob/master/examples/remove-bucket.mjs)
- [list-incomplete-uploads.js](https://github.com/minio/minio-js/blob/master/examples/list-incomplete-uploads.js)
- [get-bucket-versioning.js](https://github.com/minio/minio-js/blob/master/examples/get-bucket-versioning.js)
- [set-bucket-versioning.js](https://github.com/minio/minio-js/blob/master/examples/set-bucket-versioning.js)
- [set-bucket-tagging.js](https://github.com/minio/minio-js/blob/master/examples/set-bucket-tagging.js)
- [get-bucket-tagging.js](https://github.com/minio/minio-js/blob/master/examples/get-bucket-tagging.js)
- [remove-bucket-tagging.js](https://github.com/minio/minio-js/blob/master/examples/remove-bucket-tagging.js)
- [set-bucket-lifecycle.js](https://github.com/minio/minio-js/blob/master/examples/set-bucket-lifecycle.js)
- [get-bucket-lifecycle.js](https://github.com/minio/minio-js/blob/master/examples/get-bucket-lifecycle.js)
- [remove-bucket-lifecycle.js](https://github.com/minio/minio-js/blob/master/examples/remove-bucket-lifecycle.js)
- [get-object-lock-config.js](https://github.com/minio/minio-js/blob/master/examples/get-object-lock-config.js)
- [set-object-lock-config.js](https://github.com/minio/minio-js/blob/master/examples/set-object-lock-config.js)
- [set-bucket-replication.mjs](https://github.com/minio/minio-js/blob/master/examples/set-bucket-replication.mjs)
- [get-bucket-replication.mjs](https://github.com/minio/minio-js/blob/master/examples/get-bucket-replication.mjs)
- [remove-bucket-replication.mjs](https://github.com/minio/minio-js/blob/master/examples/remove-bucket-replication.mjs)

#### Full Examples : File Object Operations

- [fput-object.js](https://github.com/minio/minio-js/blob/master/examples/fput-object.js)
- [fget-object.js](https://github.com/minio/minio-js/blob/master/examples/fget-object.js)

#### Full Examples : Object Operations

- [put-object.js](https://github.com/minio/minio-js/blob/master/examples/put-object.js)
- [get-object.js](https://github.com/minio/minio-js/blob/master/examples/get-object.js)
- [copy-object.js](https://github.com/minio/minio-js/blob/master/examples/copy-object.js)
- [get-partialobject.js](https://github.com/minio/minio-js/blob/master/examples/get-partialobject.js)
- [remove-object.js](https://github.com/minio/minio-js/blob/master/examples/remove-object.js)
- [remove-incomplete-upload.js](https://github.com/minio/minio-js/blob/master/examples/remove-incomplete-upload.js)
- [stat-object.mjs](https://github.com/minio/minio-js/blob/master/examples/stat-object.mjs)
- [get-object-retention.js](https://github.com/minio/minio-js/blob/master/examples/get-object-retention.js)
- [put-object-retention.js](https://github.com/minio/minio-js/blob/master/examples/put-object-retention.js)
- [put-object-tagging.js](https://github.com/minio/minio-js/blob/master/examples/put-object-tagging.js)
- [get-object-tagging.js](https://github.com/minio/minio-js/blob/master/examples/get-object-tagging.js)
- [remove-object-tagging.js](https://github.com/minio/minio-js/blob/master/examples/remove-object-tagging.js)
- [set-object-legal-hold.js](https://github.com/minio/minio-js/blob/master/examples/set-object-legalhold.js)
- [get-object-legal-hold.js](https://github.com/minio/minio-js/blob/master/examples/get-object-legal-hold.js)
- [compose-object.js](https://github.com/minio/minio-js/blob/master/examples/compose-object.js)
- [select-object-content.js](https://github.com/minio/minio-js/blob/master/examples/select-object-content.js)

#### Full Examples : Presigned Operations

- [presigned-getobject.js](https://github.com/minio/minio-js/blob/master/examples/presigned-getobject.js)
- [presigned-putobject.js](https://github.com/minio/minio-js/blob/master/examples/presigned-putobject.js)
- [presigned-postpolicy.js](https://github.com/minio/minio-js/blob/master/examples/presigned-postpolicy.js)

#### Full Examples: Bucket Notification Operations

- [get-bucket-notification.js](https://github.com/minio/minio-js/blob/master/examples/get-bucket-notification.js)
- [set-bucket-notification.js](https://github.com/minio/minio-js/blob/master/examples/set-bucket-notification.js)
- [remove-all-bucket-notification.js](https://github.com/minio/minio-js/blob/master/examples/remove-all-bucket-notification.js)
- [listen-bucket-notification.js](https://github.com/minio/minio-js/blob/master/examples/minio/listen-bucket-notification.js) (MinIO Extension)

#### Full Examples: Bucket Policy Operations

- [get-bucket-policy.js](https://github.com/minio/minio-js/blob/master/examples/get-bucket-policy.js)
- [set-bucket-policy.js](https://github.com/minio/minio-js/blob/master/examples/set-bucket-policy.js)

## Custom Settings

- [setAccelerateEndPoint](https://github.com/minio/minio-js/blob/master/examples/set-accelerate-end-point.js)

## Explore Further

- [Complete Documentation](https://min.io/docs/minio/kubernetes/upstream/index.html)
- [MinIO JavaScript Client SDK API Reference](https://min.io/docs/minio/linux/developers/javascript/API.html)
- [Build your own Shopping App Example- Full Application Example ](https://github.com/minio/minio-js-store-app)

## Contribute

[Contributors Guide](https://github.com/minio/minio-js/blob/master/CONTRIBUTING.md)

![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/minio/minio-js/nodejs.yml)
