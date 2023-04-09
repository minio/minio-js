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

// Note: YOUR-ACCESSKEYID, YOUR-SECRETACCESSKEY, my-bucketname and my-objectname
// are dummy values, please replace them with original values.

var Minio = require('../dist/main/minio')
var Helpers = require('../dist/main/helpers')

var s3Client = new Minio.Client({
  endPoint: 's3.amazonaws.com',
  accessKey: 'YOUR-ACCESSKEYID',
  secretKey: 'YOUR-SECRETACCESSKEY',
})

const bucketName = 'source-bucket'

const sourceList = [
  new Helpers.CopySourceOptions({
    Bucket: bucketName,
    Object: 'parta',
    // other options if any.
  }),
  new Helpers.CopySourceOptions({
    Bucket: bucketName,
    Object: 'partb',
    // other options if any.
    //    VersionID:""
  }),
  new Helpers.CopySourceOptions({
    Bucket: bucketName,
    Object: 'partc',
  }),
  new Helpers.CopySourceOptions({
    Bucket: bucketName,
    Object: 'partd',
  }),
]

const destOption = new Helpers.CopyDestinationOptions({
  Bucket: bucketName,
  Object: '100MB.zip',
  /** Other possible options */
  /* Encryption:{
        type:Helpers.ENCRYPTION_TYPES.KMS,
        KMSMasterKeyID:'my-minio-key', //as per env value
        SSEAlgorithm:"aws:kms" // this is important
      }, */
  // UserTags:"tagKeyOverride=tagValueOverride&tgK2Ov=tgK2Ov",//querystring format.
  // UserTags:{tagKeyOverride:'tagValueOverride',tgK2Ov:'tgK2Ov'},//object format
  /* UserMetadata: {
    'X-Amz-Meta-Testing': 1234,
    'example': 5678
  }
  */
})

const composePromise = s3Client.composeObject(destOption, sourceList)
composePromise
  .then((result) => {
    console.log('ComposeObject Success...', result)
  })
  .catch((e) => {
    console.log('composeObject Promise Error', e)
  })
