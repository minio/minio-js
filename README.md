# Minimal object storage library for Nodejs [![Build Status](https://travis-ci.org/minio/minio-js.svg)](https://travis-ci.org/minio/minio-js)

## Install

```sh
$ git clone https://github.com/minio/minio-js
$ npm install
```

## Example

```js
var Minio = require('minio')
var Through2 = require('through2')

var s3client = new Minio({
  host: 's3.amazonaws.com',
  port: 80,
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

[MakeBucket(bucket, cb)](https://github.com/minio/minio-js/blob/master/src/example/make-bucket.js)

[ListBuckets() : Stream](https://github.com/minio/minio-js/blob/master/src/example/list-buckets.js)

[BucketExists(bucket, cb)](https://github.com/minio/minio-js/blob/master/src/example/bucket-exists.js)

[RemoveBucket(bucket, cb)](https://github.com/minio/minio-js/blob/master/src/example/remove-bucket.js)

[GetBucketACL(bucket, cb)](https://github.com/minio/minio-js/blob/master/src/example/get-bucket-acl.js)

[SetBucketACL(bucket, acl, cb)](https://github.com/minio/minio-js/blob/master/src/example/set-bucket-acl.js)

[DropAllIncompleteUploads(bucket, cb)](https://github.com/minio/minio-js/blob/master/src/example/drop-incomplete-upload.js)

### Object

GetObject(bucket, key) Stream](https://github.com/minio/minio-js/blob/master/src/example/get-object.js)

PutObject(bucket, key, Stream, cb)](https://github.com/minio/minio-js/blob/master/src/example/put-object.js)

ListObjects(bucket, {prefix: prefix, recursive: true}) : Stream](https://github.com/minio/minio-js/blob/master/src/example/list-objects.js)

StatObject(bucket, key, cb)](https://github.com/minio/minio-js/blob/master/src/example/stat-object.js)

RemoveObject(bucket, key, cb)](https://github.com/minio/minio-js/blob/master/src/example/remove-object.js)

DropIncompleteUpload(bucket, key, cb)](https://github.com/minio/minio-js/blob/master/src/example/drop-incomplete-upload.js)

## Join The Community
* Community hangout on Gitter    [![Gitter](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/minio/minio?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
* Ask questions on Quora  [![Quora](http://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Quora_logo.svg/55px-Quora_logo.svg.png)](http://www.quora.com/Minio)

## Contribute

[Contributors Guide](./CONTRIBUTING.md)
