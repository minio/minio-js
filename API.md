## API Documentation

### Minio client object creation
Minio client object is created using minio-js:
```js
var Minio = require('minio')

// find out your s3 end point here:
// http://docs.aws.amazon.com/general/latest/gr/rande.html#s3_region

var s3Client = new Minio({
  url: 'https://<your-s3-endpoint>',
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
* [`putObject`](#putObject)
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
Creates the bucket `bucketName`.

__Arguments__
* `bucketName` _string_ - Name of the bucket
* `callback(err)` _function_ - callback function with `err` as the error argument. `err` is null if the bucket is successfully created.

__Example__
```js
s3Client.makeBucket('mybucket', function(err) {
  if (err) return console.log("Error creating bucket")
  console.log("Bucket created successfully")
})
```
---------------------------------------
<a name="listBuckets">
#### listBuckets(callback)
List of buckets created.

__Arguments__
* `callback(err, bucketStream)` _function_ - callback function with error as the first argument. `bucketStream` is the stream emitting bucket information.

`bucketStream` emits Object with the format:
* `obj.name` _string_ : bucket name
* `obj.creationDate` _string_: date when bucket was created

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
    console.log("End")
  })
  bucketStream.on('error', function(e) {
    console.log("Error", e)
  })
})
```
---------------------------------------
<a name="bucketExists">
#### bucketExists(bucketName, callback)
To check if a bucket already exists.

__Arguments__
* `bucketName` _string_ : name of the bucket
* `callback(err)` _function_ : `err` is `null` if the bucket exists

__Example__
```js
s3Client.bucketExists('mybucket', function(e) {
  if (e) return console.log('bucket already exists')
  console.log('bucket does not exist')
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
  if (e) return console.log('unable to remove bucket')
  console.log('removed bucket successfully')
})
```
---------------------------------------
<a name="getBucketACL">
#### getBucketACL(bucketName, callback)
get a bucket's ACL.

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
set a bucket's ACL.

__Arguments__
* `bucketName` _string_: name of the bucket
* `acl` _string_: acl can be _private_, _public-read_, _public-read-write_
* `callback(err)` _function_: callback is called with error or `null`

__Example__
```js
s3Client.setBucketACL('mybucket', 'public-read-write', function(e) {
  console.log(e)
})
```

---------------------------------------
<a name="listObjects">
#### listObjects(bucketName, params)
List the objects in the bucket.

__Arguments__
* `bucketName` _string_: name of the bucket
* `params` _object_: parameters for object listing.
  * `params.prefix` _string_: the prefix of the objects that should be listed
  * `params.recursive` _bool_: `true` indicates recursive style listing and `false` indicates directory style listing delimited by '/'.

__Return Value__
* `stream` _Stream_: stream emitting the objects in the bucket, the object is of the format:
  * `stat.key` _string_: name of the object
  * `stat.size` _number_: size of the object
  * `stat.etag` _string_: etag of the object
  * `stat.lastModified` _string_: modified time stamp


__Example__
```js
var stream = s3Client.listObjects("mybucket", {recursive: false})
stream.on('data', function(obj){console.log(obj)})
stream.on('error', function(e){console.log(e)})
```

---------------------------------------
<a name="listIncompleteUploads">
#### listIncompleteUploads(bucketName, prefix, recursive)
Returns a stream that emits objects that are partially uploaded.

__Arguments__
* `bucketname` _string_: name of the bucket
* `prefix` _string_: prefix of the object names that are partially uploaded
* `recursive` bool: directory style listing when false, recursive listing when true

__Return Value__
* `stream` _Stream_ : emits objects of the format:
  * `object.key` _string_: name of the object
  * `object.uploadId` _string_: upload ID of the object
  * `object.size` _Integer_: size of the partially uploaded object

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
Callback is called with readable stream of the object content.

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
    console.log("End. Total size = " + size)
  })
  dataStream.on('error', function(e) {
    console.log(e)
  })
})
```
---------------------------------------
<a name="getPartialObject">
#### getPartialObject(bucketName, objectName, offset, length, callback)
Callback is called with readable stream of the partial object content.

__Arguments__
* `bucketName` _string_: name of the bucket
* `objectName` _string_: name of the object
* `offset` _number_: offset of the object from where the stream will start
* `length` _number_: length of the object that will be read in the stream
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
    console.log("End. Total size = " + size)
  })
  dataStream.on('error', function(e) {
    console.log(e)
  })
})
```
---------------------------------------
<a name="putObject">
#### putObject(bucketName, objectName, contentType, size, stream, callback)
Uploads the object.

