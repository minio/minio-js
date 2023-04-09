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

// Note: YOUR-ACCESSKEYID, YOUR-SECRETACCESSKEY and my-bucketname are
// dummy values, please replace them with original values.

var Minio = require("minio")

var s3Client = new Minio.Client({
  endPoint: "s3.amazonaws.com",
  accessKey: "YOUR-ACCESSKEYID",
  secretKey: "YOUR-SECRETACCESSKEY",
})
// List all object paths in bucket my-bucketname.
var objectsStream = s3Client.listObjects("my-bucketname", "", true)
objectsStream.on("data", function (obj) {
  console.log(obj)
})
objectsStream.on("error", function (e) {
  console.log(e)
})

// List all object versions in bucket my-bucketname.
var objectsStreamWithVersions = s3Client.listObjects("my-bucketname", "", true, { IncludeVersion: true })
objectsStreamWithVersions.on("data", function (obj) {
  console.log(obj)
})
objectsStreamWithVersions.on("error", function (e) {
  console.log(e)
})

// Example to list only the prefixes of a bucket.
//Non versioned bucket with Prefix listing.
function listPrefixesOfABucket(buckName) {
  var objectsStream = s3Client.listObjects(buckName, "", false, {})
  var counter = 0
  objectsStream.on("data", function (obj) {
    if (obj.prefix) {
      counter += 1
    }
  })
  objectsStream.on("end", () => {
    console.log("Non Versioned Prefix Count:", counter)
  })
  objectsStream.on("error", function (e) {
    console.log("::Error:", e)
  })
}

listPrefixesOfABucket("your-bucket")
