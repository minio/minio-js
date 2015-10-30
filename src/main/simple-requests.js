/*
 * Minio Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2015 Minio, Inc.
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


import { uriResourceEscape } from './helpers.js';
import { signV4 } from './signing.js';
import { parseError } from './xml-parsers.js';

export function bucketRequest(self, method, bucket, cb) {
  var path = `/${bucket}`
  request(self, method, path, cb)
}

export function objectRequest(self, method, bucket, object, cb) {
  var path = `/${bucket}/${uriResourceEscape(object)}`
  request(self, method, path, cb)
}

function request(self, method, path, cb) {
  var requestParams = {
    host: self.params.host,
    port: self.params.port,
    method: method,
    path: path
  }

  signV4(requestParams, '', self.params.accessKey, self.params.secretKey)

  var req = self.transport.request(requestParams, response => {
    if (response.statusCode >= 300) {
      return parseError(response, cb)
    }
    cb()
  })
  req.end()
}
