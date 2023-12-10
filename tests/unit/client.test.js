/*
 * MinIO Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2016 MinIO, Inc.
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

import * as Stream from 'node:stream'

import { assert, expect, use } from 'chai'
import chaiAsPromised from 'chai-as-promised'
use(chaiAsPromised)

import Nock from 'nock'

import { CopyDestinationOptions } from '../../src/helpers.ts'
import * as Minio from '../../src/minio.js'

const Package = { version: 'development' }

describe('Client', function () {
  var nockRequests = []
  this.timeout(5000)
  beforeEach(() => {
    Nock.cleanAll()
    nockRequests = []
  })
  afterEach(() => {
    nockRequests.forEach((element) => {
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
    useSSL: false,
  })

  describe('new client', () => {
    it('should work with https', () => {
      var client = new Minio.Client({
        endPoint: 'localhost',
        accessKey: 'accesskey',
        secretKey: 'secretkey',
      })
      assert.equal(client.port, 443)
    })
    it('should override port with http', () => {
      var client = new Minio.Client({
        endPoint: 'localhost',
        port: 9000,
        accessKey: 'accesskey',
        secretKey: 'secretkey',
        useSSL: false,
      })
      assert.equal(client.port, 9000)
    })
    it('should work with http', () => {
      var client = new Minio.Client({
        endPoint: 'localhost',
        accessKey: 'accesskey',
        secretKey: 'secretkey',
        useSSL: false,
      })
      assert.equal(client.port, 80)
    })
    it('should override port with https', () => {
      var client = new Minio.Client({
        endPoint: 'localhost',
        port: 9000,
        accessKey: 'accesskey',
        secretKey: 'secretkey',
      })
      assert.equal(client.port, 9000)
    })
    it('should fail with url', (done) => {
      try {
        new Minio.Client({
          endPoint: 'http://localhost:9000',
          accessKey: 'accesskey',
          secretKey: 'secretkey',
        })
      } catch (e) {
        done()
      }
    })
    it('should fail with non-alphanumeric', (done) => {
      try {
        new Minio.Client({
          endPoint: 'localhost##$@3',
          accessKey: 'accesskey',
          secretKey: 'secretkey',
        })
      } catch (e) {
        done()
      }
    })
    it('should fail with no url', (done) => {
      try {
        new Minio.Client({
          accessKey: 'accesskey',
          secretKey: 'secretkey',
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
          secretKey: 'secretkey',
        })
      } catch (e) {
        done()
      }
    })
    it('should fail when secure param is passed', (done) => {
      try {
        new Minio.Client({
          endPoint: 'localhost',
          secure: false,
          port: 9000,
          accessKey: 'accesskey',
          secretKey: 'secretkey',
        })
      } catch (e) {
        done()
      }
    })
    it('should fail when secure param is passed', (done) => {
      try {
        new Minio.Client({
          endPoint: 'localhost',
          secure: true,
          port: 9000,
          accessKey: 'accesskey',
          secretKey: 'secretkey',
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
            useSSL: false,
          })
          client.presignedGetObject('bucket', 'object', 1000, function () {})
        } catch (e) {
          done()
        }
      })
      it('should not generate presigned url with wrong expires param', (done) => {
        try {
          client.presignedGetObject('bucket', 'object', '0', function () {})
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
            useSSL: false,
          })
          client.presignedPutObject('bucket', 'object', 1000, function () {})
        } catch (e) {
          done()
        }
      })
      it('should not generate presigned url with wrong expires param', (done) => {
        try {
          client.presignedPutObject('bucket', 'object', '0', function () {})
        } catch (e) {
          done()
        }
      })
    })
    describe('presigned-post-policy', () => {
      it('should not generate content type for undefined value', () => {
        assert.throws(() => {
          var policy = client.newPostPolicy()
          policy.setContentType()
        }, /content-type cannot be null/)
      })
      it('should not generate content disposition for undefined value', () => {
        assert.throws(() => {
          var policy = client.newPostPolicy()
          policy.setContentDisposition()
        }, /content-disposition cannot be null/)
      })
      it('should not generate user defined metadata for string value', () => {
        assert.throws(() => {
          var policy = client.newPostPolicy()
          policy.setUserMetaData('123')
        }, /metadata should be of type "object"/)
      })
      it('should not generate user defined metadata for null value', () => {
        assert.throws(() => {
          var policy = client.newPostPolicy()
          policy.setUserMetaData(null)
        }, /metadata should be of type "object"/)
      })
      it('should not generate user defined metadata for undefined value', () => {
        assert.throws(() => {
          var policy = client.newPostPolicy()
          policy.setUserMetaData()
        }, /metadata should be of type "object"/)
      })
    })
  })

  describe('User Agent', () => {
    it('should have a default user agent', () => {
      var client = new Minio.Client({
        endPoint: 'localhost',
        accessKey: 'accesskey',
        secretKey: 'secretkey',
      })
      assert.equal(`MinIO (${process.platform}; ${process.arch}) minio-js/${Package.version}`, client.userAgent)
    })
    it('should set user agent', () => {
      var client = new Minio.Client({
        endPoint: 'localhost',
        accessKey: 'accesskey',
        secretKey: 'secretkey',
      })
      client.setAppInfo('test', '3.2.1')
      assert.equal(
        `MinIO (${process.platform}; ${process.arch}) minio-js/${Package.version} test/3.2.1`,
        client.userAgent,
      )
    })
    it('should set user agent without comments', () => {
      var client = new Minio.Client({
        endPoint: 'localhost',
        accessKey: 'accesskey',
        secretKey: 'secretkey',
      })
      client.setAppInfo('test', '3.2.1')
      assert.equal(
        `MinIO (${process.platform}; ${process.arch}) minio-js/${Package.version} test/3.2.1`,
        client.userAgent,
      )
    })
    it('should not set user agent without name', (done) => {
      try {
        var client = new Minio.Client({
          endPoint: 'localhost',
          accessKey: 'accesskey',
          secretKey: 'secretkey',
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
          secretKey: 'secretkey',
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
          secretKey: 'secretkey',
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
          secretKey: 'secretkey',
        })
        client.setAppInfo('test', '')
      } catch (e) {
        done()
      }
    })
  })

  describe('object level', () => {
    describe('#getObject(bucket, object, callback)', () => {
      it('should fail on null bucket', (done) => {
        client.getObject(null, 'hello').then(
          () => done(new Error('expecting error')),
          () => done(),
        )
      })
      it('should fail on empty bucket', (done) => {
        client.getObject('', 'hello').then(
          () => done(new Error('expecting error')),
          () => done(),
        )
      })
      it('should fail on empty bucket', (done) => {
        client.getObject('  \n  \t  ', 'hello').then(
          () => done(new Error('expecting error')),
          () => done(),
        )
      })
      it('should fail on null object', (done) => {
        client.getObject('hello', null).then(
          () => done(new Error('expecting error')),
          () => done(),
        )
      })
      it('should fail on empty object', (done) => {
        client.getObject('hello', '').then(
          () => done(new Error('expecting error')),
          () => done(),
        )
      })
    })

    describe('#putObject(bucket, object, source, size, contentType, callback)', () => {
      describe('with small objects using single put', () => {
        it('should fail when data is smaller than specified', (done) => {
          var s = new Stream.Readable()
          s._read = function () {}
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
          s._read = function () {}
          s.push('hello world')
          s.push(null)
          client.putObject('bucket', 'object', s, 10, '', (e) => {
            if (e) {
              done()
            }
          })
        })
        it('should fail with invalid bucket name', () => {
          return expect(client.putObject('ab', 'object')).to.be.rejectedWith('Invalid bucket name')
        })
        it('should fail with invalid object name', () => {
          return expect(client.putObject('bucket', '')).to.be.rejectedWith('Invalid object name')
        })
        it('should error with size > maxObjectSize', () => {
          return expect(
            client.putObject('bucket', 'object', new Stream.Readable(), client.maxObjectSize + 1),
          ).to.be.rejectedWith('size should not be more than')
        })
        it('should fail on null bucket', () => {
          return expect(client.putObject(null, 'hello', null, 1, '')).rejectedWith('Invalid bucket name')
        })
        it('should fail on empty bucket', () => {
          return expect(client.putObject(' \n \t ', 'hello', null, 1, '')).to.be.rejectedWith('Invalid bucket name')
        })
        it('should fail on empty bucket', () => {
          return expect(client.putObject('', 'hello', null, 1, '')).to.be.rejectedWith('Invalid bucket name')
        })
        it('should fail on null object', () => {
          return expect(client.putObject('hello', null, null, 1, '')).to.be.rejectedWith('Invalid object name')
        })
        it('should fail on empty object', () => {
          return expect(client.putObject('hello', '', null, 1, '')).to.be.rejectedWith('Invalid object name')
        })
      })
    })

    describe('#removeAllBucketNotification()', () => {
      it('should error on invalid arguments', () => {
        assert.throws(() => {
          client.removeAllBucketNotification(
            'ab',
            () => {},
            function () {},
          )
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
        client.statObject(null, 'hello').then(
          () => done(new Error('expecting error')),
          () => done(),
        )
      })
      it('should fail on empty bucket', (done) => {
        client.statObject('', 'hello').then(
          () => done(new Error('expecting error')),
          () => done(),
        )
      })
      it('should fail on empty bucket', (done) => {
        client.statObject('  \n  \t  ', 'hello').then(
          () => done(new Error('expecting error')),
          () => done(),
        )
      })
      it('should fail on null object', (done) => {
        client.statObject('hello', null).then(
          () => done(new Error('expecting error')),
          () => done(),
        )
      })
      it('should fail on empty object', (done) => {
        client.statObject('hello', '').then(
          () => done(new Error('expecting error')),
          () => done(),
        )
      })

      it('should fail on incompatible argument type (number) for statOpts object', (done) => {
        client.statObject('hello', 'testStatOpts', 1).then(
          () => done(new Error('expecting error')),
          () => done(),
        )
      })
      it('should fail on incompatible argument type (null) for statOpts object', (done) => {
        client.statObject('hello', 'testStatOpts', null).then(
          () => done(new Error('expecting error')),
          () => done(),
        )
      })
      it('should fail on incompatible argument type (sting) for statOpts object', (done) => {
        client.statObject('hello', 'testStatOpts', '  ').then(
          () => done(new Error('expecting error')),
          () => done(),
        )
      })
    })

    describe('#removeObject(bucket, object, callback)', () => {
      it('should fail on null bucket', (done) => {
        client.removeObject(null, 'hello', function (err) {
          if (err) {
            return done()
          }
          done(new Error('callback should receive error'))
        })
      })
      it('should fail on empty bucket', (done) => {
        client.removeObject('', 'hello', function (err) {
          if (err) {
            return done()
          }
          done(new Error('callback should receive error'))
        })
      })
      it('should fail on empty bucket', (done) => {
        client.removeObject('  \n  \t  ', 'hello', function (err) {
          if (err) {
            return done()
          }
          done(new Error('callback should receive error'))
        })
      })
      it('should fail on null object', (done) => {
        client.removeObject('hello', null, function (err) {
          if (err) {
            return done()
          }
          done(new Error('callback should receive error'))
        })
      })
      it('should fail on empty object', (done) => {
        client.removeObject('hello', '', function (err) {
          if (err) {
            return done()
          }
          done(new Error('callback should receive error'))
        })
      })
      // Versioning related options as removeOpts
      it('should fail on empty (null) removeOpts object', (done) => {
        client.removeObject('hello', 'testRemoveOpts', null, function (err) {
          if (err) {
            return done()
          }
          done(new Error('callback should receive error'))
        })
      })

      it('should fail on empty (string) removeOpts', (done) => {
        client.removeObject('hello', 'testRemoveOpts', '', function (err) {
          if (err) {
            return done()
          }
          done(new Error('callback should receive error'))
        })
      })
    })

    describe('#removeIncompleteUpload(bucket, object, callback)', () => {
      it('should fail on null bucket', (done) => {
        try {
          client.removeIncompleteUpload(null, 'hello', function () {})
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.removeIncompleteUpload('', 'hello', function () {})
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.removeIncompleteUpload('  \n  \t  ', 'hello', function () {})
        } catch (e) {
          done()
        }
      })
      it('should fail on null object', (done) => {
        try {
          client.removeIncompleteUpload('hello', null, function () {})
        } catch (e) {
          done()
        }
      })
      it('should fail on empty object', (done) => {
        try {
          client.removeIncompleteUpload('hello', '', function () {})
        } catch (e) {
          done()
        }
      })
    })
  })

  describe('Bucket Versioning APIs', () => {
    describe('getBucketVersioning(bucket, callback)', () => {
      it('should fail on null bucket', (done) => {
        client.getBucketVersioning(null, function (err) {
          if (err) {
            return done()
          }
          done(new Error('callback should receive error'))
        })
      })

      it('should fail on empty bucket', (done) => {
        client.getBucketVersioning('', function (err) {
          if (err) {
            return done()
          }
          done(new Error('callback should receive error'))
        })
      })
    })

    describe('setBucketVersioning(bucket, versionConfig, callback)', () => {
      it('should fail on null bucket', (done) => {
        client.setBucketVersioning(null, {}, function (err) {
          if (err) {
            return done()
          }
          done(new Error('callback should receive error'))
        })
      })

      it('should fail on empty bucket', (done) => {
        client.setBucketVersioning(null, {}, function (err) {
          if (err) {
            return done()
          }
          done(new Error('callback should receive error'))
        })
      })
      it('should fail on empty bucket', (done) => {
        client.setBucketVersioning('', null, function (err) {
          if (err) {
            return done()
          }
          done(new Error('callback should receive error'))
        })
      })
    })
  })

  describe('Bucket and Object Tags APIs', () => {
    describe('Set Bucket Tags ', () => {
      it('should fail on null bucket', (done) => {
        try {
          client.setBucketTagging(null, {}, function () {})
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.setBucketTagging('', {}, function () {})
        } catch (e) {
          done()
        }
      })
      it('should fail if tags are more than 50', (done) => {
        const _50_plus_key_tags = {}
        for (let i = 0; i < 51; i += 1) {
          _50_plus_key_tags[i] = i
        }
        try {
          client.setBucketTagging('', _50_plus_key_tags, function () {})
        } catch (e) {
          done()
        }
      })
    })
    describe('Get Bucket Tags', () => {
      it('should fail on invalid bucket', async () => {
        try {
          await client.getBucketTagging('nv', null)
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })
      it('should fail on null bucket', async () => {
        try {
          await client.getBucketTagging(null)
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })
      it('should fail on empty bucket', async () => {
        try {
          await client.getBucketTagging('')
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })
    })
    describe('Remove Bucket Tags', () => {
      it('should fail on null object', (done) => {
        try {
          client.removeBucketTagging(null, function () {})
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.removeBucketTagging('', function () {})
        } catch (e) {
          done()
        }
      })
      it('should fail on invalid bucket name', (done) => {
        try {
          client.removeBucketTagging('198.51.100.24', function () {})
        } catch (e) {
          done()
        }
      })

      it('should fail on invalid bucket name', (done) => {
        try {
          client.removeBucketTagging('xy', function () {})
        } catch (e) {
          done()
        }
      })
    })
    describe('Get Object Tags', () => {
      it('should fail on invalid bucket', (done) => {
        client.getObjectTagging('nv', null).then(
          () => done(new Error('callback should receive error')),
          () => done(),
        )
      })
      it('should fail on null object', async () => {
        try {
          await client.getObjectTagging('my-bucket-name', null)
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })
      it('should fail on empty object', async () => {
        try {
          await client.getObjectTagging('my-bucket-name', null)
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })
    })
    describe('Remove Object Tags', () => {
      it('should fail on null object', (done) => {
        try {
          client.removeObjectTagging('my-bucket', null, function () {})
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.removeObjectTagging('my-bucket', '', function () {})
        } catch (e) {
          done()
        }
      })
      it('should fail on invalid bucket name', (done) => {
        try {
          client.removeObjectTagging('198.51.100.24', function () {})
        } catch (e) {
          done()
        }
      })

      it('should fail on invalid bucket name', (done) => {
        try {
          client.removeObjectTagging('xy', function () {})
        } catch (e) {
          done()
        }
      })
    })
  })

  describe('setBucketLifecycle(bucket, lifecycleConfig, callback)', () => {
    it('should fail on null bucket', (done) => {
      try {
        client.setBucketLifecycle(null, null, function () {})
      } catch (e) {
        done()
      }
    })

    it('should fail on empty bucket', (done) => {
      try {
        client.setBucketLifecycle('', null, function () {})
      } catch (e) {
        done()
      }
    })
  })

  describe('getBucketLifecycle(bucket, callback)', () => {
    it('should fail on null bucket', (done) => {
      try {
        client.getBucketLifecycle(null, function () {})
      } catch (e) {
        done()
      }
    })

    it('should fail on empty bucket', (done) => {
      try {
        client.getBucketLifecycle('', function () {})
      } catch (e) {
        done()
      }
    })
  })

  describe('removeBucketLifecycle(bucket, callback)', () => {
    it('should fail on null bucket', (done) => {
      try {
        client.removeBucketLifecycle(null, null, function () {})
      } catch (e) {
        done()
      }
    })

    it('should fail on empty bucket', (done) => {
      try {
        client.removeBucketLifecycle('', null, function () {})
      } catch (e) {
        done()
      }
    })
  })

  describe('Object Locking APIs', () => {
    describe('getObjectLockConfig(bucket, callback)', () => {
      it('should fail on null bucket', (done) => {
        client.getObjectLockConfig(null, function (err) {
          if (err) {
            return done()
          }
          done(new Error('callback should receive error'))
        })
      })
      it('should fail on null bucket', (done) => {
        client.getObjectLockConfig('', function (err) {
          if (err) {
            return done()
          }
          done(new Error('callback should receive error'))
        })
      })
    })

    describe('setObjectLockConfig(bucket, lockConfig, callback)', () => {
      it('should fail on null bucket', (done) => {
        client.setObjectLockConfig(null, function (err) {
          if (err) {
            return done()
          }
          done(new Error('callback should receive error'))
        })
      })
      it('should fail on null bucket', (done) => {
        client.setObjectLockConfig('', function (err) {
          if (err) {
            return done()
          }
          done(new Error('callback should receive error'))
        })
      })
      it('should fail on passing invalid mode ', (done) => {
        client.setObjectLockConfig('my-bucket', { mode: 'invalid_mode' }, function (err) {
          if (err) {
            return done()
          }
          done(new Error('callback should receive error'))
        })
      })
      it('should fail on passing invalid unit ', (done) => {
        client.setObjectLockConfig('my-bucket', { mode: 'COMPLIANCE', unit: 'invalid_unit' }, function (err) {
          if (err) {
            return done()
          }
          done(new Error('callback should receive error'))
        })
      })

      it('should fail on passing invalid validity ', (done) => {
        client.setObjectLockConfig(
          'my-bucket',
          {
            mode: 'COMPLIANCE',
            unit: 'invalid_unit',
            validity: '',
          },
          function (err) {
            if (err) {
              return done()
            }
            done(new Error('callback should receive error'))
          },
        )
      })

      it('should fail on passing  invalid config ', (done) => {
        client.setObjectLockConfig(
          'my-bucket',
          {
            mode: 'COMPLIANCE',
            randomProp: true,
            nonExisting: false,
          },
          function (err) {
            if (err) {
              return done()
            }
            done(new Error('callback should receive error'))
          },
        )
      })
    })
  })

  describe('Object retention APIs', () => {
    describe('getObjectRetention(bucket, objectName, getRetentionOpts,callback)', () => {
      it('should fail on null bucket', (done) => {
        try {
          client.getObjectRetention(null, '', '', function () {})
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.getObjectRetention('', '', '', function () {})
        } catch (e) {
          done()
        }
      })
      it('should fail on invalid  object name', (done) => {
        try {
          client.getObjectRetention('my-bucket', null, '', function () {})
        } catch (e) {
          done()
        }
      })
      it('should fail on invalid  versionId', (done) => {
        try {
          client.getObjectRetention('my-bucket', 'objectname', { versionId: 123 }, function () {})
        } catch (e) {
          done()
        }
      })
    })

    describe('putObjectRetention(bucket, objectName, retentionConfig, callback)', () => {
      it('should fail on null bucket', (done) => {
        client.putObjectRetention(null, '', {}, function (err) {
          if (err) {
            done()
          } else {
            done(new Error('expecting error'))
          }
        })
      })
      it('should fail on empty bucket', (done) => {
        client.putObjectRetention('', '', {}, function (err) {
          if (err) {
            done()
          } else {
            done(new Error('expecting error'))
          }
        })
      })

      it('should fail on null object', (done) => {
        client.putObjectRetention('my-bucket', null, {}, function (err) {
          if (err) {
            done()
          } else {
            done(new Error('expecting error'))
          }
        })
      })
      it('should fail on empty object', (done) => {
        client.putObjectRetention('my-bucket', '', {}, function (err) {
          if (err) {
            done()
          } else {
            done(new Error('expecting error'))
          }
        })
      })
      it('should fail on passing invalid mode ', (done) => {
        client.putObjectRetention('my-bucket', 'my-object', { mode: 'invalid_mode' }, function (err) {
          if (err) {
            done()
          } else {
            done(new Error('expecting error'))
          }
        })
      })
      it('should fail on passing invalid governanceBypass ', (done) => {
        client.putObjectRetention('my-bucket', 'my-object', { governanceBypass: 'nonbool' }, function (err) {
          if (err) {
            done()
          } else {
            done(new Error('expecting error'))
          }
        })
      })
      it('should fail on passing invalid (null) retainUntilDate ', (done) => {
        client.putObjectRetention('my-bucket', 'my-object', { retainUntilDate: 12345 }, function (err) {
          if (err) {
            done()
          } else {
            done(new Error('expecting error'))
          }
        })
      })
      it('should fail on passing invalid versionId ', (done) => {
        client.putObjectRetention('my-bucket', { versionId: 'COMPLIANCE' }, function (err) {
          if (err) {
            done()
          } else {
            done(new Error('expecting error'))
          }
        })
      })
    })
  })

  describe('Bucket Encryption APIs', () => {
    describe('setBucketEncryption(bucket, encryptionConfig, callback)', () => {
      it('should fail on null bucket', (done) => {
        try {
          client.setBucketEncryption(null, function () {})
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.setBucketEncryption('', function () {})
        } catch (e) {
          done()
        }
      })
      it('should fail on multiple rules', (done) => {
        try {
          client.setBucketEncryption(
            'my-bucket',
            {
              // Default Rule
              Rule: [
                {
                  ApplyServerSideEncryptionByDefault: {
                    SSEAlgorithm: 'AES256',
                  },
                },
                {
                  ApplyServerSideEncryptionByDefault: {
                    SSEAlgorithm: 'AES256',
                  },
                },
              ],
            },
            function () {},
          )
        } catch (e) {
          done()
        }
      })
    })

    describe('getBucketEncryption(bucket, callback)', () => {
      it('should fail on null bucket', (done) => {
        try {
          client.getBucketEncryption(null, function () {})
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.getBucketEncryption('', function () {})
        } catch (e) {
          done()
        }
      })
    })

    describe('removeBucketEncryption(bucket, callback)', () => {
      it('should fail on null bucket', (done) => {
        try {
          client.removeBucketEncryption(null, function () {})
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.removeBucketEncryption('', function () {})
        } catch (e) {
          done()
        }
      })
    })
  })

  describe('Bucket Replication APIs', () => {
    describe('setBucketReplication(bucketName, replicationConfig, callback)', () => {
      it('should fail on null bucket', (done) => {
        try {
          client.setBucketReplication(null, {}, function (err) {
            if (err) {
              return done()
            }
            done(new Error('callback should receive error'))
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.setBucketReplication('', {}, function (err) {
            if (err) {
              return done()
            }
            done(new Error('callback should receive error'))
          })
        } catch (e) {
          done()
        }
      })

      it('should fail on empty replicationConfig', (done) => {
        try {
          client.setBucketReplication('my-bucket', {}, function (err) {
            if (err) {
              return done()
            }
            done(new Error('callback should receive error'))
          })
        } catch (e) {
          done()
        }
      })

      it('should fail on empty replicationConfig role', (done) => {
        try {
          client.setBucketReplication('my-bucket', { role: '' }, function (err) {
            if (err) {
              return done()
            }
            done(new Error('callback should receive error'))
          })
        } catch (e) {
          done()
        }
      })

      it('should fail on  invalid value for replicationConfig role', (done) => {
        try {
          client.setBucketReplication('my-bucket', { role: 12 }, function (err) {
            if (err) {
              return done()
            }
            done(new Error('callback should receive error'))
          })
        } catch (e) {
          done()
        }
      })

      it('should fail on  empty value for replicationConfig rules', (done) => {
        try {
          client.setBucketReplication('my-bucket', { role: 'arn:', rules: [] }, function (err) {
            if (err) {
              return done()
            }
            done(new Error('callback should receive error'))
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on  null value for replicationConfig rules', (done) => {
        try {
          client.setBucketReplication('my-bucket', { role: 'arn:', rules: null }, function (err) {
            if (err) {
              return done()
            }
            done(new Error('callback should receive error'))
          })
        } catch (e) {
          done()
        }
      })
    })

    describe('getBucketReplication(bucketName, callback)', () => {
      it('should fail on null bucket', (done) => {
        try {
          client.getBucketReplication(null, function (err) {
            if (err) {
              return done()
            }
            done(new Error('callback should receive error'))
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.getBucketReplication('', function (err) {
            if (err) {
              return done()
            }
            done(new Error('callback should receive error'))
          })
        } catch (e) {
          done()
        }
      })
    })

    describe('removeBucketReplication(bucketName, callback)', () => {
      it('should fail on null bucket', (done) => {
        try {
          client.removeBucketReplication(null, function (err) {
            if (err) {
              return done()
            }
            done(new Error('callback should receive error'))
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.removeBucketReplication('', function (err) {
            if (err) {
              return done()
            }
            done(new Error('callback should receive error'))
          })
        } catch (e) {
          done()
        }
      })
    })
  })

  describe('Object Legal Hold APIs', () => {
    describe('getObjectLegalHold(bucketName, objectName, getOpts={})', () => {
      it('should fail on null bucket', (done) => {
        try {
          client.getObjectLegalHold(null, function (err) {
            if (err) {
              return done()
            }
            done(new Error('callback should receive error'))
          })
        } catch (e) {
          done()
        }
      })

      it('should fail on empty bucket', (done) => {
        try {
          client.getObjectLegalHold('', function (err) {
            if (err) {
              return done()
            }
            done(new Error('callback should receive error'))
          })
        } catch (e) {
          done()
        }
      })

      it('should fail on null objectName', (done) => {
        try {
          client.getObjectLegalHold('my-bucket', null, function (err) {
            if (err) {
              return done()
            }
            done(new Error('callback should receive error'))
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on invalid version id in getOpts', (done) => {
        try {
          client.getObjectLegalHold('my-bucket', 'my-object', { versionId: 123 }, function (err) {
            if (err) {
              return done()
            }
            done(new Error('callback should receive error'))
          })
        } catch (e) {
          done()
        }
      })
    })

    describe('setObjectLegalHold(bucketName, objectName, setOpts={})', () => {
      it('should fail on null bucket', (done) => {
        try {
          client.setObjectLegalHold(null, function (err) {
            if (err) {
              return done()
            }
            done(new Error('callback should receive error'))
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.setObjectLegalHold('', function (err) {
            if (err) {
              return done()
            }
            done(new Error('callback should receive error'))
          })
        } catch (e) {
          done()
        }
      })

      it('should fail on null object', (done) => {
        try {
          client.setObjectLegalHold('my-bucket', null, function (err) {
            if (err) {
              return done()
            }
            done(new Error('callback should receive error'))
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on null setOpts', (done) => {
        try {
          client.setObjectLegalHold('my-bucket', 'my-object', null, function (err) {
            if (err) {
              return done()
            }
            done(new Error('callback should receive error'))
          })
        } catch (e) {
          done()
        }
      })

      it('should fail on empty version', (done) => {
        try {
          client.setObjectLegalHold('my-bucket', 'my-object', {}, function (err) {
            if (err) {
              return done()
            }
            done(new Error('callback should receive error'))
          })
        } catch (e) {
          done()
        }
      })
    })
  })

  describe('Compose Object APIs', () => {
    describe('composeObject(destObjConfig, sourceObjectList,cb)', () => {
      it('should fail on null destination config', (done) => {
        try {
          client.composeObject(null, function () {})
        } catch (e) {
          done()
        }
      })

      it('should fail on no array source config', (done) => {
        try {
          const destOptions = new CopyDestinationOptions({ Bucket: 'test-bucket', Object: 'test-object' })
          client.composeObject(destOptions, 'non-array', function () {})
        } catch (e) {
          done()
        }
      })

      it('should fail on null source config', (done) => {
        try {
          const destOptions = new CopyDestinationOptions({ Bucket: 'test-bucket', Object: 'test-object' })
          client.composeObject(destOptions, null, function () {})
        } catch (e) {
          done()
        }
      })
    })
  })

  describe('Select Object Content APIs', () => {
    describe('selectObjectContent(bucketName, objectName, selectOpts={}, cb)', () => {
      it('should fail on null bucket', (done) => {
        try {
          client.selectObjectContent(null, function () {})
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.selectObjectContent('', function () {})
        } catch (e) {
          done()
        }
      })

      it('should fail on empty object', (done) => {
        try {
          client.selectObjectContent('my-bucket', '', function () {})
        } catch (e) {
          done()
        }
      })
      it('should fail on null object', (done) => {
        try {
          client.selectObjectContent('my-bucket', null, function () {})
        } catch (e) {
          done()
        }
      })
    })
  })
})