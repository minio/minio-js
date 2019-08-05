# MinIO JavaScript Library for Amazon S3 Compatible Cloud Storage [![Slack](https://slack.min.io/slack?type=svg)](https://slack.min.io)

[![NPM](https://nodei.co/npm/minio.png)](https://nodei.co/npm/minio/)

The MinIO JavaScript Client SDK provides simple APIs to access any Amazon S3 compatible object storage server.

This quickstart guide will show you how to install the client SDK and execute an example JavaScript program. For a complete list of APIs and examples, please take a look at the [JavaScript Client API Reference](https://docs.min.io/docs/javascript-client-api-reference) documentation.

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

```sh
npm install --save-dev @types/minio
```

## Initialize MinIO Client

You need five items in order to connect to MinIO object storage server.


| Params     | Description |
| :------- | :------------ |
| endPoint	 | URL to object storage service. |
|port| TCP/IP port number. This input is optional. Default value set to ``80`` for HTTP and ``443`` for HTTPs.|
| accessKey | Access key is like user ID that uniquely identifies your account.   |
| secretKey	| Secret key is the password to your account.    |
|useSSL |Set this value to 'true' to enable secure (HTTPS) access |


```js
var Minio = require('minio')

var minioClient = new Minio.Client({
    endPoint: 'play.min.io',
    port: 9000,
    useSSL: true,
    accessKey: 'Q3AM3UQ867SPQQA43P2F',
    secretKey: 'zuf+tfteSlswRu7BJ86wekitnifILbZam1KYY3TG'
});
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
    secretKey: 'zuf+tfteSlswRu7BJ86wekitnifILbZam1KYY3TG'
});

// File that needs to be uploaded.
var file = '/tmp/photos-europe.tar'

// Make a bucket called europetrip.
minioClient.makeBucket('europetrip', 'us-east-1', function(err) {
    if (err) return console.log(err)

    console.log('Bucket created successfully in "us-east-1".')

    var metaData = {
        'Content-Type': 'application/octet-stream',
        'X-Amz-Meta-Testing': 1234,
        'example': 5678
    }
    // Using fPutObject API upload your file to the bucket europetrip.
    minioClient.fPutObject('europetrip', 'photos-europe.tar', file, metaData, function(err, etag) {
      if (err) return console.log(err)
      console.log('File uploaded successfully.')
    });
});
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

* [Complete API Reference](https://docs.min.io/docs/javascript-client-api-reference)

### API Reference : Bucket Operations

* [`makeBucket`](https://docs.min.io/docs/javascript-client-api-reference#makeBucket)
* [`listBuckets`](https://docs.min.io/docs/javascript-client-api-reference#listBuckets)
* [`bucketExists`](https://docs.min.io/docs/javascript-client-api-reference#bucketExists)
* [`removeBucket`](https://docs.min.io/docs/javascript-client-api-reference#removeBucket)
* [`listObjects`](https://docs.min.io/docs/javascript-client-api-reference#listObjects)
* [`listObjectsV2`](https://docs.min.io/docs/javascript-client-api-reference#listObjectsV2)
* [`listIncompleteUploads`](https://docs.min.io/docs/javascript-client-api-reference#listIncompleteUploads)

### API Reference : File Object Operations

* [`fPutObject`](https://docs.min.io/docs/javascript-client-api-reference#fPutObject)
* [`fGetObject`](https://docs.min.io/docs/javascript-client-api-reference#fGetObject)

### API Reference : Object Operations

* [`getObject`](https://docs.min.io/docs/javascript-client-api-reference#getObject)
* [`putObject`](https://docs.min.io/docs/javascript-client-api-reference#putObject)
* [`copyObject`](https://docs.min.io/docs/javascript-client-api-reference#copyObject)
* [`statObject`](https://docs.min.io/docs/javascript-client-api-reference#statObject)
* [`removeObject`](https://docs.min.io/docs/javascript-client-api-reference#removeObject)
* [`removeObjects`](https://docs.min.io/docs/javascript-client-api-reference#removeObjects)
* [`removeIncompleteUpload`](https://docs.min.io/docs/javascript-client-api-reference#removeIncompleteUpload)

### API Reference : Presigned Operations

* [`presignedGetObject`](https://docs.min.io/docs/javascript-client-api-reference#presignedGetObject)
* [`presignedPutObject`](https://docs.min.io/docs/javascript-client-api-reference#presignedPutObject)
* [`presignedPostPolicy`](https://docs.min.io/docs/javascript-client-api-reference#presignedPostPolicy)

### API Reference : Bucket Notification Operations

* [`getBucketNotification`](https://docs.min.io/docs/javascript-client-api-reference#getBucketNotification)
* [`setBucketNotification`](https://docs.min.io/docs/javascript-client-api-reference#setBucketNotification)
* [`removeAllBucketNotification`](https://docs.min.io/docs/javascript-client-api-reference#removeAllBucketNotification)
* [`listenBucketNotification`](https://docs.min.io/docs/javascript-client-api-reference#listenBucketNotification) (MinIO Extension)

### API Reference : Bucket Policy Operations

* [`getBucketPolicy`](https://docs.min.io/docs/javascript-client-api-reference#getBucketPolicy)
* [`setBucketPolicy`](https://docs.min.io/docs/javascript-client-api-reference#setBucketPolicy)


## Full Examples

#### Full Examples : Bucket Operations

* [list-buckets.js](https://github.com/minio/minio-js/blob/master/examples/list-buckets.js)
* [list-objects.js](https://github.com/minio/minio-js/blob/master/examples/list-objects.js)
* [list-objects-v2.js](https://github.com/minio/minio-js/blob/master/examples/list-objects-v2.js)
* [bucket-exists.js](https://github.com/minio/minio-js/blob/master/examples/bucket-exists.js)
* [make-bucket.js](https://github.com/minio/minio-js/blob/master/examples/make-bucket.js)
* [remove-bucket.js](https://github.com/minio/minio-js/blob/master/examples/remove-bucket.js)
* [list-incomplete-uploads.js](https://github.com/minio/minio-js/blob/master/examples/list-incomplete-uploads.js)

#### Full Examples : File Object Operations
* [fput-object.js](https://github.com/minio/minio-js/blob/master/examples/fput-object.js)
* [fget-object.js](https://github.com/minio/minio-js/blob/master/examples/fget-object.js)

#### Full Examples : Object Operations
* [put-object.js](https://github.com/minio/minio-js/blob/master/examples/put-object.js)
* [get-object.js](https://github.com/minio/minio-js/blob/master/examples/get-object.js)
* [copy-object.js](https://github.com/minio/minio-js/blob/master/examples/copy-object.js)
* [get-partialobject.js](https://github.com/minio/minio-js/blob/master/examples/get-partialobject.js)
* [remove-object.js](https://github.com/minio/minio-js/blob/master/examples/remove-object.js)
* [remove-incomplete-upload.js](https://github.com/minio/minio-js/blob/master/examples/remove-incomplete-upload.js)
* [stat-object.js](https://github.com/minio/minio-js/blob/master/examples/stat-object.js)

#### Full Examples : Presigned Operations
* [presigned-getobject.js](https://github.com/minio/minio-js/blob/master/examples/presigned-getobject.js)
* [presigned-putobject.js](https://github.com/minio/minio-js/blob/master/examples/presigned-putobject.js)
* [presigned-postpolicy.js](https://github.com/minio/minio-js/blob/master/examples/presigned-postpolicy.js)

#### Full Examples: Bucket Notification Operations
* [get-bucket-notification.js](https://github.com/minio/minio-js/blob/master/examples/get-bucket-notification.js)
* [set-bucket-notification.js](https://github.com/minio/minio-js/blob/master/examples/set-bucket-notification.js)
* [remove-all-bucket-notification.js](https://github.com/minio/minio-js/blob/master/examples/remove-all-bucket-notification.js)
* [listen-bucket-notification.js](https://github.com/minio/minio-js/blob/master/examples/minio/listen-bucket-notification.js) (MinIO Extension)

#### Full Examples: Bucket Policy Operations
* [get-bucket-policy.js](https://github.com/minio/minio-js/blob/master/examples/get-bucket-policy.js)
* [set-bucket-policy.js](https://github.com/minio/minio-js/blob/master/examples/set-bucket-policy.js)

## Explore Further
* [Complete Documentation](https://docs.min.io)
* [MinIO JavaScript Client SDK API Reference](https://docs.min.io/docs/javascript-client-api-reference)
* [Build your own Shopping App Example- Full Application Example ](https://github.com/minio/minio-js-store-app)

## Contribute

[Contributors Guide](https://github.com/minio/minio-js/blob/master/CONTRIBUTING.md)

[![Build Status](https://travis-ci.org/minio/minio-js.svg)](https://travis-ci.org/minio/minio-js)
[![Build status](https://ci.appveyor.com/api/projects/status/1d05e6nvxcelmrak?svg=true)](https://ci.appveyor.com/project/harshavardhana/minio-js)
