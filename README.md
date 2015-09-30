# Minio Javascript (Nodejs) Library for Amazon S3 Compatible Cloud Storage [![Gitter](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/minio/minio?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

[![NPM](https://nodei.co/npm/minio.png)](https://nodei.co/npm/minio/)

## Install from npm

```sh
$ npm install --save minio
```

## Example

```js
#!/usr/bin/env node

var Minio = require('minio')

// find out your s3 end point here:
// http://docs.aws.amazon.com/general/latest/gr/rande.html#s3_region

var s3client = new Minio({
  url: 'https://<your-s3-endpoint>',
  accessKey: 'YOUR-ACCESSKEYID',
  secretKey: 'YOUR-SECRETACCESSKEY'
})

s3client.listBuckets(function(e, bucketStream) {
  if (e) {
    console.log(e)
    return
  }
  bucketStream.on('data', function(obj) {
    console.log(obj)
  })
  bucketStream.on('end', function() {
    console.log("End")
  })
  bucketStream.on('error', function(e) {
    console.log("Error", e)
  })
})

```

## Documentation

### Bucket

[makeBucket(bucket, cb)](examples/make-bucket.js)

[listBuckets() : Stream](examples/list-buckets.js)

[bucketExists(bucket, cb)](examples/bucket-exists.js)

[removeBucket(bucket, cb)](examples/remove-bucket.js)

[getBucketACL(bucket, cb)](examples/get-bucket-acl.js)

[setBucketACL(bucket, acl, cb)](examples/set-bucket-acl.js)

[dropAllIncompleteUploads(bucket, cb)](examples/drop-incomplete-upload.js)

### Object

[getObject(bucket, key) Stream](examples/get-object.js)

[getPartialObject(bucket, key, offset, length) Stream](examples/get-partialobject.js)

[putObject(bucket, key, Stream, cb)](examples/put-object.js)

[listObjects(bucket, {prefix: prefix, recursive: true}) : Stream](examples/list-objects.js)

[statObject(bucket, key, cb)](examples/stat-object.js)

[removeObject(bucket, key, cb)](examples/remove-object.js)

[dropIncompleteUpload(bucket, key, cb)](examples/drop-incomplete-upload.js)

## Contribute

[Contributors Guide](./CONTRIBUTING.md)

[![Build Status](https://travis-ci.org/minio/minio-js.svg)](https://travis-ci.org/minio/minio-js)
[![Build status](https://ci.appveyor.com/api/projects/status/402thana800k00fv?svg=true)](https://ci.appveyor.com/project/harshavardhana/minio-js)
