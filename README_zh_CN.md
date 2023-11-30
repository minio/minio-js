# 适用于Amazon S3兼容云存储的Minio JavaScript Library [![Slack](https://slack.min.io/slack?type=svg)](https://slack.min.io)

[![NPM](https://nodei.co/npm/minio.png)](https://nodei.co/npm/minio/)

MinIO JavaScript Client SDK提供简单的API来访问任何Amazon S3兼容的对象存储服务。

本快速入门指南将向您展示如何安装客户端SDK并执行示例JavaScript程序。有关API和示例的完整列表，请参阅[JavaScript客户端API参考](https://min.io/docs/minio/linux/developers/javascript/API.html/javascript-client-api-reference)文档。

本文假设你已经安装了[nodejs](http://nodejs.org/) 。

## 使用NPM下载

`minio>7.1.0` 拥有自带的类型定义，不再需要安装 `@types/minio`。

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
import * as Minio from 'minio'

const minioClient = new Minio.Client({
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
import * as Minio from 'minio'

// Instantiate the minio client with the endpoint
// and access keys as shown below.
const minioClient = new Minio.Client({
    endPoint: 'play.min.io',
    port: 9000,
    useSSL: true,
    accessKey: 'Q3AM3UQ867SPQQA43P2F',
    secretKey: 'zuf+tfteSlswRu7BJ86wekitnifILbZam1KYY3TG'
});

// File that needs to be uploaded.
const file = '/tmp/photos-europe.tar'

// Make a bucket called europetrip.
minioClient.makeBucket('europetrip', 'us-east-1', function(err) {
    if (err) return console.log(err)

    console.log('Bucket created successfully in "us-east-1".')

    const metaData = {
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
* [完整API文档](https://min.io/docs/minio/linux/developers/javascript/API.html)

### API文档 : 操作存储桶

* [`makeBucket`](https://min.io/docs/minio/linux/developers/javascript/API.html#makeBucket)
* [`listBuckets`](https://min.io/docs/minio/linux/developers/javascript/API.html#listBuckets)
* [`bucketExists`](https://min.io/docs/minio/linux/developers/javascript/API.html#bucketExists)
* [`removeBucket`](https://min.io/docs/minio/linux/developers/javascript/API.html#removeBucket)
* [`listObjects`](https://min.io/docs/minio/linux/developers/javascript/API.html#listObjects)
* [`listObjectsV2`](https://min.io/docs/minio/linux/developers/javascript/API.html#listObjectsV2)
* [`listIncompleteUploads`](https://min.io/docs/minio/linux/developers/javascript/API.html#listIncompleteUploads)

### API文档 : 操作文件对象

* [`fPutObject`](https://min.io/docs/minio/linux/developers/javascript/API.html#fPutObject)
* [`fGetObject`](https://min.io/docs/minio/linux/developers/javascript/API.html#fGetObject)

### API文档 : 操作对象

* [`getObject`](https://min.io/docs/minio/linux/developers/javascript/API.html#getObject)
* [`putObject`](https://min.io/docs/minio/linux/developers/javascript/API.html#putObject)
* [`copyObject`](https://min.io/docs/minio/linux/developers/javascript/API.html#copyObject)
* [`statObject`](https://min.io/docs/minio/linux/developers/javascript/API.html#statObject)
* [`removeObject`](https://min.io/docs/minio/linux/developers/javascript/API.html#removeObject)
* [`removeIncompleteUpload`](https://min.io/docs/minio/linux/developers/javascript/API.html#removeIncompleteUpload)

### API文档 :  Presigned操作

* [`presignedGetObject`](https://min.io/docs/minio/linux/developers/javascript/API.html#presignedGetObject)
* [`presignedPutObject`](https://min.io/docs/minio/linux/developers/javascript/API.html#presignedPutObject)
* [`presignedPostPolicy`](https://min.io/docs/minio/linux/developers/javascript/API.html#presignedPostPolicy)

### API文档 : 存储桶通知

* [`getBucketNotification`](https://min.io/docs/minio/linux/developers/javascript/API.html#getBucketNotification)
* [`setBucketNotification`](https://min.io/docs/minio/linux/developers/javascript/API.html#setBucketNotification)
* [`removeAllBucketNotification`](https://min.io/docs/minio/linux/developers/javascript/API.html#removeAllBucketNotification)
* [`listenBucketNotification`](https://min.io/docs/minio/linux/developers/javascript/API.html#listenBucketNotification) (MinIO Extension)

### API文档 : 存储桶策略

* [`getBucketPolicy`](https://min.io/docs/minio/linux/developers/javascript/API.html#getBucketPolicy)
* [`setBucketPolicy`](https://min.io/docs/minio/linux/developers/javascript/API.html#setBucketPolicy)


## 完整示例

#### 完整示例 : 操作存储桶

* [list-buckets.js](https://github.com/minio/minio-js/blob/master/examples/list-buckets.js)
* [list-objects.js](https://github.com/minio/minio-js/blob/master/examples/list-objects.js)
* [list-objects-v2.js](https://github.com/minio/minio-js/blob/master/examples/list-objects-v2.js)
* [bucket-exists.mjs](https://github.com/minio/minio-js/blob/master/examples/bucket-exists.mjs)
* [make-bucket.js](https://github.com/minio/minio-js/blob/master/examples/make-bucket.js)
* [remove-bucket.mjs](https://github.com/minio/minio-js/blob/master/examples/remove-bucket.mjs)
* [list-incomplete-uploads.js](https://github.com/minio/minio-js/blob/master/examples/list-incomplete-uploads.js)

#### 完整示例 : 操作文件对象
* [fput-object.js](https://github.com/minio/minio-js/blob/master/examples/fput-object.js)
* [fget-object.mjs](https://github.com/minio/minio-js/blob/master/examples/fget-object.mjs)

#### 完整示例 : 操作对象
* [put-object.js](https://github.com/minio/minio-js/blob/master/examples/put-object.js)
* [get-object.mjs](https://github.com/minio/minio-js/blob/master/examples/get-object.mjs)
* [copy-object.js](https://github.com/minio/minio-js/blob/master/examples/copy-object.js)
* [get-partialobject.mjs](https://github.com/minio/minio-js/blob/master/examples/get-partialobject.mjs)
* [remove-object.js](https://github.com/minio/minio-js/blob/master/examples/remove-object.js)
* [remove-incomplete-upload.js](https://github.com/minio/minio-js/blob/master/examples/remove-incomplete-upload.js)
* [stat-object.mjs](https://github.com/minio/minio-js/blob/master/examples/stat-object.mjs)

#### 完整示例 : Presigned操作
* [presigned-getobject.js](https://github.com/minio/minio-js/blob/master/examples/presigned-getobject.js)
* [presigned-putobject.js](https://github.com/minio/minio-js/blob/master/examples/presigned-putobject.js)
* [presigned-postpolicy.js](https://github.com/minio/minio-js/blob/master/examples/presigned-postpolicy.js)

#### 完整示例 : 存储桶通知
* [get-bucket-notification.js](https://github.com/minio/minio-js/blob/master/examples/get-bucket-notification.js)
* [set-bucket-notification.js](https://github.com/minio/minio-js/blob/master/examples/set-bucket-notification.js)
* [remove-all-bucket-notification.js](https://github.com/minio/minio-js/blob/master/examples/remove-all-bucket-notification.js)
* [listen-bucket-notification.js](https://github.com/minio/minio-js/blob/master/examples/minio/listen-bucket-notification.js) (MinIO Extension)

#### 完整示例 : 存储桶策略
* [get-bucket-policy.js](https://github.com/minio/minio-js/blob/master/examples/get-bucket-policy.js)
* [set-bucket-policy.mjs](https://github.com/minio/minio-js/blob/master/examples/set-bucket-policy.mjs)

## 了解更多
* [完整文档]([https://docs.min.i](https://min.io/docs/minio/kubernetes/upstream/index.html)o)
* [MinIO JavaScript Client SDK API文档](https://min.io/docs/minio/linux/developers/javascript/API.html)
* [创建属于你的购物APP-完整示例](https://github.com/minio/minio-js-store-app)

## 贡献

[贡献者指南](https://github.com/minio/minio-js/blob/master/CONTRIBUTING.md)

[![Build Status](https://travis-ci.org/minio/minio-js.svg)](https://travis-ci.org/minio/minio-js)
[![Build status](https://ci.appveyor.com/api/projects/status/1d05e6nvxcelmrak?svg=true)](https://ci.appveyor.com/project/harshavardhana/minio-js)
