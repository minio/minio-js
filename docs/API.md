# JavaScript Client API Reference [![Slack](https://slack.min.io/slack?type=svg)](https://slack.min.io)

## Initialize MinIO Client object.

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
| Bucket operations       | Object operations      | Presigned operations | Bucket Policy & Notification operations |
| ------------- |-------------| -----| ----- |
| [`makeBucket`](#makeBucket)    | [`getObject`](#getObject) | [`presignedUrl`](#presignedUrl) | [`getBucketNotification`](#getBucketNotification) |
| [`listBuckets`](#listBuckets)  | [`getPartialObject`](#getPartialObject)    |   [`presignedGetObject`](#presignedGetObject) | [`setBucketNotification`](#setBucketNotification) |
| [`bucketExists`](#bucketExists) | [`fGetObject`](#fGetObject)    |    [`presignedPutObject`](#presignedPutObject) | [`removeAllBucketNotification`](#removeAllBucketNotification) |
| [`removeBucket`](#removeBucket)      | [`putObject`](#putObject) |    [`presignedPostPolicy`](#presignedPostPolicy) | [`getBucketPolicy`](#getBucketPolicy) |  |
| [`listObjects`](#listObjects) | [`fPutObject`](#fPutObject)   |   |   [`setBucketPolicy`](#setBucketPolicy)
| [`listObjectsV2`](#listObjectsV2) | [`copyObject`](#copyObject) | | [`listenBucketNotification`](#listenBucketNotification)|
| [`listIncompleteUploads`](#listIncompleteUploads) |  [`statObject`](#statObject) |
|     |  [`removeObject`](#removeObject)    |
|     |  [`removeObjects`](#removeObjects)    |
|  | [`removeIncompleteUpload`](#removeIncompleteUpload)  |



## 1.  Constructor

<a name="MinioClient_endpoint"></a>
###  new Minio.Client ({endPoint, port, useSSL, accessKey, secretKey, region, transport, sessionToken, partSize})

|     |
| ---- |
|``new Minio.Client ({endPoint, port, useSSL, accessKey, secretKey, region, transport, sessionToken, partSize})``|
|Initializes a new client object.|

__Parameters__

| Param  | Type  | Description  |
|---|---|---|
| `endPoint`  |  _string_ | endPoint is a host name or an IP address. |
| `port` | _number_  | TCP/IP port number. This input is optional. Default value set to 80 for HTTP and 443 for HTTPs. |
|`useSSL`    | _bool_    |If set to true, https is used instead of http. Default is true. |
|`accessKey`   | _string_   |accessKey is like user-id that uniquely identifies your account. |
|`secretKey`  |  _string_   | secretKey is the password to your account.|
|`region`    | _string_  |Set this value to override region cache. (Optional)|
|`transport`    | _string_  |Set this value to pass in a custom transport. (Optional)|
|`sessionToken`    | _string_  |Set this value to provide x-amz-security-token (AWS S3 specific). (Optional)|
|`partSize`    | _number_  |Set this value to override default part size of 64MB for multipart uploads. (Optional)|


__Example__

## Create client for MinIO

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

## Create client for AWS S3


```js
var Minio = require('minio')

var s3Client = new Minio.Client({
    endPoint:  's3.amazonaws.com',
    accessKey: 'YOUR-ACCESSKEYID',
    secretKey: 'YOUR-SECRETACCESSKEY'
})
```


## 2. Bucket operations
<a name="makeBucket"></a>

### makeBucket(bucketName, region[, callback])

Creates a new bucket.

__Parameters__

| Param  | Type  | Description  |
|---|---|---|
|`bucketName`  | _string_  | Name of the bucket. |
| `region`  |  _string_ | Region where the bucket is created. This parameter is optional. Default value is us-east-1. |
|`callback(err)`  |_function_   | Callback function with `err` as the error argument. `err` is null if the bucket is successfully created. If no callback is passed, a `Promise` is returned. |


__Example__


```js
minioClient.makeBucket('mybucket', 'us-east-1', function(err) {
  if (err) return console.log('Error creating bucket.', err)
  console.log('Bucket created successfully in "us-east-1".')
})
```

<a name="listBuckets"></a>
### listBuckets([callback])

Lists all buckets.


__Parameters__


| Param  | Type  | Description  |
|---|---|---|
|`callback(err, bucketStream) `  | _function_  | Callback function with error as the first argument. `bucketStream` is the stream emitting bucket information. If no callback is passed, a `Promise` is returned. |

bucketStream emits Object with the format:-

| Param  | Type  | Description  |
|---|---|---|
|`bucket.name`  | _string_ |bucket name |
|`bucket.creationDate`| _Date_ |date when bucket was created.  |



__Example__


```js
minioClient.listBuckets(function(err, buckets) {
  if (err) return console.log(err)
  console.log('buckets :', buckets)
})
```

<a name="bucketExists"></a>
#### bucketExists(bucketName[, callback])

Checks if a bucket exists.


__Parameters__


| Param  | Type  | Description  |
|---|---|---|
| `bucketName`  |  _string_ | Name of the bucket.  |
| `callback(err, exists)`  | _function_  | `exists` is a boolean which indicates whether `bucketName` exists or not. `err` is set when an error occurs during the operation. If no callback is passed, a `Promise` is returned. |

__Example__


```js
minioClient.bucketExists('mybucket', function(err, exists) {
  if (err) {
    return console.log(err)
  }
  if (exists) {
    return console.log('Bucket exists.')
  }
})
```

<a name="removeBucket"></a>
### removeBucket(bucketName[, callback])

Removes a bucket.

__Parameters__


| Param  |  Type | Description  |
|---|---|---|
| `bucketName`  | _string_  | Name of the bucket.  |
| `callback(err)`  | _function_  |  `err` is `null` if the bucket is removed successfully. If no callback is passed, a `Promise` is returned. |

__Example__


```js
minioClient.removeBucket('mybucket', function(err) {
  if (err) return console.log('unable to remove bucket.')
  console.log('Bucket removed successfully.')
})
```

<a name="listObjects"></a>
### listObjects(bucketName, prefix, recursive)

Lists all objects in a bucket.

__Parameters__


| Param | Type | Description |
| ---- | ---- | ---- |
| `bucketName` | _string_ | Name of the bucket. |
| `prefix`  | _string_  |  The prefix of the objects that should be listed (optional, default `''`). |
| `recursive`  | _bool_  | `true` indicates recursive style listing and `false` indicates directory style listing delimited by '/'. (optional, default `false`).  |


__Return Value__


| Param | Type | Description |
| ---- | ---- | ---- |
| `stream` | _Stream_ | Stream emitting the objects in the bucket. |

The object is of the format:

| Param | Type | Description |
| ---- | ---- | ---- |
| `obj.name` | _string_ | name of the object. |
| `obj.prefix` | _string_ | name of the object prefix. |
| `obj.size` | _number_ | size of the object. |
| `obj.etag` | _string_ |etag of the object. |
| `obj.lastModified` | _Date_ | modified time stamp. |

__Example__


```js
var stream = minioClient.listObjects('mybucket','', true)
stream.on('data', function(obj) { console.log(obj) } )
stream.on('error', function(err) { console.log(err) } )
```

<a name="listObjectsV2"></a>
### listObjectsV2(bucketName, prefix, recursive, startAfter)

Lists all objects in a bucket using S3 listing objects V2 API

__Parameters__


| Param | Type | Description |
| ---- | ---- | ---- |
| `bucketName` | _string_ | Name of the bucket. |
| `prefix`  | _string_  |  The prefix of the objects that should be listed (optional, default `''`). |
| `recursive`  | _bool_  | `true` indicates recursive style listing and `false` indicates directory style listing delimited by '/'. (optional, default `false`).  |
| `startAfter`  | _string_  |  Specifies the object name to start after when listing objects in a bucket. (optional, default `''`). |


__Return Value__

| Param | Type | Description |
| ---- | ---- | ---- |
| `stream` | _Stream_ | Stream emitting the objects in the bucket. |

The object is of the format:

| Param | Type | Description |
| ---- | ---- | ---- |
| `obj.name` | _string_ | name of the object. |
| `obj.prefix` | _string_ | name of the object prefix. |
| `obj.size` | _number_ | size of the object. |
| `obj.etag` | _string_ |etag of the object. |
| `obj.lastModified` | _Date_ | modified time stamp. |


__Example__


```js
var stream = minioClient.listObjectsV2('mybucket','', true,'')
stream.on('data', function(obj) { console.log(obj) } )
stream.on('error', function(err) { console.log(err) } )
```

<a name="listObjectsV2WithMetadata"></a>
### listObjectsV2WithMetadata(bucketName, prefix, recursive, startAfter)

Lists all objects and their metadata in a bucket using S3 listing objects V2 API

__Parameters__


| Param | Type | Description |
| ---- | ---- | ---- |
| `bucketName` | _string_ | Name of the bucket. |
| `prefix`  | _string_  |  The prefix of the objects that should be listed (optional, default `''`). |
| `recursive`  | _bool_  | `true` indicates recursive style listing and `false` indicates directory style listing delimited by '/'. (optional, default `false`).  |
| `startAfter`  | _string_  |  Specifies the object name to start after when listing objects in a bucket. (optional, default `''`). |


__Return Value__

| Param | Type | Description |
| ---- | ---- | ---- |
| `stream` | _Stream_ | Stream emitting the objects in the bucket. |

The object is of the format:

| Param | Type | Description |
| ---- | ---- | ---- |
| `obj.name` | _string_ | name of the object. |
| `obj.prefix` | _string_ | name of the object prefix. |
| `obj.size` | _number_ | size of the object. |
| `obj.etag` | _string_ |etag of the object. |
| `obj.lastModified` | _Date_ | modified time stamp. |
| `obj.metadata` | _object_ | metadata of the object. |


__Example__


```js
var stream = minioClient.extensions.listObjectsV2('mybucket','', true,'')
stream.on('data', function(obj) { console.log(obj) } )
stream.on('error', function(err) { console.log(err) } )
```

<a name="listIncompleteUploads"></a>
### listIncompleteUploads(bucketName, prefix, recursive)

Lists partially uploaded objects in a bucket.

__Parameters__


| Param  |  Type | Description  |
| ---| ---|---|
| `bucketname`  | _string_  |  Name of the bucket. |
| `prefix`  | _string_  | Prefix of the object names that are partially uploaded. (optional, default `''`)  |
| `recursive`  | _bool_  | `true` indicates recursive style listing and `false` indicates directory style listing delimited by '/'. (optional, default `false`).  |


__Return Value__


| Param  |  Type | Description  |
| ---| ---|---|
| `stream`  | _Stream_  |  Emits objects of the format listed below:|

| Param  |  Type | Description  |
| ---| ---|---|
| `part.key`  | _string_  | name of the object.|
| `part.uploadId`  | _string_  | upload ID of the object.|
| `part.size`  | _Integer_  | size of the partially uploaded object.|

__Example__


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

## 3.  Object operations

<a name="getObject"></a>
### getObject(bucketName, objectName[, callback])

Downloads an object as a stream.

__Parameters__


| Param  |  Type | Description  |
|---|---|---|
|`bucketName` | _string_ | Name of the bucket. |
|`objectName` | _string_ | Name of the object. |
|`callback(err, stream)` | _function_ | Callback is called with `err` in case of error. `stream` is the object content stream. If no callback is passed, a `Promise` is returned. |

__Example__


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

Downloads the specified range bytes of an object as a stream.

__Parameters__


| Param  |  Type | Description  |
|---|---|---|
|  `bucketName` | _string_  | Name of the bucket.  |
| `objectName`   | _string_  | Name of the object.  |
| `offset`   | _number_  | `offset` of the object from where the stream will start.  |
| `length`  | _number_  | `length` of the object that will be read in the stream (optional, if not specified we read the rest of the file from the offset).  |
|`callback(err, stream)` | _function_  | Callback is called with `err` in case of error. `stream` is the object content stream. If no callback is passed, a `Promise` is returned. |

__Example__


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

Downloads and saves the object as a file in the local filesystem.

__Parameters__

| Param  |  Type | Description  |
|---|---|---|
| `bucketName`  | _string_   | Name of the bucket.  |
| `objectName`  |_string_   | Name of the object.  |
| `filePath`  |  _string_ | Path on the local filesystem to which the object data will be written.  |
| `callback(err)`  | _function_  | Callback is called with `err` in case of error. If no callback is passed, a `Promise` is returned. |


__Example__


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
### putObject(bucketName, objectName, stream, size, metaData[, callback])

Uploads an object from a stream/Buffer.


##### From a stream

__Parameters__


| Param  |  Type | Description  |
|---|---|---|
| `bucketName`  |_string_   | Name of the bucket.  |
| `objectName`  |_string_   | Name of the object.  |
| `stream`  | _Stream_  |Readable stream.   |
|`size`   | _number_  | Size of the object (optional).  |
|`metaData`   | _Javascript Object_  | metaData of the object (optional).  |
| `callback(err, etag)` | _function_ | Non-null `err` indicates error, `etag` _string_ is the etag of the object uploaded. If no callback is passed, a `Promise` is returned. |


__Example__

The maximum size of a single object is limited to 5TB. putObject transparently uploads objects larger than 64MiB in multiple parts. Uploaded data is carefully verified using MD5SUM signatures.

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

##### From a "Buffer" or a "string"

__Parameters__


| Param  |  Type | Description  |
|---|---|---|
| `bucketName`  |_string_   | Name of the bucket.  |
| `objectName`  |_string_   | Name of the object.  |
|`string or Buffer`   | _Stream_ or _Buffer_  |Readable stream.   |
| `metaData`  | _Javascript Object_   | metaData of the object (optional).  |
| `callback(err, etag)`  | _function_  |Non-null `err` indicates error, `etag` _string_ is the etag of the object uploaded.   |


__Example__


```js
var buffer = 'Hello World'
minioClient.putObject('mybucket', 'hello-file', buffer, function(err, etag) {
  return console.log(err, etag) // err should be null
})
```
<a name="fPutObject"></a>
### fPutObject(bucketName, objectName, filePath, metaData[, callback])

Uploads contents from a file to objectName.

__Parameters__


| Param  |  Type | Description  |
|---|---|---|
| `bucketName`  | _string_  | Name of the bucket.  |
|`objectName`   |_string_   | Name of the object.  |
| `filePath`  | _string_  | Path of the file to be uploaded.  |
| `metaData`  | _Javascript Object_  | Metadata of the object.  |
| `callback(err, etag)`  |  _function_ | Non-null `err` indicates error, `etag` _string_ is the etag of the object uploaded. If no callback is passed, a `Promise` is returned. |

__Example__


The maximum size of a single object is limited to 5TB. fPutObject transparently uploads objects larger than 64MiB in multiple parts. Uploaded data is carefully verified using MD5SUM signatures.

```js
var file = '/tmp/40mbfile'
var metaData = {
  'Content-Type': 'text/html',
  'Content-Language': 123,
  'X-Amz-Meta-Testing': 1234,
  'example': 5678
}
minioClient.fPutObject('mybucket', '40mbfile', file, metaData, function(err, etag) {
  return console.log(err, etag) // err should be null
})
```

<a name="copyObject"></a>
### copyObject(bucketName, objectName, sourceObject, conditions[, callback])

Copy a source object into a new object in the specified bucket.

__Parameters__


| Param  |  Type | Description  |
|---|---|---|
| `bucketName`  | _string_  | Name of the bucket.  |
|`objectName`   |_string_   | Name of the object.  |
| `sourceObject`  | _string_  | Path of the file to be copied.  |
| `conditions`  | _CopyConditions_  | Conditions to be satisfied before allowing object copy.  |
| `callback(err, {etag, lastModified})`  |  _function_ | Non-null `err` indicates error, `etag` _string_ and lastModified _Date_ are the etag and the last modified date of the object newly copied. If no callback is passed, a `Promise` is returned. |

__Example__

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

Gets metadata of an object.

__Parameters__


| Param  |  Type | Description  |
|---|---|---|
| `bucketName`  | _string_  | Name of the bucket.  |
| `objectName`  | _string_  | Name of the object.  |
| `callback(err, stat)`  | _function_  |`err` is not `null` in case of error, `stat` contains the object information listed below. If no callback is passed, a `Promise` is returned. |



| Param  |  Type | Description  |
|---|---|---|
| `stat.size`  | _number_  | size of the object.  |
| `stat.etag`  | _string_  | etag of the object.  |
| `stat.metaData`  | _Javascript Object_  | metadata of the object.|
| `stat.lastModified`  | _Date_  | Last Modified time stamp.|


__Example__


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

Removes an object.

__Parameters__


| Param  |  Type | Description  |
|---|---|---|
|`bucketName`   |  _string_ | Name of the bucket.  |
| objectName  |  _string_ | Name of the object.  |
| `callback(err)`  | _function_  | Callback function is called with non `null` value in case of error. If no callback is passed, a `Promise` is returned. |


__Example__


```js
minioClient.removeObject('mybucket', 'photo.jpg', function(err) {
  if (err) {
    return console.log('Unable to remove object', err)
  }
  console.log('Removed the object')
})
```

<a name="removeObjects"></a>
### removeObjects(bucketName, objectsList[, callback])

Remove all objects in the objectsList.

__Parameters__


| Param | Type | Description |
| ---- | ---- | ---- |
| `bucketName` | _string_ | Name of the bucket. |
| `objectsList`  | _object_  |  list of objects in the bucket to be removed.  |
| `callback(err)`  | _function_  | Callback function is called with non `null` value in case of error. |


__Example__


```js

var objectsList = []

// List all object paths in bucket my-bucketname.
var objectsStream = s3Client.listObjects('my-bucketname', 'my-prefixname', true)

objectsStream.on('data', function(obj) {
  objectsList.push(obj.name);
})

objectsStream.on('error', function(e) {
  console.log(e);
})

objectsStream.on('end', function() {

  s3Client.removeObjects('my-bucketname',objectsList, function(e) {
    if (e) {
        return console.log('Unable to remove Objects ',e)
    }
    console.log('Removed the objects successfully')
  })

})


```

<a name="removeIncompleteUpload"></a>
### removeIncompleteUpload(bucketName, objectName[, callback])

Removes a partially uploaded object.

__Parameters__


| Param  |  Type | Description  |
|---|---|---|
| `bucketName`  |_string_   | Name of the bucket.  |
| `objectName`  | _string_  | Name of the object.  |
| `callback(err)`  | _function_  |Callback function is called with non `null` value in case of error. If no callback is passed, a `Promise` is returned.  |


__Example__


```js
minioClient.removeIncompleteUpload('mybucket', 'photo.jpg', function(err) {
  if (err) {
    return console.log('Unable to remove incomplete object', err)
  }
  console.log('Incomplete object removed successfully.')
})
```

## 4. Presigned operations

Presigned URLs are generated for temporary download/upload access to private objects.

<a name="presignedUrl"></a>
### presignedUrl(httpMethod, bucketName, objectName[, expiry, reqParams, requestDate, cb])

Generates a presigned URL for the provided HTTP method, 'httpMethod'. Browsers/Mobile clients may point to this URL to directly download objects even if the bucket is private. This presigned URL can have an associated expiration time in seconds after which the URL is no longer valid. The default value is 7 days.


__Parameters__



| Param | Type | Description  |
|---|---|---|
|`bucketName` | _string_ | Name of the bucket. |
|`objectName` | _string_ | Name of the object. |
|`expiry`     | _number_ | Expiry time in seconds. Default value is 7 days. (optional) |
|`reqParams`  | _object_ | request parameters. (optional) |
|`requestDate`  | _Date_ | A date object, the url will be issued at. Default value is now. (optional) |
|`callback(err, presignedUrl)` | _function_ | Callback function is called with non `null` err value in case of error. `presignedUrl` will be the URL using which the object can be downloaded using GET request. If no callback is passed, a `Promise` is returned. |


__Example 1__


```js
// presigned url for 'getObject' method.
// expires in a day.
minioClient.presignedUrl('GET', 'mybucket', 'hello.txt', 24*60*60, function(err, presignedUrl) {
  if (err) return console.log(err)
  console.log(presignedUrl)
})
```


__Example 2__


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
### presignedGetObject(bucketName, objectName[, expiry, respHeaders, requestDate, cb])

Generates a presigned URL for HTTP GET operations. Browsers/Mobile clients may point to this URL to directly download objects even if the bucket is private. This presigned URL can have an associated expiration time in seconds after which the URL is no longer valid. The default value is 7 days.


__Parameters__



| Param  |  Type | Description  |
|---|---|---|
|`bucketName` | _string_ | Name of the bucket. |
|`objectName` | _string_ | Name of the object. |
|`expiry`     | _number_ | Expiry time in seconds. Default value is 7 days. (optional) |
|`respHeaders`  | _object_ | response headers to override (optional) |
|`requestDate`  | _Date_ | A date object, the url will be issued at. Default value is now. (optional) |
|`callback(err, presignedUrl)` | _function_ | Callback function is called with non `null` err value in case of error. `presignedUrl` will be the URL using which the object can be downloaded using GET request. If no callback is passed, a `Promise` is returned. |


__Example__


```js
// expires in a day.
minioClient.presignedGetObject('mybucket', 'hello.txt', 24*60*60, function(err, presignedUrl) {
  if (err) return console.log(err)
  console.log(presignedUrl)
})
```

<a name="presignedPutObject"></a>
### presignedPutObject(bucketName, objectName, expiry[, callback])

Generates a presigned URL for HTTP PUT operations. Browsers/Mobile clients may point to this URL to upload objects directly to a bucket even if it is private.  This presigned URL can have an associated expiration time in seconds after which the URL is no longer valid. The default value is 7 days.


__Parameters__


| Param  |  Type | Description  |
|---|---|---|
|`bucketName` | _string_ | Name of the bucket. |
|`objectName` | _string_ | Name of the object. |
|`expiry`     | _number_ | Expiry time in seconds. Default value is 7 days. |
|`callback(err, presignedUrl)` | _function_ | Callback function is called with non `null` err value in case of error. `presignedUrl` will be the URL using which the object can be uploaded using PUT request. If no callback is passed, a `Promise` is returned. |


__Example__


```js
// expires in a day.
minioClient.presignedPutObject('mybucket', 'hello.txt', 24*60*60, function(err, presignedUrl) {
  if (err) return console.log(err)
  console.log(presignedUrl)
})
```

<a name="presignedPostPolicy"></a>
### presignedPostPolicy(policy[, callback])

Allows setting policy conditions to a presigned URL for POST operations. Policies such as bucket name to receive object uploads, key name prefixes, expiry policy may be set.

__Parameters__


| Param  |  Type | Description  |
|---|---|---|
| `policy`  | _object_  | Policy object created by minioClient.newPostPolicy() |
| `callback(err, {postURL, formData})`  | _function_  | Callback function is called with non `null` err value in case of error. `postURL` will be the URL using which the object can be uploaded using POST request. `formData` is the object having key/value pairs for the Form data of POST body. If no callback is passed, a `Promise` is returned. |


Create policy:


```js
var policy = minioClient.newPostPolicy()
```

Apply upload policy restrictions:

```js
// Policy restricted only for bucket 'mybucket'.
policy.setBucket('mybucket')

// Policy restricted only for hello.txt object.
policy.setKey('hello.txt')
```
or

```js
// Policy restricted for incoming objects with keyPrefix.
policy.setKeyStartsWith('keyPrefix')

var expires = new Date
expires.setSeconds(24 * 60 * 60 * 10)
// Policy expires in 10 days.
policy.setExpires(expires)

// Only allow 'text'.
policy.setContentType('text/plain')

// Only allow content size in range 1KB to 1MB.
policy.setContentLengthRange(1024, 1024*1024)
```

POST your content from the browser using `superagent`:


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

## 5. Bucket Policy & Notification operations

Buckets are configured to trigger notifications on specified types of events and paths filters.

<a name="getBucketNotification"></a>
### getBucketNotification(bucketName[, cb])

Fetch the notification configuration stored in the S3 provider and that belongs to the specified bucket name.

__Parameters__



| Param  |  Type | Description  |
|---|---|---|
| `bucketName`  | _string_  | Name of the bucket.  |
| `callback(err, bucketNotificationConfig)`  | _function_  | Callback function is called with non `null` err value in case of error. `bucketNotificationConfig` will be the object that carries all notification configurations associated to bucketName. If no callback is passed, a `Promise` is returned. |


__Example__


```js
minioClient.getBucketNotification('mybucket', function(err, bucketNotificationConfig) {
  if (err) return console.log(err)
  console.log(bucketNotificationConfig)
})
```

<a name="setBucketNotification"></a>
### setBucketNotification(bucketName, bucketNotificationConfig[, callback])

Upload a user-created notification configuration and associate it to the specified bucket name.


__Parameters__


| Param  |  Type | Description  |
|---|---|---|
| `bucketName`  | _string_  | Name of the bucket.  |
| `bucketNotificationConfig`  | _BucketNotification_   | Javascript object that carries the notification configuration.  |
| `callback(err)`  | _function_  | Callback function is called with non `null` err value in case of error. If no callback is passed, a `Promise` is returned. |


__Example__

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

Remove the bucket notification configuration associated to the specified bucket.

__Parameters__


| Param  |  Type | Description  |
|---|---|---|
| `bucketName`  | _string_  | Name of the bucket |
| `callback(err)`  | _function_  | Callback function is called with non `null` err value in case of error. If no callback is passed, a `Promise` is returned. |


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

Listen for notifications on a bucket. Additionally one can provider
filters for prefix, suffix and events. There is no prior set bucket notification
needed to use this API. This is an MinIO extension API where unique identifiers
are regitered and unregistered by the server automatically based on incoming requests.

Returns an `EventEmitter`, which will emit a `notification` event carrying the record.

To stop listening, call `.stop()` on the returned `EventEmitter`.

__Parameters__

| Param  |  Type | Description  |
|---|---|---|
| `bucketName`  | _string_  | Name of the bucket |
| `prefix`  | _string_  | Object key prefix to filter notifications for. |
| `suffix`  | _string_  | Object key suffix to filter notifications for. |
| `events`  | _Array_ | Enables notifications for specific event types. |

See [here](https://github.com/minio/minio-js/blob/master/examples/minio/listen-bucket-notification.js) for a full example.

```js
var listener = minioClient.listenBucketNotification('my-bucketname', 'photos/', '.jpg', ['s3:ObjectCreated:*'])
listener.on('notification', function(record) {
  // For example: 's3:ObjectCreated:Put event occurred (2016-08-23T18:26:07.214Z)'
  console.log('%s event occurred (%s)', record.eventName, record.eventTime)
  listener.stop()
})
```

<a name="getBucketPolicy"></a>
### getBucketPolicy(bucketName [, callback])

Get the bucket policy associated with the specified bucket. If `objectPrefix`
is not empty, the bucket policy will be filtered based on object permissions
as well.

__Parameters__


| Param  |  Type | Description  |
|---|---|---|
| `bucketName`  | _string_  | Name of the bucket |
| `callback(err, policy)`  | _function_  | Callback function is called with non `null` err value in case of error. `policy` is [bucket policy](https://docs.aws.amazon.com/AmazonS3/latest/dev/example-bucket-policies.html). If no callback is passed, a `Promise` is returned. |


```js
// Retrieve bucket policy of 'my-bucketname'
minioClient.getBucketPolicy('my-bucketname', function(err, policy) {
  if (err) throw err

  console.log(`Bucket policy file: ${policy}`)
})
```

<a name="setBucketPolicy"></a>
### setBucketPolicy(bucketName, bucketPolicy[, callback])

Set the bucket policy on the specified bucket. [bucketPolicy](https://docs.aws.amazon.com/AmazonS3/latest/dev/example-bucket-policies.html) is detailed here.

__Parameters__


| Param  |  Type | Description  |
|---|---|---|
| `bucketName`  | _string_  | Name of the bucket. |
| `bucketPolicy` | _string_ | bucket policy. |
| `callback(err)`  | _function_  | Callback function is called with non `null` err value in case of error. If no callback is passed, a `Promise` is returned. |


```js
// Set the bucket policy of `my-bucketname`
minioClient.setBucketPolicy('my-bucketname', JSON.stringify(policy), function(err) {
  if (err) throw err

  console.log('Bucket policy set')
})
```

## 6. HTTP request options
### setRequestOptions(options)

Set the HTTP/HTTPS request options. Supported options are `agent` ([http.Agent()](https://nodejs.org/api/http.html#http_class_http_agent)), `family` ([IP address family to use while resolving `host` or `hostname`](https://nodejs.org/api/http.html#http_http_request_url_options_callback)), and tls related options ('agent', 'ca', 'cert', 'ciphers', 'clientCertEngine', 'crl', 'dhparam', 'ecdhCurve', 'honorCipherOrder', 'key', 'passphrase', 'pfx', 'rejectUnauthorized', 'secureOptions', 'secureProtocol', 'servername', 'sessionIdContext') documented [here](https://nodejs.org/api/tls.html#tls_tls_createsecurecontext_options)

```js
// Do not reject self signed certificates.
minioClient.setRequestOptions({rejectUnauthorized: false})
```


## 7. Explore Further


- [Build your own Shopping App Example](https://github.com/minio/minio-js-store-app)
