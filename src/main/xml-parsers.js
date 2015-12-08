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

import Concat from 'concat-stream';
import ParseXml from 'xml-parser';

export function parseError(xml) {
  var e = {}
  var parsedXml = ParseXml(xml)
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
  }
  return e
}

export function parseListMultipart(xml) {
  var parsedXml = ParseXml(xml.toString()),
    result = {
      uploads: [],
      prefixes: [],
      isTruncated: false
    }
  parsedXml.root.children.forEach(element => {
    switch (element.name) {
      case 'IsTruncated':
        {
          result.isTruncated = element.content === 'true'
          break
        }
      case 'NextKeyMarker':
        {
          result.nextKeyMarker = element.content
          break
        }
      case 'NextUploadIdMarker':
        {
          result.nextUploadIdMarker = element.content
          break
        }

      case 'CommonPrefixes':
        { // todo, this is the only known way for now to propagate delimited entries
          var prefix = {}
          element.children.forEach(xmlPrefix => {
            switch (xmlPrefix.name) {
              case 'Prefix':
                {
                  prefix.prefix = xmlPrefix.content
                  break
                }
            }
          })
          result.prefixes.push(prefix)
          break
        }
      case 'Upload':
        {
          var upload = {}
          element.children.forEach(xmlObject => {
            switch (xmlObject.name) {
              case 'Key':
                {
                  upload.key = xmlObject.content
                  break
                }
              case 'UploadId':
                {
                  upload.uploadId = xmlObject.content
                  break
                }
              default:
            }
          })
          result.uploads.push(upload)
          break
        }
      default:
    }
  })
  return result
}

export function parseListBucket(xml) {
  var result = []
  var parsedXml = ParseXml(xml)
  parsedXml.root.children.forEach((element) => {
    if (element.name === 'Buckets') {
      element.children.forEach(bucketListing => {
        var bucket = {}
        bucketListing.children.forEach(prop => {
          switch (prop.name) {
            case 'Name':
              {
                bucket.name = prop.content
                break
              }
            case 'CreationDate':
              {
                bucket.creationDate = prop.content
                break
              }
          }
        })
        result.push(bucket)
      })
    }
  })
  return result
}

export function parseAcl(xml) {
  var parsedXml = ParseXml(xml),
    publicRead = false,
    publicWrite = false,
    authenticatedRead = false,
    authenticatedWrite = false

  var result = {
    owner: undefined,
    acl: []
  }

  parsedXml.root.children.forEach(element => {
    switch (element.name) {
      case 'Owner':
        {
          var ownerObj = {}
          element.children.forEach(element => {
            switch (element.name) {
              case 'ID':
                {
                  ownerObj.id = element.content
                  break
                }
              case 'DisplayName':
                {
                  ownerObj.displayName = element.content
                  break
                }
              default:
            }
          })
          result.owner = ownerObj
          break
        }
      case 'AccessControlList':
        {
          element.children.forEach(grant => {
            var granteeURL = null,
              permission = null
            var grantObj = {
              grantee: undefined,
              permission: undefined
            }
            grant.children.forEach(grantChild => {
              switch (grantChild.name) {
                case 'Grantee':
                  {
                    var granteeObj = {}
                    grantChild.children.forEach(grantee => {
                      switch (grantee.name) {
                        case 'URI':
                          {
                            granteeURL = grantee.content
                            granteeObj.uri = grantee.content
                            break
                          }
                        case 'ID':
                          {
                            granteeObj.id = grantee.content
                            break
                          }
                        case 'DisplayName':
                          {
                            granteeObj.displayName = grantee.content
                            break
                          }
                      }
                    })
                    grantObj.grantee = granteeObj
                    break
                  }
                case 'Permission':
                  {
                    permission = grantChild.content
                    grantObj.permission = grantChild.content
                    break
                  }
              }
            })
            result.acl.push(grantObj)
          })
          break
        }
    }
  })
  return result
}

export function parseBucketRegion(xml) {
  var parsedXml = ParseXml(xml)
  return parsedXml.root.content
}

export function parseListParts(xml) {
  var parsedXml = ParseXml(xml)
  var result = {
    isTruncated: false,
    parts: [],
    marker: undefined
  }
  parsedXml.root.children.forEach(element => {
    switch (element.name) {
      case 'IsTruncated':
        result.isTruncated = element.content === 'true'
        break
      case 'NextPartNumberMarker':
        result.marker = +element.content
        break
      case 'Part':
        var object = {}
        element.children.forEach(xmlObject => {
          switch (xmlObject.name) {
            case 'PartNumber':
              object.part = +xmlObject.content
              break
            case 'LastModified':
              object.lastModified = xmlObject.content
              break
            case 'ETag':
              object.etag = xmlObject.content.replace(/"/g, '').replace(/&quot;/g, '').replace(/&#34;/g, '')
              break
            case 'Size':
              object.size = +xmlObject.content
              break
            default:
          }
        })
        result.parts.push(object)
        break
      default:
        break
    }
  })
  return result
}

export function parseInitiateMultipart(xml) {
  var parsedXml = ParseXml(xml)
  var uploadId = null
  parsedXml.root.children.forEach(element => {
    if (element.name === 'UploadId') {
      uploadId = element.content
    }
  })
  return uploadId
}

export function parseCompleteMultipart(xml) {
  var parsedXml = ParseXml(xml)
  var result = {}
  parsedXml.root.children.forEach(element => {
    switch (element.name) {
      case 'Location':
        {
          result.location = element.content
          break
        }
      case 'Key':
        {
          result.key = element.content
          break
        }
      case 'Bucket':
        {
          result.bucket = element.content
          break
        }
      case 'ETag':
        {
          result.etag = element.content.replace(/"/g, '').replace(/&quot;/g, '').replace(/&#34;/g, '')
          break
        }
      default:
    }
  })
  return result
}

export function parseListObjects(xml) {
  var parsedXml = ParseXml(xml)
  var result = {
        objects: [],
        nextMarker: null,
        isTruncated: false
      }
  var marker
  parsedXml.root.children.forEach(element => {
    switch (element.name) {
      case 'IsTruncated':
        {
          result.isTruncated = element.content === 'true'
          break
        }
      case 'NextMarker':
        {
          result.nextMarker = element.content
          break
        }
      case 'Contents':
        {
          var content = {}
          element.children.forEach(xmlObject => {
            switch (xmlObject.name) {
              case 'Key':
                {
                  content.name = xmlObject.content
                  marker = content.name
                  break
                }
              case 'LastModified':
                {
                  content.lastModified = xmlObject.content
                  break
                }
              case 'Size':
                {
                  content.size = +xmlObject.content
                  break
                }
              case 'ETag':
                {
                  content.etag = xmlObject.content.replace(/"/g, '').replace(/&quot;/g, '').replace(/&#34;/g, '')
                  break
                }
              default:
            }
          })
          result.objects.push(content)
          break
        }
      case 'CommonPrefixes':
        { // todo, this is the only known way for now to propagate delimited entries
          var commonPrefixes = {}
          element.children.forEach(xmlPrefix => {
            switch (xmlPrefix.name) {
              case 'Prefix':
                {
                  commonPrefixes.name = xmlPrefix.content
                  commonPrefixes.size = 0
                  break
                }
              default:
            }
          })
          result.objects.push(commonPrefixes)
          break
        }
      default:
    }
  })
  if (result.isTruncated && !result.nextMarker) {
    result.nextMarker = marker
  }
  return result
}
