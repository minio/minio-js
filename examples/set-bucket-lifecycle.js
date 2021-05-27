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

// Note: YOUR-ACCESSKEYID, YOUR-SECRETACCESSKEY and my-bucketname are
// dummy values, please replace them with original values.

var Minio = require('minio')

var s3Client = new Minio.Client({
  endPoint: 's3.amazonaws.com',
  accessKey: 'YOUR-ACCESSKEYID',
  secretKey: 'YOUR-SECRETACCESSKEY'
})


const lifecycleConfig= {
  Rule: [{
    "ID": "Expiration Days Rule",
    "Status": "Enabled",
    "Filter": {
      "Prefix":"",
    },
    "Expiration": {
      "Days": "3650"
    }
  }
  ]
}

s3Client.setBucketLifecycle('bucketname',lifecycleConfig, function (err) {
  if (err) {
    return console.log(err)
  }
  console.log("Success")
})

//Example to demonstrate Expiration Date
const expirationDate = new Date()
expirationDate.setDate(expirationDate.getDate() + 1) // Expire next day.
expirationDate.setUTCHours(0,0,0,0)//Should be start of the day.(midnight)

const lifecycleConfigWithExpirationDate= {
  Rule: [{
    "ID": "Expiration Date Rule",
    "Status": "Enabled",
    "Filter": {
      "Prefix":"",
    },
    "Expiration": {
      Date:expirationDate.toISOString()
    }
  }
  ]
}

s3Client.setBucketLifecycle('bucketname',lifecycleConfigWithExpirationDate, function (err) {
  if (err) {
    return console.log(err)
  }
  console.log("Success")
})

