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

require('source-map-support').install()

import { assert } from 'chai'
import Nock from 'nock'
import Stream from 'stream'
import * as Minio from '../../../dist/main/minio'
import { isValidEndpoint, isValidIP, makeDateLong, makeDateShort } from '../../../dist/main/helpers'

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
    useSSL: false
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
        useSSL: false
      })
      assert.equal(client.port, 9000)
    })
    it('should work with http', () => {
      var client = new Minio.Client({
        endPoint: 'localhost',
        accessKey: 'accesskey',
        secretKey: 'secretkey',
        useSSL: false
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
    it('should fail when secure param is passed', (done) => {
      try {
        new Minio.Client({
          endPoint: 'localhost',
          secure: false,
          port: 9000,
          accessKey: 'accesskey',
          secretKey: 'secretkey'
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
            useSSL: false
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
            useSSL: false
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
      assert.equal(`MinIO (${process.platform}; ${process.arch}) minio-js/${Package.version}`,
                   client.userAgent)
    })
    it('should set user agent', () => {
      var client = new Minio.Client({
        endPoint: 'localhost',
        accessKey: 'accesskey',
        secretKey: 'secretkey'
      })
      client.setAppInfo('test', '3.2.1')
      assert.equal(`MinIO (${process.platform}; ${process.arch}) minio-js/${Package.version} test/3.2.1`,
                   client.userAgent)
    })
    it('should set user agent without comments', () => {
      var client = new Minio.Client({
        endPoint: 'localhost',
        accessKey: 'accesskey',
        secretKey: 'secretkey'
      })
      client.setAppInfo('test', '3.2.1')
      assert.equal(`MinIO (${process.platform}; ${process.arch}) minio-js/${Package.version} test/3.2.1`,
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

      it('should fail on incompatible argument type (number) for statOpts object', (done) => {
        try {
          client.statObject('hello', 'testStatOpts', 1, function() {})
        } catch (e) {
          done()
        }
      })
      it('should fail on incompatible argument type (null) for statOpts object', (done) => {
        try {
          client.statObject('hello', 'testStatOpts', null, function() {})
        } catch (e) {
          done()
        }
      })
      it('should fail on incompatible argument type (sting) for statOpts object', (done) => {
        try {
          client.statObject('hello', 'testStatOpts', '  ', function() {})
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
      //Versioning related options as removeOpts
      it('should fail on empty (null) removeOpts object', (done) => {
        try {
          client.removeObject('hello', 'testRemoveOpts',null, function() {})
        } catch (e) {
          done()
        }
      })
      
      it('should fail on empty (string) removeOpts', (done) => {
        try {
          client.removeObject('hello', 'testRemoveOpts','', function() {})
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

  describe('Bucket Versioning APIs', ()=>{
    describe('getBucketVersioning(bucket, callback)', () => {
      it('should fail on null bucket', (done) => {
        try {
          client.getBucketVersioning(null, function () {
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.getBucketVersioning('', function () {
          })
        } catch (e) {
          done()
        }
      })
    })

    describe('setBucketVersioning(bucket, versionConfig, callback)', () => {
      it('should fail on null bucket', (done) => {
        try {
          client.setBucketVersioning(null, {},function () {
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.setBucketVersioning('', {},function () {
          })
        } catch (e) {
          done()
        }
      })

      it('should fail on empty versionConfig', (done) => {
        try {
          client.setBucketVersioning('', null,function () {
          })
        } catch (e) {
          done()
        }
      })
    })
  })


  describe('Bucket and Object Tags APIs', () => {
    describe('Set Bucket Tags ', () => {
      it('should fail on null bucket', (done) => {
        try {
          client.setBucketTagging(null, {}, function () {
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.setBucketTagging('', {}, function () {
          })
        } catch (e) {
          done()
        }
      })
      it('should fail if tags are more than 50', (done) => {
        const _50_plus_key_tags={}
        for(let i=0;i<51;i+=1){
          _50_plus_key_tags[i]=i
        }
        try {
          client.setBucketTagging('', _50_plus_key_tags, function () {
          })
        } catch (e) {
          done()
        }
      })

    })
    describe('Get Bucket Tags', () => {
      it('should fail on invalid bucket', (done) => {
        try {
          client.getBucketTagging('nv',null,  function () {
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on null bucket', (done) => {
        try {
          client.getBucketTagging(null, function () {
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.getBucketTagging('', function () {
          })
        } catch (e) {
          done()
        }
      })


    })
    describe('Remove Bucket Tags', () => {
      it('should fail on null object', (done) => {
        try {
          client.removeBucketTagging(null, function () {
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.removeBucketTagging('',  function () {
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on invalid bucket name', (done) => {
        try {
          client.removeBucketTagging('198.51.100.24', function () {
          })
        } catch (e) {
          done()
        }
      })

      it('should fail on invalid bucket name', (done) => {
        try {
          client.removeBucketTagging('xy', function () {
          })
        } catch (e) {
          done()
        }
      })
    })
    describe('Put Object Tags', () => {
      it('should fail on null object', (done) => {
        try {
          client.putObjectTagging('my-bucket-name',null, {}, function () {
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on empty object', (done) => {
        try {
          client.putObjectTagging('my-bucket-name',null, {}, function () {
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on non object tags', (done) => {
        try {
          client.putObjectTagging('my-bucket-name',null, 'non-obj-tag', function () {
          })
        } catch (e) {
          done()
        }
      })
      it('should fail if tags are more than 50 on an object', (done) => {
        const _50_plus_key_tags={}
        for(let i=0;i<51;i+=1){
          _50_plus_key_tags[i]=i
        }
        try {
          client.putObjectTagging('my-bucket-name',null, _50_plus_key_tags, function () {
          })
        } catch (e) {
          done()
        }
      })

    })
    describe('Get Object Tags', () => {
      it('should fail on invalid bucket', (done) => {
        try {
          client.getObjectTagging('nv',null,  function () {
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on null object', (done) => {
        try {
          client.getObjectTagging('my-bucket-name',null, function () {
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on empty object', (done) => {
        try {
          client.getObjectTagging('my-bucket-name',null, function () {
          })
        } catch (e) {
          done()
        }
      })


    })
    describe('Remove Object Tags', () => {
      it('should fail on null object', (done) => {
        try {
          client.removeObjectTagging('my-bucket',null, function () {
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.removeObjectTagging('my-bucket', '',  function () {
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on invalid bucket name', (done) => {
        try {
          client.removeObjectTagging('198.51.100.24', function () {
          })
        } catch (e) {
          done()
        }
      })

      it('should fail on invalid bucket name', (done) => {
        try {
          client.removeObjectTagging('xy', function () {
          })
        } catch (e) {
          done()
        }
      })
    })
  })

  describe('Object Locking APIs', ()=> {
    describe('getObjectLockConfig(bucket, callback)', () => {
      it('should fail on null bucket', (done) => {
        try {
          client.getObjectLockConfig(null, function () {
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.getObjectLockConfig('', function () {
          })
        } catch (e) {
          done()
        }
      })
    })

    describe('setObjectLockConfig(bucket, lockConfig, callback)', () => {
      it('should fail on null bucket', (done) => {
        try {
          client.setObjectLockConfig(null, function () {
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.setObjectLockConfig('', function () {
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on passing invalid mode ', (done) => {
        try {
          client.setObjectLockConfig('my-bucket',{mode:"invalid_mode"}, function () {
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on passing invalid unit ', (done) => {
        try {
          client.setObjectLockConfig('my-bucket',{ mode:"COMPLIANCE",unit:"invalid_unit"}, function () {
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on passing invalid validity ', (done) => {
        try {
          client.setObjectLockConfig('my-bucket',{mode:"COMPLIANCE",unit:"invalid_unit", validity:''}, function () {
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on passing  invalid config ', (done) => {
        try {
          client.setObjectLockConfig('my-bucket',{mode:"COMPLIANCE", randomProp:true, nonExisting:false,}, function () {
          })
        } catch (e) {
          done()
        }
      })
    })
  })

  describe('Object retention APIs', ()=> {
    describe('getObjectRetention(bucket, objectName, getRetentionOpts,callback)', () => {
      it('should fail on null bucket', (done) => {
        try {
          client.getObjectRetention(null,'','', function () {
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.getObjectRetention('', '','',function () {
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on invalid  object name', (done) => {
        try {
          client.getObjectRetention('my-bucket', null, '',function () {
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on invalid  versionId', (done) => {
        try {
          client.getObjectRetention('my-bucket', 'objectname', {versionId:123},function () {
          })
        } catch (e) {
          done()
        }
      })
    })

    describe('putObjectRetention(bucket, objectName, retentionConfig, callback)', () => {
      it('should fail on null bucket', (done) => {
        try {
          client.putObjectRetention(null,'',{}, function () {
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on empty bucket', (done) => {
        try {
          client.putObjectRetention('','',{}, function () {
          })
        } catch (e) {
          done()
        }
      })

      it('should fail on null object', (done) => {
        try {
          client.putObjectRetention('my-bucket',null,{}, function () {
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on empty object', (done) => {
        try {
          client.putObjectRetention('my-bucket', '', {}, function () {
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on passing invalid mode ', (done) => {
        try {
          client.putObjectRetention('my-bucket', 'my-object', {mode:"invalid_mode"}, function () {
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on passing invalid governanceBypass ', (done) => {
        try {
          client.putObjectRetention('my-bucket', 'my-object', { governanceBypass:"nonbool"}, function () {
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on passing invalid (null) retainUntilDate ', (done) => {
        try {
          client.putObjectRetention('my-bucket', 'my-object', { retainUntilDate:12345}, function () {
          })
        } catch (e) {
          done()
        }
      })
      it('should fail on passing invalid versionId ', (done) => {
        try {
          client.putObjectRetention('my-bucket',{ versionId:"COMPLIANCE" }, function () {
          })
        } catch (e) {
          done()
        }
      })
    })
  })

})

