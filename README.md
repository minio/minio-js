# Minio JavaScript Library for Amazon S3 Compatible Cloud Storage [![Gitter](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/Minio/minio?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

[![NPM](https://nodei.co/npm/minio.png)](https://nodei.co/npm/minio/)

The Minio JavaScript Client SDK provides simple APIs to access any Amazon S3 compatible object storage server.

This quickstart guide will show you how to install the client SDK and execute an example JavaScript program. For a complete list of APIs and examples, please take a look at the [JavaScript Client API Reference](https://docs.minio.io/docs/javascript-client-api-reference) documentation.

This document assumes that you have a working [nodejs](http://nodejs.org/) setup in place.


## Download from NPM

```sh
$ npm install --save minio
```

## Download from Source

```sh
$ git clone https://github.com/minio/minio-js
$ cd minio-js
$ npm install
$ npm install -g
```
## Initialize Minio Client
You need five items in order to connect to Minio object storage server.

| Params     | Description |  
| :------- | :------------ |  
| endPoint	 | URL to object storage service. |  
|port| TCP/IP port number. This input is optional. Default value set to ``80`` for HTTP and ``443`` for HTTPs.|
| accessKey | Access key is like user ID that uniquely identifies your account.   |   
| secretKey	| Secret key is the password to your account.    |
|secure |Set this value to 'true' to enable secure (HTTPS) access |

```js
var Minio = require('minio')

var minioClient = new Minio({
    endPoint: 'play.minio.io',
    port: '9000',
    secure: true,
    accessKey: 'Q3AM3UQ867SPQQA43P2F',
    secretKey: 'zuf+tfteSlswRu7BJ86wekitnifILbZam1KYY3TG'
});
```
## Quick Start Example - File Uploader
This example program connects to an object storage server, makes a bucket on the server and then uploads a file to the bucket. 

We will use the Minio server running at [https://play.minio.io:9000](https://play.minio.io:9000) in this example. Feel free to use this service for testing and development. Access credentials shown in this example are open to the public.

#### file-uploader.js
```js
var Minio = require('minio')

// Instantiate the minio client with the endpoint 
// and access keys as shown below.
var minioClient = new Minio({
    endPoint: 'play.minio.io',
    port: 9000,
    secure: true,
    accessKey: 'Q3AM3UQ867SPQQA43P2F',
    secretKey: 'zuf+tfteSlswRu7BJ86wekitnifILbZam1KYY3TG'
});

// File that needs to be uploaded.
var file = '/tmp/photos-europe.tar'

// Make a bucket called europetrip.
minioClient.makeBucket('europetrip', 'us-east-1', function(err) {
    if (err) return console.log(err)

    console.log('Bucket created successfully in "us-east-1".')
    
    // Using fPutObject API upload your file to the bucket europetrip. 
    minioClient.fPutObject('europetrip', 'photos-europe.tar', file, 'application/octet-stream', function(err, etag) {
      if (err) return console.log(err)
      console.log('File uploaded successfully.')
    });
});
```
#### Run file-uploader
```bash
$ node file-uploader.js
Bucket created successfully in "us-east-1".

$ mc ls play/europetrip/
[2016-05-25 23:49:50 PDT]  17MiB photos-europe.tar
```

## API Reference
The full API Reference is available here. 
* [Complete API Reference](https://docs.minio.io/docs/javascript-client-api-reference)

### API Reference : Bucket Operations
* [`makeBucket`](https://docs.minio.io/docs/javascript-client-api-reference#makeBucket)
* [`listBuckets`](https://docs.minio.io/docs/javascript-client-api-reference#listBuckets)
* [`bucketExists`](https://docs.minio.io/docs/javascript-client-api-reference#bucketExists)
* [`removeBucket`](https://docs.minio.io/docs/javascript-client-api-reference#removeBucket)
* [`listObjects`](https://docs.minio.io/docs/javascript-client-api-reference#listObjects)
* [`listIncompleteUploads`](https://docs.minio.io/docs/javascript-client-api-reference#listIncompleteUploads)

### API Reference : File Object Operations
* [`fPutObject`](https://docs.minio.io/docs/javascript-client-api-reference#fPutObject)
* [`fGetObject`](https://docs.minio.io/docs/javascript-client-api-reference#fGetObject)

### API Reference : Object Operations
* [`getObject`](https://docs.minio.io/docs/javascript-client-api-reference#getObject)
* [`putObject`](https://docs.minio.io/docs/javascript-client-api-reference#putObject)
* [`statObject`](https://docs.minio.io/docs/javascript-client-api-reference#statObject)
* [`removeObject`](https://docs.minio.io/docs/javascript-client-api-reference#removeObjec)
* [`removeIncompleteUpload`](https://docs.minio.io/docs/javascript-client-api-reference#removeIncompleteUpload)

### API Reference : Presigned Operations
* [`presignedGetObject`](https://docs.minio.io/docs/javascript-client-api-reference#presignedGetObject)
* [`presignedPutObject`](https://docs.minio.io/docs/javascript-client-api-reference#presignedPutObject)
* [`presignedPostPolicy`](https://docs.minio.io/docs/javascript-client-api-reference#presignedPostPolicy)


## Full Examples

#### Full Examples : Bucket Operations

* [list-buckets.js](./examples/list-buckets.js)
* [list-objects.js](./examples/list-objects.js)
* [bucket-exists.js](./examples/bucket-exists.js)
* [make-bucket.js](./examples/make-bucket.js)
* [remove-bucket.js](./examples/remove-bucket.js)
* [list-incomplete-uploads.js](./examples/list-incomplete-uploads.js)

#### Full Examples : File Object Operations
* [fput-object.js](./examples/fput-object.js)
* [fget-object.js](./examples/fget-object.js)
#### Full Examples : Object Operations

* [put-object.js](./examples/put-object.js)
* [get-object.js](./examples/get-object.js)
* [get-partialobject.js](./examples/get-partialobject.js)
* [remove-object.js](./examples/remove-object.js)
* [stat-object.js](./examples/stat-object.js)

#### Full Examples : Presigned Operations
* [presigned-getobject.js](./examples/presigned-getobject.js)
* [presigned-putobject.js](./examples/presigned-putobject.js)
* [presigned-postpolicy.js](./examples/presigned-postpolicy.js)

 
## Explore Further
* [Complete Documentation](https://docs.minio.io)
* [Minio JavaScript Client SDK API Reference](https://docs.minio.io/docs/javascript-client-api-reference) 
* [Build your own Shopping App Example- Full Application Example ](https://docs.minio.io/docs/javascript-shopping-app)

## Contribute

[Contributors Guide](./CONTRIBUTING.md)

[![Build Status](https://travis-ci.org/minio/minio-js.svg)](https://travis-ci.org/minio/minio-js)
[![Build status](https://ci.appveyor.com/api/projects/status/1d05e6nvxcelmrak?svg=true)](https://ci.appveyor.com/project/harshavardhana/minio-js)
