/*
 * Minimal Object Storage Library, (C) 2015 Minio, Inc.
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

var minio = require('minio')
var stream = require('stream').Readable

var s3client = new minio({
  host: 'localhost',
  port: 9000
})

s3client.makeBucket('hello', function(e) {
  "use strict";
  if (e) {
    console.log(e)
    return
  }

  var newObjectStream = new stream
  newObjectStream.push('hello world')
  newObjectStream.push(null)

  s3client.putObject('hello', 'world', '', 11, newObjectStream, function(e) {
    "use strict";
    if (e) {
      console.log(e)
      return
    }
    s3client.getObject('hello', 'world', function(e, r) {
      "use strict";
      if (e) {
        console.log(e)
        return
      }
      r.pipe(process.stdout)
    })
  })
})
