/*
 * MinIO Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2021 MinIO, Inc.
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


// Note: YOUR-ACCESSKEYID, YOUR-SECRETACCESSKEY, my-bucketname
// and my-objectname are dummy values, please replace them with original values.

var Minio = require('minio')

var s3Client = new Minio.Client({
  endPoint: 's3.amazonaws.com',
  accessKey: 'YOUR-ACCESSKEYID',
  secretKey: 'YOUR-SECRETACCESSKEY'
})

// Enable S3 transfer accelerate endpoint.
s3Client.SetS3TransferAccelerate("s3-accelerate.amazonaws.com")

// Upload a buffer
var buf = new Buffer(10)
buf.fill('a')
s3Client.putObject('my-bucketname', 'my-objectname2', buf, 'application/octet-stream', function(e) {
  if (e) {
    return console.log(e.message)
  }
  console.log("Success")
})

