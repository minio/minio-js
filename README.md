# Minimal object storage library for Nodejs [![Build Status](https://travis-ci.org/minio/minio-js.svg)](https://travis-ci.org/minio/minio-js)

## Install

```sh
$ git clone https://github.com/minio/minio-js
$ npm install
```

## Example

```js
var Minio = require('minio')
var Stream = require('stream');
var Through2 = require('through2');

var s3client = new minio({
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

## Join The Community
* Community hangout on Gitter    [![Gitter](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/minio/minio?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
* Ask questions on Quora  [![Quora](http://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Quora_logo.svg/55px-Quora_logo.svg.png)](http://www.quora.com/Minio)

## Contribute

[Contributors Guide](./CONTRIBUTING.md)
