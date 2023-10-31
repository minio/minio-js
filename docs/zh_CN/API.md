# JavaScript Client API参考文档 [![Slack](https://slack.min.io/slack?type=svg)](https://slack.min.io)

## 初使化Minio Client object.

## MinIO

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

## AWS S3 

```js
var Minio = require('minio')

var s3Client = new Minio.Client({
    endPoint:  's3.amazonaws.com',
    accessKey: 'YOUR-ACCESSKEYID',
    secretKey: 'YOUR-SECRETACCESSKEY'
})
```

| 操作存储桶       | 操作对象      | Presigned操作 | 存储桶策略/通知  |
| ------------- |-------------| -----| ----- |
| [`makeBucket`](#makeBucket)    | [`getObject`](#getObject) | [`presignedUrl`](#presignedUrl) | [`getBucketNotification`](#getBucketNotification) |
| [`listBuckets`](#listBuckets)  | [`getPartialObject`](#getPartialObject)    |   [`presignedGetObject`](#presignedGetObject) | [`setBucketNotification`](#setBucketNotification) |
| [`bucketExists`](#bucketExists) | [`fGetObject`](#fGetObject)    |    [`presignedPutObject`](#presignedPutObject) | [`removeAllBucketNotification`](#removeAllBucketNotification) |
| [`removeBucket`](#removeBucket)      | [`putObject`](#putObject) |    [`presignedPostPolicy`](#presignedPostPolicy) | [`getBucketPolicy`](#getBucketPolicy) |  | 
| [`listObjects`](#listObjects) | [`fPutObject`](#fPutObject)   |   |   [`setBucketPolicy`](#setBucketPolicy)
| [`listObjectsV2`](#listObjectsV2) | [`copyObject`](#copyObject) | | [`listenBucketNotification`](#listenBucketNotification)|
| [`listIncompleteUploads`](#listIncompleteUploads) |  [`statObject`](#statObject) |
|     |  [`removeObject`](#removeObject)    |
|  | [`removeIncompleteUpload`](#removeIncompleteUpload)  |
  


## 1.  构造函数

<a name="MinioClient_endpoint"></a>
###  new Minio.Client ({endPoint, port, useSSL, accessKey, secretKey})

|     |
| ---- |
|``new Minio.Client ({endPoint, port, useSSL, accessKey, secretKey})``|
|初使化一个新的client对象。|

__参数__

| 参数| 类型 | 描述 |
|---|---|---|
| `endPoint`  |  _string_ | endPoint是一个主机名或者IP地址。 |
| `port` | _number_  | TCP/IP端口号。可选，默认值是，如果是http,则默认80端口，如果是https,则默认是443端口。 |
| `accessKey`   | _string_   |accessKey类似于用户ID，用于唯一标识你的账户。 |
|`secretKey`  |  _string_   | secretKey是你账户的密码。|
|`useSSL`    | _bool_    |如果是true，则用的是https而不是http,默认值是true。 |
|`region`    | _string_  |设置该值以覆盖自动发现存储桶region。（可选）|
|`transport`    | _string_  |Set this value to pass in a custom transport. (Optional) - To be translated |
|`sessionToken`    | _string_  |Set this value to provide x-amz-security-token (AWS S3 specific). (Optional) - To be translated|
|`partSize`    | _number_  |Set this value to override default part size of 64MB for multipart uploads. (Optional) - To be translated|
| `pathStyle`    | _bool_   | 对于非 AWS 的 Endpoint，设置该值以覆盖默认访问方式 (path)。默认值为 true。（可选） |

__示例__

## 创建连接Minio Server的客户端

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

## 创建连接AWS S3的客户端


```js
var Minio = require('minio')

var s3Client = new Minio.Client({
    endPoint:  's3.amazonaws.com',
    accessKey: 'YOUR-ACCESSKEYID',
    secretKey: 'YOUR-SECRETACCESSKEY'
})
```

## Ali OSS 

```js
var Minio = require('minio')

var s3Client = new Minio.Client({
    endPoint:  'oss-cn-hangzhou.aliyuncs.com',
    accessKey: 'YOUR-ACCESSKEYID',
    secretKey: 'YOUR-SECRETACCESSKEY',
    bucket: 'YOUR-BUCKET',
    pathStyle: false,
    region: 'oss-cn-hangzhou'
})
```

## 2. 操作存储桶
<a name="makeBucket"></a>

### makeBucket(bucketName, region[, callback])

创建一个新的存储桶。

__参数__

| 参数| 类型 | 描述 |
|---|---|---|
|`bucketName`  | _string_  | 存储桶名称。 |
| `region`  |  _string_ | 存储桶被创建的region(地区)，默认是us-east-1(美国东一区)，下面列举的是其它合法的值： |
| | |us-east-1 |
| | |us-west-1 |
| | |us-west-2 |
| | |eu-west-1 |
| | |eu-central-1|
| | |ap-southeast-1|
| | |ap-northeast-1|
| | |ap-southeast-2|
| | |sa-east-1|
| | |cn-north-1|
|`callback(err)`  |_function_   | 回调函数，`err`做为错误信息参数。如果创建存储桶成功则`err`为null。如果没有传callback的话，则返回一个`Promise`对象。 |


__示例__


```js
minioClient.makeBucket('mybucket', 'us-east-1', function(err) {
  if (err) return console.log('Error creating bucket.', err)
  console.log('Bucket created successfully in "us-east-1".')
})
```

<a name="listBuckets"></a>
### listBuckets([callback])

列出所有存储桶。


__参数__


| 参数| 类型 | 描述 |
|---|---|---|
|`callback(err, bucketStream) `  | _function_  | 回调函数，第一个参数是错误信息。`bucketStream`是带有存储桶信息的流。如果没有传callback的话，则返回一个`Promise`对象。|

bucketStream格式如下:-

| 参数| 类型 | 描述 |
|---|---|---|
|`bucket.name`  | _string_ |存储桶名称 |
|`bucket.creationDate`| _Date_ |存储桶创建时间。  |



__示例__


```js
minioClient.listBuckets(function(err, buckets) {
  if (err) return console.log(err)
  console.log('buckets :', buckets)
})
```

<a name="bucketExists"></a>
#### bucketExists(bucketName[, callback])

验证存储桶是否存在。


__参数__


| 参数| 类型 | 描述 |
|---|---|---|
| `bucketName`  |  _string_ | 存储桶名称。  |
| `callback(err)`  | _function_  | 如果存储桶存在的话`err`就是null，否则`err.code`是`NoSuchBucket`。如果没有传callback的话，则返回一个`Promise`对象。 |

__示例__


```js
minioClient.bucketExists('mybucket', function(err) {
  if (err) {
     if (err.code == 'NoSuchBucket') return console.log("bucket does not exist.")
     return console.log(err)
  }
  // if err is null it indicates that the bucket exists.
  console.log('Bucket exists.')
})
```

<a name="removeBucket"></a>
### removeBucket(bucketName[, callback])

删除存储桶。

__参数__


| 参数  |  类型 | 描述  |
|---|---|---|
| `bucketName`  | _string_  | 存储桶名称。  |
| `callback(err)`  | _function_  |  如果存储桶删除成功则`err`为`null`。如果没有传callback的话，则返回一个`Promise`对象。 |

__示例__


```js
minioClient.removeBucket('mybucket', function(err) {
  if (err) return console.log('unable to remove bucket.')
  console.log('Bucket removed successfully.')
})
```

<a name="listObjects"></a>
### listObjects(bucketName, prefix, recursive)

列出存储桶中所有对象。

__参数__


| 参数  |  类型 | 描述  |
| ---- | ---- | ---- |
| `bucketName` | _string_ | 存储桶名称。 |
| `prefix`  | _string_  |  要列出的对象的前缀 (可选，默认值是`''`)。 |
| `recursive`  | _bool_  | `true`代表递归查找，`false`代表类似文件夹查找，以'/'分隔，不查子文件夹。（可选，默认值是`false`）  |


__返回值__


| 参数  |  类型 | 描述  |
| ---- | ---- | ---- |
| `stream` | _Stream_ | 存储桶中对象信息的流。 |

对象的格式如下：

| 参数  |  类型 | 描述  |
| ---- | ---- | ---- |
| `obj.name` | _string_ | 对象名称。 |
| `obj.prefix` | _string_ | 对象名称的前缀。 |
| `obj.size` | _number_ | 对象的大小。 |
| `obj.etag` | _string_ |对象的etag值。 |
| `obj.lastModified` | _Date_ | 最后修改时间。 |

__示例__


```js
var stream = minioClient.listObjects('mybucket','', true)
stream.on('data', function(obj) { console.log(obj) } )
stream.on('error', function(err) { console.log(err) } )
```

<a name="listObjectsV2"></a>
### listObjectsV2(bucketName, prefix, recursive)

使用S3 listing objects V2版本API列出所有对象。

__参数__


| 参数  |  类型 | 描述  |
| ---- | ---- | ---- |
| `bucketName` | _string_ | 存储桶名称。 |
| `prefix`  | _string_  |  要列出的对象的前缀。（可选，默认值是`''`） |
| `recursive`  | _bool_  | `true`代表递归查找，`false`代表类似文件夹查找，以'/'分隔，不查子文件夹。（可选，默认值是`false`）  |


__返回值__

| 参数  |  类型 | 描述  |
| ---- | ---- | ---- |
| `stream` | _Stream_ | 存储桶中对象信息的流。 |

对象的格式如下：

| 参数  |  类型 | 描述  |
| ---- | ---- | ---- |
| `obj.name` | _string_ | 对象名称。 |
| `obj.prefix` | _string_ | 对象名称的前缀。 |
| `obj.size` | _number_ | 对象的大小。 |
| `obj.etag` | _string_ |对象的etag值。 |
| `obj.lastModified` | _Date_ | 最后修改时间。 |


__示例__


```js
var stream = minioClient.listObjectsV2('mybucket','', true)
stream.on('data', function(obj) { console.log(obj) } )
stream.on('error', function(err) { console.log(err) } )
```


<a name="listIncompleteUploads"></a>
### listIncompleteUploads(bucketName, prefix, recursive)

列出存储桶中未完整上传的对象。

__参数__


| 参数  |  类型 | 描述  |
| ---| ---|---|
| `bucketname`  | _string_  |  存储桶名称。 |
| `prefix`  | _string_  | 未完整上传的对象的前缀。（可选，默认值是`''`）。  |
| `recursive`  | _bool_  | `true`代表递归查找，`false`代表类似文件夹查找，以'/'分隔，不查子文件夹。（可选，默认值是`false`）  |


__返回值__


| 参数  |  类型 | 描述  |
| ---| ---|---|
| `stream`  | _Stream_  |  对象格式如下：|

| 参数  |  类型 | 描述  |
| ---| ---|---|
| `part.key`  | _string_  | 对象名称。|
| `part.uploadId`  | _string_  | 对象的上传ID。|
| `part.size`  | _Integer_  | 未完整上传的对象的大小。|

__示例__


```js
var Stream = minioClient.listIncompleteUploads('mybucket', '', true)
Stream.on('data', function(obj) {
  console.log(obj)
})
Stream.on('end', function() {
  console.log('End')
})
Stream.on('error', function(err) {
  console.log(err)
})
```

## 3.  操作对象

<a name="getObject"></a>
### getObject(bucketName, objectName[, callback])

下载对象。

__参数__


| 参数  |  类型 | 描述  |
|---|---|---|
|`bucketName` | _string_ | 存储桶名称。 |
|`objectName` | _string_ | 对象名称。 |
|`callback(err, stream)` | _function_ | 回调函数，第一个参数是错误信息。`stream`是对象的内容。如果没有传callback的话，则返回一个`Promise`对象。 |

__示例__


```js
var size = 0
minioClient.getObject('mybucket', 'photo.jpg', function(err, dataStream) {
  if (err) {
    return console.log(err)
  }
  dataStream.on('data', function(chunk) {
    size += chunk.length
  })
  dataStream.on('end', function() {
    console.log('End. Total size = ' + size)
  })
  dataStream.on('error', function(err) {
    console.log(err)
  })
})
```
<a name="getPartialObject"></a>
### getPartialObject(bucketName, objectName, offset, length[, callback])

下载对象中指定区间的字节数组，并返回流。

__参数__


| 参数  |  类型 | 描述  |
|---|---|---|
|  `bucketName` | _string_  | 存储桶名称。  |
| `objectName`   | _string_  | 对象名称。  |
| `offset`   | _number_  | `offset`是从第几个字节始  |
| `length`  | _number_  | `length`是要下载的字节数组长度（可选值，如果为空的话则代表从offset一直到文件的末尾）。  |
|`callback(err, stream)` | _function_  | 回调函数，第一个参数是错误信息。`stream`是对象的内容。如果没有传callback的话，则返回一个`Promise`对象。 |

__示例__


```js
var size = 0
// reads 30 bytes from the offset 10.
minioClient.getPartialObject('mybucket', 'photo.jpg', 10, 30, function(err, dataStream) {
  if (err) {
    return console.log(err)
  }
  dataStream.on('data', function(chunk) {
    size += chunk.length
  })
  dataStream.on('end', function() {
    console.log('End. Total size = ' + size)
  })
  dataStream.on('error', function(err) {
    console.log(err)
  })
})
```

<a name="fGetObject"></a>
### fGetObject(bucketName, objectName, filePath[, callback])

下载并将对象保存成本地文件。

__参数__

| 参数  |  类型 | 描述  |
|---|---|---|
| `bucketName`  | _string_   | 存储桶名称。  |
| `objectName`  |_string_   | 对象名称。  |
| `filePath`  |  _string_ | 要写入的本地文件路径。  |
| `callback(err)`  | _function_  | 如果报错的话，则会调用回调函数，传入`err`参数。 如果没有传callback的话，则返回一个`Promise`对象。 |


__示例__


```js
var size = 0
minioClient.fGetObject('mybucket', 'photo.jpg', '/tmp/photo.jpg', function(err) {
  if (err) {
    return console.log(err)
  }
  console.log('success')
})
```
<a name="putObject"></a>
### putObject(bucketName, objectName, stream, size, contentType[, callback])

从一个stream/Buffer中上传一个对象。

##### 从stream中上传

__参数__


| 参数  |  类型 | 描述  |
|---|---|---|
| `bucketName`  |_string_   | 存储桶名称。  |
| `objectName`  |_string_   | 对象名称。  |
| `stream`  | _Stream_  |可以读的流。   |
|`size`   | _number_  | 对象的大小（可选）。  |
|`contentType`   | _string_  | 对象的Content-Type（可选，默认是`application/octet-stream`）。|
| `callback(err, etag)` | _function_ | 如果`err`不是null则代表有错误，`etag` _string_是上传的对象的etag值。如果没有传callback的话，则返回一个`Promise`对象。 |


__示例__

单个对象的最大大小限制在5TB。putObject在对象大于5MiB时，自动使用multiple parts方式上传。这样的话，当上传失败的时候，客户端只需要上传未成功的部分即可（类似断点上传）。上传的对象使用MD5SUM签名进行完整性验证。

```js
var Fs = require('fs')
var file = '/tmp/40mbfile'
var fileStream = Fs.createReadStream(file)
var fileStat = Fs.stat(file, function(err, stats) {
  if (err) {
    return console.log(err)
  }
  minioClient.putObject('mybucket', '40mbfile', fileStream, stats.size, function(err, etag) {
    return console.log(err, etag) // err should be null
  })
})
```

##### 从"Buffer"或者"string"上传

__参数__


| 参数  |  类型 | 描述  |
|---|---|---|
| `bucketName`  |_string_   | 存储桶名称。  |
| `objectName`  |_string_   | 对象名称。  |
|`string or Buffer`   | _Stream_ or _Buffer_  |字符串可者缓冲区   |
| `contentType`  | _string_   | 对象的Content-Type（可选，默认是`application/octet-stream`）。 |
| `callback(err, etag)`  | _function_  |如果`err`不是null则代表有错误，`etag` _string_是上传的对象的etag值。 |


__示例__


```js
var buffer = 'Hello World'
minioClient.putObject('mybucket', 'hello-file', buffer, function(err, etag) {
  return console.log(err, etag) // err should be null
})
```
<a name="fPutObject"></a>
### fPutObject(bucketName, objectName, filePath, contentType[, callback])

上传文件。

__参数__


| 参数  |  类型 | 描述  |
|---|---|---|
| `bucketName`  | _string_  | 存储桶名称。  |
|`objectName`   |_string_   | 对象名称。  |
| `filePath`  | _string_  | 要上传的文件路径。  |
| `contentType`  | _string_  | 对象的Content-Type。  |
| `callback(err, etag)`  |  _function_ | 如果`err`不是null则代表有错误，`etag` _string_是上传的对象的etag值。如果没有传callback的话，则返回一个`Promise`对象。 |

__示例__


```js
var file = '/tmp/40mbfile'
minioClient.fPutObject('mybucket', '40mbfile', file, 'application/octet-stream', function(err, etag) {
  return console.log(err, etag) // err should be null
})
```

<a name="copyObject"></a>
### copyObject(bucketName, objectName, sourceObject, conditions[, callback])

将源对象拷贝到指定存储桶的新对象中。

__参数__


| 参数  |  类型 | 描述  |
|---|---|---|
| `bucketName`  | _string_  | 存储桶名称。  |
|`objectName`   |_string_   | 对象名称。  |
| `sourceObject`  | _string_  | 源对象的名称  |
| `conditions`  | _CopyConditions_  | 允许拷贝需要满足的条件。  |
| `callback(err, {etag, lastModified})`  |  _function_ | 如果`err`不是null则代表有错误，`etag` _string_是上传的对象的etag值，lastModified _Date_是新拷贝对象的最后修改时间。如果没有传callback的话，则返回一个`Promise`对象。 |

__示例__

```js
var conds = new Minio.CopyConditions()
conds.setMatchETag('bd891862ea3e22c93ed53a098218791d')
minioClient.copyObject('mybucket', 'newobject', '/mybucket/srcobject', conds, function(e, data) {
  if (e) {
    return console.log(e)
  }
  console.log("Successfully copied the object:")
  console.log("etag = " + data.etag + ", lastModified = " + data.lastModified)
})
```


<a name="statObject"></a>
### statObject(bucketName, objectName[, callback])

获取对象的元数据。

__参数__


| 参数  |  类型 | 描述  |
|---|---|---|
| `bucketName`  | _string_  | 存储桶名称。  |
| `objectName`  | _string_  | 对象名称。  |
| `callback(err, stat)`  | _function_  |如果`err`不是null则代表有错误，`stat`含有对象的元数据信息，格式如下所示。如果没有传callback的话，则返回一个`Promise`对象。 |



| 参数  |  类型 | 描述  |
|---|---|---|
| `stat.size`  | _number_  | 对象的大小。  |
| `stat.etag`  | _string_  | 对象的etag值。  |
| `stat.contentType`  | _string_  | 对象的Content-Type。|
| `stat.lastModified`  | _string_  | Last 最后修改时间。|


__示例__


```js
minioClient.statObject('mybucket', 'photo.jpg', function(err, stat) {
  if (err) {
    return console.log(err)
  }
  console.log(stat)
})
```

<a name="removeObject"></a>
### removeObject(bucketName, objectName[, callback])

删除一个对象。

__参数__


| 参数  |  类型 | 描述  |
|---|---|---|
|`bucketName`   |  _string_ | 存储桶名称。  |
| objectName  |  _string_ | 对象名称。  |
| `callback(err)`  | _function_  | 如果`err`不是null则代表有错误。如果没有传callback的话，则返回一个`Promise`对象。 |


__示例__


```js
try {
  await minioClient.removeObject('mybucket', 'photo.jpg')
  console.log('Removed the object')
} catch (err) {
  console.log('Unable to remove object', err)
}
```

<a name="removeIncompleteUpload"></a>
### removeIncompleteUpload(bucketName, objectName[, callback])

删除一个未完整上传的对象。

__参数__


| 参数  |  类型 | 描述  |
|---|---|---|
| `bucketName`  |_string_   | 存储桶名称。  |
| `objectName`  | _string_  | 对象名称。  |
| `callback(err)`  | _function_  |如果`err`不是null则代表有错误。如果没有传callback的话，则返回一个`Promise`对象。  |


__示例__


```js
minioClient.removeIncompleteUpload('mybucket', 'photo.jpg', function(err) {
  if (err) {
    return console.log('Unable to remove incomplete object', err)
  }
  console.log('Incomplete object removed successfully.')
})
```

## 4. Presigned操作

Presigned URLs用于对私有对象提供临时的上传/下载功能。

<a name="presignedUrl"></a>
### presignedUrl(httpMethod, bucketName, objectName, expiry[, reqParams, cb])

生成一个给指定HTTP方法（'httpMethod'）请求用的presigned URL。浏览器/移动端的客户端可以用这个URL进行下载，即使其所在的存储桶是私有的。这个presigned URL可以设置一个失效时间，默认值是7天。


__参数__



|参数   | 类型	  | 描述  |
|---|---|---|
|`httpMethod` | _string_ | http方法，put、get等。 |
|`bucketName` | _string_ | 存储桶名称。 |
|`objectName` | _string_ | 对象名称。 |
|`expiry`     | _number_ | 失效时间（以秒为单位），默认是7天，不得大于七天。 |
|`reqParams`  | _object_ | 请求参数。 |
|`callback(err, presignedUrl)` | _function_ | 如果`err`不是null则代表有错误。`presignedUrl`就是可临时上传/下载文件的URL。如果没有传callback的话，则返回一个`Promise`对象。 |


__示例1__


```js
// presigned url for 'getObject' method.
// expires in a day.
minioClient.presignedUrl('GET', 'mybucket', 'hello.txt', 24*60*60, function(err, presignedUrl) {
  if (err) return console.log(err)
  console.log(presignedUrl)
})
```


__示例2__


```js
// presigned url for 'listObject' method.
// Lists objects in 'myBucket' with prefix 'data'.
// Lists max 1000 of them.
minioClient.presignedUrl('GET', 'mybucket', '', 1000, {'prefix': 'data', 'max-keys': 1000}, function(err, presignedUrl) {
  if (err) return console.log(err)
  console.log(presignedUrl)
})
```

<a name="presignedGetObject"></a>
### presignedGetObject(bucketName, objectName, expiry[, cb])

生成一个给HTTP GET请求用的presigned URL。浏览器/移动端的客户端可以用这个URL进行下载，即使其所在的存储桶是私有的。这个presigned URL可以设置一个失效时间，默认值是7天。


__参数__



| 参数  |  类型 | 描述  |
|---|---|---|
|`bucketName` | _string_ | 存储桶名称。 |
|`objectName` | _string_ | 对象名称。 |
|`expiry`     | _number_ | 失效时间（以秒为单位），默认是7天，不得大于七天。 |
|`callback(err, presignedUrl)` | _function_ | 如果`err`不是null则代表有错误。`presignedUrl`就是可用于临时下载的URL。 如果没有传callback的话，则返回一个`Promise`对象。 |


__示例__


```js
// expires in a day.
minioClient.presignedGetObject('mybucket', 'hello.txt', 24*60*60, function(err, presignedUrl) {
  if (err) return console.log(err)
  console.log(presignedUrl)
})
```

<a name="presignedPutObject"></a>
### presignedPutObject(bucketName, objectName, expiry[, callback])

生成一个给HTTP PUT请求用的presigned URL。浏览器/移动端的客户端可以用这个URL进行上传，即使其所在的存储桶是私有的。这个presigned URL可以设置一个失效时间，默认值是7天。


__参数__


| 参数  |  类型 | 描述  |
|---|---|---|
|`bucketName` | _string_ | 存储桶名称。 |
|`objectName` | _string_ | 对象名称。 |
|`expiry`     | _number_ | 失效时间（以秒为单位），默认是7天，不得大于七天。 |
|`callback(err, presignedUrl)` | _function_ | 如果`err`不是null则代表有错误。`presignedUrl`用于使用PUT请求进行上传。如果没有传callback的话，则返回一个`Promise`对象。 |


__示例__


```js
// expires in a day.
minioClient.presignedPutObject('mybucket', 'hello.txt', 24*60*60, function(err, presignedUrl) {
  if (err) return console.log(err)
  console.log(presignedUrl)
})
```

<a name="presignedPostPolicy"></a>
### presignedPostPolicy(policy[, callback])

允许给POST请求的presigned URL设置条件策略。比如接收上传的存储桶名称、名称前缀、过期策略。

__参数__


| 参数  |  类型 | 描述  |
|---|---|---|
| `policy`  | _object_  | 通过minioClient.newPostPolicy()创建的Policy对象。 |
| `callback(err, {postURL, formData})`  | _function_  |如果`err`不是null则代表有错误。`postURL`用于使用post请求上传。`formData`是POST请求体中的键值对对象。如果没有传callback的话，则返回一个`Promise`对象。 |


创建策略：


```js
var policy = minioClient.newPostPolicy()
```

设置上传策略：

```js
// Policy restricted only for bucket 'mybucket'.
policy.setBucket('mybucket')

// Policy restricted only for hello.txt object.
policy.setKey('hello.txt')
```
或者

```js
// Policy restricted for incoming objects with keyPrefix.
policy.setKeyStartsWith('keyPrefix')

var expires = new Date
expires.setSeconds(24 * 60 * 60 * 10)
// Policy expires in 10 days.
policy.setExpires(expires)

// Only allow 'text'.
policy.setContentType('text/plain')

// Set content disposition response header.
policy.setContentDisposition('attachment; filename=text.txt')

// Only allow content size in range 1KB to 1MB.
policy.setContentLengthRange(1024, 1024*1024)

// Set key-value user defined metadata
policy.setUserMetaData({
  key: 'value'
})
```

使用`superagent`通过浏览器POST你的数据：


```js
minioClient.presignedPostPolicy(policy, function(err, data) {
  if (err) return console.log(err)

  var req = superagent.post(data.postURL)
  _.each(data.formData, function(value, key) {
    req.field(key, value)
  })

  // file contents.
  req.attach('file', '/path/to/hello.txt', 'hello.txt')

  req.end(function(err, res) {
    if (err) {
      return console.log(err.toString())
    }
    console.log('Upload successful.')
  })
})
```

## 5. 存储桶策略/通知

存储桶可以配置在指定事件类型和相应路径上触发通知。

<a name="getBucketNotification"></a>
### getBucketNotification(bucketName[, cb])

获取指定存储桶名称的通知配置。

__参数__



| 参数  |  类型 | 描述  |
|---|---|---|
| `bucketName`  | _string_  | 存储桶名称。  |
| `callback(err, bucketNotificationConfig)`  | _function_  | 如果`err`不是null则代表有错误。`bucketNotificationConfig`是相应存储桶上的通知配置对象。如果没有传callback的话，则返回一个`Promise`对象。 |


__示例__


```js
minioClient.getBucketNotification('mybucket', function(err, bucketNotificationConfig) {
  if (err) return console.log(err)
  console.log(bucketNotificationConfig)
})
```

<a name="setBucketNotification"></a>
### setBucketNotification(bucketName, bucketNotificationConfig[, callback])

上传一个用户创建的通知配置，并绑定到指定的存储桶上。


__参数__


| 参数  |  类型 | 描述  |
|---|---|---|
| `bucketName`  | _string_  | 存储桶名称。  |
| `bucketNotificationConfig`  | _BucketNotification_   | 包含通知配置的Javascript对象。 |
| `callback(err)`  | _function_  | 如果`err`不是null则代表有错误。如果没有传callback的话，则返回一个`Promise`对象。 |


__示例__

```js
// Create a new notification object
var bucketNotification = new Minio.NotificationConfig();

// Setup a new Queue configuration
var arn = Minio.buildARN('aws', 'sqs', 'us-west-2', '1', 'webhook')
var queue = new Minio.QueueConfig(arn)
queue.addFilterSuffix('.jpg')
queue.addFilterPrefix('myphotos/')
queue.addEvent(Minio.ObjectReducedRedundancyLostObject)
queue.addEvent(Minio.ObjectCreatedAll)

// Add the queue to the overall notification object
bucketNotification.add(queue)

minioClient.setBucketNotification('mybucket', bucketNotification, function(err) {
  if (err) return console.log(err)
  console.log('Success')
})
```

<a name="removeAllBucketNotification"></a>
### removeAllBucketNotification(bucketName[, callback])

删除指定存储桶上的通知配置。

__参数__


| 参数  |  类型 | 描述  |
|---|---|---|
| `bucketName`  | _string_  | 存储桶名称。 |
| `callback(err)`  | _function_  | 如果`err`不是null则代表有错误。如果没有传callback的话，则返回一个`Promise`对象。 |


```js
minioClient.removeAllBucketNotification('my-bucketname', function(e) {
  if (e) {
    return console.log(e)
  }
  console.log("True")
})
```

<a name="listenBucketNotification"></a>
### listenBucketNotification(bucketName, prefix, suffix, events)

监听存储桶上的通知，可通过前缀、后缀、事件类型进行过滤。使用本API并不需要预先设置存储桶通知。这是Minio的一个扩展API，服务端基于过来的请求使用唯一ID自动注册或者取消注册。

返回一个`EventEmitter`对象，它可以广播一个`通知`事件。

停止监听，调用`EventEmitter`的`stop()`方法。

__参数__

| 参数  |  类型 | 描述  |
|---|---|---|
| `bucketName`  | _string_  | 存储桶名称。 |
| `prefix`  | _string_  | 用于过滤通知的对象名称前缀。 |
| `suffix`  | _string_  | 用于过滤通知的对象名称后缀。 |
| `events`  | _Array_ | 在指定事件类型上开启通知。 |

这里是你要的[完整示例](https://github.com/minio/minio-js/blob/master/examples/minio/listen-bucket-notification.js)，拿走不谢。

```js
var listener = minioClient.listenBucketNotification('my-bucketname', 'photos/', '.jpg', ['s3:ObjectCreated:*'])
listener.on('notification', function(record) {
  // For example: 's3:ObjectCreated:Put event occurred (2016-08-23T18:26:07.214Z)'
  console.log('%s event occurred (%s)', record.eventName, record.eventTime)
  listener.stop()
})
```

<a name="getBucketPolicy"></a>
### getBucketPolicy(bucketName, objectPrefix[, callback])

获取指定存储桶的访问策略，如果`objectPrefix`不为空，则会取相应对象前缀上的访问策略。

__参数__


| 参数  |  类型 | 描述  |
|---|---|---|
| `bucketName`  | _string_  | 存储桶名称。 |
| `objectPrefix` | _string_ | 用于过滤的对象前缀，`''`代表整个存储桶。 |
| `callback(err, policy)`  | _function_  | 如果`err`不是null则代表有错误。`policy`是存储桶策略的字符串表示(`minio.Policy.NONE`，`minio.Policy.READONLY`，`minio.Policy.WRITEONLY`，或者`minio.Policy.READWRITE`). 如果没有传callback的话，则返回一个`Promise`对象。 |


```js
// Retrieve bucket policy of 'my-bucketname' that applies to all objects that
// start with 'img-'.
minioClient.getBucketPolicy('my-bucketname', 'img-', function(err, policy) {
  if (err) throw err

  console.log(`Bucket policy: ${policy}`)
})
```

<a name="setBucketPolicy"></a>
### async setBucketPolicy(bucketName, objectPrefix, bucketPolicy): Promise<void>

设置指定存储桶的策略。如果`objectPrefix`不为空，则会给符合该前缀的对象（们）设置策略。

__参数__


| 参数  |  类型 | 描述  |
|---|---|---|
| `bucketName`  | _string_  | 存储桶名称。 |
| `objectPrefix` | _string_ | 要设置访问策略的对象前缀。`''`代表整个存储桶。 |
| `bucketPolicy` | _string_ | 存储桶策略。可选值有：`minio.Policy.NONE`，`minio.Policy.READONLY`，`minio.Policy.WRITEONLY`或者`minio.Policy.READWRITE`。 |


```js
// Set the bucket policy of `my-bucketname` to `readonly` (only allow retrieval),
// but only for objects that start with 'img-'.
await minioClient.setBucketPolicy('my-bucketname', 'img-', minio.Policy.READONLY)
```


## 6. 了解更多


- [创建属于你的购物APP示例](https://github.com/minio/minio-js-store-app)
