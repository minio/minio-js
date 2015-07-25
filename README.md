# Minio Javascript (Nodejs) Library for Amazon S3 cloud storage [![Gitter](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/minio/minio?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

## Install from npm [![Build Status](https://travis-ci.org/minio/minio-js.svg)](https://travis-ci.org/minio/minio-js)

```sh
$ npm install --save minio
```

## Example

```js
#!/usr/bin/env node

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

[makeBucket(bucket, cb)](src/example/make-bucket.js)

[listBuckets() : Stream](src/example/list-buckets.js)

[bucketExists(bucket, cb)](src/example/bucket-exists.js)

[removeBucket(bucket, cb)](src/example/remove-bucket.js)

[getBucketACL(bucket, cb)](src/example/get-bucket-acl.js)

[setBucketACL(bucket, acl, cb)](src/example/set-bucket-acl.js)

[dropAllIncompleteUploads(bucket, cb)](src/example/drop-incomplete-upload.js)

### Object

[getObject(bucket, key) Stream](src/example/get-object.js)

[getPartialObject(bucket, key, offset, length) Stream](src/example/get-partialobject.js)

[putObject(bucket, key, Stream, cb)](src/example/put-object.js)

[listObjects(bucket, {prefix: prefix, recursive: true}) : Stream](src/example/list-objects.js)

[statObject(bucket, key, cb)](src/example/stat-object.js)

[removeObject(bucket, key, cb)](src/example/remove-object.js)

[dropIncompleteUpload(bucket, key, cb)](src/example/drop-incomplete-upload.js)

## Contribute

[Contributors Guide](./CONTRIBUTING.md)

[![NPM](https://img.shields.io/npm/v/minio.svg)](https://www.npmjs.com/package/minio)
[![NPM](https://img.shields.io/npm/l/minio.svg)](https://www.npmjs.com/package/minio)
[![NPM](https://img.shields.io/npm/dm/minio.svg)](https://www.npmjs.com/package/minio)
