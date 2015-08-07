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

var helpers = require('./helpers.js'),
    signV4 = require('./signing.js').signV4,
    xmlParsers = require('./xml-parsers.js')

function bucketRequest(self, method, bucket, cb) {
  var path = `/${bucket}`
  request(self, method, path, cb)
}

function objectRequest(self, method, bucket, object, cb) {
  var path = `/${bucket}/${helpers.uriResourceEscape(object)}`
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
      return xmlParsers.parseError(response, cb)
    }
    cb()
  })
  req.end()
}

module.exports = {
  bucketRequest: bucketRequest,
  objectRequest: objectRequest
}
