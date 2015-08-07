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

var Concat = require('concat-stream'),
    ParseXml = require('xml-parser'),
    helpers = require('./helpers.js'),
    parseError = (response, cb) => {
      if (typeof response !== 'undefined') {
        response.pipe(Concat(errorXml => {
          var e = {}
          e.requestId = response.headersSent ? response.getHeader('x-amz-request-id') : null
          if (errorXml.length === 0) {
            if (response.statusCode === 301) {
              e.code = 'MovedPermanently'
              e.message = 'Moved Permanently'
            } else if (response.statusCode === 307) {
              e.code = 'TemporaryRedirect'
              e.message = 'Are you using the correct endpoint URL?'
            } else if (response.statusCode === 403) {
              e.code = 'AccessDenied'
              e.message = 'Valid and authorized credentials required'
            } else if (response.statusCode === 404) {
              e.code = 'NotFound'
              e.message = 'Not Found'
            } else if (response.statusCode === 405) {
              e.code = 'MethodNotAllowed'
              e.message = 'Method Not Allowed'
            } else if (response.statusCode === 501) {
              e.code = 'MethodNotAllowed'
              e.message = 'Method Not Allowed'
            } else {
              e.code = 'UnknownError'
              e.message = `${response.statusCode}`
            }
            return cb(e)
          }

          var parsedXml = ParseXml(errorXml.toString())
          if (typeof parsedXml.root !== 'undefined') {
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
            return cb(e)
          }
        }))
      } else {
        return cb('No response was received')
      }
    }

function parseListMultipartResult(bucket, key, response, cb) {
  response.pipe(Concat(xml => {
    var parsedXml = ParseXml(xml.toString()),
        result = {
          uploads: [],
          isTruncated: false,
          nextJob: null
        },
        nextJob = {
          bucket: bucket,
          key: key
        },
        ignoreTruncated = false
    parsedXml.root.children.forEach(element => {
      switch (element.name) {
      case 'IsTruncated': {
        result.isTruncated = element.content === 'true'
        break
      }
      case 'NextKeyMarker': {
        nextJob.keyMarker = element.content
        break
      }
      case 'NextUploadIdMarker': {
        nextJob.uploadIdMarker = element.content
        break
      }
      case 'Upload': {
        var upload = {
          bucket: bucket,
          key: null,
          uploadId: null
        }
        element.children.forEach(xmlObject => {
          switch (xmlObject.name) {
          case 'Key': {
            upload.key = helpers.uriResourceEscape(xmlObject.content)
            break
          }
          case 'UploadId': {
            upload.uploadId = xmlObject.content
            break
          }
          default:
          }
        })
        if (key) {
          if (helpers.uriResourceEscape(key) === upload.key) {
            result.uploads.push(upload)
          } else {
            ignoreTruncated = true
          }
        } else {
          result.uploads.push(upload)
        }
        break
      }
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
            case 'Name': {
              bucket.name = prop.content
              break
            }
            case 'CreationDate': {
              bucket.creationDate = prop.content
              break
            }
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
    var xml = ParseXml(body.toString()),
        publicRead = false,
        publicWrite = false,
        authenticatedRead = false,
        authenticatedWrite = false

    xml.root.children.forEach(element => {
      switch (element.name) {
      case 'AccessControlList': {
        element.children.forEach(grant => {
          var granteeURL = null,
              permission = null
          grant.children.forEach(grantChild => {
            switch (grantChild.name) {
            case 'Grantee': {
              grantChild.children.forEach(grantee => {
                switch (grantee.name) {
                case 'URI': {
                  granteeURL = grantee.content
                  break
                }
                }
              })
              break
            }
            case 'Permission': {
              permission = grantChild.content
              break
            }
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
