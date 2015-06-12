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
 
var signV4 = require('./signing.js')
var xmlParsers = require('./xml-parsers.js')

function bucketRequest(self, method, bucket, cb) {
  var requestParams = {
    host: self.params.host,
    port: self.params.port,
    method: method,
    path: `/${bucket}`
  }

  signV4(requestParams, '', self.params.accessKey, self.params.secretKey)

  var req = self.transport.request(requestParams, response => {
    if (response.statusCode !== 204) {
      return xmlParsers.parseError(response, cb)
    }
    cb()
  })
  req.end()
}

module.exports = {
  bucketRequest: bucketRequest
}
