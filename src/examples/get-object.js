/*
 * Minio Javascript Library for Amazon S3 compatible cloud storage, (C) 2015 Minio, Inc.
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

var Minio = require('minio')
var Through2 = require('through2')

var s3client = new Minio({
  url: 'https://s3.amazonaws.com',
  accessKey: 'YOUR-ACCESSKEYID',
  secretKey: 'YOUR-SECRETACCESSKEY'
})

var size = 0
s3client.getObject('goroutine', 'hello/11mb', function(e, dataStream) {
  if (e) {
    return console.log(e)
  }

  dataStream.pipe(Through2(
    function(chunk, enc, done) {
      size += chunk.length
      done()
    },

    function(done) {
      console.log('total size: ' + size)
      done()
    }))
  dataStream.on('error', function(e) {
    console.log(e)
  })
})
