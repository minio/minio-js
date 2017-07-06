/*
 * Minio Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2016 Minio, Inc.
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

require('source-map-support').install()

import { assert } from 'chai'
import Concat from 'concat-stream'
import Nock from 'nock'
import Through2 from 'through2'
import Stream from 'stream'
import * as Minio from '../../../dist/main/minio'
import { isValidEndpoint, isValidIP, makeDateLong, makeDateShort } from '../../../dist/main/helpers'

import { parseBucketPolicy, generateBucketPolicy } from '../../../dist/main/bucket-policy'

var Package = require('../../../package.json')

describe('Helpers', () => {
  it('should validate for s3 endpoint', () => {
    assert.equal(isValidEndpoint('s3.amazonaws.com'), true)
  })
  it('should validate for s3 china', () => {
    assert.equal(isValidEndpoint('s3.cn-north-1.amazonaws.com.cn'), true)
  })
  it('should fail for invalid endpoint', () => {
    assert.equal(isValidEndpoint('s3-us-west-2.amazonaws.com'), false)
  })
  it('should fail for invalid endpoint characters', () => {
    assert.equal(isValidEndpoint('111.#2.11'), false)
  })
  it('should validate for valid ip', () => {
    assert.equal(isValidIP('1.1.1.1'), true)
  })
  it('should fail for invalid ip', () => {
    assert.equal(isValidIP('1.1.1'), false)
  })
  it('should make date short', () => {
    let date = new Date('2012-12-03T17:25:36.331Z')

    assert.equal(makeDateShort(date), '20121203')
  })
  it('should make date long', () => {
    let date = new Date('2017-08-11T17:26:34.935Z')

    assert.equal(makeDateLong(date), '20170811T172634Z')
  })
})

describe('CopyConditions', () => {
  let date = '2017-08-11T19:34:18.437Z'

  let cc = new Minio.CopyConditions()

  describe('#setModified', () => {
    it('should take a date argument', () => {
      cc.setModified(new Date(date))

      assert.equal(cc.modified, date)
    })

    it('should throw without date', () => {
      assert.throws(() => {
        cc.setModified()
      }, /date must be of type Date/)

      assert.throws(() => {
        cc.setModified({ hi: 'there' })
      }, /date must be of type Date/)
    })
  })

  describe('#setUnmodified', () => {
    it('should take a date argument', () => {
      cc.setUnmodified(new Date(date))

      assert.equal(cc.unmodified, date)
    })

    it('should throw without date', () => {
      assert.throws(() => {
        cc.setUnmodified()
      }, /date must be of type Date/)

      assert.throws(() => {
        cc.setUnmodified({ hi: 'there' })
      }, /date must be of type Date/)
    })
  })
})

describe('Client', function() {
  var nockRequests = []
  this.timeout(5000)
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
      var request = Nock(address),
        trace = new Error().stack
      nockRequests.push({
        request: request,
        trace: trace
      })
      return request
    },
    client = new Minio.Client({
      endPoint: 'localhost',
      port: 9000,
      accessKey: 'accesskey',
      secretKey: 'secretkey',
      secure: false
    })
  describe('new client', () => {
    it('should work with https', () => {
      var client = new Minio.Client({
        endPoint: 'localhost',
        accessKey: 'accesskey',
        secretKey: 'secretkey'
      })
      assert.equal(client.port, 443)
    })
    it('should override port with http', () => {
      var client = new Minio.Client({
        endPoint: 'localhost',
        port: 9000,
        accessKey: 'accesskey',
        secretKey: 'secretkey',
        secure: false
      })
      assert.equal(client.port, 9000)
    })
    it('should work with http', () => {
      var client = new Minio.Client({
        endPoint: 'localhost',
        accessKey: 'accesskey',
        secretKey: 'secretkey',
        secure: false
      })
      assert.equal(client.port, 80)
    })
    it('should override port with https', () => {
      var client = new Minio.Client({
        endPoint: 'localhost',
        port: 9000,
        accessKey: 'accesskey',
        secretKey: 'secretkey'
      })
      assert.equal(client.port, 9000)
    })
    it('should fail with url', (done) => {
      try {
        new Minio.Client({
          endPoint: 'http://localhost:9000',
          accessKey: 'accesskey',
          secretKey: 'secretkey'
        })
      } catch (e) {
        done()
      }
    })
    it('should fail with alphanumeric', (done) => {
      try {
        new Minio.Client({
          endPoint: 'localhost##$@3',
          accessKey: 'accesskey',
          secretKey: 'secretkey'
        })
      } catch (e) {
        done()
      }
    })
    it('should fail with no url', (done) => {
      try {
        new Minio.Client({
          accessKey: 'accesskey',
          secretKey: 'secretkey'
        })
      } catch (e) {
        done()
      }
    })
    it('should fail with bad port', (done) => {
      try {
        new Minio.Client({
          endPoint: 'localhost',
          port: -1,
          accessKey: 'accesskey',
          secretKey: 'secretkey'
        })
      } catch (e) {
        done()
      }
    })
  })
  describe('Presigned URL', () => {
    describe('presigned-get', () => {
      it('should not generate presigned url with no access key', (done) => {
        try {
          var client = new Minio.Client({
            endPoint: 'localhost',
            port: 9000,
            secure: false
          })
          client.presignedGetObject('bucket', 'object', 1000, function() {})
        } catch (e) {
          done()
        }
      })
      it('should not generate presigned url with wrong expires param', (done) => {
        try {
          client.presignedGetObject('bucket', 'object', '0', function() {})
        } catch (e) {
          done()
        }
      })
      it('should generate presigned url', (done) => {
        MockResponse('http://localhost:9000').get('/bucket?location').reply(200, '<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">EU</LocationConstraint>')
        client.presignedGetObject('bucket', 'object', 86400, (e, url) => {
          assert.equal(e, null)
          assert.equal(url.length > 0, true)
          done()
        })
      })
    })
    describe('presigned-put', () => {
      it('should not generate presigned url with no access key', (done) => {
        try {
          var client = new Minio.Client({
            endPoint: 'localhost',
            port: 9000,
            secure: false
          })
          client.presignedPutObject('bucket', 'object', 1000, function() {})
        } catch (e) {
          done()
        }
      })
      it('should not generate presigned url with wrong expires param', (done) => {
        try {
          client.presignedPutObject('bucket', 'object', '0', function() {})
        } catch (e) {
          done()
        }
      })
      it('should generate presigned url', (done) => {
        client.presignedPutObject('bucket', 'object', 1000, (e, url) => {
          assert.equal(e, null)
          assert.equal(url.length > 0, true)
          done()
        })
      })
      it('should use default expiry if none is given', (done) => {
        client.presignedPutObject('bucket', 'object', (e, url) => {
          assert.equal(e, null)
          assert(url.length > 0)
          done()
        })
      })
    })
  })
  describe('User Agent', () => {
    it('should have a default user agent', () => {
      var client = new Minio.Client({
        endPoint: 'localhost',
        accessKey: 'accesskey',
        secretKey: 'secretkey'
      })
      assert.equal(`Minio (${process.platform}; ${process.arch}) minio-js/${Package.version}`,
                   client.userAgent)
    })
    it('should set user agent', () => {
      var client = new Minio.Client({
        endPoint: 'localhost',
        accessKey: 'accesskey',
        secretKey: 'secretkey'
      })
      client.setAppInfo('test', '3.1.3')
      assert.equal(`Minio (${process.platform}; ${process.arch}) minio-js/${Package.version} test/3.1.3`,
                   client.userAgent)
    })
    it('should set user agent without comments', () => {
      var client = new Minio.Client({
        endPoint: 'localhost',
        accessKey: 'accesskey',
        secretKey: 'secretkey'
      })
      client.setAppInfo('test', '3.1.3')
      assert.equal(`Minio (${process.platform}; ${process.arch}) minio-js/${Package.version} test/3.1.3`,
                   client.userAgent)
    })
    it('should not set user agent without name', (done) => {
      try {
        var client = new Minio.Client({
          endPoint: 'localhost',
          accessKey: 'accesskey',
          secretKey: 'secretkey'
        })
        client.setAppInfo(null, '3.1.3')
      } catch (e) {
        done()
      }
    })
    it('should not set user agent with empty name', (done) => {
      try {
        var client = new Minio.Client({
          endPoint: 'localhost',
          accessKey: 'accesskey',
          secretKey: 'secretkey'
        })
        client.setAppInfo('', '3.1.3')
      } catch (e) {
        done()
      }
    })
    it('should not set user agent without version', (done) => {
      try {
        var client = new Minio.Client({
          endPoint: 'localhost',
          accessKey: 'accesskey',
          secretKey: 'secretkey'
        })
        client.setAppInfo('test', null)
      } catch (e) {
        done()
      }
    })
    it('should not set user agent with empty version', (done) => {
      try {
        var client = new Minio.Client({
          endPoint: 'localhost',
          accessKey: 'accesskey',
          secretKey: 'secretkey'
        })
        client.setAppInfo('test', '')
      } catch (e) {
        done()
      }
    })
  })
  describe('Authentication', () => {
    describe('not set', () => {
      it('should not send auth info without keys', (done) => {
        client = new Minio.Client({
          endPoint: 'localhost',
          port: 9000,
          secure: false
        })
        MockResponse('http://localhost:9000').get('/bucket?location').reply(200, '<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">EU</LocationConstraint>')
        MockResponse('http://localhost:9000', {
          badHeaders: ['Authorization']
        }).head('/bucket/object').reply(200, '', {
          'ETag': 'etag',
          'Content-Length': 11,
          'Last-Modified': 'lastmodified',
          'Content-Type': 'text/plain'
        })
        client.statObject('bucket', 'object', (e, r) => {
          assert.deepEqual(r, {
            size: 11,
            'lastModified': 'lastmodified',
            etag: 'etag',
            contentType: 'text/plain'
          })
          done()
        })
      })
    })
    describe('set with access and secret keys', () => {
      it('should not send auth info without keys', (done) => {
        client = new Minio.Client({
          endPoint: 'localhost',
          port: 9000,
          accessKey: 'accessKey',
          secretKey: 'secretKey',
          secure: false
        })
        MockResponse('http://localhost:9000').get('/bucket?location').reply(200, '<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">EU</LocationConstraint>')
        MockResponse('http://localhost:9000', {
          reqHeaders: {
            'x-amz-content-sha256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            'Authorization': '/AWS4-HMAC-SHA256/i',
          }
        }).head('/bucket/object').reply(200, '', {
          'ETag': 'etag',
          'Content-Length': 11,
          'Last-Modified': 'lastmodified',
          'Content-Type': 'text/plain'
        })
        client.statObject('bucket', 'object', (e, r) => {
          assert.deepEqual(r, {
            size: 11,
            'lastModified': 'lastmodified',
            etag: 'etag',
            contentType: 'text/plain'
          })
          done()
        })
      })
    })
  })

  describe('Bucket API calls', () => {
    describe('#makeBucket(bucket, region, callback)', () => {
      it('should call the callback on success', (done) => {
        MockResponse('http://localhost:9000').put('/bucket').reply(200)
        client.makeBucket('bucket', '', (e) => {
          assert.equal(e, null)
          done()
        })
      })
      it('pass an error into the callback on failure', (done) => {
        MockResponse('http://localhost:9000').put('/bucket').reply(400, generateError('code', 'message', 'requestid', 'hostid', '/bucket'))
        client.makeBucket('bucket', '', checkError('code', 'message', 'requestid', 'hostid', '/bucket', done))
      })
      it('should fail on null bucket', (done) => {
        try {
          client.makeBucket(null, '', assert.fail)
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.makeBucket('', '', assert.fail)
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.makeBucket('  \n  \t  ', '', assert.fail)
        } catch (e) {
          done()
        }
      })
    })

    describe('#listBuckets()', () => {
      it('should generate a bucket iterator', (done) => {
        MockResponse('http://localhost:9000').get('/').reply(200, '<ListAllMyBucketsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01"><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner><Buckets><Bucket><Name>bucket</Name><CreationDate>2015-05-05T20:35:51.410Z</CreationDate></Bucket><Bucket><Name>foo</Name><CreationDate>2015-05-05T20:35:47.170Z</CreationDate></Bucket></Buckets></ListAllMyBucketsResult>')
        var expectedResults = [{
          name: 'bucket',
          creationDate: new Date('2015-05-05T20:35:51.410Z')
        }, {
          name: 'foo',
          creationDate: new Date('2015-05-05T20:35:47.170Z')
        }]
        client.listBuckets(function(e, buckets) {
          assert.deepEqual(buckets, expectedResults)
          done()
        })
      })
      it('should pass error to callback', (done) => {
        MockResponse('http://localhost:9000').get('/').reply(400, generateError('code', 'message', 'requestid', 'hostid', '/'))
        client.listBuckets(checkError('code', 'message', 'requestid', 'hostid', '/', done))
      })
    })

    describe('#bucketExists(bucket, cb)', () => {
      it('should call callback with no options if successful', (done) => {
        MockResponse('http://localhost:9000').get('/bucket?location').reply(200, '<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">EU</LocationConstraint>')
        MockResponse('http://localhost:9000').head('/bucket').reply(200)
        client.bucketExists('bucket', (e) => {
          assert.equal(e, null)
          done()
        })
      })
      it('should pass error to callback', (done) => {
        MockResponse('http://localhost:9000').head('/bucket').reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))
        client.bucketExists('bucket', checkError('code', 'message', 'requestid', 'hostid', 'resource', done))
      })
      it('should return an error on moved permanently', (done) => {
        MockResponse('http://localhost:9000').get('/bucket?location').reply(200, '<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">EU</LocationConstraint>')
        MockResponse('http://localhost:9000').head('/bucket').reply(301)
        client.bucketExists('bucket', checkError('MovedPermanently', 'Moved Permanently', null, null, null, done))
      })
      it('should return an error on 404', (done) => {
        MockResponse('http://localhost:9000').get('/bucket?location').reply(200, '<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">EU</LocationConstraint>')
        MockResponse('http://localhost:9000').head('/bucket').reply(403)
        client.bucketExists('bucket', checkError('AccessDenied', 'Valid and authorized credentials required', null, null, null, done))
      })
      it('should return an error on 404', (done) => {
        MockResponse('http://localhost:9000').get('/bucket?location').reply(200, '<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">EU</LocationConstraint>')
        MockResponse('http://localhost:9000').head('/bucket').reply(404)
        client.bucketExists('bucket', checkError('NotFound', 'Not Found', null, null, null, done))
      })
      it('should fail on null bucket', (done) => {
        try {
          client.bucketExists(null, assert.fail)
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.bucketExists('', assert.fail)
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.BucketExists('  \n  \t  ', assert.fail)
        } catch (e) {
          done()
        }
      })
    })

    describe('#removeBucket(bucket, cb)', () => {
      it('should remove a bucket', (done) => {
        MockResponse('http://localhost:9000').get('/bucket?location').reply(200, '<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">EU</LocationConstraint>')
        MockResponse('http://localhost:9000').delete('/bucket').reply(204)
        client.removeBucket('bucket', () => {
          done()
        })
      })
      it('should pass error to callback', (done) => {
        MockResponse('http://localhost:9000').get('/bucket?location').reply(200, '<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">EU</LocationConstraint>')
        MockResponse('http://localhost:9000').delete('/bucket').reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))
        client.removeBucket('bucket', checkError('code', 'message', 'requestid', 'hostid', 'resource', done))
      })
      it('should fail on null bucket', (done) => {
        try {
          client.removeBucket(null, assert.fail)
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.removeBucket('', assert.fail)
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.removeBucket('  \n  \t  ', assert.fail)
        } catch (e) {
          done()
        }
      })
    })
  })

  describe('bucket policy', () => {
    describe('constants', () => {
      it('should equal string values', () => {
        assert.equal(Minio.Policy.NONE, 'none')
        assert.equal(Minio.Policy.READONLY, 'readonly')
        assert.equal(Minio.Policy.READWRITE, 'readwrite')
        assert.equal(Minio.Policy.WRITEONLY, 'writeonly')
      })
    })
    describe('internal #parseBucketPolicy(policy, bucketName, objectPrefix)', () => {
      it('should parse Policy.READONLY', () => {
        let payload = JSON.parse('{"Version":"2012-10-17","Statement":[{"Sid":"","Effect":"Allow","Principal":{"AWS":["*"]},"Action":["s3:GetBucketLocation","s3:ListBucket"],"Resource":["arn:aws:s3:::bucket"]},{"Sid":"","Effect":"Allow","Principal":{"AWS":["*"]},"Action":["s3:GetObject"],"Resource":["arn:aws:s3:::bucket/*"]}]}')

        assert.equal(parseBucketPolicy(payload, 'bucket', ''), Minio.Policy.READONLY)
      })
      it('should parse Policy.WRITEONLY', () => {
        let payload = JSON.parse('{"Version":"2012-10-17","Statement":[{"Sid":"","Effect":"Allow","Principal":{"AWS":["*"]},"Action":["s3:GetBucketLocation","s3:ListBucketMultipartUploads"],"Resource":["arn:aws:s3:::bucket"]},{"Sid":"","Effect":"Allow","Principal":{"AWS":["*"]},"Action":["s3:AbortMultipartUpload","s3:DeleteObject","s3:ListMultipartUploadParts","s3:PutObject"],"Resource":["arn:aws:s3:::bucket/*"]}]}')

        assert.equal(parseBucketPolicy(payload, 'bucket', ''), Minio.Policy.WRITEONLY)
      })
      it('should parse Policy.READWRITE', () => {
        let payload = JSON.parse('{"Version":"2012-10-17","Statement":[{"Sid":"","Effect":"Allow","Principal":{"AWS":["*"]},"Action":["s3:GetBucketLocation","s3:ListBucketMultipartUploads"],"Resource":["arn:aws:s3:::bucket"]},{"Sid":"","Effect":"Allow","Principal":{"AWS":["*"]},"Action":["s3:AbortMultipartUpload","s3:DeleteObject","s3:ListMultipartUploadParts","s3:PutObject","s3:GetObject"],"Resource":["arn:aws:s3:::bucket/*"]}]}')

        assert.equal(parseBucketPolicy(payload, 'bucket', ''), Minio.Policy.READWRITE)
      })
      it('should parse AWS Policy.READONLY', () => {
        let payload = JSON.parse('{"Version":"2012-10-17","Statement":[{"Sid":"","Effect":"Allow","Principal":{"AWS":"*"},"Action":"s3:GetBucketLocation","Resource":"arn:aws:s3:::bucket"},{"Sid":"","Effect":"Allow","Principal":{"AWS":"*"},"Action":"s3:GetObject","Resource":"arn:aws:s3:::bucket/*"},{"Sid":"","Effect":"Allow","Principal":{"AWS":"*"},"Action":"s3:ListBucket","Resource":"arn:aws:s3:::bucket"}]}')

        assert.equal(parseBucketPolicy(payload, 'bucket', ''), Minio.Policy.READONLY)
      })
      it('should parse AWS Policy.READWRITE', () => {
        // AWS drops the array for the string, so the parser should normalize this back.
        let payload = JSON.parse('{"Version":"2012-10-17","Statement":[{"Sid":"","Effect":"Allow","Principal":{"AWS":"*"},"Action":["s3:GetBucketLocation","s3:ListBucketMultipartUploads"],"Resource":"arn:aws:s3:::bucket"},{"Sid":"","Effect":"Allow","Principal":{"AWS":"*"},"Action":["s3:GetObject","s3:AbortMultipartUpload","s3:DeleteObject","s3:ListMultipartUploadParts","s3:PutObject"],"Resource":"arn:aws:s3:::bucket/*"},{"Sid":"","Effect":"Allow","Principal":{"AWS":"*"},"Action":"s3:ListBucket","Resource":"arn:aws:s3:::bucket"}]}')

        assert.equal(parseBucketPolicy(payload, 'bucket', ''), Minio.Policy.READWRITE)
      })
      it('should parse Policy.NONE', () => {
        let payload = JSON.parse('{"Version":"2012-10-17","Statement":[{"Sid":"","Effect":"Allow","Principal":{"AWS":["*"]},"Action":["s3:DeleteObject"],"Resource":["arn:aws:s3:::bucket/*"]}]}')

        assert.equal(parseBucketPolicy(payload, 'bucket', ''), Minio.Policy.NONE)
      })
    })
    describe('internal #generateBucketPolicy(policy, bucketName, objectPrefix)', () => {
      it('should handle Policy.READONLY', () => {
        let payload = generateBucketPolicy(Minio.Policy.READONLY, 'bucket5', '')

        assert.equal(JSON.stringify(payload), '{"Version":"2012-10-17","Statement":[{"Sid":"","Effect":"Allow","Principal":{"AWS":["*"]},"Action":["s3:GetBucketLocation"],"Resource":["arn:aws:s3:::bucket5"]},{"Sid":"","Effect":"Allow","Principal":{"AWS":["*"]},"Action":["s3:GetObject"],"Resource":["arn:aws:s3:::bucket5/*"]},{"Sid":"","Effect":"Allow","Principal":{"AWS":["*"]},"Action":["s3:ListBucket"],"Resource":["arn:aws:s3:::bucket5"]}]}')
      })
      it('should handle Policy.WRITEONLY', () => {
        let payload = generateBucketPolicy(Minio.Policy.WRITEONLY, 'bucket6', '')

        assert.equal(JSON.stringify(payload), '{"Version":"2012-10-17","Statement":[{"Sid":"","Effect":"Allow","Principal":{"AWS":["*"]},"Action":["s3:GetBucketLocation","s3:ListBucketMultipartUploads"],"Resource":["arn:aws:s3:::bucket6"]},{"Sid":"","Effect":"Allow","Principal":{"AWS":["*"]},"Action":["s3:AbortMultipartUpload","s3:DeleteObject","s3:ListMultipartUploadParts","s3:PutObject"],"Resource":["arn:aws:s3:::bucket6/*"]}]}')
      })
      it('should handle Policy.READWRITE', () => {
        let payload = generateBucketPolicy(Minio.Policy.READWRITE, 'bucket8', '')

        assert.equal(JSON.stringify(payload), '{"Version":"2012-10-17","Statement":[{"Sid":"","Effect":"Allow","Principal":{"AWS":["*"]},"Action":["s3:GetBucketLocation","s3:ListBucketMultipartUploads"],"Resource":["arn:aws:s3:::bucket8"]},{"Sid":"","Effect":"Allow","Principal":{"AWS":["*"]},"Action":["s3:GetObject","s3:AbortMultipartUpload","s3:DeleteObject","s3:ListMultipartUploadParts","s3:PutObject"],"Resource":["arn:aws:s3:::bucket8/*"]},{"Sid":"","Effect":"Allow","Principal":{"AWS":["*"]},"Action":["s3:ListBucket"],"Resource":["arn:aws:s3:::bucket8"]}]}')
      })
      it('should handle Policy.READWRITE with prefix', () => {
        let payload = generateBucketPolicy(Minio.Policy.READWRITE, 'bucket9', 'prefix')

        assert.equal(JSON.stringify(payload), '{"Version":"2012-10-17","Statement":[{"Sid":"","Effect":"Allow","Principal":{"AWS":["*"]},"Action":["s3:GetBucketLocation","s3:ListBucketMultipartUploads"],"Resource":["arn:aws:s3:::bucket9"]},{"Sid":"","Effect":"Allow","Principal":{"AWS":["*"]},"Action":["s3:GetObject","s3:AbortMultipartUpload","s3:DeleteObject","s3:ListMultipartUploadParts","s3:PutObject"],"Resource":["arn:aws:s3:::bucket9/prefix*"]},{"Sid":"","Effect":"Allow","Principal":{"AWS":["*"]},"Action":["s3:ListBucket"],"Resource":["arn:aws:s3:::bucket9"],"Condition":{"StringEquals":{"s3:prefix":"prefix"}}}]}')
      })
    })
  })

  describe('object level', () => {
    describe('#getObject(bucket, object, callback)', () => {
      it('should return a stream object', (done) => {
        MockResponse('http://localhost:9000').get('/bucket?location').reply(200, '<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">EU</LocationConstraint>')
        MockResponse('http://localhost:9000').get('/bucket/object').reply(200, 'hello world')
        client.getObject('bucket', 'object', (e, r) => {
          assert.equal(e, null)
          r.pipe(Concat(buf => {
            assert.equal(buf, 'hello world')
            done()
          }))
        })
      })
      it('should pass error to callback', (done) => {
        MockResponse('http://localhost:9000').get('/bucket/object').reply(400, generateError('code', 'message', 'requestid', 'hostid', '/bucket/object'))
        client.getObject('bucket', 'object', checkError('code', 'message', 'requestid', 'hostid', '/bucket/object', done))
      })
      it('should fail on null bucket', (done) => {
        try {
          client.getObject(null, 'hello', function() {})
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.getObject('', 'hello', function() {})
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.getObject('  \n  \t  ', 'hello', function() {})
        } catch (e) {
          done()
        }
      })
      it('should fail on null object', (done) => {
        try {
          client.getObject('hello', null, function() {})
        } catch (e) {
          done()
        }
      })
      it('should fail on empty object', (done) => {
        try {
          client.getObject('hello', '', function() {})
        } catch (e) {
          done()
        }
      })
    })
    describe('#getPartialObject(bucket, object, offset, length, callback)', () => {
      it('should work with offset and length', (done) => {
        MockResponse('http://localhost:9000').get('/bucket?location').reply(200, '<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">EU</LocationConstraint>')
        MockResponse('http://localhost:9000', {
          reqHeaders: {
            'range': '10-21'
          }
        }).get('/bucket/object').reply(206, 'hello world')
        client.getPartialObject('bucket', 'object', 10, 11, (e, r) => {
          assert.equal(e, null)
          r.pipe(Concat(buf => {
            assert.equal(buf, 'hello world')
            done()
          }))
        })
      })
      it('should work with length as 0', (done) => {
        MockResponse('http://localhost:9000', {
          reqHeaders: {
            'range': '10-'
          }
        }).get('/bucket/object').reply(206, 'hello world')
        client.getPartialObject('bucket', 'object', 10, 0, (e, r) => {
          assert.equal(e, null)
          r.pipe(Concat(buf => {
            assert.equal(buf, 'hello world')
            done()
          }))
        })
      })
      it('should work with offset as 0', (done) => {
        MockResponse('http://localhost:9000', {
          reqHeaders: {
            'range': '0-21'
          }
        }).get('/bucket/object').reply(206, 'hello world')
        client.getPartialObject('bucket', 'object', 0, 11, (e, r) => {
          assert.equal(e, null)
          r.pipe(Concat(buf => {
            assert.equal(buf, 'hello world')
            done()
          }))
        })
      })
    })

    describe('#putObject(bucket, object, source, size, contentType, callback)', () => {
      describe('with small objects using single put', () => {
        it('should put an object', (done) => {
          MockResponse('http://localhost:9000').put('/bucket/object', 'hello world').reply(200)
          var s = new Stream.Readable()
          s._read = function() {}
          s.push('hello world')
          s.push(null)
          client.putObject('bucket', 'object', s, 11, 'text/plain', done)
        })
        it('should pass error to callback', (done) => {
          MockResponse('http://localhost:9000').put('/bucket/object', 'hello world').reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))
          var s = new Stream.Readable()
          s._read = function() {}
          s.push('hello world')
          s.push(null)
          client.putObject('bucket', 'object', s, 11, '', checkError('code', 'message', 'requestid', 'hostid', 'resource', done))
        })
        it('should fail when data is smaller than specified', (done) => {
          var s = new Stream.Readable()
          s._read = function() {}
          s.push('hello world')
          s.push(null)
          client.putObject('bucket', 'object', s, 12, '', (e) => {
            if (e) {
              done()
            }
          })
        })
        it('should fail when data is larger than specified', (done) => {
          var s = new Stream.Readable()
          s._read = function() {}
          s.push('hello world')
          s.push(null)
          client.putObject('bucket', 'object', s, 10, '', (e) => {
            if (e) {
              done()
            }
          })
        })
        it('should fail with invalid bucket name', () => {
          assert.throws(() => {
            client.putObject('ab', 'object', () => {})
          }, /Invalid bucket name/)
        })
        it('should fail with invalid object name', () => {
          assert.throws(() => {
            client.putObject('bucket', '', () => {})
          }, /Invalid object name/)
        })
        it('should error with size > maxObjectSize', () => {
          assert.throws(() => {
            client.putObject('bucket', 'object', new Stream.Readable(), client.maxObjectSize + 1, () => {})
          }, /size should not be more than/)
        })
        it('should fail on null bucket', (done) => {
          try {
            client.putObject(null, 'hello', null, 1, '', function() {})
          } catch (e) {
            done()
          }
        })
        it('should fail on empty bucket', (done) => {
          try {
            client.putObject(' \n \t ', 'hello', null, 1, '', function() {})
          } catch (e) {
            done()
          }
        })
        it('should fail on empty bucket', (done) => {
          try {
            client.putObject('', 'hello', null, 1, '', function() {})
          } catch (e) {
            done()
          }
        })
        it('should fail on null object', (done) => {
          try {
            client.putObject('hello', null, null, 1, '', function() {})
          } catch (e) {
            done()
          }
        })
        it('should fail on empty object', (done) => {
          try {
            client.putObject('hello', '', null, 1, '', function() {})
          } catch (e) {
            done()
          }
        })
      })
      describe('with large objects using multipart', () => {
        var uploadData = ''
        for (var i = 0; i < 1024; i++) {
          uploadData += 'a'
        }
        it('should put an object with no resume needed', (done) => {
          MockResponse('http://localhost:9000').get('/bucket?location').reply(200, '<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">EU</LocationConstraint>')
          MockResponse('http://localhost:9000').get('/bucket?uploads&max-uploads=1000&prefix=object').reply(200, '<ListMultipartUploadsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker></NextKeyMarker><NextUploadIdMarker></NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>false</IsTruncated><Prefix></Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
          MockResponse('http://localhost:9000').post('/bucket/object?uploads').reply(200, '<?xml version="1.0" encoding="UTF-8"?>\n<InitiateMultipartUploadResult><Bucket>bucket</Bucket><Key>object</Key><UploadId>uploadid</UploadId></InitiateMultipartUploadResult>')
          MockResponse('http://localhost:9000').put('/bucket/object?partNumber=1&uploadId=uploadid', (body) => {
            return body.length === 5 * 1024 * 1024

          }).reply(200, '', {
            etag: 'etag1'
          })
          MockResponse('http://localhost:9000').put('/bucket/object?partNumber=2&uploadId=uploadid', (body) => {
            return body.length === 5 * 1024 * 1024

          }).reply(200, '', {
            etag: 'etag2'
          })
          MockResponse('http://localhost:9000').put('/bucket/object?partNumber=3&uploadId=uploadid', (body) => {
            return body.length === 1024 * 1024

          }).reply(200, '', {
            etag: 'etag3'
          })
          MockResponse('http://localhost:9000').post('/bucket/object?uploadId=uploadid').reply(200, '<?xml version="1.0" encoding="UTF-8"?><CompleteMultipartUploadResult><Bucket>bucket</Bucket><Key>object</Key><Location>location</Location><ETag>"3858f62230ac3c915f300c664312c11f"</ETag></CompleteMultipartUploadResult>')
          var s = new Stream.Readable()
          s._read = function() {}
          for (var i = 0; i < 11 * 1024; i++) {
            s.push(uploadData)
          }
          s.push(null)
          client.putObject('bucket', 'object', s, 11 * 1024 * 1024, '', done)
        })
        it('should resume an object upload', (done) => {
          MockResponse('http://localhost:9000').get('/bucket?uploads&max-uploads=1000&prefix=object').reply(200, '<ListMultipartUploadsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01"><Bucket>bucket</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker></NextKeyMarker><NextUploadIdMarker></NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>false</IsTruncated><Upload><Key>object</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Prefix>object</Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
          MockResponse('http://localhost:9000').get('/bucket/object?uploadId=uploadid').reply(200, '<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01"><Bucket>bucket</Bucket><Key>go1.4.2</Key><UploadId>ntWSjzBytPT2xKLaMRonzXncsO10EH4Fc-Iq2-4hG-ulRYB</UploadId><Initiator><ID>minio</ID><DisplayName>minio</DisplayName></Initiator><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner><StorageClass>STANDARD</StorageClass><PartNumberMarker>0</PartNumberMarker><NextPartNumberMarker>0</NextPartNumberMarker><MaxParts>1000</MaxParts><IsTruncated>false</IsTruncated><Part><PartNumber>1</PartNumber><ETag>"79b281060d337b9b2b84ccf390adcf74"</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part><Part><PartNumber>2</PartNumber><ETag>"79b281060d337b9b2b84ccf390adcf74"</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part></ListPartsResult>')
          MockResponse('http://localhost:9000').put('/bucket/object?partNumber=3&uploadId=uploadid', (body) => {
            return body.length === 1024 * 1024

          }).reply(200, '', {
            etag: '79b281060d337b9b2b84ccf390adcf74'
          })
          MockResponse('http://localhost:9000').post('/bucket/object?uploadId=uploadid').reply(200, '<?xml version="1.0" encoding="UTF-8"?><CompleteMultipartUploadResult><Bucket>bucket</Bucket><Key>object</Key><Location>location</Location><ETag>"3858f62230ac3c915f300c664312c11f"</ETag></CompleteMultipartUploadResult>')
          var s = new Stream.Readable()
          s._read = function() {}
          for (var i = 0; i < 11 * 1024; i++) {
            s.push(uploadData)
          }
          s.push(null)
          client.putObject('bucket', 'object', s, 11 * 1024 * 1024, '', (e) => {
            done(e)
          })
        })
        it('should resume an object upload when uploaded data does not match, overwriting mismatching parts', (done) => {
          MockResponse('http://localhost:9000').get('/bucket?uploads&max-uploads=1000&prefix=object').reply(200, '<ListMultipartUploadsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01"><Bucket>bucket</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker></NextKeyMarker><NextUploadIdMarker></NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>false</IsTruncated><Upload><Key>object</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Prefix>object</Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
          MockResponse('http://localhost:9000').get('/bucket/object?uploadId=uploadid').reply(200, '<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01"><Bucket>bucket</Bucket><Key>go1.4.2</Key><UploadId>ntWSjzBytPT2xKLaMRonzXncsO10EH4Fc-Iq2-4hG-ulRYB</UploadId><Initiator><ID>minio</ID><DisplayName>minio</DisplayName></Initiator><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner><StorageClass>STANDARD</StorageClass><PartNumberMarker>0</PartNumberMarker><NextPartNumberMarker>0</NextPartNumberMarker><MaxParts>1000</MaxParts><IsTruncated>false</IsTruncated><Part><PartNumber>1</PartNumber><ETag>"79b281060d337b9b2b84ccf390adcf74"</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part><Part><PartNumber>2</PartNumber><ETag>"89b281060d337b9b2b84ccf390adcf74"</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part></ListPartsResult>')
          MockResponse('http://localhost:9000').put('/bucket/object?partNumber=2&uploadId=uploadid', (body) => {
            return body.length === 5 * 1024 * 1024
          }).reply(200, '', {
            etag: '79b281060d337b9b2b84ccf390adcf74'
          })
          MockResponse('http://localhost:9000').put('/bucket/object?partNumber=3&uploadId=uploadid', (body) => {
            return body.length === 1024 * 1024

          }).reply(200, '', {
            etag: '79b281060d337b9b2b84ccf390adcf74'
          })
          MockResponse('http://localhost:9000').post('/bucket/object?uploadId=uploadid').reply(200, '<?xml version="1.0" encoding="UTF-8"?><CompleteMultipartUploadResult><Bucket>bucket</Bucket><Key>object</Key><Location>location</Location><ETag>"3858f62230ac3c915f300c664312c11f"</ETag></CompleteMultipartUploadResult>')
          var s = new Stream.Readable()
          s._read = function() {}
          for (var i = 0; i < 11 * 1024; i++) {
            s.push(uploadData)
          }
          s.push(null)
          client.putObject('bucket', 'object', s, 11 * 1024 * 1024, '', done)
        })
        it('should succeed if actual size is smaller than expected', (done) => {
          MockResponse('http://localhost:9000').get('/bucket?uploads&max-uploads=1000&prefix=object').reply(200, '<ListMultipartUploadsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker></NextKeyMarker><NextUploadIdMarker></NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>false</IsTruncated><Prefix></Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
          MockResponse('http://localhost:9000').post('/bucket/object?uploads').reply(200, '<?xml version="1.0" encoding="UTF-8"?>\n<InitiateMultipartUploadResult><Bucket>bucket</Bucket><Key>object</Key><UploadId>uploadid</UploadId></InitiateMultipartUploadResult>')
          MockResponse('http://localhost:9000').put('/bucket/object?partNumber=1&uploadId=uploadid', (body) => {
            return body.length === 5 * 1024 * 1024
          }).reply(200, '', {
            etag: 'etag1'
          })
          MockResponse('http://localhost:9000').put('/bucket/object?partNumber=2&uploadId=uploadid', (body) => {
            return body.length === 5 * 1024 * 1024
          }).reply(200, '', {
            etag: 'etag2'
          })
          MockResponse('http://localhost:9000').put('/bucket/object?partNumber=3&uploadId=uploadid', (body) => {
            return body.length === 1 * 1024 * 1024
          }).reply(200, '', {
            etag: 'etag3'
          })
          MockResponse('http://localhost:9000').post('/bucket/object?uploadId=uploadid').reply(200, '<?xml version="1.0" encoding="UTF-8"?><CompleteMultipartUploadResult><Bucket>bucket</Bucket><Key>object</Key><Location>location</Location><ETag>"3858f62230ac3c915f300c664312c11f"</ETag></CompleteMultipartUploadResult>')
          var s = new Stream.Readable()
          s._read = function() {}
          for (var i = 0; i < 11 * 1024; i++) {
            s.push(uploadData)
          }
          s.push(null)
          client.putObject('bucket', 'object', s, 12 * 1024 * 1024, '', done)
        })
        it('should succeed if actual size is larger than expected', (done) => {
          MockResponse('http://localhost:9000').get('/bucket?uploads&max-uploads=1000&prefix=object').reply(200, '<ListMultipartUploadsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker></NextKeyMarker><NextUploadIdMarker></NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>false</IsTruncated><Prefix></Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
          MockResponse('http://localhost:9000').post('/bucket/object?uploads').reply(200, '<?xml version="1.0" encoding="UTF-8"?>\n<InitiateMultipartUploadResult><Bucket>bucket</Bucket><Key>object</Key><UploadId>uploadid</UploadId></InitiateMultipartUploadResult>')
          MockResponse('http://localhost:9000').put('/bucket/object?partNumber=1&uploadId=uploadid', (body) => {
            return body.length === 5 * 1024 * 1024
          }).reply(200, '', {
            etag: 'etag1'
          })
          MockResponse('http://localhost:9000').put('/bucket/object?partNumber=2&uploadId=uploadid', (body) => {
            return body.length === 5 * 1024 * 1024

          }).reply(200, '', {
            etag: 'etag2'
          })
          MockResponse('http://localhost:9000').put('/bucket/object?partNumber=3&uploadId=uploadid', (body) => {
            return body.length === 2 * 1024 * 1024

          }).reply(200, '', {
            etag: 'etag3'
          })
          MockResponse('http://localhost:9000').post('/bucket/object?uploadId=uploadid').reply(200, '<?xml version="1.0" encoding="UTF-8"?><CompleteMultipartUploadResult><Bucket>bucket</Bucket><Key>object</Key><Location>location</Location><ETag>"3858f62230ac3c915f300c664312c11f"</ETag></CompleteMultipartUploadResult>')
          var s = new Stream.Readable()
          s._read = function() {}
          for (var i = 0; i < 12 * 1024; i++) {
            s.push(uploadData)
          }
          s.push(null)
          client.putObject('bucket', 'object', s, 11 * 1024 * 1024, '', (e) => {
            assert.equal(e, null)
            done()
          })
        })
        it('should pass upload list error to callback', (done) => {
          MockResponse('http://localhost:9000').get('/bucket?uploads&max-uploads=1000&prefix=object').reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))
          var s = new Stream.Readable()
          s._read = function() {}
          for (var i = 0; i < 11 * 1024; i++) {
            s.push(uploadData)
          }
          s.push(null)
          client.putObject('bucket', 'object', s, 11 * 1024 * 1024, '', checkError('code', 'message', 'requestid', 'hostid', 'resource', done))
        })
        it('should pass part list error to callback', (done) => {
          MockResponse('http://localhost:9000').get('/bucket?location').reply(200, '<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">EU</LocationConstraint>')
          MockResponse('http://localhost:9000').get('/bucket?uploads&max-uploads=1000&prefix=object').reply(200, '<ListMultipartUploadsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01"><Bucket>bucket</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker></NextKeyMarker><NextUploadIdMarker></NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>false</IsTruncated><Upload><Key>object</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Prefix>object</Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
          MockResponse('http://localhost:9000').get('/bucket/object?uploadId=uploadid').reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))
          var s = new Stream.Readable()
          s._read = function() {}
          for (var i = 0; i < 11 * 1024; i++) {
            s.push(uploadData)
          }
          s.push(null)
          client.putObject('bucket', 'object', s, 11 * 1024 * 1024, '', checkError('code', 'message', 'requestid', 'hostid', 'resource', done))
        })
        it('should pass put error to callback', (done) => {
          MockResponse('http://localhost:9000').get('/bucket?location').reply(200, '<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">EU</LocationConstraint>')
          MockResponse('http://localhost:9000').get('/bucket?uploads&max-uploads=1000&prefix=object').reply(200, '<ListMultipartUploadsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01"><Bucket>bucket</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker></NextKeyMarker><NextUploadIdMarker></NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>false</IsTruncated><Upload><Key>object</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Prefix>object</Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
          MockResponse('http://localhost:9000').get('/bucket/object?uploadId=uploadid').reply(200, '<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01"><Bucket>bucket</Bucket><Key>go1.4.2</Key><UploadId>ntWSjzBytPT2xKLaMRonzXncsO10EH4Fc-Iq2-4hG-ulRYB</UploadId><Initiator><ID>minio</ID><DisplayName>minio</DisplayName></Initiator><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner><StorageClass>STANDARD</StorageClass><PartNumberMarker>0</PartNumberMarker><NextPartNumberMarker>0</NextPartNumberMarker><MaxParts>1000</MaxParts><IsTruncated>false</IsTruncated><Part><PartNumber>1</PartNumber><ETag>"79b281060d337b9b2b84ccf390adcf74"</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part><Part><PartNumber>2</PartNumber><ETag>"79b281060d337b9b2b84ccf390adcf74"</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part></ListPartsResult>')
          MockResponse('http://localhost:9000').put('/bucket/object?partNumber=3&uploadId=uploadid', (body) => {
            return body.length === 1024 * 1024

          }).reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))
          var s = new Stream.Readable()
          s._read = function() {}
          for (var i = 0; i < 11 * 1024; i++) {
            s.push(uploadData)
          }
          s.push(null)
          client.putObject('bucket', 'object', s, 11 * 1024 * 1024, '', checkError('code', 'message', 'requestid', 'hostid', 'resource', done))
        })
        it('should pass complete upload error to callback', (done) => {
          MockResponse('http://localhost:9000').get('/bucket?location').reply(200, '<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">EU</LocationConstraint>')
          MockResponse('http://localhost:9000').get('/bucket?uploads&max-uploads=1000&prefix=object').reply(200, '<ListMultipartUploadsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01"><Bucket>bucket</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker></NextKeyMarker><NextUploadIdMarker></NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>false</IsTruncated><Upload><Key>object</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Prefix>object</Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
          MockResponse('http://localhost:9000').get('/bucket/object?uploadId=uploadid').reply(200, '<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01"><Bucket>bucket</Bucket><Key>go1.4.2</Key><UploadId>ntWSjzBytPT2xKLaMRonzXncsO10EH4Fc-Iq2-4hG-ulRYB</UploadId><Initiator><ID>minio</ID><DisplayName>minio</DisplayName></Initiator><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner><StorageClass>STANDARD</StorageClass><PartNumberMarker>0</PartNumberMarker><NextPartNumberMarker>0</NextPartNumberMarker><MaxParts>1000</MaxParts><IsTruncated>false</IsTruncated><Part><PartNumber>1</PartNumber><ETag>"79b281060d337b9b2b84ccf390adcf74"</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part><Part><PartNumber>2</PartNumber><ETag>"79b281060d337b9b2b84ccf390adcf74"</ETag><LastModified>2015-06-03T03:12:34.756Z</LastModified><Size>5242880</Size></Part></ListPartsResult>')
          MockResponse('http://localhost:9000').put('/bucket/object?partNumber=3&uploadId=uploadid', (body) => {
            return body.length === 1024 * 1024

          }).reply(200, '', {
            etag: '79b281060d337b9b2b84ccf390adcf74'
          })
          MockResponse('http://localhost:9000').post('/bucket/object?uploadId=uploadid').reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))
          var s = new Stream.Readable()
          s._read = function() {}
          for (var i = 0; i < 11 * 1024; i++) {
            s.push(uploadData)
          }
          s.push(null)
          client.putObject('bucket', 'object', s, 11 * 1024 * 1024, '', checkError('code', 'message', 'requestid', 'hostid', 'resource', done))
        })
      })
    })

    describe('#removeAllBucketNotification()', () => {
      it('should error on invalid arguments', () => {
        assert.throws(() => {
          client.removeAllBucketNotification('ab', () => {}, function() {})
        }, /Invalid bucket name/)
      })
      it('remove all bucket notifications', (done) => {
        MockResponse('http://localhost:9000').get('/bucket?location').reply(200, '<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">EU</LocationConstraint>')
        MockResponse('http://localhost:9000').put('/bucket?notification').reply(200, '')
        client.removeAllBucketNotification('bucket', function(e) {
          assert.equal(e, null)
          done()
        })
      })
    })

    describe('#setBucketNotification()', () => {
      it('should error on invalid arguments', () => {
        assert.throws(() => {
          client.setBucketNotification('ab', () => {})
        }, /Invalid bucket name/)
        assert.throws(() => {
          client.setBucketNotification('bucket', 49, () => {})
        }, /notification config should be of type "Object"/)
      })
      it('set a bucket notification', (done) => {
        MockResponse('http://localhost:9000').put('/bucket?notification').reply(200, '')

        var config = new Minio.NotificationConfig()
        var arn = Minio.buildARN('aws', 'sns', 'us-west-2', 408065444917, 'TestTopic')
        var topic = new Minio.TopicConfig(arn)

        topic.addFilterSuffix('.jpg')
        topic.addFilterPrefix('myphotos/')
        topic.addEvent(Minio.ObjectCreatedAll)

        config.add(topic)

        client.setBucketNotification('bucket', config, function(e) {
          assert.equal(e, null)
          done()
        })
      })
    })

    describe('#getBucketNotification()', () => {
      it('should error on invalid arguments', () => {
        assert.throws(() => {
          client.getBucketNotification('ab', () => {})
        }, /Invalid bucket name/)
      })
      it('get and parse a bucket notification response', (done) => {
        MockResponse('http://localhost:9000').get('/bucket?notification').reply(200, '<NotificationConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><TopicConfiguration><Id>YjVkM2Y0YmUtNGI3NC00ZjQyLWEwNGItNDIyYWUxY2I0N2M4</Id><Topic>arn:aws:sns:us-east-1:83310034:s3notificationtopic2</Topic><Event>s3:ReducedRedundancyLostObject</Event><Event>s3:ObjectCreated:*</Event><Filter><S3Key><FilterRule><Name>suffix</Name><Value>.jpg</Value></FilterRule><FilterRule><Name>prefix</Name><Value>photos/</Value></FilterRule></S3Key></Filter></TopicConfiguration><QueueConfiguration><Id>ZjVkM2Y0YmUtNGI3NC00ZjQyLWEwNGItNDIyYWUxY2I0N2M4</Id><Queue>arn:aws:sns:us-east-1:83310034:s3notificationqueue2</Queue><Event>s3:ReducedRedundancyLostObject</Event><Event>s3:ObjectCreated:*</Event></QueueConfiguration></NotificationConfiguration>')
        client.getBucketNotification('bucket', function(e, bucketNotification) {
          var expectedResults = {
            TopicConfiguration:[{ Id: 'YjVkM2Y0YmUtNGI3NC00ZjQyLWEwNGItNDIyYWUxY2I0N2M4', Topic:'arn:aws:sns:us-east-1:83310034:s3notificationtopic2', Event:['s3:ReducedRedundancyLostObject', 's3:ObjectCreated:*'], Filter:[{Name:'suffix', Value:'.jpg'}, {Name:'prefix', Value:'photos/'}]}],
            QueueConfiguration:[ { Id: 'ZjVkM2Y0YmUtNGI3NC00ZjQyLWEwNGItNDIyYWUxY2I0N2M4', Queue:'arn:aws:sns:us-east-1:83310034:s3notificationqueue2', Event:['s3:ReducedRedundancyLostObject', 's3:ObjectCreated:*'], Filter:[]}],
            CloudFunctionConfiguration:[]}
          assert.deepEqual(bucketNotification, expectedResults)
          done()
        })
      })
    })

    describe('#listenBucketNotification', () => {
      it('should error on invalid arguments', () => {
        assert.throws(() => {
          client.listenBucketNotification('ab', 'prefix', 'suffix', ['events'])
        }, /Invalid bucket name/)
        assert.throws(() => {
          client.listenBucketNotification('bucket', {}, 'suffix', ['events'])
        }, /prefix must be of type string/)
        assert.throws(() => {
          client.listenBucketNotification('bucket', '', {}, ['events'])
        }, /suffix must be of type string/)
        assert.throws(() => {
          client.listenBucketNotification('bucket', '', '', {})
        }, /events must be of type Array/)
      })
    })

    describe('#listObjects()', () => {
      it('should iterate without a prefix', (done) => {
        MockResponse('http://localhost:9000').get('/bucket?max-keys=1000').reply(200, '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01"><Name>bucket</Name><Prefix></Prefix><Marker></Marker><MaxKeys>1000</MaxKeys><Delimiter></Delimiter><IsTruncated>true</IsTruncated><Contents><Key>key1</Key><LastModified>2015-05-05T02:21:15.716Z</LastModified><ETag>"5eb63bbbe01eeed093cb22bb8f5acdc3"</ETag><Size>11</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents><Contents><Key>key2</Key><LastModified>2015-05-05T20:36:17.498Z</LastModified><ETag>"2a60eaffa7a82804bdc682ce1df6c2d4"</ETag><Size>1661</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents></ListBucketResult>')
        MockResponse('http://localhost:9000').get('/bucket?marker=key2&max-keys=1000').reply(200, '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01"><Name>bucket</Name><Prefix></Prefix><Marker></Marker><MaxKeys>1000</MaxKeys><Delimiter></Delimiter><IsTruncated>true</IsTruncated><Contents><Key>key3</Key><LastModified>2015-05-05T02:21:15.716Z</LastModified><ETag>"5eb63bbbe01eeed093cb22bb8f5acdc3"</ETag><Size>11</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents><Contents><Key>key4</Key><LastModified>2015-05-05T20:36:17.498Z</LastModified><ETag>"2a60eaffa7a82804bdc682ce1df6c2d4"</ETag><Size>1661</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents></ListBucketResult>')
        MockResponse('http://localhost:9000').get('/bucket?marker=key4&max-keys=1000').reply(200, '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01"><Name>bucket</Name><Prefix></Prefix><Marker></Marker><MaxKeys>1000</MaxKeys><Delimiter></Delimiter><IsTruncated>false</IsTruncated><Contents><Key>key5</Key><LastModified>2015-05-05T02:21:15.716Z</LastModified><ETag>"5eb63bbbe01eeed093cb22bb8f5acdc3"</ETag><Size>11</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents><Contents><Key>key6</Key><LastModified>2015-05-05T20:36:17.498Z</LastModified><ETag>"2a60eaffa7a82804bdc682ce1df6c2d4"</ETag><Size>1661</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents></ListBucketResult>')
        var stream = client.listObjects('bucket', '', true),
          results = [],
          expectedResults = [{
            'etag': '5eb63bbbe01eeed093cb22bb8f5acdc3',
            'lastModified': new Date('2015-05-05T02:21:15.716Z'),
            'name': 'key1',
            'size': 11
          }, {
            'etag': '2a60eaffa7a82804bdc682ce1df6c2d4',
            'lastModified': new Date('2015-05-05T20:36:17.498Z'),
            'name': 'key2',
            'size': 1661
          }, {
            'etag': '5eb63bbbe01eeed093cb22bb8f5acdc3',
            'lastModified': new Date('2015-05-05T02:21:15.716Z'),
            'name': 'key3',
            'size': 11
          }, {
            'etag': '2a60eaffa7a82804bdc682ce1df6c2d4',
            'lastModified': new Date('2015-05-05T20:36:17.498Z'),
            'name': 'key4',
            'size': 1661
          }, {
            'etag': '5eb63bbbe01eeed093cb22bb8f5acdc3',
            'lastModified': new Date('2015-05-05T02:21:15.716Z'),
            'name': 'key5',
            'size': 11
          }, {
            'etag': '2a60eaffa7a82804bdc682ce1df6c2d4',
            'lastModified': new Date('2015-05-05T20:36:17.498Z'),
            'name': 'key6',
            'size': 1661
          }]
        stream.pipe(Through2.obj(function(object, enc, end) {
          results.push(object)
          end()
        }, function(end) {
          assert.deepEqual(results, expectedResults)
          end()
          done()
        }))
      })
      it('should iterate with a prefix', (done) => {
        MockResponse('http://localhost:9000').get('/bucket?max-keys=1000&prefix=key').reply(200, '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01"><Name>bucket</Name><Prefix></Prefix><Marker></Marker><MaxKeys>1000</MaxKeys><Delimiter></Delimiter><IsTruncated>true</IsTruncated><Contents><Key>key1</Key><LastModified>2015-05-05T02:21:15.716Z</LastModified><ETag>"5eb63bbbe01eeed093cb22bb8f5acdc3"</ETag><Size>11</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents><Contents><Key>key2</Key><LastModified>2015-05-05T20:36:17.498Z</LastModified><ETag>"2a60eaffa7a82804bdc682ce1df6c2d4"</ETag><Size>1661</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents></ListBucketResult>')
        MockResponse('http://localhost:9000').get('/bucket?marker=key2&max-keys=1000&prefix=key').reply(200, '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01"><Name>bucket</Name><Prefix></Prefix><Marker></Marker><MaxKeys>1000</MaxKeys><Delimiter></Delimiter><IsTruncated>true</IsTruncated><Contents><Key>key3</Key><LastModified>2015-05-05T02:21:15.716Z</LastModified><ETag>"5eb63bbbe01eeed093cb22bb8f5acdc3"</ETag><Size>11</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents><Contents><Key>key4</Key><LastModified>2015-05-05T20:36:17.498Z</LastModified><ETag>"2a60eaffa7a82804bdc682ce1df6c2d4"</ETag><Size>1661</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents></ListBucketResult>')
        MockResponse('http://localhost:9000').get('/bucket?marker=key4&max-keys=1000&prefix=key').reply(200, '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01"><Name>bucket</Name><Prefix></Prefix><Marker></Marker><MaxKeys>1000</MaxKeys><Delimiter></Delimiter><IsTruncated>false</IsTruncated><Contents><Key>key5</Key><LastModified>2015-05-05T02:21:15.716Z</LastModified><ETag>"5eb63bbbe01eeed093cb22bb8f5acdc3"</ETag><Size>11</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents><Contents><Key>key6</Key><LastModified>2015-05-05T20:36:17.498Z</LastModified><ETag>"2a60eaffa7a82804bdc682ce1df6c2d4"</ETag><Size>1661</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents></ListBucketResult>')
        var stream = client.listObjects('bucket', 'key', true),
          results = [],
          expectedResults = [{
            'etag': '5eb63bbbe01eeed093cb22bb8f5acdc3',
            'lastModified': new Date('2015-05-05T02:21:15.716Z'),
            'name': 'key1',
            'size': 11
          }, {
            'etag': '2a60eaffa7a82804bdc682ce1df6c2d4',
            'lastModified': new Date('2015-05-05T20:36:17.498Z'),
            'name': 'key2',
            'size': 1661
          }, {
            'etag': '5eb63bbbe01eeed093cb22bb8f5acdc3',
            'lastModified': new Date('2015-05-05T02:21:15.716Z'),
            'name': 'key3',
            'size': 11
          }, {
            'etag': '2a60eaffa7a82804bdc682ce1df6c2d4',
            'lastModified': new Date('2015-05-05T20:36:17.498Z'),
            'name': 'key4',
            'size': 1661
          }, {
            'etag': '5eb63bbbe01eeed093cb22bb8f5acdc3',
            'lastModified': new Date('2015-05-05T02:21:15.716Z'),
            'name': 'key5',
            'size': 11
          }, {
            'etag': '2a60eaffa7a82804bdc682ce1df6c2d4',
            'lastModified': new Date('2015-05-05T20:36:17.498Z'),
            'name': 'key6',
            'size': 1661
          }]
        stream.pipe(Through2.obj(function(object, enc, end) {
          results.push(object)
          end()
        }, function(end) {
          assert.deepEqual(results, expectedResults)
          end()
          done()
        }))
      })
      it.skip('should iterate with recursion', (done) => {
        MockResponse('http://localhost:9000').get('/bucket?max-keys=1000').reply(200, '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01"><Name>bucket</Name><Prefix></Prefix><Marker></Marker><MaxKeys>1000</MaxKeys><Delimiter></Delimiter><IsTruncated>true</IsTruncated><Contents><Key>key1</Key><LastModified>2015-05-05T02:21:15.716Z</LastModified><ETag>"5eb63bbbe01eeed093cb22bb8f5acdc3"</ETag><Size>11</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents><Contents><Key>key2</Key><LastModified>2015-05-05T20:36:17.498Z</LastModified><ETag>"2a60eaffa7a82804bdc682ce1df6c2d4"</ETag><Size>1661</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents></ListBucketResult>')
        MockResponse('http://localhost:9000').get('/bucket?marker=key2&max-keys=1000').reply(200, '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01"><Name>bucket</Name><Prefix></Prefix><Marker></Marker><MaxKeys>1000</MaxKeys><Delimiter></Delimiter><IsTruncated>true</IsTruncated><Contents><Key>key3</Key><LastModified>2015-05-05T02:21:15.716Z</LastModified><ETag>"5eb63bbbe01eeed093cb22bb8f5acdc3"</ETag><Size>11</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents><Contents><Key>key4</Key><LastModified>2015-05-05T20:36:17.498Z</LastModified><ETag>"2a60eaffa7a82804bdc682ce1df6c2d4"</ETag><Size>1661</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents></ListBucketResult>')
        MockResponse('http://localhost:9000').get('/bucket?marker=key4&max-keys=1000').reply(200, '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01"><Name>bucket</Name><Prefix></Prefix><Marker></Marker><MaxKeys>1000</MaxKeys><Delimiter></Delimiter><IsTruncated>false</IsTruncated><Contents><Key>key5</Key><LastModified>2015-05-05T02:21:15.716Z</LastModified><ETag>"5eb63bbbe01eeed093cb22bb8f5acdc3"</ETag><Size>11</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents><Contents><Key>key6</Key><LastModified>2015-05-05T20:36:17.498Z</LastModified><ETag>"2a60eaffa7a82804bdc682ce1df6c2d4"</ETag><Size>1661</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents></ListBucketResult>')
        var stream = client.listObjects('bucket', '', true),
          results = [],
          expectedResults = [{
            'etag': '5eb63bbbe01eeed093cb22bb8f5acdc3',
            'lastModified': '2015-05-05T02:21:15.716Z',
            'name': 'key1',
            'size': 11
          }, {
            'etag': '2a60eaffa7a82804bdc682ce1df6c2d4',
            'lastModified': '2015-05-05T20:36:17.498Z',
            'name': 'key2',
            'size': 1661
          }, {
            'etag': '5eb63bbbe01eeed093cb22bb8f5acdc3',
            'lastModified': '2015-05-05T02:21:15.716Z',
            'name': 'key3',
            'size': 11
          }, {
            'etag': '2a60eaffa7a82804bdc682ce1df6c2d4',
            'lastModified': '2015-05-05T20:36:17.498Z',
            'name': 'key4',
            'size': 1661
          }, {
            'etag': '5eb63bbbe01eeed093cb22bb8f5acdc3',
            'lastModified': '2015-05-05T02:21:15.716Z',
            'name': 'key5',
            'size': 11
          }, {
            'etag': '2a60eaffa7a82804bdc682ce1df6c2d4',
            'lastModified': '2015-05-05T20:36:17.498Z',
            'name': 'key6',
            'size': 1661
          }]
        stream.pipe(Through2.obj(function(object, enc, end) {
          results.push(object)
          end()
        }, function(end) {
          assert.deepEqual(results, expectedResults)
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
        stream.on('error', checkError('code', 'message', 'requestid', 'hostid', '/bucket', done))
      })
      it('should pass error in stream on subsequent error', (done) => {
        MockResponse('http://localhost:9000').get('/bucket?location').reply(200, '<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">EU</LocationConstraint>')
        MockResponse('http://localhost:9000').filteringPath(() => {
          return '/bucket'
        }).get('/bucket').reply(200, '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01"><Name>bucket</Name><Prefix></Prefix><Marker></Marker><MaxKeys>1000</MaxKeys><Delimiter></Delimiter><IsTruncated>true</IsTruncated><Contents><Key>key1</Key><LastModified>2015-05-05T02:21:15.716Z</LastModified><ETag>"5eb63bbbe01eeed093cb22bb8f5acdc3"</ETag><Size>11</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents><Contents><Key>key2</Key><LastModified>2015-05-05T20:36:17.498Z</LastModified><ETag>"2a60eaffa7a82804bdc682ce1df6c2d4"</ETag><Size>1661</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents></ListBucketResult>')
        MockResponse('http://localhost:9000').filteringPath(() => {
          return '/bucket'
        }).get('/bucket').reply(400, generateError('code', 'message', 'requestid', 'hostid', '/bucket'))
        var stream = client.listObjects('bucket')
        stream.pipe(Through2.obj(function(part, enc, end) {
          end()
        }, function(end) {
          end()
        }))
        stream.on('error', checkError('code', 'message', 'requestid', 'hostid', '/bucket', done))
      })
    })

    describe('#listObjectsV2()', () => {
      it('should iterate with a truncated flag', (done) => {
        MockResponse('http://localhost:9000').get('/bucket?location').reply(200, '<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">EU</LocationConstraint>')
        MockResponse('http://localhost:9000').get('/bucket?list-type=2&max-keys=1000').reply(200, '<?xml version="1.0" encoding="UTF-8"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>bucket</Name><Prefix></Prefix><KeyCount>7</KeyCount><MaxKeys>1000</MaxKeys><Delimiter>/</Delimiter><IsTruncated>true</IsTruncated><NextContinuationToken>6b9d1e3d20436</NextContinuationToken><Contents><Key>7mb.bin</Key><LastModified>2016-07-17T07:21:54.000Z</LastModified><ETag>&quot;67dc7f4b9253ab418a9f7fbc4282432a-2&quot;</ETag><Size>7340032</Size><StorageClass>STANDARD</StorageClass></Contents></ListBucketResult>')
        MockResponse('http://localhost:9000').get('/bucket?continuation-token=6b9d1e3d20436&list-type=2&max-keys=1000').reply(200, '<?xml version="1.0" encoding="UTF-8"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>bucket</Name><Prefix></Prefix><KeyCount>7</KeyCount><MaxKeys>1000</MaxKeys><Delimiter>/</Delimiter><IsTruncated>false</IsTruncated><Contents><Key>hosts</Key><LastModified>2016-07-15T11:46:53.000Z</LastModified><ETag>&quot;2bb4dbc9f2171fcd060366f4ea235c1c&quot;</ETag><Size>220</Size><StorageClass>STANDARD</StorageClass></Contents><Contents><Key>main.go</Key><LastModified>2016-07-19T10:29:14.000Z</LastModified><ETag>&quot;16c5f5a9817b6b9d1e3d204366a22f96&quot;</ETag><Size>8231</Size><StorageClass>STANDARD</StorageClass></Contents><CommonPrefixes><Prefix>1100/</Prefix></CommonPrefixes><CommonPrefixes><Prefix>caddy/</Prefix></CommonPrefixes><CommonPrefixes><Prefix>hosts/</Prefix></CommonPrefixes><CommonPrefixes><Prefix>uploads/</Prefix></CommonPrefixes></ListBucketResult>')
        var stream = client.listObjectsV2('bucket', '', true),
          results = [],
          expectedResults = [
            {
              'etag': '67dc7f4b9253ab418a9f7fbc4282432a-2',
              'lastModified': new Date('2016-07-17T07:21:54.000Z'),
              'name': '7mb.bin',
              'size': 7340032 },
            { 'etag': '2bb4dbc9f2171fcd060366f4ea235c1c',
              'lastModified': new Date('2016-07-15T11:46:53.000Z'),
              'name': 'hosts',
              'size': 220 },
            { 'etag': '16c5f5a9817b6b9d1e3d204366a22f96',
              'lastModified': new Date('2016-07-19T10:29:14.000Z'),
              'name': 'main.go',
              'size': 8231 },
            { 'prefix': '1100/',
              'size': 0 },
            { 'prefix': 'caddy/',
              'size': 0 },
            { 'prefix': 'hosts/',
              'size': 0 },
            { 'prefix': 'uploads/',
              'size': 0
            }
          ]
        stream.pipe(Through2.obj(function(object, enc, end) {
          results.push(object)
          end()
        }, function(end) {
          assert.deepEqual(results, expectedResults)
          end()
          done()
        }))
      })
    })

    describe('#statObject(bucket, object, callback)', () => {
      it('should retrieve object metadata', (done) => {
        MockResponse('http://localhost:9000').head('/bucket/object').reply(200, '', {
          'ETag': 'etag',
          'Content-Length': 11,
          'Last-Modified': 'lastmodified',
          'Content-Type': 'text/plain'
        })
        client.statObject('bucket', 'object', (e, r) => {
          assert.deepEqual(r, {
            size: 11,
            lastModified: 'lastmodified',
            etag: 'etag',
            contentType: 'text/plain'
          })
          done()
        })
      })
      it('should pass error to callback', (done) => {
        MockResponse('http://localhost:9000').head('/bucket/object')
          .reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))

        client.statObject('bucket', 'object', checkError('code', 'message', 'requestid', 'hostid', 'resource', done))
      })
      it('should fail on null bucket', (done) => {
        try {
          client.statObject(null, 'hello', function() {})
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.statObject('', 'hello', function() {})
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.statObject('  \n  \t  ', 'hello', function() {})
        } catch (e) {
          done()
        }
      })
      it('should fail on null object', (done) => {
        try {
          client.statObject('hello', null, function() {})
        } catch (e) {
          done()
        }
      })
      it('should fail on empty object', (done) => {
        try {
          client.statObject('hello', '', function() {})
        } catch (e) {
          done()
        }
      })
    })

    describe('#removeObject(bucket, object, callback)', () => {
      it('should delete an object', (done) => {
        MockResponse('http://localhost:9000').get('/bucket?location').reply(200, '<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">EU</LocationConstraint>')
        MockResponse('http://localhost:9000').delete('/bucket/object').reply(204)
        client.removeObject('bucket', 'object', (e) => {
          assert.equal(e, null)
          done()
        })
      })
      it('should pass error to callback', (done) => {
        MockResponse('http://localhost:9000').delete('/bucket/object')
          .reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))
        client.removeObject('bucket', 'object', checkError('code', 'message', 'requestid', 'hostid', 'resource', done))
      })
      it('should fail on null bucket', (done) => {
        try {
          client.removeObject(null, 'hello', function() {})
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.removeObject('', 'hello', function() {})
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.removeObject('  \n  \t  ', 'hello', function() {})
        } catch (e) {
          done()
        }
      })
      it('should fail on null object', (done) => {
        try {
          client.removeObject('hello', null, function() {})
        } catch (e) {
          done()
        }
      })
      it('should fail on empty object', (done) => {
        try {
          client.removeObject('hello', '', function() {})
        } catch (e) {
          done()
        }
      })
    })

    describe('#removeIncompleteUpload(bucket, object, callback)', () => {
      it('should remove an incomplete upload', (done) => {
        MockResponse('http://localhost:9000').get('/golang?location').reply(200, '<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">EU</LocationConstraint>')
        MockResponse('http://localhost:9000').get('/golang?uploads&max-uploads=1000&prefix=go1.4.2').reply(200, '<ListMultipartUploadsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker>keymarker</NextKeyMarker><NextUploadIdMarker>uploadmarker</NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>false</IsTruncated><Upload><Key>go1.4.2.1</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Upload><Key>go1.4.2</Key><UploadId>uploadid2</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T15:00:07.759Z</Initiated></Upload><Upload><Key>go1.5.0</Key><UploadId>uploadid2</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T15:00:07.759Z</Initiated></Upload><Prefix></Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
        MockResponse('http://localhost:9000').get('/golang?uploads&max-uploads=1000&prefix=go1.4.2').reply(200, '<ListMultipartUploadsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><Prefix></Prefix><Delimiter></Delimiter><IsTruncated>false</IsTruncated></ListMultipartUploadsResult>')
        MockResponse('http://localhost:9000').delete('/golang/go1.4.2?uploadId=uploadid2').reply(204)
        client.removeIncompleteUpload('golang', 'go1.4.2', done)
      })
      it('should pass error to callback on list failure', (done) => {
        MockResponse('http://localhost:9000').get('/golang?uploads&max-uploads=1000&prefix=go1.4.2').reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))
        client.removeIncompleteUpload('golang', 'go1.4.2', checkError('code', 'message', 'requestid', 'hostid', 'resource', done))
      })
      it('should pass error to callback on second list failure', (done) => {
        MockResponse('http://localhost:9000').get('/golang?location').reply(200, '<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">EU</LocationConstraint>')
        MockResponse('http://localhost:9000').get('/golang?uploads&max-uploads=1000&prefix=go1.4.2').reply(200, '<ListMultipartUploadsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker>keymarker</NextKeyMarker><NextUploadIdMarker>uploadmarker</NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>true</IsTruncated><Upload><Key>go1.4.2.1</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Upload><Key>go1.4.2.2</Key><UploadId>uploadid2</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T15:00:07.759Z</Initiated></Upload><Prefix></Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
        MockResponse('http://localhost:9000').get('/golang?uploads&key-marker=keymarker&max-uploads=1000&prefix=go1.4.2&upload-id-marker=uploadmarker').reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))
        client.removeIncompleteUpload('golang', 'go1.4.2', checkError('code', 'message', 'requestid', 'hostid', 'resource', done))
      })
      it('should return error on delete failure', (done) => {
        MockResponse('http://localhost:9000').get('/golang?location').reply(200, '<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">EU</LocationConstraint>')
        MockResponse('http://localhost:9000').get('/golang?uploads&max-uploads=1000&prefix=go1.4.2').reply(200, '<ListMultipartUploadsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker>keymarker</NextKeyMarker><NextUploadIdMarker>uploadmarker</NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>false</IsTruncated><Upload><Key>go1.4.2</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Upload><Key>go1.4.2.1</Key><UploadId>uploadid2</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T15:00:07.759Z</Initiated></Upload><Prefix></Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
        MockResponse('http://localhost:9000').delete('/golang/go1.4.2?uploadId=uploadid').reply(400, generateError('code', 'message', 'requestid', 'hostid', 'resource'))
        client.removeIncompleteUpload('golang', 'go1.4.2', checkError('code', 'message', 'requestid', 'hostid', 'resource', done))
      })
      it('should fail on null bucket', (done) => {
        try {
          client.removeIncompleteUpload(null, 'hello', function() {})
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.removeIncompleteUpload('', 'hello', function() {})
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.removeIncompleteUpload('  \n  \t  ', 'hello', function() {})
        } catch (e) {
          done()
        }
      })
      it('should fail on null object', (done) => {
        try {
          client.removeIncompleteUpload('hello', null, function() {})
        } catch (e) {
          done()
        }
      })
      it('should fail on empty object', (done) => {
        try {
          client.removeIncompleteUpload('hello', '', function() {})
        } catch (e) {
          done()
        }
      })
    })
  })
})

var checkError = (code, message, requestid, hostid, resource, callback) => {
  if (!callback) throw new Error('callback can not be null')
  return (e) => {
    if (e === null) {
      callback('expected error, received success')
    }
    assert.equal(e.name, 'S3Error')
    assert.equal(e.code, code)
    assert.equal(e.message, message)
    assert.equal(e.requestid, requestid)
    assert.equal(e.hostid, hostid)
    assert.equal(e.resource, resource)
    callback()
  }
}

var generateError = (code, message, requestid, hostid, resource) => {
  return `<Error><Code>${code}</Code><Message>${message}</Message><RequestId>${requestid}</RequestId><HostId>${hostid}</HostId><Resource>${resource}</Resource></Error>`
}
