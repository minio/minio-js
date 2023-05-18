/*
 * MinIO Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2016 MinIO, Inc.
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

// Note that `listenBucketNotification` is only available for MinIO, and not
// Amazon.

const Minio = require('minio')

var s3Client = new Minio.Client({
  endPoint: '...',
  accessKey: 'YOUR-ACCESSKEYID',
  secretKey: 'YOUR-SECRETACCESSKEY',
})

// Start listening for notifications on the bucket, using our arn.
let poller = s3Client.listenBucketNotification('bucket1', 'photos/', '.jpg', ['s3:ObjectCreated:*'])
// Notification will be emitted every time a new notification is received.
// For object creation, here is a sample record:

// { eventVersion: '2.0',
//   eventSource: 'aws:s3',
//   awsRegion: 'us-east-1',
//   eventTime: '2016-08-23T18:26:07.214Z',
//   eventName: 's3:ObjectCreated:Put',
//   userIdentity: { principalId: 'minio' },
//   requestParameters: { sourceIPAddress: '...' },
//   responseElements: {},
//   s3:
//    { s3SchemaVersion: '1.0',
//      configurationId: 'Config',
//      bucket:
//       { name: 'bucket1',
//         ownerIdentity: [Object],
//         arn: 'arn:aws:s3:::bucket1' },
//      object: { key: 'photos%2Fobject.jpg', size: 10, sequencer: '...' } } }
poller.on('notification', (record) => {
  console.log('New object: %s/%s (size: %d)', record.s3.bucket.name, record.s3.object.key, record.s3.object.size)

  // Now that we've received our notification, we can cancel the listener.
  // We could leave it open if we wanted to continue to receive notifications.
  poller.stop()
})

// Create an object - this should trigger a notification.
s3Client.putObject('bucket1', 'file.jpg', 'stringdata', (err, etag) => {
  if (err) throw err
})
