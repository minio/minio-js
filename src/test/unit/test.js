/*
 * Minimal Object Storage Library, (C) 2016 Minio, Inc.
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

require('source-map-support').install()

var Assert = require('assert')
var Concat = require('concat-stream')
var Http = require('http')
var Nock = require('nock')
var Package = require('../../../package.json')
var Through2 = require('through2')
var Stream = require('stream')

var Rewire = require('rewire')
var minio = Rewire('../../..')
var upload = require('../../../dist/main/upload.js')
var multipart = require('../../../dist/main/multipart.js')

var MockTransport = require('./transport.js')

describe('Client', () => {
  "use strict";

  var nockRequests = []
  beforeEach(() => {
    Nock.cleanAll()
    nockRequests = []
  })
  afterEach(() => {
    nockRequests.forEach(element => {
      if (!element.request.isDone()) {
        element.request.done()
      }
    })
  })
  var MockResponse = (address) => {
    var request = Nock(address)
    var trace = new Error().stack
    nockRequests.push({
      request: request,
      trace: trace
    })
    return request
  }
  var client = new minio({
    url: 'http://localhost:9000',
    accessKey: "accesskey",
    secretKey: "secretkey"
  })
  describe('new client', () => {
    it('should work with http', () => {
      var client = new minio({
        url: 'http://localhost',
        accessKey: "accesskey",
        secretKey: "secretkey"
      })
      Assert.equal(client.params.port, 80)
    })
    it('should override port with http', () => {
      var client = new minio({
        url: 'http://localhost:9000',
        accessKey: "accesskey",
        secretKey: "secretkey"
      })
      Assert.equal(client.params.port, 9000)
    })
    it('should work with https', () => {
      var client = new minio({
        url: 'https://localhost',
        accessKey: "accesskey",
        secretKey: "secretkey"
      })
      Assert.equal(client.params.port, 443)
    })
    it('should override port with https', () => {
      var client = new minio({
        url: 'https://localhost:9000',
        accessKey: "accesskey",
        secretKey: "secretkey"
      })
      Assert.equal(client.params.port, 9000)
    })
    it('should fail with no url', (done) => {
      try {
        new minio({ // jshint ignore:line
          accessKey: "accesskey",
          secretKey: "secretkey"
        })
      } catch (e) {
        done()
      }
    })
    it('should fail with no scheme', (done) => {
      try {
        new minio({ // jshint ignore:line
          url: 'localhost',
          accessKey: "accesskey",
          secretKey: "secretkey"
        })
      } catch (e) {
        done()
      }
    })
  })
  describe('User Agent', () => {
    it('should have a default user agent', () => {
      var client = new minio({
        url: 'https://localhost:9000',
        accessKey: "accesskey",
        secretKey: "secretkey"
      })
      Assert.equal(`minio-js/${Package.version} (${process.platform}; ${process.arch})`, client.params.agent)
    })
    it('should add to the user agent', () => {
      var client = new minio({
        url: 'https://localhost:9000',
        accessKey: "accesskey",
        secretKey: "secretkey"
      })
      client.addUserAgent('test', '1.0.0', ['comment', 'on', 'life'])
      Assert.equal(`minio-js/${Package.version} (${process.platform}; ${process.arch}) test/1.0.0 (comment; on; life)`, client.params.agent)
    })
    it('should add to the user agent without comments', () => {
      var client = new minio({
        url: 'https://localhost:9000',
        accessKey: "accesskey",
        secretKey: "secretkey"
      })
      client.addUserAgent('test', '1.0.0', [])
      Assert.equal(`minio-js/${Package.version} (${process.platform}; ${process.arch}) test/1.0.0`, client.params.agent)
    })
    it('should add to the user agent without name', (done) => {
      try {
        var client = new minio({
          url: 'https://localhost:9000',
          accessKey: "accesskey",
          secretKey: "secretkey"
        })
        client.addUserAgent(null, '1.0.0')
      } catch (e) {
        done()
      }
    })
    it('should add to the user agent with empty name', (done) => {
      try {
        var client = new minio({
          url: 'https://localhost:9000',
          accessKey: "accesskey",
          secretKey: "secretkey"
        })
        client.addUserAgent('', '1.0.0')
      } catch (e) {
        done()
      }
    })
    it('should add to the user agent without version', (done) => {
      try {
        var client = new minio({
          url: 'https://localhost:9000',
          accessKey: "accesskey",
          secretKey: "secretkey"
        })
        client.addUserAgent('test', null)
      } catch (e) {
        done()
      }
    })
    it('should add to the user agent with empty version', (done) => {
      try {
        var client = new minio({
          url: 'https://localhost:9000',
          accessKey: "accesskey",
          secretKey: "secretkey"
        })
        client.addUserAgent('test', '')
      } catch (e) {
        done()
      }
    })
  })
  describe('Authentication', () => {
    describe('not set', () => {
      var transport = new MockTransport()
      var client = new minio({
        url: 'http://localhost:9000'
      }, transport)
      it('should not send auth info without keys', (done) => {
        client.transport.addRequest((params) => {
          Assert.deepEqual(params, {
            host: 'localhost',
            port: 9000,
            path: '/bucket/object',
            method: 'HEAD'
          })
        }, 200, {
          'etag': 'etag',
          'content-length': 11,
          'last-modified': 'lastmodified'
        }, null)
        client.statObject('bucket', 'object', (e, r) => {
          Assert.deepEqual(r, {
            size: '11',
            'lastModified': 'lastmodified',
            etag: 'etag'
          })
          done()
        })
      })
    })
    describe('set with access and secret keys', () => {
      it('should not send auth info without keys', (done) => {
        var transport = new MockTransport()
        var client = new minio({
          url: 'http://localhost:9000',
          accessKey: 'accessKey',
          secretKey: 'secretKey'
        }, transport)
        client.transport.addRequest((params) => {
          Assert.equal(true, params.headers.authorization !== null)
          Assert.equal(true, params.headers.authorization.indexOf('accessKey') > -1)
          Assert.equal(true, params.headers['x-amz-date'] !== null)
          delete params.headers.authorization
          delete params.headers['x-amz-date']
          Assert.deepEqual(params, {
            host: 'localhost',
            port: 9000,
            path: '/bucket/object',
            method: 'HEAD',
            headers: {
              host: 'localhost',
              'x-amz-content-sha256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
            }
          })
        }, 200, {
          'etag': 'etag',
          'content-length': 11,
          'last-modified': 'lastmodified'
        }, null)
        client.statObject('bucket', 'object', (e, r) => {
          Assert.deepEqual(r, {
            size: '11',
            'lastModified': 'lastmodified',
            etag: 'etag'
          })
          done()
        })
      })
    })
  })

  describe('Bucket API calls', () => {
    describe('#makeBucket(bucket, callback)', () => {
      it('should call the callback on success', (done) => {
        MockResponse('http://localhost:9000').put('/bucket', '<CreateBucketConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"></CreateBucketConfiguration>').reply(200)
        client.makeBucket('bucket', done)
      })
      it('pass an error into the callback on failure', (done) => {
        MockResponse('http://localhost:9000').put('/bucket', '<CreateBucketConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"></CreateBucketConfiguration>').reply(400, generateError('code', 'message', 'requestid', 'hostid', '/bucket'))
        client.makeBucket('bucket', checkError('code', 'message', 'requestid', 'hostid', '/bucket', done))
      })
      it('should fail on null bucket', (done) => {
        client.makeBucket(null, (e) => {
          Assert(e, 'bucket name cannot be empty')
          done()
        })
      })
      it('should fail on empty bucket', (done) => {
        client.makeBucket("", (e) => {
          Assert(e, 'bucket name cannot be empty')
          done()
        })
      })
      it('should fail on empty bucket', (done) => {
        client.makeBucket("  \n  \t  ", (e) => {
          Assert(e, 'bucket name cannot be empty')
          done()
        })
      })
    })

    describe("#listBuckets()", () => {
      it('should generate a bucket iterator', (done) => {
        MockResponse('http://localhost:9000').get('/').reply(200, "<ListAllMyBucketsResult xmlns=\"http://doc.s3.amazonaws.com/2006-03-01\"><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner><Buckets><Bucket><Name>bucket</Name><CreationDate>2015-05-05T20:35:51.410Z</CreationDate></Bucket><Bucket><Name>foo</Name><CreationDate>2015-05-05T20:35:47.170Z</CreationDate></Bucket></Buckets></ListAllMyBucketsResult>")
        var stream = client.listBuckets()
        var results = []
        var expectedResults = [{
          name: 'bucket',
          creationDate: "2015-05-05T20:35:51.410Z"
        }, {
          name: 'foo',
          creationDate: "2015-05-05T20:35:47.170Z"
        }]
        stream.pipe(Through2.obj(function(bucket, enc, end) {
          results.push(bucket)
          end()
        }, function(end) {
          Assert.deepEqual(results, expectedResults)
          end()
          done()
        }))
      })
      it('should pass error to callback', (done) => {
        MockResponse('http://localhost:9000').get('/').reply(400, generateError('code', 'message', 'requestid', 'hostid', '/'))
        var stream = client.listBuckets()
        stream.pipe(Through2.obj(function(part, enc, end) {
          end()
        }, function(end) {
          end()
        }))
        stream.on('error', (e) => {
          checkError('code', 'message', 'requestid', 'hostid', '/')(e)
          done()
        })
      })
    })

    describe('#bucketExists(bucket, cb)', () => {
      it('should call callback with no options if successful', (done) => {
        MockResponse('http://localhost:9000').head('/bucket').reply(204)
        client.bucketExists('bucket', (e) => {
          Assert.equal(e, null)
          done()
        })
      })
      it('should pass error to callback', (done) => {
        MockResponse('http://localhost:9000').head('/bucket').reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))
        client.bucketExists('bucket', checkError('code', 'message', 'requestid', 'hostid', 'resource', (r) => {
          Assert.equal(r, null)
          done()
        }))
      })
      it('should return an error on moved permanently', (done) => {
        MockResponse('http://localhost:9000').head('/bucket').reply(301)
        client.bucketExists('bucket', checkError('MovedPermanently', 'Moved Permanently', null, null, null, (r) => {
          Assert.equal(r, null)
          done()
        }))
      })
      it('should return an error on 404', (done) => {
        MockResponse('http://localhost:9000').head('/bucket').reply(404)
        client.bucketExists('bucket', checkError('NotFound', '404: Not Found', null, null, null, (r) => {
          Assert.equal(r, null)
          done()
        }))
      })
      it('should fail on null bucket', (done) => {
        client.bucketExists(null, (e) => {
          Assert(e, 'bucket name cannot be empty')
          done()
        })
      })
      it('should fail on empty bucket', (done) => {
        client.bucketExists("", (e) => {
          Assert(e, 'bucket name cannot be empty')
          done()
        })
      })
      it('should fail on empty bucket', (done) => {
        client.bucketExists("  \n  \t  ", (e) => {
          Assert(e, 'bucket name cannot be empty')
          done()
        })
      })
    })

    describe('#removeBucket(bucket, cb)', () => {
      it('should remove a bucket', (done) => {
        MockResponse('http://localhost:9000').delete('/bucket').reply(204)
        client.removeBucket('bucket', () => {
          done()
        })
      })
      it('should pass error to callback', (done) => {
        MockResponse('http://localhost:9000').delete('/bucket').reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))
        client.removeBucket('bucket', checkError('code', 'message', 'requestid', 'hostid', 'resource', (r) => {
          Assert.equal(r, null)
          done()
        }))
      })
      it('should fail on null bucket', (done) => {
        client.removeBucket(null, (e) => {
          Assert(e, 'bucket name cannot be empty')
          done()
        })
      })
      it('should fail on empty bucket', (done) => {
        client.removeBucket("", (e) => {
          Assert(e, 'bucket name cannot be empty')
          done()
        })
      })
      it('should fail on empty bucket', (done) => {
        client.removeBucket("  \n  \t  ", (e) => {
          Assert(e, 'bucket name cannot be empty')
          done()
        })
      })
    })

    describe('#getBucketACL(bucket, cb)', () => {
      it('should return public-read-write acl', (done) => {
        MockResponse('http://localhost:9000').get('/bucket?acl').reply(200, '<AccessControlPolicy xmlns=\"http://s3.amazonaws.com/doc/2006-03-01\"><Owner><ID>75aa57f09aa0c8caeab4f8c24e99d10f8e7faeebf76c078efc7c6caea54ba06a</ID><DisplayName>CustomersName@amazon.com</DisplayName></Owner><AccessControlList><Grant><Grantee xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xsi:type=\"CanonicalUser\"><ID>75aa57f09aa0c8caeab4f8c24e99d10f8e7faeebf76c078efc7c6caea54ba06a</ID><DisplayName>CustomersName@amazon.com</DisplayName><URI>http://acs.amazonaws.com/groups/global/AllUsers</URI></Grantee><Permission>WRITE</Permission></Grant><Grant><Grantee xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xsi:type=\"CanonicalUser\"><ID>75aa57f09aa0c8caeab4f8c24e99d10f8e7faeebf76c078efc7c6caea54ba06a</ID><DisplayName>CustomersName@amazon.com</DisplayName><URI>http://acs.amazonaws.com/groups/global/AllUsers</URI></Grantee><Permission>READ</Permission></Grant><Grant><Grantee xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xsi:type=\"CanonicalUser\"><ID>75aa57f09aa0c8caeab4f8c24e99d10f8e7faeebf76c078efc7c6caea54ba06a</ID><DisplayName>CustomersName@amazon.com</DisplayName></Grantee><Permission>FULL_CONTROL</Permission></Grant></AccessControlList></AccessControlPolicy>')
        client.getBucketACL('bucket', (e, r) => {
          Assert.equal(e, null)
          Assert.equal(r, "public-read-write")
          done()
        })
      })
      it('should return public-read acl', (done) => {
        MockResponse('http://localhost:9000').get('/bucket?acl').reply(200, '<AccessControlPolicy xmlns=\"http://s3.amazonaws.com/doc/2006-03-01\"><Owner><ID>75aa57f09aa0c8caeab4f8c24e99d10f8e7faeebf76c078efc7c6caea54ba06a</ID><DisplayName>CustomersName@amazon.com</DisplayName></Owner><AccessControlList><Grant><Grantee xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xsi:type=\"CanonicalUser\"><ID>75aa57f09aa0c8caeab4f8c24e99d10f8e7faeebf76c078efc7c6caea54ba06a</ID><DisplayName>CustomersName@amazon.com</DisplayName><URI>http://acs.amazonaws.com/groups/global/AllUsers</URI></Grantee><Permission>READ</Permission></Grant><Grant><Grantee xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xsi:type=\"CanonicalUser\"><ID>75aa57f09aa0c8caeab4f8c24e99d10f8e7faeebf76c078efc7c6caea54ba06a</ID><DisplayName>CustomersName@amazon.com</DisplayName></Grantee><Permission>FULL_CONTROL</Permission></Grant></AccessControlList></AccessControlPolicy>')
        client.getBucketACL('bucket', (e, r) => {
          Assert.equal(e, null)
          Assert.equal(r, "public-read")
          done()
        })
      })
      it('should return authenticated-read acl', (done) => {
        MockResponse('http://localhost:9000').get('/bucket?acl').reply(200, '<AccessControlPolicy xmlns="http://s3.amazonaws.com/doc/2006-03-01"><Owner><ID>75aa57f09aa0c8caeab4f8c24e99d10f8e7faeebf76c078efc7c6caea54ba06a</ID><DisplayName>CustomersName@amazon.com</DisplayName></Owner><AccessControlList><Grant><Grantee xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="CanonicalUser"><ID>75aa57f09aa0c8caeab4f8c24e99d10f8e7faeebf76c078efc7c6caea54ba06a</ID><DisplayName>CustomersName@amazon.com</DisplayName><URI>http://acs.amazonaws.com/groups/global/AuthenticatedUsers</URI></Grantee><Permission>READ</Permission></Grant><Grant><Grantee xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="CanonicalUser"><ID>75aa57f09aa0c8caeab4f8c24e99d10f8e7faeebf76c078efc7c6caea54ba06a</ID><DisplayName>CustomersName@amazon.com</DisplayName></Grantee><Permission>FULL_CONTROL</Permission></Grant></AccessControlList></AccessControlPolicy>')
        client.getBucketACL('bucket', (e, r) => {
          Assert.equal(e, null)
          Assert.equal(r, 'authenticated-read')
          done()
        })
      })
      it('should return private acl', (done) => {
        MockResponse('http://localhost:9000').get('/bucket?acl').reply(200, '<AccessControlPolicy xmlns="http://s3.amazonaws.com/doc/2006-03-01"><Owner><ID>75aa57f09aa0c8caeab4f8c24e99d10f8e7faeebf76c078efc7c6caea54ba06a</ID><DisplayName>CustomersName@amazon.com</DisplayName></Owner><AccessControlList><Grant><Grantee xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="CanonicalUser"><ID>75aa57f09aa0c8caeab4f8c24e99d10f8e7faeebf76c078efc7c6caea54ba06a</ID><DisplayName>CustomersName@amazon.com</DisplayName></Grantee><Permission>FULL_CONTROL</Permission></Grant></AccessControlList></AccessControlPolicy>')
        client.getBucketACL('bucket', (e, r) => {
          Assert.equal(e, null)
          Assert.equal(r, 'private')
          done()
        })
      })
      it('should pass error to callback', (done) => {
        MockResponse('http://localhost:9000').get('/bucket?acl').reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))
        client.getBucketACL('bucket', checkError('code', 'message', 'requestid', 'hostid', 'resource', done))
      })
      it('should fail on null bucket', (done) => {
        client.getBucketACL(null, (e) => {
          Assert(e, 'bucket name cannot be empty')
          done()
        })
      })
      it('should fail on empty bucket', (done) => {
        client.getBucketACL("", (e) => {
          Assert(e, 'bucket name cannot be empty')
          done()
        })
      })
      it('should fail on empty bucket', (done) => {
        client.getBucketACL("  \n  \t  ", (e) => {
          Assert(e, 'bucket name cannot be empty')
          done()
        })
      })
    })

    describe('#setBucketACL(bucket, acl, cb)', () => {
      it('should set acl', (done) => {
        var transport = new MockTransport()
        var client = new minio({
          url: 'http://localhost:9000'
        }, transport)
        client.transport.addRequest((params) => {
          Assert.deepEqual(params, {
            host: 'localhost',
            port: 9000,
            path: '/bucket?acl',
            method: 'PUT',
            headers: {
              'x-amz-acl': 'public'
            }
          })
        }, 200, {
          'etag': 'etag',
          'content-length': 11,
          'last-modified': 'lastmodified'
        }, null)
        client.setBucketACL('bucket', 'public', (e) => {
          Assert.equal(e, null)
        })
        done()
      })
      it('should pass error to callback', (done) => {
        MockResponse('http://localhost:9000').put('/bucket?acl').reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))
        client.setBucketACL('bucket', 'public', checkError('code', 'message', 'requestid', 'hostid', 'resource', (r) => {
          Assert.equal(r, null)
          done()
        }))
      })
      it('should fail on null bucket', (done) => {
        client.setBucketACL(null, "public", (e) => {
          Assert(e, 'bucket name cannot be empty')
          done()
        })
      })
      it('should fail on empty bucket', (done) => {
        client.setBucketACL("", "public", (e) => {
          Assert(e, 'bucket name cannot be empty')
          done()
        })
      })
      it('should fail on empty bucket', (done) => {
        client.setBucketACL("  \n  \t  ", "public", (e) => {
          Assert(e, 'bucket name cannot be empty')
          done()
        })
      })
      it('should fail on null acl', (done) => {
        client.setBucketACL("hello", null, (e) => {
          Assert(e, 'acl name cannot be empty')
          done()
        })
      })
      it('should fail on empty acl', (done) => {
        client.setBucketACL("hello", "", (e) => {
          Assert(e, 'acl name cannot be empty')
          done()
        })
      })
      it('should fail on empty acl', (done) => {
        client.setBucketACL("hello", "  \n  \t  ", (e) => {
          Assert(e, 'acl name cannot be empty')
          done()
        })
      })
    })

    describe('#dropAllIncompleteUploads(bucket, cb)', () => {
      it('should drop all incomplete multipart uploads', (done) => {
        MockResponse('http://localhost:9000').get('/golang?uploads&max-uploads=1000').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker>keymarker</NextKeyMarker><NextUploadIdMarker>uploadidmarker</NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>true</IsTruncated><Upload><Key>go1.4.2</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Upload><Key>go1.5.0</Key><UploadId>uploadid2</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T15:00:07.759Z</Initiated></Upload><Prefix></Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
        MockResponse('http://localhost:9000').delete('/golang/go1.4.2?uploadId=uploadid').reply(204)
        MockResponse('http://localhost:9000').delete('/golang/go1.5.0?uploadId=uploadid2').reply(204)
        MockResponse('http://localhost:9000').get('/golang?uploads&key-marker=keymarker&max-uploads=1000&upload-id-marker=uploadidmarker').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker>keymarker</NextKeyMarker><NextUploadIdMarker>uploadidmarker</NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>false</IsTruncated><Upload><Key>go1.4.2</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Upload><Key>go1.5.0</Key><UploadId>uploadid2</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T15:00:07.759Z</Initiated></Upload><Prefix></Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
        MockResponse('http://localhost:9000').delete('/golang/go1.4.2?uploadId=uploadid').reply(204)
        MockResponse('http://localhost:9000').delete('/golang/go1.5.0?uploadId=uploadid2').reply(204)
        client.dropAllIncompleteUploads('golang', done)
      })
      it('should pass list error to callback', (done) => {
        MockResponse('http://localhost:9000').get('/golang?uploads&max-uploads=1000').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker>keymarker</NextKeyMarker><NextUploadIdMarker>uploadidmarker</NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>true</IsTruncated><Upload><Key>go1.4.2</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Upload><Key>go1.5.0</Key><UploadId>uploadid2</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T15:00:07.759Z</Initiated></Upload><Prefix></Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
        MockResponse('http://localhost:9000').delete('/golang/go1.4.2?uploadId=uploadid').reply(204)
        MockResponse('http://localhost:9000').delete('/golang/go1.5.0?uploadId=uploadid2').reply(204)
        MockResponse('http://localhost:9000').get('/golang?uploads&key-marker=keymarker&max-uploads=1000&upload-id-marker=uploadidmarker').reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))
        client.dropAllIncompleteUploads('golang', checkError('code', 'message', 'requestid', 'hostid', 'resource', done))
      })
      it('should pass delete error to callback', (done) => {
        MockResponse('http://localhost:9000').get('/golang?uploads&max-uploads=1000').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker>keymarker</NextKeyMarker><NextUploadIdMarker>uploadidmarker</NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>true</IsTruncated><Upload><Key>go1.4.2</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Upload><Key>go1.5.0</Key><UploadId>uploadid2</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T15:00:07.759Z</Initiated></Upload><Prefix></Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
        MockResponse('http://localhost:9000').delete('/golang/go1.4.2?uploadId=uploadid').reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))
        MockResponse('http://localhost:9000').get('/golang?uploads&key-marker=keymarker&max-uploads=1000&upload-id-marker=uploadidmarker').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker>keymarker</NextKeyMarker><NextUploadIdMarker>uploadidmarker</NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>false</IsTruncated><Upload><Key>go1.4.2</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Upload><Key>go1.5.0</Key><UploadId>uploadid2</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T15:00:07.759Z</Initiated></Upload><Prefix></Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
        client.dropAllIncompleteUploads('golang', checkError('code', 'message', 'requestid', 'hostid', 'resource', done))
      })
      it('should fail on null bucket', (done) => {
        client.dropAllIncompleteUploads(null, (e) => {
          Assert(e, 'bucket name cannot be empty')
          done()
        })
      })
      it('should fail on empty bucket', (done) => {
        client.dropAllIncompleteUploads("", (e) => {
          Assert(e, 'bucket name cannot be empty')
          done()
        })
      })
      it('should fail on empty bucket', (done) => {
        client.dropAllIncompleteUploads("  \n  \t  ", (e) => {
          Assert(e, 'bucket name cannot be empty')
          done()
        })
      })
    })
  })

  describe("object level", () => {
    describe('#getObject(bucket, object, callback)', () => {
      it('should return a stream object', (done) => {
        MockResponse('http://localhost:9000').get('/bucket/object').reply(200, "hello world")
        client.getObject("bucket", "object", (e, r) => {
          Assert.equal(e, null)
          r.pipe(Concat(buf => {
            Assert.equal(buf, "hello world")
            done()
          }))
        })
      })
      it('should pass error to callback', (done) => {
        MockResponse('http://localhost:9000').get('/bucket/object').reply(400, generateError('code', 'message', 'requestid', 'hostid', '/bucket/object'))
        client.getObject("bucket", "object", checkError('code', 'message', 'requestid', 'hostid', '/bucket/object', (r) => {
          Assert.equal(r, null)
          done()
        }))
      })
      it('should fail on null bucket', (done) => {
        client.getObject(null, "hello", (e) => {
          Assert(e, 'bucket name cannot be empty')
          done()
        })
      })
      it('should fail on empty bucket', (done) => {
        client.getObject("", "hello", (e) => {
          Assert(e, 'bucket name cannot be empty')
          done()
        })
      })
      it('should fail on empty bucket', (done) => {
        client.getObject("  \n  \t  ", "hello", (e) => {
          Assert(e, 'bucket name cannot be empty')
          done()
        })
      })
      it('should fail on null object', (done) => {
        client.getObject("hello", null, (e) => {
          Assert(e, 'object key cannot be empty')
          done()
        })
      })
      it('should fail on empty object', (done) => {
        client.getObject("hello", "", (e) => {
          Assert(e, 'object key cannot be empty')
          done()
        })
      })
      it('should fail on empty object', (done) => {
        client.getObject("hello", "  \n  \t  ", (e) => {
          Assert(e, 'object key cannot be empty')
          done()
        })
      })
    })
    describe('#getPartialObject(bucket, object, offset, range) callback)', () => {
      it('should work with offset and range', (done) => {
        MockResponse('http://localhost:9000', {
          reqHeaders: {
            'range': '10-21'
          }
        }).get('/bucket/object').reply(206, "hello world")
        client.getPartialObject("bucket", "object", 10, 11, (e, r) => {
          Assert.equal(e, null)
          r.pipe(Concat(buf => {
            Assert.equal(buf, "hello world")
            done()
          }))
        })
      })
      it('should work with offset', (done) => {
        MockResponse('http://localhost:9000', {
          reqHeaders: {
            'range': '10-'
          }
        }).get('/bucket/object').reply(206, "hello world")
        client.getPartialObject("bucket", "object", 10, null, (e, r) => {
          Assert.equal(e, null)
          r.pipe(Concat(buf => {
            Assert.equal(buf, "hello world")
            done()
          }))
        })
      })
      it('should work with range', (done) => {
        MockResponse('http://localhost:9000', {
          reqHeaders: {
            'range': '0-21'
          }
        }).get('/bucket/object').reply(206, "hello world")
        client.getPartialObject("bucket", "object", null, 11, (e, r) => {
          Assert.equal(e, null)
          r.pipe(Concat(buf => {
            Assert.equal(buf, "hello world")
            done()
          }))
        })
      })
    })

    describe("#putObject(bucket, object, contentType, size, source, callback)", () => {
      describe('with small objects using single put', () => {
        it('should put an object', (done) => {
          MockResponse('http://localhost:9000').put('/bucket/object', 'hello world').reply(200)
          var s = new Stream.Readable()
          s._read = function() {}
          s.push('hello world')
          s.push(null)
          client.putObject("bucket", "object", '', 11, s, done)
        })
        it('should pass error to callback', (done) => {
          MockResponse('http://localhost:9000').put('/bucket/object', 'hello world').reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))
          var s = new Stream.Readable()
          s._read = function() {}
          s.push('hello world')
          s.push(null)
          client.putObject("bucket", "object", '', 11, s, checkError('code', 'message', 'requestid', 'hostid', 'resource', done))
        })
        it('should fail on null bucket', (done) => {
          client.putObject(null, "hello", '', 1, new Stream.Readable(), (e) => {
            Assert(e, 'bucket name cannot be empty')
            done()
          })
        })
        it('should fail when data is smaller than specified', (done) => {
          var s = new Stream.Readable()
          s._read = function() {}
          s.push('hello world')
          s.push(null)
          client.putObject("bucket", "object", '', 12, s, (e) => {
            if(e) {
              done()
            }
          })
        })
        it('should fail when data is larger than specified', (done) => {
          var s = new Stream.Readable()
          s._read = function() {}
          s.push('hello world')
          s.push(null)
          client.putObject("bucket", "object", '', 10, s, (e)=> {
            if(e) {
              done()
            }
          })
        })
        it('should fail on empty bucket', (done) => {
          client.putObject("", "hello", '', 1, new Stream.Readable(), (e) => {
            Assert(e, 'bucket name cannot be empty')
            done()
          })
        })
        it('should fail on empty bucket', (done) => {
          client.putObject(" \n \t ", "hello", '', 1, new Stream.Readable(), (e) => {
            Assert(e, 'bucket name cannot be empty')
            done()
          })
        })
        it('should fail on null object', (done) => {
          client.putObject("hello", null, '', 1, new Stream.Readable(), (e) => {
            Assert(e, 'bucket name cannot be empty')
            done()
          })
        })
        it('should fail on empty object', (done) => {
          client.putObject("hello", '', '', 1, new Stream.Readable(), (e) => {
            Assert(e, 'bucket name cannot be empty')
            done()
          })
        })
        it('should fail on empty object', (done) => {
          client.putObject("hello", " \n \t ", '', 1, new Stream.Readable(), (e) => {
            Assert(e, 'bucket name cannot be empty')
            done()
          })
        })
      })
      describe('with large objects using multipart', () => {
        var uploadBlock = ''
        for (var i = 0; i < 1024; i++) {
          uploadBlock += 'a'
        }
        it('should put an object with no resume needed', (done) => {
          MockResponse('http://localhost:9000').get('/bucket?uploads&max-uploads=1000&prefix=object').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker></NextKeyMarker><NextUploadIdMarker></NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>false</IsTruncated><Prefix></Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
          MockResponse('http://localhost:9000').post('/bucket/object?uploads').reply(200, '<?xml version="1.0" encoding="UTF-8"?>\n<InitiateMultipartUploadResult><Bucket>bucket</Bucket><Key>object</Key><UploadId>uploadid</UploadId></InitiateMultipartUploadResult>')
          MockResponse('http://localhost:9000').put('/bucket/object?partNumber=1&uploadId=uploadid', (body) => {
            return body.length === 5 * 1024 * 1024;

          }).reply(200, '', {
            etag: 'etag1'
          })
          MockResponse('http://localhost:9000').put('/bucket/object?partNumber=2&uploadId=uploadid', (body) => {
            return body.length === 5 * 1024 * 1024;

          }).reply(200, '', {
            etag: 'etag2'
          })
          MockResponse('http://localhost:9000').put('/bucket/object?partNumber=3&uploadId=uploadid', (body) => {
            return body.length === 1024 * 1024;

          }).reply(200, '', {
            etag: 'etag3'
          })
          MockResponse('http://localhost:9000').post('/bucket/object?uploadId=uploadid').reply(200, '<?mxl version="1.0" encoding="UTF-8"?><InitiateMultipartUploadResult><Bucket>bucket</Bucket><Key>object</Key><UploadId>uploadid</UploadId></InitiateMultipartUploadResult>')
          var s = new Stream.Readable()
          s._read = function() {}
          for (var i = 0; i < 11 * 1024; i++) {
            s.push(uploadBlock)
          }
          s.push(null)
          client.putObject("bucket", "object", '', 11 * 1024 * 1024, s, done)
        })
        it('should resume an object upload', (done) => {
          MockResponse('http://localhost:9000').get('/bucket?uploads&max-uploads=1000&prefix=object').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>bucket</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker></NextKeyMarker><NextUploadIdMarker></NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>false</IsTruncated><Upload><Key>object</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Prefix>object</Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
          MockResponse('http://localhost:9000').get('/bucket/object?uploadId=uploadid').reply(200, '<ListPartsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>bucket</Bucket><Key>go1.4.2</Key><UploadId>ntWSjzBytPT2xKLaMRonzXncsO10EH4Fc-Iq2-4hG-ulRYB</UploadId><Initiator><ID>minio</ID><DisplayName>minio</DisplayName></Initiator><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner><StorageClass>STANDARD</StorageClass><PartNumberMarker>0</PartNumberMarker><NextPartNumberMarker>0</NextPartNumberMarker><MaxParts>1000</MaxParts><IsTruncated>false</IsTruncated><Part><PartNumber>1</PartNumber><ETag>79b281060d337b9b2b84ccf390adcf74</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part><Part><PartNumber>2</PartNumber><ETag>79b281060d337b9b2b84ccf390adcf74</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part></ListPartsResult>')
          MockResponse('http://localhost:9000').put('/bucket/object?partNumber=3&uploadId=uploadid', (body) => {
            return body.length === 1024 * 1024;

          }).reply(200, '', {
            etag: '79b281060d337b9b2b84ccf390adcf74'
          })
          MockResponse('http://localhost:9000').post('/bucket/object?uploadId=uploadid').reply(200, '<?mxl version="1.0" encoding="UTF-8"?><InitiateMultipartUploadResult><Bucket>bucket</Bucket><Key>object</Key><UploadId>uploadid</UploadId></InitiateMultipartUploadResult>')
          var s = new Stream.Readable()
          s._read = function() {}
          for (var i = 0; i < 11 * 1024; i++) {
            s.push(uploadBlock)
          }
          s.push(null)
          client.putObject("bucket", "object", '', 11 * 1024 * 1024, s, (e) => {
            done(e)
          })
        })
        it('should resume an object upload when uploaded data does not match, overwriting mismatching parts', (done) => {
          MockResponse('http://localhost:9000').get('/bucket?uploads&max-uploads=1000&prefix=object').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>bucket</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker></NextKeyMarker><NextUploadIdMarker></NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>false</IsTruncated><Upload><Key>object</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Prefix>object</Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
          MockResponse('http://localhost:9000').get('/bucket/object?uploadId=uploadid').reply(200, '<ListPartsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>bucket</Bucket><Key>go1.4.2</Key><UploadId>ntWSjzBytPT2xKLaMRonzXncsO10EH4Fc-Iq2-4hG-ulRYB</UploadId><Initiator><ID>minio</ID><DisplayName>minio</DisplayName></Initiator><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner><StorageClass>STANDARD</StorageClass><PartNumberMarker>0</PartNumberMarker><NextPartNumberMarker>0</NextPartNumberMarker><MaxParts>1000</MaxParts><IsTruncated>false</IsTruncated><Part><PartNumber>1</PartNumber><ETag>79b281060d337b9b2b84ccf390adcf74</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part><Part><PartNumber>2</PartNumber><ETag>89b281060d337b9b2b84ccf390adcf74</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part></ListPartsResult>')
          MockResponse('http://localhost:9000').put('/bucket/object?partNumber=2&uploadId=uploadid', (body) => {
            return body.length === 5 * 1024 * 1024;
          }).reply(200, '', {
            etag: '79b281060d337b9b2b84ccf390adcf74'
          })
          MockResponse('http://localhost:9000').put('/bucket/object?partNumber=3&uploadId=uploadid', (body) => {
            return body.length === 1024 * 1024;

          }).reply(200, '', {
            etag: '79b281060d337b9b2b84ccf390adcf74'
          })
          MockResponse('http://localhost:9000').post('/bucket/object?uploadId=uploadid').reply(200, '<?mxl version="1.0" encoding="UTF-8"?><InitiateMultipartUploadResult><Bucket>bucket</Bucket><Key>object</Key><UploadId>uploadid</UploadId></InitiateMultipartUploadResult>')
          var s = new Stream.Readable()
          s._read = function() {}
          for (var i = 0; i < 11 * 1024; i++) {
            s.push(uploadBlock)
          }
          s.push(null)
          client.putObject("bucket", "object", '', 11 * 1024 * 1024, s, done)
        })
        it('should fail if actual size is smaller than expected', (done) => {
          MockResponse('http://localhost:9000').get('/bucket?uploads&max-uploads=1000&prefix=object').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker></NextKeyMarker><NextUploadIdMarker></NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>false</IsTruncataed><Prefix></Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
          MockResponse('http://localhost:9000').post('/bucket/object?uploads').reply(200, '<?xml version="1.0" encoding="UTF-8"?>\n<InitiateMultipartUploadResult><Bucket>bucket</Bucket><Key>object</Key><UploadId>uploadid</UploadId></InitiateMultipartUploadResult>')
          MockResponse('http://localhost:9000').put('/bucket/object?partNumber=1&uploadId=uploadid', (body) => {
            return body.length === 5 * 1024 * 1024;
          }).reply(200, '', {
            etag: 'etag1'
          })
          MockResponse('http://localhost:9000').put('/bucket/object?partNumber=2&uploadId=uploadid', (body) => {
            return body.length === 5 * 1024 * 1024;

          }).reply(200, '', {
            etag: 'etag2'
          })
          MockResponse('http://localhost:9000').put('/bucket/object?partNumber=3&uploadId=uploadid', (body) => {
            return body.length === 1 * 1024 * 1024;

          }).reply(200, '', {
            etag: 'etag3'
          })
          var s = new Stream.Readable()
          s._read = function() {}
          for (var i = 0; i < 11 * 1024; i++) {
            s.push(uploadBlock)
          }
          s.push(null)
          client.putObject("bucket", "object", '', 12 * 1024 * 1024, s, (e) => {
            done()
          })
        })
        it('should fail if actual size is larger than expected', (done) => {
          MockResponse('http://localhost:9000').get('/bucket?uploads&max-uploads=1000&prefix=object').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker></NextKeyMarker><NextUploadIdMarker></NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>false</IsTruncataed><Prefix></Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
          MockResponse('http://localhost:9000').post('/bucket/object?uploads').reply(200, '<?xml version="1.0" encoding="UTF-8"?>\n<InitiateMultipartUploadResult><Bucket>bucket</Bucket><Key>object</Key><UploadId>uploadid</UploadId></InitiateMultipartUploadResult>')
          MockResponse('http://localhost:9000').put('/bucket/object?partNumber=1&uploadId=uploadid', (body) => {
            return body.length === 5 * 1024 * 1024;
          }).reply(200, '', {
            etag: 'etag1'
          })
          MockResponse('http://localhost:9000').put('/bucket/object?partNumber=2&uploadId=uploadid', (body) => {
            return body.length === 5 * 1024 * 1024;

          }).reply(200, '', {
            etag: 'etag2'
          })
          var s = new Stream.Readable()
          s._read = function() {}
          for (var i = 0; i < 12 * 1024; i++) {
            s.push(uploadBlock)
          }
          s.push(null)
          client.putObject("bucket", "object", '', 11 * 1024 * 1024, s, (e) => {
            done()
          })
        })
        it('should pass upload list error to callback', (done) => {
          MockResponse('http://localhost:9000').get('/bucket?uploads&max-uploads=1000&prefix=object').reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))
          var s = new Stream.Readable()
          s._read = function() {}
          for (var i = 0; i < 11 * 1024; i++) {
            s.push(uploadBlock)
          }
          s.push(null)
          client.putObject("bucket", "object", '', 11 * 1024 * 1024, s, checkError('code', 'message', 'requestid', 'hostid', 'resource', done))
        })
        it('should pass part list error to callback', (done) => {
          MockResponse('http://localhost:9000').get('/bucket?uploads&max-uploads=1000&prefix=object').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>bucket</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker></NextKeyMarker><NextUploadIdMarker></NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>false</IsTruncated><Upload><Key>object</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Prefix>object</Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
          MockResponse('http://localhost:9000').get('/bucket/object?uploadId=uploadid').reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))
          var s = new Stream.Readable()
          s._read = function() {}
          for (var i = 0; i < 11 * 1024; i++) {
            s.push(uploadBlock)
          }
          s.push(null)
          client.putObject("bucket", "object", '', 11 * 1024 * 1024, s, checkError('code', 'message', 'requestid', 'hostid', 'resource', done))
        })
        it('should pass put error to callback', (done) => {
          MockResponse('http://localhost:9000').get('/bucket?uploads&max-uploads=1000&prefix=object').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>bucket</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker></NextKeyMarker><NextUploadIdMarker></NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>false</IsTruncated><Upload><Key>object</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Prefix>object</Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
          MockResponse('http://localhost:9000').get('/bucket/object?uploadId=uploadid').reply(200, '<ListPartsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>bucket</Bucket><Key>go1.4.2</Key><UploadId>ntWSjzBytPT2xKLaMRonzXncsO10EH4Fc-Iq2-4hG-ulRYB</UploadId><Initiator><ID>minio</ID><DisplayName>minio</DisplayName></Initiator><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner><StorageClass>STANDARD</StorageClass><PartNumberMarker>0</PartNumberMarker><NextPartNumberMarker>0</NextPartNumberMarker><MaxParts>1000</MaxParts><IsTruncated>false</IsTruncated><Part><PartNumber>1</PartNumber><ETag>79b281060d337b9b2b84ccf390adcf74</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part><Part><PartNumber>2</PartNumber><ETag>79b281060d337b9b2b84ccf390adcf74</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part></ListPartsResult>')
          MockResponse('http://localhost:9000').put('/bucket/object?partNumber=3&uploadId=uploadid', (body) => {
            return body.length === 1024 * 1024;

          }).reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))
          var s = new Stream.Readable()
          s._read = function() {}
          for (var i = 0; i < 11 * 1024; i++) {
            s.push(uploadBlock)
          }
          s.push(null)
          client.putObject("bucket", "object", '', 11 * 1024 * 1024, s, checkError('code', 'message', 'requestid', 'hostid', 'resource', done))
        })
        it('should pass complete upload error to callback', (done) => {
          MockResponse('http://localhost:9000').get('/bucket?uploads&max-uploads=1000&prefix=object').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>bucket</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker></NextKeyMarker><NextUploadIdMarker></NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>false</IsTruncated><Upload><Key>object</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Prefix>object</Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
          MockResponse('http://localhost:9000').get('/bucket/object?uploadId=uploadid').reply(200, '<ListPartsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>bucket</Bucket><Key>go1.4.2</Key><UploadId>ntWSjzBytPT2xKLaMRonzXncsO10EH4Fc-Iq2-4hG-ulRYB</UploadId><Initiator><ID>minio</ID><DisplayName>minio</DisplayName></Initiator><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner><StorageClass>STANDARD</StorageClass><PartNumberMarker>0</PartNumberMarker><NextPartNumberMarker>0</NextPartNumberMarker><MaxParts>1000</MaxParts><IsTruncated>false</IsTruncated><Part><PartNumber>1</PartNumber><ETag>79b281060d337b9b2b84ccf390adcf74</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part><Part><PartNumber>2</PartNumber><ETag>79b281060d337b9b2b84ccf390adcf74</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part></ListPartsResult>')
          MockResponse('http://localhost:9000').put('/bucket/object?partNumber=3&uploadId=uploadid', (body) => {
            return body.length === 1024 * 1024;

          }).reply(200, '', {
            etag: '79b281060d337b9b2b84ccf390adcf74'
          })
          MockResponse('http://localhost:9000').post('/bucket/object?uploadId=uploadid').reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))
          var s = new Stream.Readable()
          s._read = function() {}
          for (var i = 0; i < 11 * 1024; i++) {
            s.push(uploadBlock)
          }
          s.push(null)
          client.putObject("bucket", "object", '', 11 * 1024 * 1024, s, checkError('code', 'message', 'requestid', 'hostid', 'resource', done))
        })
      })
    })

    describe("#listObjects()", () => {
      it('should iterate without a prefix', (done) => {
        MockResponse('http://localhost:9000').get('/bucket?max-keys=1000').reply(200, "<ListBucketResult xmlns=\"http://doc.s3.amazonaws.com/2006-03-01\"><Name>bucket</Name><Prefix></Prefix><Marker></Marker><MaxKeys>1000</MaxKeys><Delimiter></Delimiter><IsTruncated>true</IsTruncated><Contents><Key>key1</Key><LastModified>2015-05-05T02:21:15.716Z</LastModified><ETag>5eb63bbbe01eeed093cb22bb8f5acdc3</ETag><Size>11</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents><Contents><Key>key2</Key><LastModified>2015-05-05T20:36:17.498Z</LastModified><ETag>2a60eaffa7a82804bdc682ce1df6c2d4</ETag><Size>1661</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents></ListBucketResult>")
        MockResponse('http://localhost:9000').get('/bucket?marker=key2&max-keys=1000').reply(200, "<ListBucketResult xmlns=\"http://doc.s3.amazonaws.com/2006-03-01\"><Name>bucket</Name><Prefix></Prefix><Marker></Marker><MaxKeys>1000</MaxKeys><Delimiter></Delimiter><IsTruncated>true</IsTruncated><Contents><Key>key3</Key><LastModified>2015-05-05T02:21:15.716Z</LastModified><ETag>5eb63bbbe01eeed093cb22bb8f5acdc3</ETag><Size>11</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents><Contents><Key>key4</Key><LastModified>2015-05-05T20:36:17.498Z</LastModified><ETag>2a60eaffa7a82804bdc682ce1df6c2d4</ETag><Size>1661</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents></ListBucketResult>")
        MockResponse('http://localhost:9000').get('/bucket?marker=key4&max-keys=1000').reply(200, "<ListBucketResult xmlns=\"http://doc.s3.amazonaws.com/2006-03-01\"><Name>bucket</Name><Prefix></Prefix><Marker></Marker><MaxKeys>1000</MaxKeys><Delimiter></Delimiter><IsTruncated>false</IsTruncated><Contents><Key>key5</Key><LastModified>2015-05-05T02:21:15.716Z</LastModified><ETag>5eb63bbbe01eeed093cb22bb8f5acdc3</ETag><Size>11</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents><Contents><Key>key6</Key><LastModified>2015-05-05T20:36:17.498Z</LastModified><ETag>2a60eaffa7a82804bdc682ce1df6c2d4</ETag><Size>1661</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents></ListBucketResult>")
        var stream = client.listObjects('bucket')
        var results = []
        var expectedResults = [{
          "etag": "5eb63bbbe01eeed093cb22bb8f5acdc3",
          "lastModified": "2015-05-05T02:21:15.716Z",
          "name": "key1",
          "size": 11
        }, {
          "etag": "2a60eaffa7a82804bdc682ce1df6c2d4",
          "lastModified": "2015-05-05T20:36:17.498Z",
          "name": "key2",
          "size": 1661
        }, {
          "etag": "5eb63bbbe01eeed093cb22bb8f5acdc3",
          "lastModified": "2015-05-05T02:21:15.716Z",
          "name": "key3",
          "size": 11
        }, {
          "etag": "2a60eaffa7a82804bdc682ce1df6c2d4",
          "lastModified": "2015-05-05T20:36:17.498Z",
          "name": "key4",
          "size": 1661
        }, {
          "etag": "5eb63bbbe01eeed093cb22bb8f5acdc3",
          "lastModified": "2015-05-05T02:21:15.716Z",
          "name": "key5",
          "size": 11
        }, {
          "etag": "2a60eaffa7a82804bdc682ce1df6c2d4",
          "lastModified": "2015-05-05T20:36:17.498Z",
          "name": "key6",
          "size": 1661
        }]
        stream.pipe(Through2.obj(function(object, enc, end) {
          results.push(object)
          end()
        }, function(end) {
          Assert.deepEqual(results, expectedResults)
          end()
          done()
        }))
      })
      it('should iterate with a prefix', (done) => {
        MockResponse('http://localhost:9000').get('/bucket?max-keys=1000&prefix=key').reply(200, "<ListBucketResult xmlns=\"http://doc.s3.amazonaws.com/2006-03-01\"><Name>bucket</Name><Prefix></Prefix><Marker></Marker><MaxKeys>1000</MaxKeys><Delimiter></Delimiter><IsTruncated>true</IsTruncated><Contents><Key>key1</Key><LastModified>2015-05-05T02:21:15.716Z</LastModified><ETag>5eb63bbbe01eeed093cb22bb8f5acdc3</ETag><Size>11</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents><Contents><Key>key2</Key><LastModified>2015-05-05T20:36:17.498Z</LastModified><ETag>2a60eaffa7a82804bdc682ce1df6c2d4</ETag><Size>1661</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents></ListBucketResult>")
        MockResponse('http://localhost:9000').get('/bucket?marker=key2&max-keys=1000&prefix=key').reply(200, "<ListBucketResult xmlns=\"http://doc.s3.amazonaws.com/2006-03-01\"><Name>bucket</Name><Prefix></Prefix><Marker></Marker><MaxKeys>1000</MaxKeys><Delimiter></Delimiter><IsTruncated>true</IsTruncated><Contents><Key>key3</Key><LastModified>2015-05-05T02:21:15.716Z</LastModified><ETag>5eb63bbbe01eeed093cb22bb8f5acdc3</ETag><Size>11</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents><Contents><Key>key4</Key><LastModified>2015-05-05T20:36:17.498Z</LastModified><ETag>2a60eaffa7a82804bdc682ce1df6c2d4</ETag><Size>1661</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents></ListBucketResult>")
        MockResponse('http://localhost:9000').get('/bucket?marker=key4&max-keys=1000&prefix=key').reply(200, "<ListBucketResult xmlns=\"http://doc.s3.amazonaws.com/2006-03-01\"><Name>bucket</Name><Prefix></Prefix><Marker></Marker><MaxKeys>1000</MaxKeys><Delimiter></Delimiter><IsTruncated>false</IsTruncated><Contents><Key>key5</Key><LastModified>2015-05-05T02:21:15.716Z</LastModified><ETag>5eb63bbbe01eeed093cb22bb8f5acdc3</ETag><Size>11</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents><Contents><Key>key6</Key><LastModified>2015-05-05T20:36:17.498Z</LastModified><ETag>2a60eaffa7a82804bdc682ce1df6c2d4</ETag><Size>1661</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents></ListBucketResult>")
        var stream = client.listObjects('bucket', {
          prefix: 'key'
        })
        var results = []
        var expectedResults = [{
          "etag": "5eb63bbbe01eeed093cb22bb8f5acdc3",
          "lastModified": "2015-05-05T02:21:15.716Z",
          "name": "key1",
          "size": 11
        }, {
          "etag": "2a60eaffa7a82804bdc682ce1df6c2d4",
          "lastModified": "2015-05-05T20:36:17.498Z",
          "name": "key2",
          "size": 1661
        }, {
          "etag": "5eb63bbbe01eeed093cb22bb8f5acdc3",
          "lastModified": "2015-05-05T02:21:15.716Z",
          "name": "key3",
          "size": 11
        }, {
          "etag": "2a60eaffa7a82804bdc682ce1df6c2d4",
          "lastModified": "2015-05-05T20:36:17.498Z",
          "name": "key4",
          "size": 1661
        }, {
          "etag": "5eb63bbbe01eeed093cb22bb8f5acdc3",
          "lastModified": "2015-05-05T02:21:15.716Z",
          "name": "key5",
          "size": 11
        }, {
          "etag": "2a60eaffa7a82804bdc682ce1df6c2d4",
          "lastModified": "2015-05-05T20:36:17.498Z",
          "name": "key6",
          "size": 1661
        }]
        stream.pipe(Through2.obj(function(object, enc, end) {
          results.push(object)
          end()
        }, function(end) {
          Assert.deepEqual(results, expectedResults)
          end()
          done()
        }))
      })
      it.skip('should iterate with recursion', (done) => {
        MockResponse('http://localhost:9000').get('/bucket?delimiter=/&max-keys=1000').reply(200, "<ListBucketResult xmlns=\"http://doc.s3.amazonaws.com/2006-03-01\"><Name>bucket</Name><Prefix></Prefix><Marker></Marker><MaxKeys>1000</MaxKeys><Delimiter></Delimiter><IsTruncated>true</IsTruncated><Contents><Key>key1</Key><LastModified>2015-05-05T02:21:15.716Z</LastModified><ETag>5eb63bbbe01eeed093cb22bb8f5acdc3</ETag><Size>11</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents><Contents><Key>key2</Key><LastModified>2015-05-05T20:36:17.498Z</LastModified><ETag>2a60eaffa7a82804bdc682ce1df6c2d4</ETag><Size>1661</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents></ListBucketResult>")
        MockResponse('http://localhost:9000').get('/bucket?delimiter=%2F&marker=key2&max-keys=1000').reply(200, "<ListBucketResult xmlns=\"http://doc.s3.amazonaws.com/2006-03-01\"><Name>bucket</Name><Prefix></Prefix><Marker></Marker><MaxKeys>1000</MaxKeys><Delimiter></Delimiter><IsTruncated>true</IsTruncated><Contents><Key>key3</Key><LastModified>2015-05-05T02:21:15.716Z</LastModified><ETag>5eb63bbbe01eeed093cb22bb8f5acdc3</ETag><Size>11</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents><Contents><Key>key4</Key><LastModified>2015-05-05T20:36:17.498Z</LastModified><ETag>2a60eaffa7a82804bdc682ce1df6c2d4</ETag><Size>1661</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents></ListBucketResult>")
        MockResponse('http://localhost:9000').get('/bucket?delimiter=%2F&marker=key4&max-keys=1000').reply(200, "<ListBucketResult xmlns=\"http://doc.s3.amazonaws.com/2006-03-01\"><Name>bucket</Name><Prefix></Prefix><Marker></Marker><MaxKeys>1000</MaxKeys><Delimiter></Delimiter><IsTruncated>false</IsTruncated><Contents><Key>key5</Key><LastModified>2015-05-05T02:21:15.716Z</LastModified><ETag>5eb63bbbe01eeed093cb22bb8f5acdc3</ETag><Size>11</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents><Contents><Key>key6</Key><LastModified>2015-05-05T20:36:17.498Z</LastModified><ETag>2a60eaffa7a82804bdc682ce1df6c2d4</ETag><Size>1661</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents></ListBucketResult>")
        var stream = client.listObjects('bucket', {
          recursive: false
        })
        var results = []
        var expectedResults = [{
          "etag": "5eb63bbbe01eeed093cb22bb8f5acdc3",
          "lastModified": "2015-05-05T02:21:15.716Z",
          "name": "key1",
          "size": 11
        }, {
          "etag": "2a60eaffa7a82804bdc682ce1df6c2d4",
          "lastModified": "2015-05-05T20:36:17.498Z",
          "name": "key2",
          "size": 1661
        }, {
          "etag": "5eb63bbbe01eeed093cb22bb8f5acdc3",
          "lastModified": "2015-05-05T02:21:15.716Z",
          "name": "key3",
          "size": 11
        }, {
          "etag": "2a60eaffa7a82804bdc682ce1df6c2d4",
          "lastModified": "2015-05-05T20:36:17.498Z",
          "name": "key4",
          "size": 1661
        }, {
          "etag": "5eb63bbbe01eeed093cb22bb8f5acdc3",
          "lastModified": "2015-05-05T02:21:15.716Z",
          "name": "key5",
          "size": 11
        }, {
          "etag": "2a60eaffa7a82804bdc682ce1df6c2d4",
          "lastModified": "2015-05-05T20:36:17.498Z",
          "name": "key6",
          "size": 1661
        }]
        stream.pipe(Through2.obj(function(object, enc, end) {
          results.push(object)
          end()
        }, function(end) {
          Assert.deepEqual(results, expectedResults)
          end()
          done()
        }))
      })
      it('should pass error on stream', (done) => {
        MockResponse('http://localhost:9000').filteringPath(() => {
          return '/bucket'
        }).get('/bucket').reply(400, generateError('code', 'message', 'requestid', 'hostid', '/bucket'))
        var stream = client.listObjects('bucket')
        stream.pipe(Through2.obj(function(part, enc, end) {
          end()
        }, function(end) {
          end()
        }))
        stream.on('error', (e) => {
          checkError('code', 'message', 'requestid', 'hostid', '/bucket')(e)
          done()
        })
      })
      it('should pass error in stream on subsequent error', (done) => {
        MockResponse('http://localhost:9000').filteringPath(() => {
          return '/bucket'
        }).get('/bucket').reply(200, "<ListBucketResult xmlns=\"http://doc.s3.amazonaws.com/2006-03-01\"><Name>bucket</Name><Prefix></Prefix><Marker></Marker><MaxKeys>1000</MaxKeys><Delimiter></Delimiter><IsTruncated>true</IsTruncated><Contents><Key>key1</Key><LastModified>2015-05-05T02:21:15.716Z</LastModified><ETag>5eb63bbbe01eeed093cb22bb8f5acdc3</ETag><Size>11</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents><Contents><Key>key2</Key><LastModified>2015-05-05T20:36:17.498Z</LastModified><ETag>2a60eaffa7a82804bdc682ce1df6c2d4</ETag><Size>1661</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents></ListBucketResult>")
        MockResponse('http://localhost:9000').filteringPath(() => {
          return '/bucket'
        }).get('/bucket').reply(400, generateError('code', 'message', 'requestid', 'hostid', '/bucket'))
        var stream = client.listObjects('bucket')
        stream.pipe(Through2.obj(function(part, enc, end) {
          end()
        }, function(end) {
          end()
        }))
        stream.on('error', (e) => {
          checkError('code', 'message', 'requestid', 'hostid', '/bucket')(e)
          done()
        })
      })
    })

    describe("#statObject(bucket, object, callback)", () => {
      it('should retrieve object metadata', (done) => {
        MockResponse('http://localhost:9000').head('/bucket/object').reply(200, '', {
          'ETag': 'etag',
          'Content-Length': 11,
          'Last-Modified': 'lastmodified'
        })

        client.statObject('bucket', 'object', (e, r) => {
          Assert.deepEqual(r, {
            size: '11',
            lastModified: 'lastmodified',
            etag: 'etag'
          })
          done()
        })
      })
      it('should pass error to callback', (done) => {
        MockResponse('http://localhost:9000').head('/bucket/object')
          .reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))

        client.statObject('bucket', 'object', checkError('code', 'message', 'requestid', 'hostid', 'resource', (r) => {
          Assert.equal(r, null)
          done()
        }))
      })
      it('should fail on null bucket', (done) => {
        client.statObject(null, "hello", (e) => {
          Assert(e, 'bucket name cannot be empty')
          done()
        })
      })
      it('should fail on empty bucket', (done) => {
        client.statObject("", "hello", (e) => {
          Assert(e, 'bucket name cannot be empty')
          done()
        })
      })
      it('should fail on empty bucket', (done) => {
        client.statObject("  \n  \t  ", "hello", (e) => {
          Assert(e, 'bucket name cannot be empty')
          done()
        })
      })
      it('should fail on null object', (done) => {
        client.statObject("hello", null, (e) => {
          Assert(e, 'object key cannot be empty')
          done()
        })
      })
      it('should fail on empty object', (done) => {
        client.statObject("hello", "", (e) => {
          Assert(e, 'object key cannot be empty')
          done()
        })
      })
      it('should fail on empty object', (done) => {
        client.statObject("hello", "  \n  \t  ", (e) => {
          Assert(e, 'object key cannot be empty')
          done()
        })
      })
    })

    describe("#removeObject(bucket, object, callback)", () => {
      it('should delete an object', (done) => {
        MockResponse('http://localhost:9000').delete('/bucket/object').reply(204)
        client.removeObject('bucket', 'object', (e) => {
          Assert.equal(e, null)
          done()
        })
      })
      it('should pass error to callback', (done) => {
        MockResponse('http://localhost:9000').delete('/bucket/object')
          .reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))
        client.removeObject('bucket', 'object', checkError('code', 'message', 'requestid', 'hostid', 'resource', (r) => {
          Assert.equal(r, null)
          done()
        }))
      })
      it('should fail on null bucket', (done) => {
        client.removeObject(null, "hello", (e) => {
          Assert(e, 'bucket name cannot be empty')
          done()
        })
      })
      it('should fail on empty bucket', (done) => {
        client.removeObject("", "hello", (e) => {
          Assert(e, 'bucket name cannot be empty')
          done()
        })
      })
      it('should fail on empty bucket', (done) => {
        client.removeObject("  \n  \t  ", "hello", (e) => {
          Assert(e, 'bucket name cannot be empty')
          done()
        })
      })
      it('should fail on null object', (done) => {
        client.removeObject("hello", null, (e) => {
          Assert(e, 'object key cannot be empty')
          done()
        })
      })
      it('should fail on empty object', (done) => {
        client.removeObject("hello", "", (e) => {
          Assert(e, 'object key cannot be empty')
          done()
        })
      })
      it('should fail on empty object', (done) => {
        client.removeObject("hello", "  \n  \t  ", (e) => {
          Assert(e, 'object key cannot be empty')
          done()
        })
      })
    })

    describe("#dropIncompleteUpload(bucket, object, callback)", () => {
      it('should drop an incomplete upload', (done) => {
        MockResponse('http://localhost:9000').get('/golang?uploads&max-uploads=1000&prefix=go1.4.2').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker>keymarker</NextKeyMarker><NextUploadIdMarker>uploadmarker</NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>true</IsTruncated><Upload><Key>go1.4.2</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Upload><Key>go1.4.2</Key><UploadId>uploadid2</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T15:00:07.759Z</Initiated></Upload><Upload><Key>go1.5.0</Key><UploadId>uploadid2</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T15:00:07.759Z</Initiated></Upload><Prefix></Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
        MockResponse('http://localhost:9000').delete('/golang/go1.4.2?uploadId=uploadid').reply(204)
        MockResponse('http://localhost:9000').delete('/golang/go1.4.2?uploadId=uploadid2').reply(204)
        client.dropIncompleteUpload('golang', 'go1.4.2', done)
      })
      it('should pass error to callback on list failure', (done) => {
        MockResponse('http://localhost:9000').get('/golang?uploads&max-uploads=1000&prefix=go1.4.2').reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))
        client.dropIncompleteUpload('golang', 'go1.4.2', checkError('code', 'message', 'requestid', 'hostid', 'resource', done))
      })
      it('should pass error to callback on second list failure', (done) => {
        MockResponse('http://localhost:9000').get('/golang?uploads&max-uploads=1000&prefix=go1.4.2').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker>keymarker</NextKeyMarker><NextUploadIdMarker>uploadmarker</NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>true</IsTruncated><Upload><Key>go1.4.2</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Upload><Key>go1.4.2</Key><UploadId>uploadid2</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T15:00:07.759Z</Initiated></Upload><Prefix></Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
        MockResponse('http://localhost:9000').delete('/golang/go1.4.2?uploadId=uploadid').reply(204)
        MockResponse('http://localhost:9000').delete('/golang/go1.4.2?uploadId=uploadid2').reply(204)
        MockResponse('http://localhost:9000').get('/golang?uploads&key-marker=keymarker&max-uploads=1000&prefix=go1.4.2&upload-id-marker=uploadmarker').reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))
        client.dropIncompleteUpload('golang', 'go1.4.2', checkError('code', 'message', 'requestid', 'hostid', 'resource', done))
      })
      it('should return error on delete failure', (done) => {
        MockResponse('http://localhost:9000').get('/golang?uploads&max-uploads=1000&prefix=go1.4.2').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker>keymarker</NextKeyMarker><NextUploadIdMarker>uploadmarker</NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>true</IsTruncated><Upload><Key>go1.4.2</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Upload><Key>go1.4.2</Key><UploadId>uploadid2</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T15:00:07.759Z</Initiated></Upload><Prefix></Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
        MockResponse('http://localhost:9000').delete('/golang/go1.4.2?uploadId=uploadid').reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))
        MockResponse('http://localhost:9000').get('/golang?uploads&key-marker=keymarker&max-uploads=1000&prefix=go1.4.2&upload-id-marker=uploadmarker').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker>keymarker</NextKeyMarker><NextUploadIdMarker>uploadmarker</NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>true</IsTruncated><Upload><Key>go1.4.2</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Upload><Key>go1.4.2</Key><UploadId>uploadid2</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T15:00:07.759Z</Initiated></Upload><Prefix></Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
        client.dropIncompleteUpload('golang', 'go1.4.2', checkError('code', 'message', 'requestid', 'hostid', 'resource', done))
      })
      it('should fail on null bucket', (done) => {
        client.dropIncompleteUpload(null, "hello", (e) => {
          Assert(e, 'bucket name cannot be empty')
          done()
        })
      })
      it('should fail on empty bucket', (done) => {
        client.dropIncompleteUpload("", "hello", (e) => {
          Assert(e, 'bucket name cannot be empty')
          done()
        })
      })
      it('should fail on empty bucket', (done) => {
        client.dropIncompleteUpload("  \n  \t  ", "hello", (e) => {
          Assert(e, 'bucket name cannot be empty')
          done()
        })
      })
      it('should fail on null object', (done) => {
        client.dropIncompleteUpload("hello", null, (e) => {
          Assert(e, 'object key cannot be empty')
          done()
        })
      })
      it('should fail on empty object', (done) => {
        client.dropIncompleteUpload("hello", "", (e) => {
          Assert(e, 'object key cannot be empty')
          done()
        })
      })
      it('should fail on empty object', (done) => {
        client.dropIncompleteUpload("hello", "  \n  \t  ", (e) => {
          Assert(e, 'object key cannot be empty')
          done()
        })
      })
    })
  })

  describe('unexposed functions', () => {
    describe('listMultipartUploads(transport, params, bucket, key, objectMarker, uploadIdMarker, callback', () => {
      var method = multipart.listMultipartUploads
      var params = {
        host: 'localhost',
        port: 9000
      }
      describe('without a key', () => {
        it('should list uploads', (done) => {
          MockResponse('http://localhost:9000').get('/golang?uploads&max-uploads=1000').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker></NextKeyMarker><NextUploadIdMarker></NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>false</IsTruncated><Upload><Key>go1.4.2</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Upload><Key>go1.5.0</Key><UploadId>uploadid2</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T15:00:07.759Z</Initiated></Upload><Prefix></Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
          method(Http, params, 'golang', null, null, null, (e, result) => {
            Assert.equal(e, null)
            Assert.deepEqual(result, {
              isTruncated: false,
              uploads: [{
                bucket: 'golang',
                key: 'go1.4.2',
                uploadId: 'uploadid'
              }, {
                bucket: 'golang',
                key: 'go1.5.0',
                uploadId: 'uploadid2'
              }],
              nextJob: null
            })
            done()
          })
        })
        it('should list uploads with new job', (done) => {
          MockResponse('http://localhost:9000').get('/golang?uploads&max-uploads=1000').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker>keymarker</NextKeyMarker><NextUploadIdMarker>uploadmarker</NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>true</IsTruncated><Upload><Key>go1.4.2</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Upload><Key>go1.5.0</Key><UploadId>uploadid2</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T15:00:07.759Z</Initiated></Upload><Prefix></Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
          method(Http, params, 'golang', null, null, null, (e, result) => {
            Assert.equal(e, null)
            Assert.deepEqual(result, {
              isTruncated: true,
              uploads: [{
                bucket: 'golang',
                key: 'go1.4.2',
                uploadId: 'uploadid'
              }, {
                bucket: 'golang',
                key: 'go1.5.0',
                uploadId: 'uploadid2'
              }],
              nextJob: {
                bucket: 'golang',
                key: null,
                keyMarker: 'keymarker',
                uploadIdMarker: 'uploadmarker'
              }
            })
            done()
          })
        })
        it('should list uploads with markers', (done) => {
          MockResponse('http://localhost:9000').get('/golang?uploads&key-marker=keymarker&max-uploads=1000&upload-id-marker=uploadidmarker').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker></NextKeyMarker><NextUploadIdMarker></NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>false</IsTruncated><Upload><Key>go1.4.2</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Upload><Key>go1.5.0</Key><UploadId>uploadid2</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T15:00:07.759Z</Initiated></Upload><Prefix></Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
          method(Http, params, 'golang', null, 'keymarker', 'uploadidmarker', (e, result) => {
            Assert.equal(e, null)
            Assert.deepEqual(result, {
              isTruncated: false,
              uploads: [{
                bucket: 'golang',
                key: 'go1.4.2',
                uploadId: 'uploadid'
              }, {
                bucket: 'golang',
                key: 'go1.5.0',
                uploadId: 'uploadid2'
              }],
              nextJob: null
            })
            done()
          })
        })
        it('should pass error to callback', (done) => {
          MockResponse('http://localhost:9000').get('/golang?uploads&max-uploads=1000').reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))
          method(Http, params, 'golang', null, null, null, checkError('code', 'message', 'requestid', 'hostid', 'resource', (result) => {
            Assert.equal(result, null)
            checkError('code', 'message', 'requestid', 'hostid', 'resource', (r) => {
              Assert.equal(r, null)
            })
            done()
          }))
        })
      })
      describe('with a key', () => {
        it('should list uploads', (done) => {
          MockResponse('http://localhost:9000').get('/golang?uploads&max-uploads=1000&prefix=go1.4.2').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker></NextKeyMarker><NextUploadIdMarker></NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>false</IsTruncated><Upload><Key>go1.4.2</Key><UploadId>lpF5gD3b1bFxPjseZwJSf4FR_3UjP0grnAMy2iRwzXx5Ph0</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T16:34:57.199Z</Initiated></Upload><Upload><Key>go1.4.2</Key><UploadId>0Elr5Z_OhUOdiivZabenC5JOaHCH0ThAdpC0rrLT5ns-pqh</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T16:34:57.199Z</Initiated></Upload><Upload><Key>go1.4.2.linux-amd64.tar.gz</Key><UploadId>vYir4Iyo0-wVnZqxZ7PK6KwNVZktv-5uULHiM-t50bO3_LJ</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Prefix>go1.4.2</Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
          method(Http, params, 'golang', 'go1.4.2', null, null, (e, result) => {
            Assert.equal(e, null)
            Assert.deepEqual(result, {
              isTruncated: false,
              uploads: [{
                bucket: 'golang',
                key: 'go1.4.2',
                uploadId: 'lpF5gD3b1bFxPjseZwJSf4FR_3UjP0grnAMy2iRwzXx5Ph0'
              }, {
                bucket: 'golang',
                key: 'go1.4.2',
                uploadId: '0Elr5Z_OhUOdiivZabenC5JOaHCH0ThAdpC0rrLT5ns-pqh'
              }],
              nextJob: null
            })
            done()
          })
        })
        it('should list uploads with a new job', (done) => {
          MockResponse('http://localhost:9000').get('/golang?uploads&max-uploads=1000&prefix=go1.4.2').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker>keymarker</NextKeyMarker><NextUploadIdMarker>uploadidmarker</NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>true</IsTruncated><Upload><Key>go1.4.2</Key><UploadId>lpF5gD3b1bFxPjseZwJSf4FR_3UjP0grnAMy2iRwzXx5Ph0</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T16:34:57.199Z</Initiated></Upload><Upload><Key>go1.4.2</Key><UploadId>0Elr5Z_OhUOdiivZabenC5JOaHCH0ThAdpC0rrLT5ns-pqh</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T16:34:57.199Z</Initiated></Upload><Prefix>go1.4.2</Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
          method(Http, params, 'golang', 'go1.4.2', null, null, (e, result) => {
            Assert.equal(e, null)
            Assert.deepEqual(result, {
              isTruncated: true,
              uploads: [{
                bucket: 'golang',
                key: 'go1.4.2',
                uploadId: 'lpF5gD3b1bFxPjseZwJSf4FR_3UjP0grnAMy2iRwzXx5Ph0'
              }, {
                bucket: 'golang',
                key: 'go1.4.2',
                uploadId: '0Elr5Z_OhUOdiivZabenC5JOaHCH0ThAdpC0rrLT5ns-pqh'
              }],
              nextJob: {
                bucket: 'golang',
                key: 'go1.4.2',
                keyMarker: 'keymarker',
                uploadIdMarker: 'uploadidmarker'
              }
            })
            done()
          })
        })
        it('should list uploads with markers', (done) => {
          MockResponse('http://localhost:9000').get('/golang?uploads&key-marker=keymarker&max-uploads=1000&prefix=go1.4.2&upload-id-marker=uploadidmarker').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker></NextKeyMarker><NextUploadIdMarker></NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>false</IsTruncated><Upload><Key>go1.4.2</Key><UploadId>lpF5gD3b1bFxPjseZwJSf4FR_3UjP0grnAMy2iRwzXx5Ph0</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T16:34:57.199Z</Initiated></Upload><Upload><Key>go1.4.2</Key><UploadId>0Elr5Z_OhUOdiivZabenC5JOaHCH0ThAdpC0rrLT5ns-pqh</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T16:34:57.199Z</Initiated></Upload><Upload><Key>go1.4.2.linux-amd64.tar.gz</Key><UploadId>vYir4Iyo0-wVnZqxZ7PK6KwNVZktv-5uULHiM-t50bO3_LJ</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Prefix>go1.4.2</Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
          method(Http, params, 'golang', 'go1.4.2', 'keymarker', 'uploadidmarker', (e, result) => {
            Assert.equal(e, null)
            Assert.deepEqual(result, {
              isTruncated: false,
              uploads: [{
                bucket: 'golang',
                key: 'go1.4.2',
                uploadId: 'lpF5gD3b1bFxPjseZwJSf4FR_3UjP0grnAMy2iRwzXx5Ph0'
              }, {
                bucket: 'golang',
                key: 'go1.4.2',
                uploadId: '0Elr5Z_OhUOdiivZabenC5JOaHCH0ThAdpC0rrLT5ns-pqh'
              }],
              nextJob: null
            })
            done()
          })
        })
      })
    })
    describe('abortMultipartUpload', () => {
      var method = multipart.abortMultipartUpload
      var params = {
        host: 'localhost',
        port: 9000
      }
      it('should drop an incomplete upload', (done) => {
        MockResponse('http://localhost:9000').delete('/bucket/object?uploadId=uploadid').reply(204)
        method(Http, params, 'bucket', 'object', 'uploadid', (e) => {
          Assert.equal(e, null)
          done()
        })
      })
      it('should pass error to callback', (done) => {
        MockResponse('http://localhost:9000').delete('/bucket/object?uploadId=uploadid').reply(204)
        method(Http, params, 'bucket', 'object', 'uploadid', (e) => {
          Assert.equal(e, null)
          done()
        })
      })
    })
    describe('#initiateNewMultipartUpload(transport, params, bucket, object, cb)', () => {
      var method = upload.initiateNewMultipartUpload
      var params = {
        host: 'localhost',
        port: 9000
      }
      it('should initiate a new multipart upload', (done) => {
        MockResponse('http://localhost:9000').post('/bucket/object?uploads').reply(200, '<?xml version="1.0" encoding="UTF-8"?>\n<InitiateMultipartUploadResult><Bucket>bucket</Bucket><Key>object</Key><UploadId>uploadid</UploadId></InitiateMultipartUploadResult>')
        method(Http, params, 'bucket', 'object', (e, uploadID) => {
          Assert.equal(e, null)
          Assert.equal(uploadID, 'uploadid')
          done()
        })
      })
      it('should pass error to callback', (done) => {
        MockResponse('http://localhost:9000').post('/bucket/object?uploads').reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))
        method(Http, params, 'bucket', 'object', checkError('code', 'message', 'requestid', 'hostid', 'resource', done))
      })
    })
    describe('#completeMultipartUpload(transport, params, bucket, object, uploadID, etags cb)', () => {
      var method = upload.completeMultipartUpload
      var params = {
        host: 'localhost',
        port: 9000
      }
      var etags = [{
        part: 1,
        etag: 'etag1'
      }, {
        part: 2,
        etag: 'etag2'
      }, {
        part: 3,
        etag: 'etag3'
      }]
      it('should complete a multipart upload', (done) => {
        MockResponse('http://localhost:9000').post('/bucket/object?uploadId=uploadid', '<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>etag1</ETag></Part><Part><PartNumber>2</PartNumber><ETag>etag2</ETag></Part><Part><PartNumber>3</PartNumber><ETag>etag3</ETag></Part></CompleteMultipartUpload>').reply(200)
        method(Http, params, 'bucket', 'object', 'uploadid', etags, done)
      })
      it('should pass error to callback', (done) => {
        MockResponse('http://localhost:9000').post('/bucket/object?uploadId=uploadid').reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))
        method(Http, params, 'bucket', 'object', 'uploadid', etags, checkError('code', 'message', 'requestid', 'hostid', 'resource', done))
      })
    })
    describe('#listParts(transport, params, bucket, object, uploadId, marker, cb)', () => {
      var method = multipart.listParts
      var params = {
        host: 'localhost',
        port: 9000
      }
      it('should return etags and truncated false', (done) => {
        var etags = {
          isTruncated: false,
          parts: [{
            part: 1,
            etag: 'etag1',
            lastModified: '2015-06-03T03:12:34.756Z',
            size: 5 * 1024 * 1024
          }, {
            part: 2,
            etag: 'etag2',
            lastModified: '2015-06-03T03:12:34.756Z',
            size: 5 * 1024 * 1024
          }, {
            part: 3,
            etag: 'etag3',
            lastModified: '2015-06-03T03:12:34.756Z',
            size: 5 * 1024 * 1024
          }],
          nextJob: null
        }
        MockResponse('http://localhost:9000').get('/bucket/object?uploadId=uploadid').reply(200, '<ListPartsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>bucket</Bucket><Key>go1.4.2</Key><UploadId>ntWSjzBytPT2xKLaMRonzXncsO10EH4Fc-Iq2-4hG-ulRYB</UploadId><Initiator><ID>minio</ID><DisplayName>minio</DisplayName></Initiator><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner><StorageClass>STANDARD</StorageClass><PartNumberMarker>0</PartNumberMarker><NextPartNumberMarker>0</NextPartNumberMarker><MaxParts>1000</MaxParts><IsTruncated>false</IsTruncated><Part><PartNumber>1</PartNumber><ETag>etag1</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part><Part><PartNumber>2</PartNumber><ETag>etag2</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part><Part><PartNumber>3</PartNumber><ETag>etag3</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part></ListPartsResult>')
        method(Http, params, 'bucket', 'object', 'uploadid', null, (e, r) => {
          Assert.equal(e, null)
          Assert.deepEqual(r, etags)
          done()
        })
      })
      it('should return paged etags and truncated true', (done) => {
        var etags = {
          isTruncated: true,
          parts: [{
            part: 4,
            etag: 'etag1',
            lastModified: '2015-06-03T03:12:34.756Z',
            size: 5 * 1024 * 1024
          }, {
            part: 5,
            etag: 'etag2',
            lastModified: '2015-06-03T03:12:34.756Z',
            size: 5 * 1024 * 1024
          }, {
            part: 6,
            etag: 'etag3',
            lastModified: '2015-06-03T03:12:34.756Z',
            size: 5 * 1024 * 1024
          }],
          nextJob: {
            bucket: 'bucket',
            key: 'object',
            uploadId: 'uploadid',
            marker: 6
          }
        }
        MockResponse('http://localhost:9000').get('/bucket/object?part-number-marker=3&uploadId=uploadid').reply(200, '<ListPartsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>bucket</Bucket><Key>go1.4.2</Key><UploadId>ntWSjzBytPT2xKLaMRonzXncsO10EH4Fc-Iq2-4hG-ulRYB</UploadId><Initiator><ID>minio</ID><DisplayName>minio</DisplayName></Initiator><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner><StorageClass>STANDARD</StorageClass><PartNumberMarker>0</PartNumberMarker><NextPartNumberMarker>6</NextPartNumberMarker><MaxParts>1000</MaxParts><IsTruncated>true</IsTruncated><Part><PartNumber>4</PartNumber><ETag>etag1</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part><Part><PartNumber>5</PartNumber><ETag>etag2</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part><Part><PartNumber>6</PartNumber><ETag>etag3</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part></ListPartsResult>')
        method(Http, params, 'bucket', 'object', 'uploadid', 3, (e, r) => {
          Assert.equal(e, null)
          Assert.deepEqual(r, etags)
          done()
        })
      })
      it('should pass error to callcack', (done) => {
        MockResponse('http://localhost:9000').get('/bucket/object?part-number-marker=3&uploadId=uploadid').reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))
        method(Http, params, 'bucket', 'object', 'uploadid', 3, checkError('code', 'message', 'requestid', 'hostid', 'resource', done))
      })
    })
    describe('#listAllParts(transport, params, bucket, object, uploadId)', () => {
      var method = multipart.listAllParts
      var params = {
        host: 'localhost',
        port: 9000
      }
      it('should list all parts', (done) => {
        var expectedResults = [{
          part: 1,
          etag: 'etag1',
          lastModified: '2015-06-03T03:12:34.756Z',
          size: 5242880
        }, {
          part: 2,
          etag: 'etag2',
          lastModified: '2015-06-03T03:12:34.756Z',
          size: 5242880
        }, {
          part: 3,
          etag: 'etag3',
          lastModified: '2015-06-03T03:12:34.756Z',
          size: 5242880
        }, {
          part: 4,
          etag: 'etag4',
          lastModified: '2015-06-03T03:12:34.756Z',
          size: 5242880
        }, {
          part: 5,
          etag: 'etag5',
          lastModified: '2015-06-03T03:12:34.756Z',
          size: 5242880
        }, {
          part: 6,
          etag: 'etag6',
          lastModified: '2015-06-03T03:12:34.756Z',
          size: 5242880
        }, {
          part: 7,
          etag: 'etag7',
          lastModified: '2015-06-03T03:12:34.756Z',
          size: 5242880
        }, {
          part: 8,
          etag: 'etag8',
          lastModified: '2015-06-03T03:12:34.756Z',
          size: 5242880
        }, {
          part: 9,
          etag: 'etag9',
          lastModified: '2015-06-03T03:12:34.756Z',
          size: 5242880
        }]
        MockResponse('http://localhost:9000').get('/bucket/object?uploadId=uploadid').reply(200, '<ListPartsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>bucket</Bucket><Key>go1.4.2</Key><UploadId>ntWSjzBytPT2xKLaMRonzXncsO10EH4Fc-Iq2-4hG-ulRYB</UploadId><Initiator><ID>minio</ID><DisplayName>minio</DisplayName></Initiator><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner><StorageClass>STANDARD</StorageClass><PartNumberMarker>0</PartNumberMarker><NextPartNumberMarker>3</NextPartNumberMarker><MaxParts>1000</MaxParts><IsTruncated>true</IsTruncated><Part><PartNumber>1</PartNumber><ETag>etag1</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part><Part><PartNumber>2</PartNumber><ETag>etag2</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part><Part><PartNumber>3</PartNumber><ETag>etag3</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part></ListPartsResult>')
        MockResponse('http://localhost:9000').get('/bucket/object?part-number-marker=3&uploadId=uploadid').reply(200, '<ListPartsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>bucket</Bucket><Key>go1.4.2</Key><UploadId>ntWSjzBytPT2xKLaMRonzXncsO10EH4Fc-Iq2-4hG-ulRYB</UploadId><Initiator><ID>minio</ID><DisplayName>minio</DisplayName></Initiator><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner><StorageClass>STANDARD</StorageClass><PartNumberMarker>0</PartNumberMarker><NextPartNumberMarker>6</NextPartNumberMarker><MaxParts>1000</MaxParts><IsTruncated>true</IsTruncated><Part><PartNumber>4</PartNumber><ETag>etag4</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part><Part><PartNumber>5</PartNumber><ETag>etag5</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part><Part><PartNumber>6</PartNumber><ETag>etag6</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part></ListPartsResult>')
        MockResponse('http://localhost:9000').get('/bucket/object?part-number-marker=6&uploadId=uploadid').reply(200, '<ListPartsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>bucket</Bucket><Key>go1.4.2</Key><UploadId>ntWSjzBytPT2xKLaMRonzXncsO10EH4Fc-Iq2-4hG-ulRYB</UploadId><Initiator><ID>minio</ID><DisplayName>minio</DisplayName></Initiator><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner><StorageClass>STANDARD</StorageClass><PartNumberMarker>0</PartNumberMarker><NextPartNumberMarker>0</NextPartNumberMarker><MaxParts>1000</MaxParts><IsTruncated>false</IsTruncated><Part><PartNumber>7</PartNumber><ETag>etag7</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part><Part><PartNumber>8</PartNumber><ETag>etag8</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part><Part><PartNumber>9</PartNumber><ETag>etag9</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part></ListPartsResult>')
        var stream = method(Http, params, 'bucket', 'object', 'uploadid')
        var results = []
        stream.pipe(Through2.obj(function(part, enc, end) {
          results.push(part)
          end()
        }, function(end) {
          Assert.deepEqual(results, expectedResults)
          end()
          done()
        }))
      })
      it('should return error in stream', (done) => {
        MockResponse('http://localhost:9000').get('/bucket/object?uploadId=uploadid').reply(200, '<ListPartsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>bucket</Bucket><Key>go1.4.2</Key><UploadId>ntWSjzBytPT2xKLaMRonzXncsO10EH4Fc-Iq2-4hG-ulRYB</UploadId><Initiator><ID>minio</ID><DisplayName>minio</DisplayName></Initiator><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner><StorageClass>STANDARD</StorageClass><PartNumberMarker>0</PartNumberMarker><NextPartNumberMarker>3</NextPartNumberMarker><MaxParts>1000</MaxParts><IsTruncated>true</IsTruncated><Part><PartNumber>1</PartNumber><ETag>etag1</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part><Part><PartNumber>2</PartNumber><ETag>etag2</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part><Part><PartNumber>3</PartNumber><ETag>etag3</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part></ListPartsResult>')
        MockResponse('http://localhost:9000').get('/bucket/object?part-number-marker=3&uploadId=uploadid').reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))
        var stream = method(Http, params, 'bucket', 'object', 'uploadid')
        stream.pipe(Through2.obj(function(part, enc, end) {
          end()
        }, function(end) {
          end()
        }))
        stream.on('error', () => {
          done()
        })
      })
    })
  })

})

var checkError = (code, message, requestid, hostid, resource, callback) => {
  return (e, ...rest) => {
    "use strict";
    if (e === null) {
      callback('expected error, received success')
    }
    Assert.equal(e.code, code)
    Assert.equal(e.message, message)
    Assert.equal(e.requestid, requestid)
    Assert.equal(e.hostid, hostid)
    Assert.equal(e.resource, resource)
    if (callback) {
      if (rest.length === 0) {
        callback()
      } else {
        callback(rest)
      }
    } else {
      if (rest.length > 0) {
        Assert.fail('Data returned with no callback registered')
      }
    }
  }
}

var generateError = (code, message, requestid, hostid, resource) => {
  return `<Error><Code>${code}</Code><Message>${message}</Message><RequestId>${requestid}</RequestId><HostId>${hostid}</HostId><Resource>${resource}</Resource></Error>`
}
