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
 
var Concat = require('concat-stream')
var ParseXml = require('xml-parser')

var parseError = (response, cb) => {
  if (response.statusCode === 301) {
    return cb({
      code: 'MovedPermanently',
      message: 'Moved Permanently',
      requestId: null,
      hostId: null,
      resource: null
    })
  }
  if (response.statusCode === 404) {
    return cb({
      code: 'NotFound',
      message: '404: Not Found',
      requestId: null,
      hostId: null,
      resource: null
    })
  }
  response.pipe(Concat(errorXml => {
    var parsedXml = ParseXml(errorXml.toString())
    var e = {}
    parsedXml.root.children.forEach(element => {
      if (element.name === 'Code') {
        e.code = element.content
      } else if (element.name === 'Message') {
        e.message = element.content
      } else if (element.name === 'RequestId') {
        e.requestid = element.content
      } else if (element.name === 'Resource') {
        e.resource = element.content
      } else if (element.name === 'HostId') {
        e.hostid = element.content
      }
    })
    cb(e)
  }))
}

module.exports = {
  parseError: parseError
}