__Arguments__
* `bucketName` _string_: name of the bucket
* `objectName` _string_: name of the object
* `contentType` _string_: content type of the object
* `size` _number_: size of the object
* `stream` _Stream_: Readable stream
* `callback(err, etag)` _function_: non null `err` indicates error, `etag` _string_ is the etag of the object uploaded.

__Example__
```js
var file = '/tmp/40mbfile'
var fileStream = Fs.createReadStream(file)
var fileStat = Fs.stat(file, function(e, stat) {
  if (e) {
    return console.log(e)
  }
  s3Client.putObject('mybucket', '40mbfile', 'application/octet-stream', 40*1024*1024, fileStream, function(e, etag) {
    return console.log(e, etag) // e should be null
  })
})
```

---------------------------------------
<a name="statObject">
#### statObject(bucketName, objectName, callback)
Stat information of the object.

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
Remove the specified object.

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
Remove the partially uploaded object.

__Arguments__
* `bucketName` _string_: name of the bucket
* `objectName` _string_: name of the object
* `callback(err)` _function_: callback function is called with non `null` value in case of error

__Example__
```js
s3Client.removeIncompleteUpload('mybucket', 'photo.jpg', function(err, stat) {
  if (e) {
    return console.log('Unable to remove object', err)
  }
  console.log('Removed the object')
})
```

### Presigned operations
---------------------------------------
<a name="presignedGetObject">
#### presignedGetObject(bucketName, objectName, expiry)
Generate a presigned URL for GET

__Arguments__
* `bucketName` _string_: name of the bucket
* `objectName` _string_: name of the object
* `expiry` _number_: expiry in seconds

__Example__
```js
// expires in 1 day
var presignedUrl = s3Client.presignedGetObject('mybucket', 'photo.jpg', 24*60*60)
```

---------------------------------------
<a name="presignedPutObject">
#### presignedPutObject(bucketName, objectName, expiry)
Generate a presigned URL for PUT. Using this URL, the browser can upload to S3 only with the specified object name.

__Arguments__
* `bucketName` _string_: name of the bucket
* `objectName` _string_: name of the object
* `expiry` _number_: expiry in seconds

__Example__
```js
// expires in 1 day
var presignedUrl = s3Client.presignedPutObject('mybucket', 'photo.jpg', 24*60*60)
```

---------------------------------------
<a name="presignedPostPolicy">
#### presignedPostPolicy
presignedPostPolicy can be used in situations where we want more control on the upload than what presignedPutObject() provides. i.e Using presignedPostPolicy we will be able to put policy restrictions on the object's `name` `bucket` `expiry` `Content-Type`

We need to get policy object first:
```js
var policy = s3Client.newPostPolicy()
```
Apply upload policy restrictions:
```js
policy.setKey("photo.png") OR policy.setKeyStartsWith("keyPrefix")
policy.setBucket("bucketname")
var expires = new Date
expires.setSeconds(24 * 60 * 60 * 10) //10 days
policy.setExpires(expires)
policy.setContentType("image/png")
```
Get the POST form key/value object:
```js
formData = s3Client.presignedPostPolicy(policy)
```
Do a POST operation (using `superagent` npm module) from the browser:
```js
var req = superagent.post('https://<your-s3-endpoint>/bucketname')
_.each(formData, function(value, key) {
  req.field(key, value)
})

// file contents
req.attach('file', '/path/to/photo.jpg', 'photo.jpg')

req.end(function(err, res) {
  if (err) {
    return console.log(err.toString())
  }
  console.log("Upload successful")
})
```
