## API Documentation

### Minio client object creation
Minio client object is created using minio-js:
```js
var Minio = require('minio')

var s3Client = new Minio({
  endPoint:  's3.amazonaws.com',
  accessKey: 'YOUR-ACCESSKEYID',
  secretKey: 'YOUR-SECRETACCESSKEY'
})
```

s3Client can be used to perform operations on S3 storage. APIs are described below.

### Bucket operations
* [`makeBucket`](#makeBucket)
* [`listBuckets`](#listBuckets)
* [`bucketExists`](#bucketExists)
* [`removeBucket`](#removeBucket)
* [`getBucketACL`](#getBucketACL)
* [`setBucketACL`](#setBucketACL)
* [`listObjects`](#listObjects)
* [`listIncompleteUploads`](#listIncompleteUploads)

### Object operations

* [`getObject`](#getObject)
* [`getPartialObject`](#getPartialObject)
* [`fGetObject`](#fGetObject)
* [`putObject`](#putObject)
* [`fPutObject`](#fPutObject)
* [`statObject`](#statObject)
* [`removeObject`](#removeObject)
* [`removeIncompleteUpload`](#removeIncompleteUpload)

### Presigned operations

* [`presignedGetObject`](#presignedGetObject)
* [`presignedPutObject`](#presignedPutObject)
* [`presignedPostPolicy`](#presignedPostPolicy)

### Bucket operations
---------------------------------------
<a name="makeBucket">
#### makeBucket(bucketName, callback)
Create a new bucket.

__Arguments__
* `bucketName` _string_ - Name of the bucket.
* `acl` _string_ - cannedACL valid values are _private_, _public-read_, _public-read-write_, _authenticated-read_.
* `region` _string_ - region valid values are _us-west-1_, _us-west-2_,  _eu-west-1_, _eu-central-1_, _ap-southeast-1_, _ap-northeast-1_, _ap-southeast-2_, _sa-east-1_
* `callback(err)` _function_ - callback function with `err` as the error argument. `err` is null if the bucket is successfully created.

__Example__
```js
s3Client.makeBucket('mybucket', 'public-read', 'us-west-1', function(err) {
  if (err) return console.log('Error creating bucket.')
  console.log('Bucket created successfully in "us-west-1".')
})
```
---------------------------------------
<a name="listBuckets">
#### listBuckets(callback)
List all buckets.

__Arguments__
* `callback(err, bucketStream)` _function_ - callback function with error as the first argument. `bucketStream` is the stream emitting bucket information.

`bucketStream` emits Object with the format:
* `bucket.name` _string_ : bucket name
* `bucket.creationDate` _Date_: date when bucket was created

__Example__
```js
s3Client.listBuckets(function(e, bucketStream) {
  if (e) {
    console.log(e)
    return
  }
  bucketStream.on('data', function(obj) {
    console.log(obj)
  })
  bucketStream.on('end', function() {
    console.log('End')
  })
  bucketStream.on('error', function(e) {
    console.log('Error', e)
  })
})
```
---------------------------------------
<a name="bucketExists">
#### bucketExists(bucketName, callback)
Check if bucket exists.

__Arguments__
* `bucketName` _string_ : name of the bucket
* `callback(err)` _function_ : `err` is `null` if the bucket exists

__Example__
```js
s3Client.bucketExists('mybucket', function(e) {
  if (e) return console.log('Bucket does not exist.')
  console.log('Bucket exists.')
})
```
---------------------------------------
<a name="removeBucket">
#### removeBucket(bucketName, callback)
Remove a bucket.

__Arguments__
* `bucketName` _string_ : name of the bucket
* `callback(err)` _function_ : `err` is `null` if the bucket is removed successfully.

__Example__
```js
s3Client.removeBucket('mybucket', function(e) {
  if (e) return console.log('unable to remove bucket.')
  console.log('Bucket removed successfully.')
})
```
---------------------------------------
<a name="getBucketACL">
#### getBucketACL(bucketName, callback)
Get ACL of a bucket.

__Arguments__
* `bucketName` _string_ : name of the bucket
* `callback(err, acl)` _function_ : `err` is not `null` in case of error. `acl` _string_ is the cannedACL which can have the values _private_, _public-read_, _public-read-write_.

__Example__
```js
s3Client.getBucketACL('mybucket', function(e, acl) {
  if (e) {
    return console.log(e)
  }
  console.log('acl is', acl)
})
```
---------------------------------------
<a name="setBucketACL">
#### setBucketACL(bucketname, acl, callback)
Set ACL on an existing bucket.

__Arguments__
* `bucketName` _string_: name of the bucket
* `acl` _string_: acl can be _private_, _public-read_, _public-read-write_
* `callback(err)` _function_: callback is called with error or `null`

__Example__
```js
s3Client.setBucketACL('mybucket', 'public-read-write', function(e) {
  if (e) {
    return console.log(e)
  }
  console.log('Successfully updated acl.')
})
```

---------------------------------------
<a name="listObjects">
#### listObjects(bucketName, prefix, recursive)
List objects in a bucket.

__Arguments__
* `bucketName` _string_: name of the bucket
* `prefix` _string_: the prefix of the objects that should be listed (optional, default `''`)
* `recursive` _bool_: `true` indicates recursive style listing and `false` indicates directory style listing delimited by '/'. (optional, default `false`)

__Return Value__
* `stream` _Stream_: stream emitting the objects in the bucket, the object is of the format:
  * `obj.key` _string_: name of the object
  * `obj.size` _number_: size of the object
  * `obj.etag` _string_: etag of the object
  * `obj.lastModified` _Date_: modified time stamp

__Example__
```js
var stream = s3Client.listObjects('mybucket', {recursive: false})
stream.on('data', function(obj) { console.log(obj) } )
stream.on('error', function(e) { console.log(e) } )
```

---------------------------------------
<a name="listIncompleteUploads">
#### listIncompleteUploads(bucketName, prefix, recursive)
List partially uploaded objects in a bucket.

__Arguments__
* `bucketname` _string_: name of the bucket
* `prefix` _string_: prefix of the object names that are partially uploaded
* `recursive` bool: directory style listing when false, recursive listing when true

__Return Value__
* `stream` _Stream_ : emits objects of the format:
  * `part.key` _string_: name of the object
  * `part.uploadId` _string_: upload ID of the object
  * `part.size` _Integer_: size of the partially uploaded object

__Example__
```js
var Stream = s3Client.listIncompleteUploads('mybucket', 'photos/2014/may', true)
Stream.on('data', function(obj) {
  console.log(obj)
})
Stream.on('end', function() {
  console.log('End')
})
Stream.on('error', function(e) {
  console.log(e)
})
```

---------------------------------------
### Object operations
<a name="getObject">
#### getObject(bucketName, objectName, callback)
Download an object.

__Arguments__
* `bucketName` _string_: name of the bucket
* `objectName` _string_: name of the object
* `callback(err, stream)` _function_: callback is called with `err` in case of error. `stream` is the object content stream

__Example__
```js
var size = 0
s3Client.getObject('mybucket', 'photo.jpg', function(e, dataStream) {
  if (e) {
    return console.log(e)
  }
  dataStream.on('data', function(chunk) {
    size += chunk.length
  })
  dataStream.on('end', function() {
    console.log('End. Total size = ' + size)
  })
  dataStream.on('error', function(e) {
    console.log(e)
  })
})
```
---------------------------------------
<a name="getPartialObject">
#### getPartialObject(bucketName, objectName, offset, length, callback)
Download the specified range bytes of an object.

__Arguments__
* `bucketName` _string_: name of the bucket
* `objectName` _string_: name of the object
* `offset` _number_: offset of the object from where the stream will start
* `length` _number_: length of the object that will be read in the stream (optional, if not specified we read the rest of the file from the offset)
* `callback(err, stream)` _function_: callback is called with `err` in case of error. `stream` is the object content stream

__Example__
```js
var size = 0
// reads 30 bytes from the offset 10
s3Client.getObject('mybucket', 'photo.jpg', 10, 30, function(e, dataStream) {
  if (e) {
    return console.log(e)
  }
  dataStream.on('data', function(chunk) {
    size += chunk.length
  })
  dataStream.on('end', function() {
    console.log('End. Total size = ' + size)
  })
  dataStream.on('error', function(e) {
    console.log(e)
  })
})
```
---------------------------------------
<a name="fGetObject">
#### fGetObject(bucketName, objectName, filePath, callback)
Callback is called with `error` in case of error or `null` in case of success

__Arguments__
* `bucketName` _string_: name of the bucket
* `objectName` _string_: name of the object
* `filePath` _string_: path to which the object data will be written to
* `callback(err)` _function_: callback is called with `err` in case of error.

__Example__
```js
var size = 0
s3Client.fGetObject('mybucket', 'photo.jpg', '/tmp/photo.jpg', function(e) {
  if (e) {
    return console.log(e)
  }
  console.log('success')
})
```
---------------------------------------
<a name="putObject">
#### putObject(bucketName, objectName, stream, size, contentType, callback)
Upload an object.

Uploading a stream
__Arguments__
* `bucketName` _string_: name of the bucket
* `objectName` _string_: name of the object
* `stream` _Stream_: Readable stream
* `size` _number_: size of the object
* `contentType` _string_: content type of the object (optional, default `application/octet-stream`)
* `callback(err, etag)` _function_: non null `err` indicates error, `etag` _string_ is the etag of the object uploaded.

__Example__
```js
var file = '/tmp/40mbfile'
var fileStream = Fs.createReadStream(file)
var fileStat = Fs.stat(file, function(e, stats) {
  if (e) {
    return console.log(e)
  }
  s3Client.putObject('mybucket', '40mbfile', fileStream, stats.size, 'application/octet-stream', function(e, etag) {
    return console.log(e, etag) // e should be null
  })
})
```

Uploading "Buffer" or "string"
__Arguments__
* `bucketName` _string_: name of the bucket
* `objectName` _string_: name of the object
* `string or Buffer` _Stream_ or _Buffer_: Readable stream
* `contentType` _string_: content type of the object (optional, default `application/octet-stream`)
* `callback(err, etag)` _function_: non null `err` indicates error, `etag` _string_ is the etag of the object uploaded.

__Example__
```js
var buffer = 'Hello World'
s3Client.putObject('mybucket', 'hello-file', buffer, 'application/octet-stream', function(e, etag) {
  return console.log(e, etag) // e should be null
})
```

---------------------------------------
<a name="fPutObject">
#### fPutObject(bucketName, objectName, filePath, contentType, callback)
Uploads the object using contents from a file

__Arguments__
* `bucketName` _string_: name of the bucket
* `objectName` _string_: name of the object
* `filePath` _string_: file path of the file to be uploaded
* `contentType` _string_: content type of the object
* `callback(err, etag)` _function_: non null `err` indicates error, `etag` _string_ is the etag of the object uploaded.

__Example__
```js
var file = '/tmp/40mbfile'
s3Client.putObject('mybucket', '40mbfile', 'application/octet-stream', function(e, etag) {
  return console.log(e, etag) // e should be null
})
```
---------------------------------------
<a name="statObject">
#### statObject(bucketName, objectName, callback)
Get metadata of an object.

__Arguments__
* `bucketName` _string_: name of the bucket
* `objectName` _string_: name of the object
* `callback(err, stat)` _function_: `err` is not `null` in case of error, `stat` contains the object information:
  * `stat.size` _number_: size of the object
  * `stat.etag` _string_: etag of the object
  * `stat.contentType` _string_: Content-Type of the object
  * `stat.lastModified` _string_: modified time stamp

__Example__
```js
s3Client.statObject('mybucket', 'photo.jpg', function(err, stat) {
  if (err) {
    return console.log(err)
  }
  console.log(stat)
})
```
---------------------------------------
<a name="removeObject">
#### removeObject(bucketName, objectName, callback)
Remove an object.

__Arguments__
* `bucketName` _string_: name of the bucket
* `objectName` _string_: name of the object
* `callback(err)` _function_: callback function is called with non `null` value in case of error

__Example__
```js
s3Client.removeObject('mybucket', 'photo.jpg', function(err, stat) {
  if (e) {
    return console.log('Unable to remove object', err)
  }
  console.log('Removed the object')
})
```
---------------------------------------
<a name="removeIncompleteUpload">
#### removeIncompleteUpload(bucketName, objectName, callback)
Remove an partially uploaded object.

__Arguments__
* `bucketName` _string_: name of the bucket
* `objectName` _string_: name of the object
* `callback(err)` _function_: callback function is called with non `null` value in case of error

__Example__
```js
s3Client.removeIncompleteUpload('mybucket', 'photo.jpg', function(err, stat) {
  if (e) {
    return console.log('Unable to remove incomplete object', err)
  }
  console.log('Incomplete object removed successfully.')
})
```

### Presigned operations
---------------------------------------
<a name="presignedGetObject">
#### presignedGetObject(bucketName, objectName, expiry, cb)
Generate a presigned URL for GET.

__Arguments__
* `bucketName` _string_: name of the bucket.
* `objectName` _string_: name of the object.
* `expiry` _number_: expiry in seconds.
* `callback(err, presignedUrl)` _function_: callback function is called with non `null` value in case of error. `presignedUrl` will be the URL using which the object can be downloaded using GET request.

__Example__
```js
// expires in a day
var presignedUrl = s3Client.presignedGetObject('mybucket', 'photo.jpg', 24*60*60, function(err, presignedUrl) {
  if (err) return console.log(err)
  console.log(presignedUrl)
})

```

---------------------------------------
<a name="presignedPutObject">
#### presignedPutObject(bucketName, objectName, expiry, cb)
Generate a presigned URL for PUT.
<blockquote>
NOTE: you can upload to S3 only with specified object name.
</blockquote>

__Arguments__
* `bucketName` _string_: name of the bucket
* `objectName` _string_: name of the object
* `expiry` _number_: expiry in seconds
* `callback(err, presignedUrl)` _function_: callback function is called with non `null` value in case of error. `presignedUrl` will be the URL using which the object can be uploaded using PUT request.

__Example__
```js
// expires in a day
var presignedUrl = s3Client.presignedPutObject('mybucket', 'photo.jpg', 24*60*60, function(err, presignedUrl) {
  if (err) return console.log(err)
  console.log(presignedUrl)
})
```

---------------------------------------
<a name="presignedPostPolicy">
#### presignedPostPolicy

presignedPostPolicy is used for uploading objects using POST request but it gives more control than presigned-PUT on
what can be uploaded by the clients in the POST request.
We can provide policies specifying conditions restricting what you want to allow in a POST request
such as bucket name where objects can be uploaded, key name prefixes that you want to allow for the
object being created and more, etc.

We need to create our policy first:
```js
var policy = s3Client.newPostPolicy()
```
Apply upload policy restrictions:
```js
// Policy restricted only for bucket 'bucketName'.
policy.setBucket('bucketName')

// Policy restricted only for photo.png object.
policy.setKey('photo.png')

 or

// Policy restricted for incoming objects with keyPrefix.
policy.setKeyStartsWith('keyPrefix')

var expires = new Date
expires.setSeconds(24 * 60 * 60 * 10)
// Policy expires in 10 days.
policy.setExpires(expires)

// Only allow 'png' images.
policy.setContentType('image/png')

// Only allow content size in range 1KB to 1MB.
policy.setContentLengthRange(1024, 1024*1024)
```
Upload using POST.
```js
s3Client.presignedPostPolicy(policy, function(err, postURL, formData) {
  if (err) return console.log(err)

  var req = superagent.post(postURL)
  _.each(formData, function(value, key) {
    req.field(key, value)
  })

  // file contents
  req.attach('file', '/path/to/photo.jpg', 'photo.jpg')

  req.end(function(err, res) {
    if (err) {
      return console.log(err.toString())
    }
    console.log('Upload successful.')
  })
})
```
