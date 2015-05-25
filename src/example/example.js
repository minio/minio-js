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

var minio = require('../..')
var stream = require('stream').Readable

var client = new minio({host: 'localhost', port: 9000})

client.createBucket('hello', (e) => {
    "use strict";
    if (e != null) {
        console.log(e)
    }
})

var s = new stream

s.push('hello world')
s.push(null)

client.putObject('hello', 'world', '', 11, s, (e) => {
    "use strict";
    if (e != null) {
        console.log(e)
    }
})

