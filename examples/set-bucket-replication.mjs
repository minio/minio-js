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

const arnFromMcCli = 'arn:minio:replication::b22d653b-e4fb-4c5d-8140-7694c8e72ed4:dest-bucket'
const replicationConfig = {
  role: arnFromMcCli,
  rules: [
    {
      ID: 'cisea130mbms6splbmg0',
      Status: 'Enabled',
      Priority: 1,
      DeleteMarkerReplication: { Status: 'Enabled' },
      DeleteReplication: { Status: 'Enabled' },
      Destination: {
        Bucket: 'arn:aws:s3:::dest-bucket',
        StorageClass: 'REDUCED_REDUNDANCY',
      },
      SourceSelectionCriteria: { ReplicaModifications: { Status: 'Enabled' } },
      Filter: {
        //Possible values.
        // Prefix: '/',
        // Tag: [{ 'Key': 'key1', 'Value': 'value1' }, { 'Key': 'key2', 'Value': 'value2' }],//if only this,  =>    'DeleteMarkerReplication': { 'Status': 'Disabled' },
        And: {
          Prefix: '/',
          Tag: [
            { Key: 'key1', Value: 'value1' },
            { Key: 'key2', Value: 'value2' },
          ],
        },
      },
      ExistingObjectReplication: { Status: 'Enabled' },
    },
  ],
}

try {
  await s3Client.setBucketReplication('source-bucket', replicationConfig)
  console.log('Success')
} catch (err) {
  console.log(err.message)
}

/**
 * Steps to configure bucket replication
 * Create Site 1
 * CI=true  MINIO_ROOT_USER=minio MINIO_ROOT_PASSWORD=minio123 minio server /tmp/sem{1...4}  --address ":22000" --console-address ":9025"
 * mc alias set local22 http://localhost:22000 minio minio123
 * Create Site 2
 * CI=true  MINIO_ROOT_USER=minio MINIO_ROOT_PASSWORD=minio123 minio server /tmp/sem-1{1...4}  --address ":23000" --console-address ":9035"
 * mc alias set local23 http://localhost:23000 minio minio123
 *
 * mc mb local22/source-bucket
 * mc mb local23/dest-bucket
 * mc version enable local22/source-bucket
 * mc version enable local23/dest-bucket
 *
 *
 * ➜ mc replicate add local22/source-bucket --remote-bucket http://minio:minio123@localhost:23000/dest-bucket --priority 1
 *
 * mc replicate ls local22/source-bucket  --json| jq .rule.Destination.Bucket  # to obtain the arn
 *
 * Result
 * ➜ mc replicate ls local22/source-bucket --json
 *
 * mc replicate add local22/source-bucket --remote-bucket http://minio:minio123@localhost:23000/dest-bucket --replicate "existing-objects,delete,delete-marker" --priority 1 --tags "key1=value1&key2=value2" --bandwidth "2G" --sync
 */
