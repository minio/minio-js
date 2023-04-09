/*
 * MinIO Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2016-2019 MinIO, Inc.
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
  endPoint: "localhost",
  port: 9000,
  useSSL: false,
  accessKey: "YOUR-ACCESSKEYID",
  secretKey: "YOUR-SECRETACCESSKEY",
})

var config = new Minio.NotificationConfig()
var arn = Minio.buildARN("minio", "sqs", "", "1", "webhook")
var queue = new Minio.QueueConfig(arn)

queue.addFilterSuffix(".jpg")
queue.addFilterPrefix("myphotos/")
queue.addEvent(Minio.ObjectCreatedAll)

config.add(queue)

s3Client.setBucketNotification("my-bucketname", config, function (e) {
  if (e) {
    return console.log(e)
  }
  console.log("Success")
})
