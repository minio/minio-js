/*
 * MinIO Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2015 MinIO, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Note: YOUR-ACCESSKEYID, YOUR-SECRETACCESSKEY, my-testfile, my-bucketname
// and my-objectname are dummy values, please replace them with original values.

const Minio = require('minio')
const Fs = require('fs')

const s3Client = new Minio.Client({
  endPoint: 's3.amazonaws.com',
  accessKey: 'YOUR-ACCESSKEYID',
  secretKey: 'YOUR-SECRETACCESSKEY'
})

// Upload a stream
const file = 'my-testfile.ogg'
const fileStream = Fs.createReadStream(file)
const fileStat = Fs.stat(file, function(e, stat) {
  if (e) {
    return console.log(e)
  }
  s3Client.putObject('my-bucketname', 'my-objectname.ogg', fileStream, stat.size, 'audio/ogg', function(e) {
    if (e) {
      return console.log(e)
    }
    console.log('Successfully uploaded the stream')
  })
})

// Upload a buffer
const buf = new Buffer(10)
buf.fill('a')
s3Client.putObject('my-bucketname', 'my-objectname2', buf, 'application/octet-stream', function(e) {
  if (e) {
    return console.log(e)
  }
  console.log('Successfully uploaded the buffer')
})

// Upload a string
const str = 'random string to be uploaded'
s3Client.putObject('my-bucketname', 'my-objectname3', str, 'text/plain', function(e) {
  if (e) {
    return console.log(e)
  }
  console.log('Successfully uploaded the string')
})

// Upload a Buffer without content-type (default: 'application/octet-stream')
s3Client.putObject('my-bucketname', 'my-objectname4', buf, function(e) {
  if (e) {
    return console.log(e)
  }
  console.log('Successfully uploaded the Buffer')
})
