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
import Nock from 'nock'
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
  it('should validate for us-west-2', () => {
    assert.equal(isValidEndpoint('s3-us-west-2.amazonaws.com'), true)
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
  let date = 'Fri, 11 Aug 2017 19:34:18 GMT'

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
  var client = new Minio.Client({
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
      client.setAppInfo('test', '3.2.1')
      assert.equal(`Minio (${process.platform}; ${process.arch}) minio-js/${Package.version} test/3.2.1`,
                   client.userAgent)
    })
    it('should set user agent without comments', () => {
      var client = new Minio.Client({
        endPoint: 'localhost',
        accessKey: 'accesskey',
        secretKey: 'secretkey'
      })
      client.setAppInfo('test', '3.2.1')
      assert.equal(`Minio (${process.platform}; ${process.arch}) minio-js/${Package.version} test/3.2.1`,
                   client.userAgent)
    })
    it('should not set user agent without name', (done) => {
      try {
        var client = new Minio.Client({
          endPoint: 'localhost',
          accessKey: 'accesskey',
          secretKey: 'secretkey'
        })
        client.setAppInfo(null, '3.2.1')
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
        client.setAppInfo('', '3.2.1')
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

    describe('#putObject(bucket, object, source, size, contentType, callback)', () => {
      describe('with small objects using single put', () => {
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
    })

    describe('#removeAllBucketNotification()', () => {
      it('should error on invalid arguments', () => {
        assert.throws(() => {
          client.removeAllBucketNotification('ab', () => {}, function() {})
        }, /Invalid bucket name/)
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
    })

    describe('#getBucketNotification()', () => {
      it('should error on invalid arguments', () => {
        assert.throws(() => {
          client.getBucketNotification('ab', () => {})
        }, /Invalid bucket name/)
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

    describe('#statObject(bucket, object, callback)', () => {
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

