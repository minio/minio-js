# Minio Javascript (Nodejs) Library for Amazon S3 Cloud Storage [![Gitter](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/minio/minio?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

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

[makeBucket(bucket, cb)](src/examples/make-bucket.js)

[listBuckets() : Stream](src/examples/list-buckets.js)

[bucketExists(bucket, cb)](src/examples/bucket-exists.js)

[removeBucket(bucket, cb)](src/examples/remove-bucket.js)

[getBucketACL(bucket, cb)](src/examples/get-bucket-acl.js)

[setBucketACL(bucket, acl, cb)](src/examples/set-bucket-acl.js)

[dropAllIncompleteUploads(bucket, cb)](src/examples/drop-incomplete-upload.js)

### Object

[getObject(bucket, key) Stream](src/examples/get-object.js)

[getPartialObject(bucket, key, offset, length) Stream](src/examples/get-partialobject.js)

[putObject(bucket, key, Stream, cb)](src/examples/put-object.js)

[listObjects(bucket, {prefix: prefix, recursive: true}) : Stream](src/examples/list-objects.js)

[statObject(bucket, key, cb)](src/examples/stat-object.js)

[removeObject(bucket, key, cb)](src/examples/remove-object.js)

[dropIncompleteUpload(bucket, key, cb)](src/examples/drop-incomplete-upload.js)

## Contribute

[Contributors Guide](./CONTRIBUTING.md)

[![NPM](https://img.shields.io/npm/v/minio.svg)](https://www.npmjs.com/package/minio)
[![NPM](https://img.shields.io/npm/l/minio.svg)](https://www.npmjs.com/package/minio)
[![NPM](https://img.shields.io/npm/dm/minio.svg)](https://www.npmjs.com/package/minio)
