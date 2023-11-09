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

//Apply default encryption.
s3Client.setBucketEncryption('my-bucket', function (error) {
  if (error) {
    return console.log(error)
  }
  console.log('Success')
})

//Set Encryption Rule. Only one rule is allowed.

/**
 * The following rule is not supported.
 * ` { ApplyServerSideEncryptionByDefault: { KMSMasterKeyID: 'arn:aws:kms:us-east-1:1234/5678example', SSEAlgorithm:   "aws:kms" } }`
 */

const encryptionConfig = {
  Rule: [
    {
      ApplyServerSideEncryptionByDefault: {
        SSEAlgorithm: 'AES256',
      },
    },
  ],
}

s3Client.setBucketEncryption('my-bucket', encryptionConfig, function (error) {
  if (error) {
    return console.log(error)
  }
  console.log('Success')
})

/**
 * KMS ID based SSE Encryption
 * Sample Configuration:
 *
 * export MINIO_KMS_KES_ENDPOINT=https://play.min.io:7373;
 * export MINIO_KMS_KES_KEY_FILE=root.key;
 * export MINIO_KMS_KES_CERT_FILE=root.cert;
 * export MINIO_KMS_KES_KEY_NAME=my-minio-key; //KMS Key ID
 *
 * Start the server.
 *
 *
 * Sample stat on an object:
 * {
 *    size: 150029,
 *    metaData: {
 *      'content-type': 'application/octet-stream',
 *      'x-amz-server-side-encryption': 'aws:kms',
 *      'x-amz-server-side-encryption-aws-kms-key-id': 'my-minio-key', // the key will be printed here.
 *      example: '5678',
 *      testing: '1234'
 *    },
 *    lastModified: 2021-05-28T04:35:47.000Z,
 *    versionId: null,
 *    etag: '80f98a015af584b829f06c11f49f8e09'
 *  }
 */

const kmsIdEncryptionConfig = {
  Rule: [
    {
      ApplyServerSideEncryptionByDefault: {
        KMSMasterKeyID: 'my-minio-key', //as per env value
        SSEAlgorithm: 'aws:kms', // this is important
      },
    },
  ],
}

s3Client.setBucketEncryption('my-bucket', kmsIdEncryptionConfig, function (error) {
  if (error) {
    return console.log(error)
  }
  console.log('Success')
})
