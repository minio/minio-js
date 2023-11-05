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

import * as Minio from 'minio'

const s3Client = new Minio.Client({
  endPoint: 's3.amazonaws.com',
  accessKey: 'YOUR-ACCESSKEYID',
  secretKey: 'YOUR-SECRETACCESSKEY',
})

try {
  //Set legal hold config of an object.
  await s3Client.setObjectLegalHold('bucketname', 'objectName')
  console.log('Success')
} catch (err) {
  console.log(err.message)
}

try {
  //Set legal hold config of an object version.
  await s3Client.setObjectLegalHold('bucketname', 'objectName', {
    status: 'ON',
    versionId: '67d3a60d-e837-4218-96d3-44733cdc7c6f',
  })
  console.log('Success')
} catch (err) {
  console.log(err.message)
}
