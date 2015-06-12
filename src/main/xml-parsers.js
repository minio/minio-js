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

/*jshint sub: true */

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

function parseListBucketResult(response, stream) {
  response.pipe(Concat(errorXml => {
    var parsedXml = ParseXml(errorXml.toString())
    parsedXml.root.children.forEach(element => {
      if (element.name === 'Buckets') {
        element.children.forEach(bucketListing => {
          var bucket = {}
          bucketListing.children.forEach(prop => {
            switch (prop.name) {
              case "Name":
                bucket.name = prop.content
                break
              case "CreationDate":
                bucket.creationDate = prop.content
                break
            }
          })
          stream.push(bucket)
        })
      }
    })
    stream.push(null)
  }))
}

function parseAcl(response, cb) {
  response.pipe(Concat((body) => {
    var xml = ParseXml(body.toString())

    var publicRead = false
    var publicWrite = false
    var authenticatedRead = false
    var authenticatedWrite = false

    xml.root.children.forEach(element => {
      switch (element.name) {
        case "AccessControlList":
          element.children.forEach(grant => {
            var granteeURL = null
            var permission = null
            grant.children.forEach(grantChild => {
              switch (grantChild.name) {
                case "Grantee":
                  grantChild.children.forEach(grantee => {
                    switch (grantee.name) {
                      case "URI":
                        granteeURL = grantee.content
                        break
                    }
                  })
                  break
                case "Permission":
                  permission = grantChild.content
                  break
              }
            })
            if (granteeURL === 'http://acs.amazonaws.com/groups/global/AllUsers') {
              if (permission === 'READ') {
                publicRead = true
              } else if (permission === 'WRITE') {
                publicWrite = true
              }
            } else if (granteeURL === 'http://acs.amazonaws.com/groups/global/AuthenticatedUsers') {
              if (permission === 'READ') {
                authenticatedRead = true
              } else if (permission === 'WRITE') {
                authenticatedWrite = true
              }
            }
          })
          break
      }
    })
    var cannedACL = 'unsupported-acl'
    if (publicRead && publicWrite && !authenticatedRead && !authenticatedWrite) {
      cannedACL = 'public-read-write'
    } else if (publicRead && !publicWrite && !authenticatedRead && !authenticatedWrite) {
      cannedACL = 'public-read'
    } else if (!publicRead && !publicWrite && authenticatedRead && !authenticatedWrite) {
      cannedACL = 'authenticated-read'
    } else if (!publicRead && !publicWrite && !authenticatedRead && !authenticatedWrite) {
      cannedACL = 'private'
    }
    cb(null, cannedACL)
  }))
}

module.exports = {
  parseError: parseError,
  parseListMultipartResult: parseListMultipartResult,
  parseListBucketResult: parseListBucketResult,
  parseAcl: parseAcl
}
