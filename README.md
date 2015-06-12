# Minimal object storage library for Nodejs [![Build Status](https://travis-ci.org/minio/minio-js.svg)](https://travis-ci.org/minio/minio-js)

## Install from npm

```sh
$ npm install --save minio
```

## Example

```js
var Minio = require('minio')
var Through2 = require('through2')

var s3client = new Minio({
  url: 'https://s3.amazonaws.com',
  accessKey: 'YOUR-ACCESSKEYID',
  secretKey: 'YOUR-SECRETACCESSKEY'
})

var bucketStream = s3client.listBuckets()
bucketStream.pipe(Through2.obj(function(bucket, enc, done) {
  console.log(bucket)
  done()
}))
```

## Documentation

### Bucket

[MakeBucket(bucket, cb)](src/example/make-bucket.js)

[ListBuckets() : Stream](src/example/list-buckets.js)

[BucketExists(bucket, cb)](src/example/bucket-exists.js)

[RemoveBucket(bucket, cb)](src/example/remove-bucket.js)

[GetBucketACL(bucket, cb)](src/example/get-bucket-acl.js)

[SetBucketACL(bucket, acl, cb)](src/example/set-bucket-acl.js)

[DropAllIncompleteUploads(bucket, cb)](src/example/drop-incomplete-upload.js)

### Object

[GetObject(bucket, key) Stream](src/example/get-object.js)

[PutObject(bucket, key, Stream, cb)](src/example/put-object.js)

[ListObjects(bucket, {prefix: prefix, recursive: true}) : Stream](src/example/list-objects.js)

[StatObject(bucket, key, cb)](src/example/stat-object.js)

[RemoveObject(bucket, key, cb)](src/example/remove-object.js)

[DropIncompleteUpload(bucket, key, cb)](src/example/drop-incomplete-upload.js)

## Join The Community
* Community hangout on Gitter    [![Gitter](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/minio/minio?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
* Ask questions on Quora  [![Quora](http://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Quora_logo.svg/55px-Quora_logo.svg.png)](http://www.quora.com/Minio)

## Contribute

[Contributors Guide](./CONTRIBUTING.md)

[![NPM](https://img.shields.io/npm/v/minio.svg)](https://www.npmjs.com/package/minio)
[![NPM](https://img.shields.io/npm/l/minio.svg)](https://www.npmjs.com/package/minio)
[![NPM](https://img.shields.io/npm/dm/minio.svg)](https://www.npmjs.com/package/minio)
