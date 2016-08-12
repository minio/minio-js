# JavaScript Client API Reference [![Gitter](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/Minio/minio?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

## Initialize Minio Client object.  

## Minio

```js

var Minio = require('minio')

var minioClient = new Minio({
    endPoint: 'play.minio.io',
    port: 9000,
  	secure: true,
    accessKey: 'Q3AM3UQ867SPQQA43P2F',
    secretKey: 'zuf+tfteSlswRu7BJ86wekitnifILbZam1KYY3TG'
});

```

## AWS S3

```js

var Minio = require('minio')

var s3Client = new Minio({
    endPoint:  's3.amazonaws.com',
	  accessKey: 'YOUR-ACCESSKEYID',
	  secretKey: 'YOUR-SECRETACCESSKEY'
})

```

| Bucket operations       | Object operations      | Presigned operations | Bucket Policy & Notification operations |
| ------------- |-------------| -----| ----- |
| [`makeBucket`](#makeBucket)    | [`getObject`](#getObject) | [`presignedGetObject`](#presignedGetObject) | [`getBucketNotification`](#getBucketNotification) |
| [`listBuckets`](#listBuckets)  | [`getPartialObject`](#getPartialObject)    |   [`presignedPutObject`](#presignedPutObject) | [`setBucketNotification`](#setBucketNotification) |
| [`bucketExists`](#bucketExists) | [`fGetObject`](#fGetObject)    |    [`presignedPostPolicy`](#presignedPostPolicy) | [`deleteBucketNotification`](#deleteBucketNotification) |
| [`removeBucket`](#removeBucket)      | [`putObject`](#putObject)       |     | [`getBucketPolicy`](#getBucketPolicy)
| [`listObjects`](#listObjects) | [`fPutObject`](#fPutObject)   |   |   [`setBucketPolicy`](#setBucketPolicy)
| [`listObjectsV2`](#listObjectsV2) | [`statObject`](#statObject)   |
| [`listIncompleteUploads`](#listIncompleteUploads) | |
|     |  [`removeObject`](#removeObject)    |
|  | [`removeIncompleteUpload`](#removeIncompleteUpload)  |


## 1.  Constructor

<a name="MinioClient_endpoint"></a>
###  new Minio ({endPoint, port, secure, accessKey, secretKey})

|     |
| ---- |
|``new Minio ({endPoint, port, secure, accessKey, secretKey})``|
|Initializes a new client object.|

__Parameters__

| Param  | Type  | Description  |
|---|---|---|
| `endPoint`  |  _string_ | endPoint is an URL, domain name, IPv4 address or IPv6 address.Valid endpoints are listed below: |
| | |https://s3.amazonaws.com |
| | |https://play.minio.io:9000 |
| | |localhost |
| | |play.minio.io|
| `port` | _number_  | TCP/IP port number. This input is optional. Default value set to 80 for HTTP and 443 for HTTPs. |
| `accessKey`   | _string_   |accessKey is like user-id that uniquely identifies your account. | 
|`secretKey`  |  _string_   | secretKey is the password to your account.|
|`secure`    | _bool_    |If set to true, https is used instead of http. Default is https if not set. |



__Example__

## Minio

```js

var Minio = require('minio')

var minioClient = new Minio({
    endPoint: 'play.minio.io',
    port: 9000,
    secure: true,
    accessKey: 'Q3AM3UQ867SPQQA43P2F',
    secretKey: 'zuf+tfteSlswRu7BJ86wekitnifILbZam1KYY3TG'
});

```

## AWS S3


```js


var Minio = require('minio')

var s3Client = new Minio({
    endPoint:  's3.amazonaws.com',
    accessKey: 'YOUR-ACCESSKEYID',
    secretKey: 'YOUR-SECRETACCESSKEY'
})


```


## 2. Bucket operations
<a name="makeBucket"></a>

### makeBucket(bucketName, region, callback)

Creates a new bucket.

__Parameters__

| Param  | Type  | Description  |
|---|---|---|
|`bucketName`  | _string_  | Name of the bucket. | 
| `region`  |  _string_ | Default value is us-east-1 Region where the bucket is created. Valid values are listed below: |
| | |us-east-1 |
| | |us-west-1 |
| | |us-west-2 |
| | |eu-west-1 |
| | | eu-central-1|
| | | ap-southeast-1|
| | | ap-northeast-1|
| | | ap-southeast-2|
| | | sa-east-1| 
|`callback(err)`  |_function_   | Callback function with `err` as the error argument. `err` is null if the bucket is successfully created.   |




__Example__


```js

minioClient.makeBucket('mybucket', 'us-east-1', function(err) {
  if (err) return console.log('Error creating bucket.', err)
  console.log('Bucket created successfully in "us-east-1".')
})

```

<a name="listBuckets"></a>
### listBuckets(callback)

Lists all buckets.


__Parameters__


| Param  | Type  | Description  |
|---|---|---|
|`callback(err, bucketStream) `  | _function_  | Callback function with error as the first argument. bucketStream is the stream emitting bucket information. |

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
#### bucketExists(bucketName, callback)

Checks if a bucket exists.


__Parameters__


| Param  | Type  | Description  |
|---|---|---|
| `bucketName`  |  _string_ | Name of the bucket.  |
| `callback(err)`  | _function_  | `err` is `null` if the bucket exists. `err.code` is `NoSuchBucket` in case the bucket does not exist. |

__Example__


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
### removeBucket(bucketName, callback)

Removes a bucket.

__Parameters__


| Param  |  Type | Description  |
|---|---|---|
| `bucketName`  | _string_  | Name of the bucket.  |
| `callback(err)`  | _function_  |  `err` is `null` if the bucket is removed successfully. |

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
| `obj.key` | _string_ | name of the object. |
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
### listObjectsV2(bucketName, prefix, recursive)

Lists all objects in a bucket using S3 listing objects V2 API

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
| `obj.key` | _string_ | name of the object. |
| `obj.size` | _number_ | size of the object. |
| `obj.etag` | _string_ |etag of the object. |
| `obj.lastModified` | _Date_ | modified time stamp. |


__Example__


```js

var stream = minioClient.listObjectsV2('mybucket','', true)
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
### getObject(bucketName, objectName, callback)

Downloads an object as a stream.

__Parameters__


| Param  |  Type | Description  |
|---|---|---|
| `bucketName`  | _string_  | Name of the bucket.  |
| `objectName`  | _string_  |  Name of the object. |
| `callback(err, stream)` | _function_ | Callback is called with `err` in case of error. `stream` is the object content stream.|

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
### getPartialObject(bucketName, objectName, offset, length, callback)

Downloads the specified range bytes of an object as a stream.

__Parameters__


| Param  |  Type | Description  |
|---|---|---|
|  `bucketName` | _string_  | Name of the bucket.  |
| `objectName`   | _string_  | Name of the object.  |
| `offset`   | _number_  | `offset` of the object from where the stream will start.  |
| `length`  | _number_  | `length` of the object that will be read in the stream (optional, if not specified we read the rest of the file from the offset).  |
|`callback(err, stream)` | _function_  | Callback is called with `err` in case of error. `stream` is the object content stream.|

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
### fGetObject(bucketName, objectName, filePath, callback)

Downloads and saves the object as a file in the local filesystem.

__Parameters__

| Param  |  Type | Description  |
|---|---|---|
| `bucketName`  | _string_   | Name of the bucket.  |
| `objectName`  |_string_   | Name of the object.  |
| `filePath`  |  _string_ | Path on the local filesystem to which the object data will be written.  |
| `callback(err)`  | _function_  | Callback is called with `err` in case of error.  |


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
### putObject(bucketName, objectName, stream, size, contentType, callback)

Uploads an object from a stream/Buffer.


##### From a stream

__Parameters__


| Param  |  Type | Description  |
|---|---|---|
| `bucketName`  |_string_   | Name of the bucket.  |
| `objectName`  |_string_   | Name of the object.  |
| `stream`  | _Stream_  |Readable stream.   |
|`size`   | _number_  | Size of the object.  |
|`contentType`   | _string_  | Content-Type of the object (optional, default `application/octet-stream`).  |
| `callback(err, etag)` | _function_ | Non-null `err` indicates error, `etag` _string_ is the etag of the object uploaded.|


__Example__

The maximum size of a single object is limited to 5TB. putObject transparently uploads objects larger than 5MiB in multiple parts. This allows failed uploads to resume safely by only uploading the missing parts. Uploaded data is carefully verified using MD5SUM signatures.

```js

var Fs = require('fs')
var file = '/tmp/40mbfile'
var fileStream = Fs.createReadStream(file)
var fileStat = Fs.stat(file, function(err, stats) {
  if (err) {
    return console.log(err)
  }
  minioClient.putObject('mybucket', '40mbfile', fileStream, stats.size, 'application/octet-stream', function(err, etag) {
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
| `contentType`  | _string_   | Content-Type of the object (optional, default `application/octet-stream`).  |
| `callback(err, etag)`  | _function_  |Non-null `err` indicates error, `etag` _string_ is the etag of the object uploaded.   |


__Example__


```js

var buffer = 'Hello World'
minioClient.putObject('mybucket', 'hello-file', buffer, 'application/octet-stream', function(err, etag) {
  return console.log(err, etag) // err should be null
})

```
<a name="fPutObject"></a>
### fPutObject(bucketName, objectName, filePath, contentType, callback)

Uploads contents from a file to objectName.

__Parameters__


| Param  |  Type | Description  |
|---|---|---|
| `bucketName`  | _string_  | Name of the bucket.  |
|`objectName`   |_string_   | Name of the object.  |
| `filePath`  | _string_  | Path of the file to be uploaded.  |
| `contentType`  | _string_  | Content-Type of the object.  |
| `callback(err, etag)`  |  _function_ | Non-null `err` indicates error, `etag` _string_ is the etag of the object uploaded.  |

__Example__


The maximum size of a single object is limited to 5TB. fPutObject transparently uploads objects larger than 5MiB in multiple parts. This allows failed uploads to resume safely by only uploading the missing parts. Uploaded data is carefully verified using MD5SUM signatures.

```js

var file = '/tmp/40mbfile'
minioClient.fPutObject('mybucket', '40mbfile', file, 'application/octet-stream', function(err, etag) {
  return console.log(err, etag) // err should be null
})

```

<a name="statObject"></a>
### statObject(bucketName, objectName, callback)

Gets metadata of an object.

__Parameters__


| Param  |  Type | Description  |
|---|---|---|
| `bucketName`  | _string_  | Name of the bucket.  |
| `objectName`  | _string_  | Name of the object.  |
| `callback(err, stat)`  | _function_  |`err` is not `null` in case of error, `stat` contains the object information listed below: |



| Param  |  Type | Description  |
|---|---|---|
| `stat.size`  | _number_  | size of the object.  |
| `stat.etag`  | _string_  | etag of the object.  |
| `stat.contentType`  | _string_  | Content-Type of the object.|
| `stat.lastModified`  | _string_  | Last Modified time stamp.|


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
### removeObject(bucketName, objectName, callback)

Removes an object.

__Parameters__


| Param  |  Type | Description  |
|---|---|---|
|`bucketName`   |  _string_ | Name of the bucket.  |
| objectName  |  _string_ | Name of the object.  |
| `callback(err)`  | _function_  | Callback function is called with non `null` value in case of error.  |


__Example__


```js

minioClient.removeObject('mybucket', 'photo.jpg', function(err) {
  if (err) {
    return console.log('Unable to remove object', err)
  }
  console.log('Removed the object')
})

```

<a name="removeIncompleteUpload"></a>
### removeIncompleteUpload(bucketName, objectName, callback)

Removes a partially uploaded object.

__Parameters__


| Param  |  Type | Description  |
|---|---|---|
| `bucketName`  |_string_   | Name of the bucket.  |
| `objectName`  | _string_  | Name of the object.  |
| `callback(err)`  | _function_  |Callback function is called with non `null` value in case of error.   |


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

<a name="presignedGetObject"></a>
### presignedGetObject(bucketName, objectName, expiry, cb)

Generates a presigned URL for HTTP GET operations. Browsers/Mobile clients may point to this URL to directly download objects even if the bucket is private. This presigned URL can have an associated expiration time in seconds after which the URL is no longer valid. The default expiry is set to 7 days.


__Parameters__



| Param  |  Type | Description  |
|---|---|---|
| `bucketName`  | _string_  | Name of the bucket.  |
|`objectName`   | _string_  | Name of the object.  |
| `expiry`  |_number_   | Expiry in seconds. Default expiry is set to 7 days.  |
| `callback(err, presignedUrl)`  | _function_  | Callback function is called with non `null` err value in case of error. `presignedUrl` will be the URL using which the object can be downloaded using GET request.  |


__Example__


```js

// expires in a day.
minioClient.presignedGetObject('mybucket', 'hello.txt', 24*60*60, function(err, presignedUrl) {
  if (err) return console.log(err)
  console.log(presignedUrl)
})

```

<a name="presignedPutObject"></a>
### presignedPutObject(bucketName, objectName, expiry, callback)

Generates a presigned URL for HTTP PUT operations. Browsers/Mobile clients may point to this URL to upload objects directly to a bucket even if it is private.  This presigned URL can have an associated expiration time in seconds after which the URL is no longer valid. The default expiry is set to 7 days.


__Parameters__


| Param  |  Type | Description  |
|---|---|---|
| `bucketName`  | _string_  | Name of the bucket.  |
| `objectName`  | _string_  | Name of the object.  |
| `expiry`  | _number_   | Expiry in seconds. Default expiry is set to 7 days.  |
| `callback(err, presignedUrl)`  | _function_  | Callback function is called with non `null` err value in case of error. `presignedUrl` will be the URL using which the object can be uploaded using PUT request.  |


__Example__


```js

// expires in a day.
minioClient.presignedPutObject('mybucket', 'hello.txt', 24*60*60, function(err, presignedUrl) {
  if (err) return console.log(err)
  console.log(presignedUrl)
})

```

<a name="presignedPostPolicy"></a>
### presignedPostPolicy(policy, callback)

Allows setting policy conditions to a presigned URL for POST operations. Policies such as bucket name to receive object uploads, key name prefixes, expiry policy may be set.

__Parameters__


| Param  |  Type | Description  |
|---|---|---|
| `policy`  | _object_  | Policy object created by minioClient.newPostPolicy() |
| `callback(err, postURL, formData)`  | _function_  | Callback function is called with non `null` err value in case of error. `postURL` will be the URL using which the object can be uploaded using POST request. `formData` is the object having key/value pairs for the Form data of POST body. |


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

minioClient.presignedPostPolicy(policy, function(err, postURL, formData) {
  if (err) return console.log(err)

  var req = superagent.post(postURL)
  _.each(formData, function(value, key) {
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
### getBucketNotification(bucketName, cb)

Fetch the notification configuration stored in the S3 provider and that belongs to the specified bucket name.

__Parameters__



| Param  |  Type | Description  |
|---|---|---|
| `bucketName`  | _string_  | Name of the bucket.  |
| `callback(err, bucketNotificationConfig)`  | _function_  | Callback function is called with non `null` err value in case of error. `bucketNotificationConfig` will be the object that carries all notification configurations associated to bucketName.  |


__Example__


```js

minioClient.getBucketNotification('mybucket', function(err, bucketNotificationConfig) {
  if (err) return console.log(err)
  console.log(bucketNotificationConfig)
})

```

<a name="setBucketNotification"></a>
### setBucketNotification(bucketName, bucketNotificationConfig, callback)

Upload a user-created notification configuration and associate it to the specified bucket name.


__Parameters__


| Param  |  Type | Description  |
|---|---|---|
| `bucketName`  | _string_  | Name of the bucket.  |
| `bucketNotificationConfig`  | _BucketNotification_   | Javascript object that carries the notification configuration.  |
| `callback(err)`  | _function_  | Callback function is called with non `null` err value in case of error.  |


__Example__

```js

// Create a new notification object
var bucketNotification = new Notify.BucketNotification();

// Setup a new topic configuration
var arn = Notify.newARN('aws', 'sns', 'us-west-2', '408065449417', 'TestTopic')
var topic = new Notify.TopicConfig(arn)
topic.addFilterSuffix('.jpg')
topic.addFilterPrefix('myphotos/')
topic.addEvent(Notify.ObjectReducedRedundancyLostObject)
topic.addEvent(Notify.ObjectCreatedAll)

// Add the topic to the overall notification object
bucketNotification.addTopicConfiguration(topic)

minioClient.setBucketNotification('mybucket', bucketNotification, function(err) {
  if (err) return console.log(err)
  console.log('Success')
})

```

<a name="deleteBucketNotification"></a>
### deletBucketNotification(bucketName, callback)

Remove the bucket notification configuration associated to the specified bucket.

__Parameters__


| Param  |  Type | Description  |
|---|---|---|
| `bucketName`  | _string_  | Name of the bucket |
| `callback(err)`  | _function_  | Callback function is called with non `null` err value in case of error. |


```js
minioClient.deleteBucketNotification('my-bucketname', function(e) {
  if (e) {
    return console.log(e)
  }
  console.log("True")
})
```

<a name="getBucketPolicy"></a>
### getBucketPolicy(bucketName, objectPrefix, callback)

Get the bucket policy associated with the specified bucket. If `objectPrefix`
is not empty, the bucket policy will be filtered based on object permissions
as well.

__Parameters__


| Param  |  Type | Description  |
|---|---|---|
| `bucketName`  | _string_  | Name of the bucket |
| `objectPrefix` | _string_ | Prefix of objects in the bucket with which to filter permissions off of. Use `''` for entire bucket. |
| `callback(err, policy)`  | _function_  | Callback function is called with non `null` err value in case of error. `policy` will be the string representation of the bucket policy (`minio.Policy.NONE`, `minio.Policy.READONLY`, `minio.Policy.WRITEONLY`, or `minio.Policy.READWRITE`). |


```js
// Retrieve bucket policy of 'my-bucketname' that applies to all objects that
// start with 'img-'.
minioClient.getBucketPolicy('my-bucketname', 'img-', function(err, policy) {
  if (err) throw err

  console.log(`Bucket policy: ${policy}`)
})
```

<a name="setBucketPolicy"></a>
### setBucketPolicy(bucketName, objectPrefix, bucketPolicy, callback)

Set the bucket policy associated with the specified bucket. If `objectPrefix`
is not empty, the bucket policy will only be assigned to objects that fit the
given prefix.

__Parameters__


| Param  |  Type | Description  |
|---|---|---|
| `bucketName`  | _string_  | Name of the bucket |
| `objectPrefix` | _string_ | Prefix of objects in the bucket to modify permissions of. Use `''` for entire bucket. |
| `bucketPolicy` | _string_ | The bucket policy. This can be: `minio.Policy.NONE`, `minio.Policy.READONLY`, `minio.Policy.WRITEONLY`, or `minio.Policy.READWRITE`. |
| `callback(err)`  | _function_  | Callback function is called with non `null` err value in case of error. |


```js
// Set the bucket policy of `my-bucketname` to `readonly` (only allow retrieval),
// but only for objects that start with 'img-'.
minioClient.setBucketPolicy('my-bucketname', 'img-', minio.Policy.READONLY, function(err) {
  if (err) throw err

  console.log('Set bucket policy to \'readonly\'.')
})
```


## 6. Explore Further


- [Build your own Shopping App Example](https://docs.minio.io/docs/javascript-shopping-app)

