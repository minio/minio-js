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

// Note: YOUR-ACCESSKEYID, YOUR-SECRETACCESSKEY, my-bucketname
// and my-objectname are dummy values, please replace them with original values.

var Minio = require("../dist/main/minio")

var s3Client = new Minio.Client({
  endPoint: "s3.amazonaws.com",
  accessKey: "YOUR-ACCESSKEYID",
  secretKey: "YOUR-SECRETACCESSKEY",
})

// Reference: https://aws.amazon.com/blogs/storage/querying-data-without-servers-or-databases-using-amazon-s3-select/
const selectRequestConfig = {
  // expression:"SELECT * FROM s3object s where s.\"Name\" = 'Jane'",
  expression: "SELECT * FROM s3object s",
  expressionType: "SQL",
  inputSerialization: {
    CSV: { FileHeaderInfo: "Use", RecordDelimiter: "\n", FieldDelimiter: "," },
    CompressionType: "NONE",
  },
  outputSerialization: { CSV: { RecordDelimiter: "\n", FieldDelimiter: "," } },
  requestProgress: { Enabled: true },
  // scanRange:{ start:50, end:100 }
}

s3Client.selectObjectContent("my-bucketname", "my-objectname", selectRequestConfig, function (e, stat) {
  if (e) {
    return console.log(e)
  }
  console.log(stat)
})
