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

// Note: YOUR-ACCESSKEYID, YOUR-SECRETACCESSKEY, my-objectname and my-bucketname
// are dummy values, please replace them with original values.

import * as Minio from 'minio'

const s3Client = new Minio.Client({
  endPoint: 's3.amazonaws.com',
  accessKey: 'YOUR-ACCESSKEYID',
  secretKey: 'YOUR-SECRETACCESSKEY',
  useSSL: true, // Default is true.
})

// Construct a new postPolicy.
var policy = s3Client.newPostPolicy()
// Set the object name my-objectname.
policy.setKey('my-objectname')
// Set the bucket to my-bucketname.
policy.setBucket('my-bucketname')

var expires = new Date()
expires.setSeconds(24 * 60 * 60 * 10) //10 days
policy.setExpires(expires)

policy.setContentLengthRange(1024, 1024 * 1024) // Min upload length is 1KB Max upload size is 1MB

policy.setContentType('text/plain')

policy.setContentDisposition('attachment; filename=text.txt')

policy.setUserMetaData({
  key: 'value',
})

s3Client.presignedPostPolicy(policy, function (e, data) {
  if (e) return console.log(e)
  var curl = []
  curl.push(`curl ${data.postURL}`)
  for (var key in data.formData) {
    if (data.formData.hasOwnProperty(key)) {
      var value = data.formData[key]
      curl.push(`-F ${key}=${value}`)
    }
  }
  // Print curl command to upload files.
  curl.push('-F file=@<FILE>')
  console.log(curl.join(' '))
})
