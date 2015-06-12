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

function parseListMultipartResult(bucket, key, response, cb) {
  response.pipe(Concat(xml => {
    var parsedXml = ParseXml(xml.toString())
    var result = {
      uploads: [],
      isTruncated: false,
      nextJob: null
    }
    var nextJob = {
      bucket: bucket,
      key: key
    }
    var ignoreTruncated = false
    parsedXml.root.children.forEach(element => {
      switch (element.name) {
        case "IsTruncated":
          result.isTruncated = element.content === 'true'
          break
        case "NextKeyMarker":
          nextJob.keyMarker = decodeURI(element.content)
          break
        case "NextUploadIdMarker":
          nextJob.uploadIdMarker = decodeURI(element.content)
          break
        case "Upload":
          var upload = {
            bucket: bucket,
            key: null,
            uploadId: null,
          }
          element.children.forEach(xmlObject => {
            switch (xmlObject.name) {
              case "Key":
                upload.key = decodeURI(xmlObject.content)
                break
              case "UploadId":
                upload.uploadId = decodeURI(xmlObject.content)
                break
              default:
            }
          })
          if (key) {
            if (key === upload.key) {
              result.uploads.push(upload)
            } else {
              ignoreTruncated = true
            }
          } else {
            result.uploads.push(upload)
          }
          break
        default:
      }
    })
    if (result.isTruncated && !ignoreTruncated) {
      result.nextJob = nextJob
    } else {
      result.isTruncated = false
    }
    cb(null, result)
  }))
}

module.exports = {
  parseError: parseError,
  parseListMultipartResult: parseListMultipartResult
}
