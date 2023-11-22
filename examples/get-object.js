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

// Note: YOUR-ACCESSKEYID, YOUR-SECRETACCESSKEY, my-bucketname and my-objectname
// are dummy values, please replace them with original values.

import * as Minio from 'minio'

const s3Client = new Minio.Client({
  endPoint: 's3.amazonaws.com',
  accessKey: 'YOUR-ACCESSKEYID',
  secretKey: 'YOUR-SECRETACCESSKEY',
})

let size = 0
// Get a full object.
s3Client.getObject('my-bucketname', 'my-objectname', function (e, dataStream) {
  if (e) {
    return console.log(e)
  }
  dataStream.on('data', function (chunk) {
    size += chunk.length
  })
  dataStream.on('end', function () {
    console.log('End. Total size = ' + size)
  })
  dataStream.on('error', function (e) {
    console.log(e)
  })
})

//Get a specific version of an object
let versionedObjSize = 0
s3Client.getObject(
  'my-versioned-bucket',
  'my-versioned-object',
  { versionId: 'my-versionId' },
  function (err, dataStream) {
    if (err) {
      return console.log(err)
    }
    dataStream.on('data', function (chunk) {
      versionedObjSize += chunk.length
    })
    dataStream.on('end', function () {
      console.log('End. Total size = ' + versionedObjSize)
    })
    dataStream.on('error', function (err) {
      console.log(err)
    })
  },
)
