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

s3Client.getObjectLegalHold('test-l-bucket', 'inspect-data.enc', (e, res) => {
  if (e) {
    console.log('CB Error 1', e.message)
    return
  }
  console.log('CB Success Res', res)
})

s3Client.getObjectLegalHold('test-l-bucket', null, (e, res) => {
  if (e) {
    console.log('CB Error 2', e.message)
    return
  }
  console.log('CB Success Res 2', res)
})

try {
  const buckets = await s3Client.getObjectLegalHold('test-l-bucket', 'inspect-data.enc', { versionId: 1234 })
  console.log('Default Success', buckets)
} catch (err) {
  console.log('Error::', err.message)
}
/*
// with version Id
try {
  const buckets = await s3Client.getObjectLegalHold(null, 'inspect-data.enc', {versionId:'d24cbb1b-81c2-449d-b6d0-8a5f19b66b05'})
  console.log('Version Success', buckets)
} catch (err) {
  console.log(err.message)
}
*/
