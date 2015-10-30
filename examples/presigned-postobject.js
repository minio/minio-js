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

var Minio = require('./minio-js')
var superagent = require('superagent')
var _ = require('underscore')

// find out your s3 end point here:
// http://docs.aws.amazon.com/general/latest/gr/rande.html#s3_region
var s3Client = new Minio({
  url: 'https://<your-s3-endpoint>',
  accessKey: 'YOUR-ACCESSKEYID',
  secretKey: 'YOUR-SECRETACCESSKEY'
})

var policy = s3Client.newPostPolicy()

policy.setKey("keyname")
policy.setBucket("bucketname")
var expires = new Date
expires.setSeconds(24 * 60 * 60 * 10) //10 days
policy.setExpires(expires)

formData = s3Client.presignedPostPolicy(policy)

var req = superagent.post('https://s3-us-west-2.amazonaws.com/bucketname')
_.each(formData, function(value, key) {
  req.field(key, value)
})

// file contents
req.field('file', 'ooooooooooooo')

req.end(function(err, res) {
  if (err) {
    console.log(err.toString())
  }
})
