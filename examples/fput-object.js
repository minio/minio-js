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

const metaData = {
  'Content-Type': 'application/octet-stream',
  'X-Amz-Meta-Testing': 1234,
  'example': 5678
}

// Put a file in bucket my-bucketname.
var file = 'my-testfile'
s3Client.fPutObject('my-bucketname', 'my-objectname', file, metaData, function(e) {
  if (e) {
    return console.log(e)
  }
  console.log('Success')
})

// Put a file in bucket my-bucketname with content-type detected automatically.
// In this case it is `text/plain`.
var file = 'my-testfile.txt'
s3Client.fPutObject('my-bucketname', 'my-objectname', file, function(e) {
  if (e) {
    return console.log(e)
  }
  console.log('Success')
})
