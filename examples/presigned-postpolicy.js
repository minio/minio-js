/*
 * Minio Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2015 Minio, Inc.
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

var Minio = require('minio')

// find out your s3 end point here:
// http://docs.aws.amazon.com/general/latest/gr/rande.html#s3_region
var s3Client = new Minio({
  endPoint: 'https://s3.amazonaws.com',
  accessKey: 'YOUR-ACCESSKEYID',
  secretKey: 'YOUR-SECRETACCESSKEY'
})

// construct a new postPolicy.
var policy = s3Client.newPostPolicy()
policy.setKey("keyName")
policy.setBucket("bucketName")

var expires = new Date
expires.setSeconds(24 * 60 * 60 * 10) //10 days
policy.setExpires(expires)

policy.setContentLength(1024, 1024*1024) // Min upload length is 1KB Max upload size is 1MB

s3Client.presignedPostPolicy(policy, function(e, formData) {
  if (e) return console.log(e)
  var curl = []
  curl.push('curl https://s3.amazonaws.com/bucketName')
  for (var key in formData) {
    if (formData.hasOwnProperty(key)) {
      var value = formData[key]
      curl.push(`-F ${key}=${value}`)
    }
  }
  curl.push('-F file=@<FILE>')
  console.log(curl.join(' '))
})
