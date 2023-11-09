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

// Note: YOUR-ACCESSKEYID and YOUR-SECRETACCESSKEY are dummy values, please
// replace them with original values.

import * as Minio from 'minio'

const s3Client = new Minio.Client({
  endPoint: 's3.amazonaws.com',
  port: 9000,
  useSSL: false,
  accessKey: 'YOUR-ACCESSKEYID',
  secretKey: 'YOUR-SECRETACCESSKEY',
})

const objectsList = []
const bucketName = 'my-bucket'
const prefix = 'my-prefix'
const recursive = false

function removeObjects(bucketName, prefix, recursive, includeVersion) {
  // List all object paths in bucket
  var objectsStream = s3Client.listObjects(bucketName, prefix, recursive, { IncludeVersion: includeVersion })

  objectsStream.on('data', function (obj) {
    if (includeVersion) {
      objectsList.push(obj)
    } else {
      objectsList.push(obj.name)
    }
  })

  objectsStream.on('error', function (e) {
    return console.log(e)
  })

  objectsStream.on('end', function () {
    s3Client.removeObjects(bucketName, objectsList, function (e) {
      if (e) {
        return console.log(e)
      }
      console.log('Success')
    })
  })
}

removeObjects(bucketName, prefix, recursive, true) // Versioned objects of a bucket to be deleted.
removeObjects(bucketName, prefix, recursive, false) // Normal objects of a bucket to be deleted.

// Delete Multiple objects and respective versions.
function removeObjectsMultipleVersions() {
  const deleteList = [
    { versionId: '03ed08e1-34ff-4465-91ed-ba50c1e80f39', name: 'prefix-1/out.json.gz' },
    { versionId: '35517ae1-18cb-4a21-9551-867f53a10cfe', name: 'dir1/dir2/test.pdf' },
    { versionId: '3053f564-9aea-4a59-88f0-7f25d6320a2c', name: 'dir1/dir2/test.pdf' },
  ]

  s3Client.removeObjects('my-bucket', deleteList, function (e) {
    if (e) {
      return console.log(e)
    }
    console.log('Successfully deleted..')
  })
}
removeObjectsMultipleVersions()
