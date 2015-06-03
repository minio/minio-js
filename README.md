# Minimal object storage library for Nodejs [![Build Status](https://travis-ci.org/minio/minio-js.svg)](https://travis-ci.org/minio/minio-js)

## Install

```sh
$ git clone https://github.com/minio/minio-js
$ npm install
```

## Example

```js
var stream = require('stream');
var util = require('util');
var minio = require('minio')

function StringifyStream(){
  stream.Transform.call(this);

  this._readableState.objectMode = false;
  this._writableState.objectMode = true;
}
util.inherits(StringifyStream, stream.Transform);

StringifyStream.prototype._transform = function(obj, encoding, cb){
  this.push(JSON.stringify(obj));
  cb();
};

var s3client = new minio({
  host: 's3.amazonaws.com',
  port: 80,
  accessKey: 'YOUR-ACCESSKEYID',
  secretKey: 'YOUR-SECRETACCESSKEY'
})

var bucketstream = s3client.listBuckets()
bucketstream.pipe(new StringifyStream()).pipe(process.stdout)
```

## Documentation

## Join The Community
* Community hangout on Gitter    [![Gitter](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/minio/minio?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
* Ask questions on Quora  [![Quora](http://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Quora_logo.svg/55px-Quora_logo.svg.png)](http://www.quora.com/Minio)

## Contribute

[Contributors Guide](./CONTRIBUTING.md)
