# 适用于Amazon S3兼容云存储的Minio JavaScript Library [![Slack](https://slack.min.io/slack?type=svg)](https://slack.min.io)

[![NPM](https://nodei.co/npm/minio.png)](https://nodei.co/npm/minio/)

MinIO JavaScript Client SDK提供简单的API来访问任何Amazon S3兼容的对象存储服务。

本快速入门指南将向您展示如何安装客户端SDK并执行示例JavaScript程序。有关API和示例的完整列表，请参阅[JavaScript客户端API参考](https://docs.min.io/docs/javascript-client-api-reference)文档。

本文假设你已经安装了[nodejs](http://nodejs.org/) 。

## 使用NPM下载

```sh
npm install --save minio
```

## 下载并安装源码

```sh
git clone https://github.com/minio/minio-js
cd minio-js
npm install
npm install -g
```

## 初使化Minio Client

你需要设置5个属性来链接Minio对象存储服务。

| 参数     | 描述 |
| :------- | :------------ |
| endPoint	 |对象存储服务的URL |
|port| TCP/IP端口号。可选值，如果是使用HTTP的话，默认值是`80`；如果使用HTTPS的话，默认值是`443`。|
| accessKey | Access key是唯一标识你的账户的用户ID。  |
| secretKey	| Secret key是你账户的密码。   |
|useSSL |true代表使用HTTPS |


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

## 示例-文件上传

本示例连接到一个对象存储服务，创建一个存储桶并上传一个文件到存储桶中。

我们在本示例中使用运行在 [https://play.min.io](https://play.min.io) 上的Minio服务，你可以用这个服务来开发和测试。示例中的访问凭据是公开的。

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

#### 运行file-uploader

```sh
node file-uploader.js
Bucket created successfully in "us-east-1".

mc ls play/europetrip/
[2016-05-25 23:49:50 PDT]  17MiB photos-europe.tar
```

## API文档

完整的API文档在这里。
* [完整API文档](https://docs.min.io/docs/javascript-client-api-reference)

### API文档 : 操作存储桶

* [`makeBucket`](https://docs.min.io/docs/javascript-client-api-reference#makeBucket)
* [`listBuckets`](https://docs.min.io/docs/javascript-client-api-reference#listBuckets)
* [`bucketExists`](https://docs.min.io/docs/javascript-client-api-reference#bucketExists)
* [`removeBucket`](https://docs.min.io/docs/javascript-client-api-reference#removeBucket)
* [`listObjects`](https://docs.min.io/docs/javascript-client-api-reference#listObjects)
* [`listObjectsV2`](https://docs.min.io/docs/javascript-client-api-reference#listObjectsV2)
* [`listIncompleteUploads`](https://docs.min.io/docs/javascript-client-api-reference#listIncompleteUploads)

### API文档 : 操作文件对象

* [`fPutObject`](https://docs.min.io/docs/javascript-client-api-reference#fPutObject)
* [`fGetObject`](https://docs.min.io/docs/javascript-client-api-reference#fGetObject)

### API文档 : 操作对象

* [`getObject`](https://docs.min.io/docs/javascript-client-api-reference#getObject)
* [`putObject`](https://docs.min.io/docs/javascript-client-api-reference#putObject)
* [`copyObject`](https://docs.min.io/docs/javascript-client-api-reference#copyObject)
* [`statObject`](https://docs.min.io/docs/javascript-client-api-reference#statObject)
* [`removeObject`](https://docs.min.io/docs/javascript-client-api-reference#removeObject)
* [`removeIncompleteUpload`](https://docs.min.io/docs/javascript-client-api-reference#removeIncompleteUpload)

### API文档 :  Presigned操作

* [`presignedGetObject`](https://docs.min.io/docs/javascript-client-api-reference#presignedGetObject)
* [`presignedPutObject`](https://docs.min.io/docs/javascript-client-api-reference#presignedPutObject)
* [`presignedPostPolicy`](https://docs.min.io/docs/javascript-client-api-reference#presignedPostPolicy)

### API文档 : 存储桶通知

* [`getBucketNotification`](https://docs.min.io/docs/javascript-client-api-reference#getBucketNotification)
* [`setBucketNotification`](https://docs.min.io/docs/javascript-client-api-reference#setBucketNotification)
* [`removeAllBucketNotification`](https://docs.min.io/docs/javascript-client-api-reference#removeAllBucketNotification)
* [`listenBucketNotification`](https://docs.min.io/docs/javascript-client-api-reference#listenBucketNotification) (MinIO Extension)

### API文档 : 存储桶策略

* [`getBucketPolicy`](https://docs.min.io/docs/javascript-client-api-reference#getBucketPolicy)
* [`setBucketPolicy`](https://docs.min.io/docs/javascript-client-api-reference#setBucketPolicy)


## 完整示例

#### 完整示例 : 操作存储桶

* [list-buckets.js](https://github.com/minio/minio-js/blob/master/examples/list-buckets.js)
* [list-objects.js](https://github.com/minio/minio-js/blob/master/examples/list-objects.js)
* [list-objects-v2.js](https://github.com/minio/minio-js/blob/master/examples/list-objects-v2.js)
* [bucket-exists.js](https://github.com/minio/minio-js/blob/master/examples/bucket-exists.js)
* [make-bucket.js](https://github.com/minio/minio-js/blob/master/examples/make-bucket.js)
* [remove-bucket.js](https://github.com/minio/minio-js/blob/master/examples/remove-bucket.js)
* [list-incomplete-uploads.js](https://github.com/minio/minio-js/blob/master/examples/list-incomplete-uploads.js)

#### 完整示例 : 操作文件对象
* [fput-object.js](https://github.com/minio/minio-js/blob/master/examples/fput-object.js)
* [fget-object.js](https://github.com/minio/minio-js/blob/master/examples/fget-object.js)

#### 完整示例 : 操作对象
* [put-object.js](https://github.com/minio/minio-js/blob/master/examples/put-object.js)
* [get-object.js](https://github.com/minio/minio-js/blob/master/examples/get-object.js)
* [copy-object.js](https://github.com/minio/minio-js/blob/master/examples/copy-object.js)
* [get-partialobject.js](https://github.com/minio/minio-js/blob/master/examples/get-partialobject.js)
* [remove-object.js](https://github.com/minio/minio-js/blob/master/examples/remove-object.js)
* [remove-incomplete-upload.js](https://github.com/minio/minio-js/blob/master/examples/remove-incomplete-upload.js)
* [stat-object.js](https://github.com/minio/minio-js/blob/master/examples/stat-object.js)

#### 完整示例 : Presigned操作
* [presigned-getobject.js](https://github.com/minio/minio-js/blob/master/examples/presigned-getobject.js)
* [presigned-putobject.js](https://github.com/minio/minio-js/blob/master/examples/presigned-putobject.js)
* [presigned-postpolicy.js](https://github.com/minio/minio-js/blob/master/examples/presigned-postpolicy.js)

####完整示例 : 存储桶通知
* [get-bucket-notification.js](https://github.com/minio/minio-js/blob/master/examples/get-bucket-notification.js)
* [set-bucket-notification.js](https://github.com/minio/minio-js/blob/master/examples/set-bucket-notification.js)
* [remove-all-bucket-notification.js](https://github.com/minio/minio-js/blob/master/examples/remove-all-bucket-notification.js)
* [listen-bucket-notification.js](https://github.com/minio/minio-js/blob/master/examples/minio/listen-bucket-notification.js) (MinIO Extension)

#### 完整示例 : 存储桶策略
* [get-bucket-policy.js](https://github.com/minio/minio-js/blob/master/examples/get-bucket-policy.js)
* [set-bucket-policy.js](https://github.com/minio/minio-js/blob/master/examples/set-bucket-policy.js)

## 了解更多
* [完整文档](https://docs.min.io)
* [MinIO JavaScript Client SDK API文档](https://docs.min.io/docs/javascript-client-api-reference)
* [创建属于你的购物APP-完整示例](https://github.com/minio/minio-js-store-app)

## 贡献

[贡献者指南](https://github.com/minio/minio-js/blob/master/CONTRIBUTING.md)

[![Build Status](https://travis-ci.org/minio/minio-js.svg)](https://travis-ci.org/minio/minio-js)
[![Build status](https://ci.appveyor.com/api/projects/status/1d05e6nvxcelmrak?svg=true)](https://ci.appveyor.com/project/harshavardhana/minio-js)
