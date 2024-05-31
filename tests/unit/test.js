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

import { CopyDestinationOptions, CopySourceOptions } from '../../src/helpers.ts'
import {
  calculateEvenSplits,
  isValidEndpoint,
  isValidIP,
  makeDateLong,
  makeDateShort,
  partsRequired,
} from '../../src/internal/helper.ts'
import { joinHostPort } from '../../src/internal/join-host-port.ts'
import * as Minio from '../../src/minio.js'
import { parseListObjects } from '../../src/xml-parsers.js'

const Package = { version: 'development' }

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

  it('should make date short', () => {
    let date = new Date('2012-12-03T17:25:36.331Z')

    assert.equal(makeDateShort(date), '20121203')
  })
  it('should make date long', () => {
    let date = new Date('2017-08-11T17:26:34.935Z')

    assert.equal(makeDateLong(date), '20170811T172634Z')
  })

  // Adopted from minio-go sdk
  const oneGB = 1024 * 1024 * 1024
  const fiveGB = 5 * oneGB

  const OBJ_SIZES = {
    gb1: oneGB,
    gb5: fiveGB,
    gb5p1: fiveGB + 1,
    gb10p1: 2 * fiveGB + 1,
    gb10p2: 2 * fiveGB + 2,
  }

  const maxMultipartPutObjectSize = 1024 * 1024 * 1024 * 1024 * 5

  it('Parts Required Test cases ', () => {
    const expectedPartsRequiredTestCases = [
      { value: 0, expected: 0 },
      { value: 1, expected: 1 },
      {
        value: fiveGB,
        expected: 10,
      },
      { value: OBJ_SIZES.gb5p1, expected: 10 },
      { value: 2 * fiveGB, expected: 20 },
      {
        value: OBJ_SIZES.gb10p1,
        expected: 20,
      },
      { value: OBJ_SIZES.gb10p2, expected: 20 },
      {
        value: OBJ_SIZES.gb10p1 + OBJ_SIZES.gb10p2,
        expected: 40,
      },
      { value: maxMultipartPutObjectSize, expected: 10000 },
    ]

    expectedPartsRequiredTestCases.forEach((testCase) => {
      const fnResult = partsRequired(testCase.value)
      assert.equal(fnResult, testCase.expected)
    })
  })
  it('Even split of Sizes Test cases ', () => {
    // Adopted from minio-go sdk
    const expectedSplitsTestCases = [
      {
        size: 0,
        sourceConfig: new CopySourceOptions({ Start: -1 }),
        expectedStart: null,
        expectedEnd: null,
      },
      {
        size: 1,
        sourceConfig: new CopySourceOptions({ Start: -1 }),
        expectedStart: [undefined],
        expectedEnd: [NaN],
      },
      { size: 1, sourceConfig: new CopySourceOptions({ Start: 0 }), expectedStart: [0], expectedEnd: [0] },
      {
        size: OBJ_SIZES.gb1,
        sourceConfig: new CopySourceOptions({ Start: -1 }),
        expectedStart: [0, 536870912],
        expectedEnd: [536870911, 1073741823],
      },
      {
        size: OBJ_SIZES.gb5,
        sourceConfig: new CopySourceOptions({ Start: -1 }),
        expectedStart: [
          0, 536870912, 1073741824, 1610612736, 2147483648, 2684354560, 3221225472, 3758096384, 4294967296, 4831838208,
        ],
        expectedEnd: [
          536870911, 1073741823, 1610612735, 2147483647, 2684354559, 3221225471, 3758096383, 4294967295, 4831838207,
          5368709119,
        ],
      },

      // 2 part splits
      {
        size: OBJ_SIZES.gb5p1,
        sourceConfig: new CopySourceOptions({ Start: -1 }),
        expectedStart: [
          0, 536870913, 1073741825, 1610612737, 2147483649, 2684354561, 3221225473, 3758096385, 4294967297, 4831838209,
        ],
        expectedEnd: [
          536870912, 1073741824, 1610612736, 2147483648, 2684354560, 3221225472, 3758096384, 4294967296, 4831838208,
          5368709120,
        ],
      },
      {
        size: OBJ_SIZES.gb5p1,
        sourceConfig: new CopySourceOptions({ Start: -1 }),
        expectedStart: [
          0, 536870913, 1073741825, 1610612737, 2147483649, 2684354561, 3221225473, 3758096385, 4294967297, 4831838209,
        ],
        expectedEnd: [
          536870912, 1073741824, 1610612736, 2147483648, 2684354560, 3221225472, 3758096384, 4294967296, 4831838208,
          5368709120,
        ],
      },

      // 3 part splits
      {
        size: OBJ_SIZES.gb10p1,
        sourceConfig: new CopySourceOptions({ Start: -1 }),
        expectedStart: [
          0, 536870913, 1073741825, 1610612737, 2147483649, 2684354561, 3221225473, 3758096385, 4294967297, 4831838209,
          5368709121, 5905580033, 6442450945, 6979321857, 7516192769, 8053063681, 8589934593, 9126805505, 9663676417,
          10200547329,
        ],
        expectedEnd: [
          536870912, 1073741824, 1610612736, 2147483648, 2684354560, 3221225472, 3758096384, 4294967296, 4831838208,
          5368709120, 5905580032, 6442450944, 6979321856, 7516192768, 8053063680, 8589934592, 9126805504, 9663676416,
          10200547328, 10737418240,
        ],
      },
      {
        size: OBJ_SIZES.gb10p2,
        sourceConfig: new CopySourceOptions({ Start: -1 }),
        expectedStart: [
          0, 536870913, 1073741826, 1610612738, 2147483650, 2684354562, 3221225474, 3758096386, 4294967298, 4831838210,
          5368709122, 5905580034, 6442450946, 6979321858, 7516192770, 8053063682, 8589934594, 9126805506, 9663676418,
          10200547330,
        ],
        expectedEnd: [
          536870912, 1073741825, 1610612737, 2147483649, 2684354561, 3221225473, 3758096385, 4294967297, 4831838209,
          5368709121, 5905580033, 6442450945, 6979321857, 7516192769, 8053063681, 8589934593, 9126805505, 9663676417,
          10200547329, 10737418241,
        ],
      },
    ]

    expectedSplitsTestCases.forEach((testCase) => {
      const fnResult = calculateEvenSplits(testCase.size, testCase)
      const { startIndex, endIndex } = fnResult || {}

      if (Array.isArray(startIndex) && Array.isArray(endIndex)) {
        const isExpectedResult =
          startIndex.length === testCase.expectedStart.length && endIndex.length === testCase.expectedEnd.length
        assert.equal(isExpectedResult, true)
      } else {
        // null cases.
        assert.equal(startIndex, expectedSplitsTestCases.expectedStart)
        assert.equal(endIndex, expectedSplitsTestCases.expectedEnd)
      }
    })
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
      it('should fail on null bucket', async () => {
        try {
          await client.removeObject(null, 'hello')
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })

      it('should fail on empty bucket', async () => {
        try {
          await client.removeObject('', 'hello')
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })

      it('should fail invalid bucket name', async () => {
        try {
          await client.removeObject('  \n  \t  ', 'hello')
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })

      it('should fail on null object', async () => {
        try {
          await client.removeObject('hello', null)
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })

      it('should fail on empty object', async () => {
        try {
          await client.removeObject('hello', '')
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })

      // Versioning related options as removeOpts
      it('should fail on empty (null) removeOpts object', async () => {
        try {
          await client.removeObject('hello', 'testRemoveOpts', null)
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })

      it('should fail on empty (string) removeOpts', async () => {
        try {
          await client.removeObject('hello', '', '')
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })
    })

    describe('#removeIncompleteUpload(bucket, object, callback)', () => {
      it('should fail on null bucket', async () => {
        try {
          await client.removeIncompleteUpload(null, 'hello')
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })
      it('should fail on empty bucket', async () => {
        try {
          await client.removeIncompleteUpload('', 'hello')
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })
      it('should fail on empty bucket', async () => {
        try {
          await client.removeIncompleteUpload('  \n  \t  ', 'hello')
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })

      it('should fail on null object', async () => {
        try {
          await client.removeIncompleteUpload('hello', null)
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })
      it('should fail on empty object', async () => {
        try {
          await client.removeIncompleteUpload('hello', '')
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
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
        client.setBucketTagging(null, {}).then(
          () => done(new Error('callback should receive error')),
          () => done(),
        )
      })
      it('should fail on empty bucket', (done) => {
        client.setBucketTagging('', {}).then(
          () => done(new Error('callback should receive error')),
          () => done(),
        )
      })
      it('should fail if tags are more than 50', (done) => {
        const _50_plus_key_tags = {}
        for (let i = 0; i < 51; i += 1) {
          _50_plus_key_tags[i] = i
        }
        client.setBucketTagging('', _50_plus_key_tags).then(
          () => done(new Error('callback should receive error')),
          () => done(),
        )
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
        client.removeBucketTagging(null).then(
          () => done(new Error('callback should receive error')),
          () => done(),
        )
      })
      it('should fail on empty bucket', (done) => {
        client.removeBucketTagging('').then(
          () => done(new Error('callback should receive error')),
          () => done(),
        )
      })
      it('should fail on invalid bucket name', (done) => {
        client.removeBucketTagging('198.51.100.24').then(
          () => done(new Error('callback should receive error')),
          () => done(),
        )
      })

      it('should fail on invalid bucket name', (done) => {
        client.removeBucketTagging('xy').then(
          () => done(new Error('callback should receive error')),
          () => done(),
        )
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
        client.removeObjectTagging('my-bucket', null).then(
          () => done(new Error('callback should receive error')),
          () => done(),
        )
      })
      it('should fail on empty bucket', (done) => {
        client.removeObjectTagging('my-bucket', '').then(
          () => done(new Error('callback should receive error')),
          () => done(),
        )
      })
      it('should fail on invalid bucket name', (done) => {
        client.removeObjectTagging('198.51.100.24').then(
          () => done(new Error('callback should receive error')),
          () => done(),
        )
      })

      it('should fail on invalid bucket name', (done) => {
        client.removeObjectTagging('xy').then(
          () => done(new Error('callback should receive error')),
          () => done(),
        )
      })
    })
  })

  describe('setBucketLifecycle(bucket, lifecycleConfig, callback)', () => {
    it('should fail on null bucket', async () => {
      try {
        await client.setBucketLifecycle(null, null)
      } catch (err) {
        return
      }
      throw new Error('callback should receive error')
    })
    it('should fail on empty bucket', async () => {
      try {
        await client.setBucketLifecycle('', null)
      } catch (err) {
        return
      }
      throw new Error('callback should receive error')
    })
  })

  describe('getBucketLifecycle(bucket, callback)', () => {
    it('should fail on null bucket', async () => {
      try {
        await client.getBucketLifecycle(null)
      } catch (err) {
        return
      }
      throw new Error('callback should receive error')
    })

    it('should fail on empty bucket', async () => {
      try {
        await client.getBucketLifecycle('')
      } catch (err) {
        return
      }
      throw new Error('callback should receive error')
    })
  })
  describe('removeBucketLifecycle(bucket, callback)', () => {
    it('should fail on null bucket', async () => {
      try {
        await client.removeBucketLifecycle(null, null)
      } catch (err) {
        return
      }
      throw new Error('callback should receive error')
    })

    it('should fail on empty bucket', async () => {
      try {
        await client.removeBucketLifecycle('', null)
      } catch (err) {
        return
      }
      throw new Error('callback should receive error')
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
      it('should fail on null bucket', async () => {
        try {
          await client.getObjectRetention(null, '', '')
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })
      it('should fail on empty bucket', async () => {
        try {
          await client.getObjectRetention('', '', '')
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })
      it('should fail on invalid  object name', async () => {
        try {
          await client.getObjectRetention('my-bucket', null, '')
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })
      it('should fail on invalid  versionId', async () => {
        try {
          await client.getObjectRetention('my-bucket', null, '')
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })
    })

    describe('putObjectRetention(bucket, objectName, retentionConfig, callback)', () => {
      it('should fail on null bucket', async () => {
        try {
          await client.putObjectRetention(null, '', {})
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })
      it('should fail on empty bucket', async () => {
        try {
          await client.putObjectRetention('', '', {})
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })

      it('should fail on null object', async () => {
        try {
          await client.putObjectRetention('my-bucket', null, {})
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })
      it('should fail on empty object', async () => {
        try {
          await client.putObjectRetention('my-bucket', '', {})
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })
      it('should fail on passing invalid mode ', async () => {
        try {
          await client.putObjectRetention('my-bucket', 'my-object', { mode: 'invalid_mode' })
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })
      it('should fail on passing invalid governanceBypass ', async () => {
        try {
          await client.putObjectRetention('my-bucket', 'my-object', { governanceBypass: 'nonbool' })
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })
      it('should fail on passing invalid (null) retainUntilDate ', async () => {
        try {
          await client.putObjectRetention('my-bucket', 'my-object', { retainUntilDate: 12345 })
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })
      it('should fail on passing invalid versionId ', async () => {
        try {
          await client.putObjectRetention('my-bucket', { versionId: 'COMPLIANCE' })
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })
    })
  })

  describe('Bucket Encryption APIs', () => {
    describe('setBucketEncryption(bucket, encryptionConfig, callback)', () => {
      it('should fail on null bucket', async () => {
        try {
          await client.setBucketEncryption(null)
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })
      it('should fail on empty bucket', async () => {
        try {
          await client.setBucketEncryption('')
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })
      it('should fail on multiple rules', async () => {
        try {
          await client.setBucketEncryption('my-bucket', {
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
          })
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })
    })

    describe('getBucketEncryption(bucket, callback)', () => {
      it('should fail on null bucket', async () => {
        try {
          await client.getBucketEncryption(null)
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })

      it('should fail on empty bucket', async () => {
        try {
          await client.getBucketEncryption('')
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })
    })

    describe('removeBucketEncryption(bucket, callback)', () => {
      it('should fail on empty bucket', async () => {
        try {
          await client.getBucketEncryption('')
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })

      it('should fail on null bucket', async () => {
        try {
          await client.getBucketEncryption(null)
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
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
      it('should fail on null destination config', async () => {
        try {
          await client.composeObject(null)
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })
      it('should fail on no array source config', async () => {
        try {
          const destOptions = new CopyDestinationOptions({ Bucket: 'test-bucket', Object: 'test-object' })
          await client.composeObject(destOptions, 'non-array')
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })

      it('should fail on null source config', async () => {
        try {
          const destOptions = new CopyDestinationOptions({ Bucket: 'test-bucket', Object: 'test-object' })
          await client.composeObject(destOptions, null)
        } catch (err) {
          return
        }
        throw new Error('callback should receive error')
      })
    })
  })
  describe('Select Object Content APIs', () => {
    describe('selectObjectContent(bucketName, objectName, selectOpts={}, cb)', () => {
      it('should fail on null bucket', (done) => {
        client.selectObjectContent(null).then(
          () => done(new Error('expecting error')),
          () => done(),
        )
      })
      it('should fail on empty bucket', (done) => {
        client.selectObjectContent('').then(
          () => done(new Error('expecting error')),
          () => done(),
        )
      })

      it('should fail on empty object', (done) => {
        client.selectObjectContent('my-bucket', '').then(
          () => done(new Error('expecting error')),
          () => done(),
        )
      })
      it('should fail on null object', (done) => {
        client.selectObjectContent('my-bucket', null).then(
          () => done(new Error('expecting error')),
          () => done(),
        )
      })
    })
  })
})

describe('IP Address Validations', () => {
  it('should validate for valid ip', () => {
    assert.equal(isValidIP('1.1.1.1'), true)
  })

  it('Check list of IPV4 Invalid addresses', () => {
    const invalidIpv4 = [
      ' 127.0.0.1',
      '127.0.0.1 ',
      '127.0.0.1 127.0.0.1',
      '127.0.0.256',
      '127.0.0.1//1',
      '127.0.0.1/0x1',
      '127.0.0.1/-1',
      '127.0.0.1/ab',
      '127.0.0.1/',
      '127.0.0.256/32',
      '127.0.0.1/33',
    ]
    invalidIpv4.map((ip) => {
      assert.equal(isValidIP(ip), false)
    })
  })

  it('Check list of IPV4 Valid addresses', () => {
    const validIpv4 = ['001.002.003.004', '127.0.0.1', '255.255.255.255', '192.168.1.10']
    validIpv4.map((ip) => {
      assert.equal(isValidIP(ip), true)
    })
  })

  it('Check list of IPV6 Invalid addresses', () => {
    const invalidIpV6 = [
      "':10.0.0.1",
      '-1',
      '::1 ::1',
      '1.2.3.4:1111:2222:3333:4444::5555',
      '1.2.3.4:1111:2222:3333::5555',
      '1.2.3.4:1111:2222::5555',
      '1.2.3.4:1111::5555',
      '1.2.3.4::',
      '1.2.3.4::5555',
      '11112222:3333:4444:5555:6666:1.2.3.4',
      '11112222:3333:4444:5555:6666:7777:8888',
      '::1//64',
      '::1/0001',
      '1111:',
      '1111:1.2.3.4',
      '1111:2222',
      '1111:22223333:4444:5555:6666:1.2.3.4',
      '1111:22223333:4444:5555:6666:7777:8888',
      '1111:2222:',
      '1111:2222:1.2.3.4',
      '1111:2222:3333',
      '1111:2222:33334444:5555:6666:1.2.3.4',
      '1111:2222:33334444:5555:6666:7777:8888',
      '1111:2222:3333:',
      '1111:2222:3333:1.2.3.4',
      '1111:2222:3333:4444',
      '1111:2222:3333:44445555:6666:1.2.3.4',
      '1111:2222:3333:44445555:6666:7777:8888',
      '1111:2222:3333:4444:',
      '1111:2222:3333:4444:1.2.3.4',
      '1111:2222:3333:4444:5555',
      '1111:2222:3333:4444:55556666:1.2.3.4',
      '1111:2222:3333:4444:55556666:7777:8888',
      '1111:2222:3333:4444:5555:',
      '1111:2222:3333:4444:5555:1.2.3.4',
      '1111:2222:3333:4444:5555:6666',
      '1111:2222:3333:4444:5555:66661.2.3.4',
      '1111:2222:3333:4444:5555:66667777:8888',
      '1111:2222:3333:4444:5555:6666:',
      '1111:2222:3333:4444:5555:6666:1.2.3.4.5',
      '1111:2222:3333:4444:5555:6666:255.255.255255',
      '1111:2222:3333:4444:5555:6666:255.255255.255',
      '1111:2222:3333:4444:5555:6666:255255.255.255',
      '1111:2222:3333:4444:5555:6666:256.256.256.256',
      '1111:2222:3333:4444:5555:6666:7777',
      '1111:2222:3333:4444:5555:6666:77778888',
      '1111:2222:3333:4444:5555:6666:7777:',
      '1111:2222:3333:4444:5555:6666:7777:1.2.3.4',
      '1111:2222:3333:4444:5555:6666:7777:::',
      '1111:2222:3333:4444:5555:6666::8888:',
      '1111:2222:3333:4444:5555:6666:::',
      '1111:2222:3333:4444:5555:6666:::8888',
      '1111:2222:3333:4444:5555::7777:8888:',
      '1111:2222:3333:4444:5555::7777::',
      '1111:2222:3333:4444:5555::8888:',
      '1111:2222:3333:4444:5555:::',
      '1111:2222:3333:4444:5555:::1.2.3.4',
      '1111:2222:3333:4444:5555:::7777:8888',
      '1111:2222:3333:4444::5555:',
      '1111:2222:3333:4444::6666:7777:8888:',
      '1111:2222:3333:4444::6666:7777::',
      '1111:2222:3333:4444::6666::8888',
      '1111:2222:3333:4444::7777:8888:',
      '1111:2222:3333:4444::8888:',
      '1111:2222:3333:4444:::',
      '1111:2222:3333:4444:::6666:1.2.3.4',
      '1111:2222:3333:4444:::6666:7777:8888',
      '1111:2222:3333::5555:',
      '1111:2222:3333::5555:6666:7777:8888:',
      '1111:2222:3333::5555:6666:7777::',
      '1111:2222:3333::5555:6666::8888',
      '1111:2222:3333::5555::1.2.3.4',
      '1111:2222:3333::5555::7777:8888',
      '1111:2222:3333::6666:7777:8888:',
      '1111:2222:3333::7777:8888:',
      '1111:2222:3333::8888:',
      '1111:2222:3333:::',
      '1111:2222:3333:::5555:6666:1.2.3.4',
      '1111:2222:3333:::5555:6666:7777:8888',
      '1111:2222::4444:5555:6666:7777:8888:',
      '1111:2222::4444:5555:6666:7777::',
      '1111:2222::4444:5555:6666::8888',
      '1111:2222::4444:5555::1.2.3.4',
      '1111:2222::4444:5555::7777:8888',
      '1111:2222::4444::6666:1.2.3.4',
      '1111:2222::4444::6666:7777:8888',
      '1111:2222::5555:',
      '1111:2222::5555:6666:7777:8888:',
      '1111:2222::6666:7777:8888:',
      '1111:2222::7777:8888:',
      '1111:2222::8888:',
      '1111:2222:::',
      '1111:2222:::4444:5555:6666:1.2.3.4',
      '1111:2222:::4444:5555:6666:7777:8888',
      '1111::3333:4444:5555:6666:7777:8888:',
      '1111::3333:4444:5555:6666:7777::',
      '1111::3333:4444:5555:6666::8888',
      '1111::3333:4444:5555::1.2.3.4',
      '1111::3333:4444:5555::7777:8888',
      '1111::3333:4444::6666:1.2.3.4',
      '1111::3333:4444::6666:7777:8888',
      '1111::3333::5555:6666:1.2.3.4',
      '1111::3333::5555:6666:7777:8888',
      '1111::4444:5555:6666:7777:8888:',
      '1111::5555:',
      '1111::5555:6666:7777:8888:',
      '1111::6666:7777:8888:',
      '1111::7777:8888:',
      '1111::8888:',
      '1111:::',
      '1111:::3333:4444:5555:6666:1.2.3.4',
      '1111:::3333:4444:5555:6666:7777:8888',
      '12345::6:7:8',
      '124.15.6.89/60',
      '1:2:3:4:5:6:7:8:9',
      '1:2:3::4:5:6:7:8:9',
      '1:2:3::4:5::7:8',
      '1::1.2.256.4',
      '1::1.2.3.256',
      '1::1.2.3.300',
      '1::1.2.3.900',
      '1::1.2.300.4',
      '1::1.2.900.4',
      '1::1.256.3.4',
      '1::1.300.3.4',
      '1::1.900.3.4',
      '1::256.2.3.4',
      '1::260.2.3.4',
      '1::2::3',
      '1::300.2.3.4',
      '1::300.300.300.300',
      '1::3000.30.30.30',
      '1::400.2.3.4',
      '1::5:1.2.256.4',
      '1::5:1.2.3.256',
      '1::5:1.2.3.300',
      '1::5:1.2.3.900',
      '1::5:1.2.300.4',
      '1::5:1.2.900.4',
      '1::5:1.256.3.4',
      '1::5:1.300.3.4',
      '1::5:1.900.3.4',
      '1::5:256.2.3.4',
      '1::5:260.2.3.4',
      '1::5:300.2.3.4',
      '1::5:300.300.300.300',
      '1::5:3000.30.30.30',
      '1::5:400.2.3.4',
      '1::5:900.2.3.4',
      '1::900.2.3.4',
      '1:::3:4:5',
      '2001:0000:1234: 0000:0000:C1C0:ABCD:0876',
      '2001:0000:1234:0000:0000:C1C0:ABCD:0876  0',
      '2001:1:1:1:1:1:255Z255X255Y255',
      '2001::FFD3::57ab',
      '2001:DB8:0:0:8:800:200C:417A:221',
      '2001:db8:85a3::8a2e:37023:7334',
      '2001:db8:85a3::8a2e:370k:7334',
      '3ffe:0b00:0000:0001:0000:0000:000a',
      '3ffe:b00::1::a',
      ':',
      ':1.2.3.4',
      ':1111:2222:3333:4444:5555:6666:1.2.3.4',
      ':1111:2222:3333:4444:5555:6666:7777:8888',
      ':1111:2222:3333:4444:5555:6666:7777::',
      ':1111:2222:3333:4444:5555:6666::',
      ':1111:2222:3333:4444:5555:6666::8888',
      ':1111:2222:3333:4444:5555::',
      ':1111:2222:3333:4444:5555::1.2.3.4',
      ':1111:2222:3333:4444:5555::7777:8888',
      ':1111:2222:3333:4444:5555::8888',
      ':1111:2222:3333:4444::',
      ':1111:2222:3333:4444::1.2.3.4',
      ':1111:2222:3333:4444::5555',
      ':1111:2222:3333:4444::6666:1.2.3.4',
      ':1111:2222:3333:4444::6666:7777:8888',
      ':1111:2222:3333:4444::7777:8888',
      ':1111:2222:3333:4444::8888',
      ':1111:2222:3333::',
      ':1111:2222:3333::1.2.3.4',
      ':1111:2222:3333::5555',
      ':1111:2222:3333::5555:6666:1.2.3.4',
      ':1111:2222:3333::5555:6666:7777:8888',
      ':1111:2222:3333::6666:1.2.3.4',
      ':1111:2222:3333::6666:7777:8888',
      ':1111:2222:3333::7777:8888',
      ':1111:2222:3333::8888',
      ':1111:2222::',
      ':1111:2222::1.2.3.4',
      ':1111:2222::4444:5555:6666:1.2.3.4',
      ':1111:2222::4444:5555:6666:7777:8888',
      ':1111:2222::5555',
      ':1111:2222::5555:6666:1.2.3.4',
      ':1111:2222::5555:6666:7777:8888',
      ':1111:2222::6666:1.2.3.4',
      ':1111:2222::6666:7777:8888',
      ':1111:2222::7777:8888',
      ':1111:2222::8888',
      ':1111::',
      ':1111::1.2.3.4',
      ':1111::3333:4444:5555:6666:1.2.3.4',
      ':1111::3333:4444:5555:6666:7777:8888',
      ':1111::4444:5555:6666:1.2.3.4',
      ':1111::4444:5555:6666:7777:8888',
      ':1111::5555',
      ':1111::5555:6666:1.2.3.4',
      ':1111::5555:6666:7777:8888',
      ':1111::6666:1.2.3.4',
      ':1111::6666:7777:8888',
      ':1111::7777:8888',
      ':1111::8888',
      ':2222:3333:4444:5555:6666:1.2.3.4',
      ':2222:3333:4444:5555:6666:7777:8888',
      ':3333:4444:5555:6666:1.2.3.4',
      ':3333:4444:5555:6666:7777:8888',
      ':4444:5555:6666:1.2.3.4',
      ':4444:5555:6666:7777:8888',
      ':5555:6666:1.2.3.4',
      ':5555:6666:7777:8888',
      ':6666:1.2.3.4',
      ':6666:7777:8888',
      ':7777:8888',
      ':8888',
      '::-1',
      '::.',
      '::..',
      '::...',
      '::...4',
      '::..3.',
      '::..3.4',
      '::.2..',
      '::.2.3.',
      '::.2.3.4',
      '::1...',
      '::1.2..',
      '::1.2.256.4',
      '::1.2.3.',
      '::1.2.3.256',
      '::1.2.3.300',
      '::1.2.3.900',
      '::1.2.300.4',
      '::1.2.900.4',
      '::1.256.3.4',
      '::1.300.3.4',
      '::1.900.3.4',
      '::1111:2222:3333:4444:5555:6666::',
      '::2222:3333:4444:5555:6666:7777:8888:',
      '::2222:3333:4444:5555:7777:8888::',
      '::2222:3333:4444:5555:7777::8888',
      '::2222:3333:4444:5555::1.2.3.4',
      '::2222:3333:4444:5555::7777:8888',
      '::2222:3333:4444::6666:1.2.3.4',
      '::2222:3333:4444::6666:7777:8888',
      '::2222:3333::5555:6666:1.2.3.4',
      '::2222:3333::5555:6666:7777:8888',
      '::2222::4444:5555:6666:1.2.3.4',
      '::2222::4444:5555:6666:7777:8888',
      '::256.2.3.4',
      '::260.2.3.4',
      '::300.2.3.4',
      '::300.300.300.300',
      '::3000.30.30.30',
      '::3333:4444:5555:6666:7777:8888:',
      '::400.2.3.4',
      '::4444:5555:6666:7777:8888:',
      '::5555:',
      '::5555:6666:7777:8888:',
      '::6666:7777:8888:',
      '::7777:8888:',
      '::8888:',
      '::900.2.3.4',
      ':::',
      ':::1.2.3.4',
      ':::2222:3333:4444:5555:6666:1.2.3.4',
      ':::2222:3333:4444:5555:6666:7777:8888',
      ':::3333:4444:5555:6666:7777:8888',
      ':::4444:5555:6666:1.2.3.4',
      ':::4444:5555:6666:7777:8888',
      ':::5555',
      ':::5555:6666:1.2.3.4',
      ':::5555:6666:7777:8888',
      ':::6666:1.2.3.4',
      ':::6666:7777:8888',
      ':::7777:8888',
      ':::8888',
      '::ffff:192x168.1.26',
      '::ffff:2.3.4',
      '::ffff:257.1.2.3',
      'FF01::101::2',
      'FF02:0000:0000:0000:0000:0000:0000:0000:0001',
      'XXXX:XXXX:XXXX:XXXX:XXXX:XXXX:1.2.3.4',
      'XXXX:XXXX:XXXX:XXXX:XXXX:XXXX:XXXX:XXXX',
      'a::b::c',
      'a::g',
      'a:a:a:a:a:a:a:a:a',
      'a:aaaaa::',
      'a:b',
      'a:b:c:d:e:f:g:0',
      'ffff:',
      'ffff::ffff::ffff',
      'ffgg:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
      'ldkfj',
      '::/129',
      '1000:://32',
      '::/',
    ]
    invalidIpV6.map((ip) => {
      const valid = isValidIP(ip)
      assert.equal(valid, false)
    })
  })

  it('Check list of IPV6 Valid addresses', () => {
    const validIpv6 = [
      '0000:0000:0000:0000:0000:0000:0000:0000',
      '0000:0000:0000:0000:0000:0000:0000:0001',
      '0:0:0:0:0:0:0:0',
      '0:0:0:0:0:0:0:1',
      '0:0:0:0:0:0:0::',
      '0:0:0:0:0:0:13.1.68.3',
      '0:0:0:0:0:0::',
      '0:0:0:0:0::',
      '0:0:0:0:0:FFFF:129.144.52.38',
      '0:0:0:0:1:0:0:0',
      '0:0:0:0::',
      '0:0:0::',
      '0:0::',
      '0:1:2:3:4:5:6:7',
      '0::',
      '0:a:b:c:d:e:f::',
      '1080:0:0:0:8:800:200c:417a',
      '1080::8:800:200c:417a',
      '1111:2222:3333:4444:5555:6666:123.123.123.123',
      '1111:2222:3333:4444:5555:6666:7777:8888',
      '1111:2222:3333:4444:5555:6666:7777::',
      '1111:2222:3333:4444:5555:6666::',
      '1111:2222:3333:4444:5555:6666::8888',
      '1111:2222:3333:4444:5555::',
      '1111:2222:3333:4444:5555::7777:8888',
      '1111:2222:3333:4444:5555::8888',
      '1111:2222:3333:4444::',
      '1111:2222:3333:4444::6666:123.123.123.123',
      '1111:2222:3333:4444::6666:7777:8888',
      '1111:2222:3333:4444::7777:8888',
      '1111:2222:3333:4444::8888',
      '1111:2222:3333::',
      '1111:2222:3333::5555:6666:123.123.123.123',
      '1111:2222:3333::5555:6666:7777:8888',
      '1111:2222:3333::6666:123.123.123.123',
      '1111:2222:3333::6666:7777:8888',
      '1111:2222:3333::7777:8888',
      '1111:2222:3333::8888',
      '1111:2222::',
      '1111:2222::4444:5555:6666:123.123.123.123',
      '1111:2222::4444:5555:6666:7777:8888',
      '1111:2222::5555:6666:123.123.123.123',
      '1111:2222::5555:6666:7777:8888',
      '1111:2222::6666:123.123.123.123',
      '1111:2222::6666:7777:8888',
      '1111:2222::7777:8888',
      '1111:2222::8888',
      '1111::',
      '1111::3333:4444:5555:6666:123.123.123.123',
      '1111::3333:4444:5555:6666:7777:8888',
      '1111::4444:5555:6666:123.123.123.123',
      '1111::4444:5555:6666:7777:8888',
      '1111::5555:6666:123.123.123.123',
      '1111::5555:6666:7777:8888',
      '1111::6666:123.123.123.123',
      '1111::6666:7777:8888',
      '1111::7777:8888',
      '1111::8888',
      '1:2:3:4:5:6:1.2.3.4',
      '1:2:3:4:5:6:7:8',
      '1:2:3:4:5:6::',
      '1:2:3:4:5:6::8',
      '1:2:3:4:5::',
      '1:2:3:4:5::7:8',
      '1:2:3:4:5::8',
      '1:2:3:4::',
      '1:2:3:4::5:1.2.3.4',
      '1:2:3:4::7:8',
      '1:2:3:4::8',
      '1:2:3::',
      '1:2:3::5:1.2.3.4',
      '1:2:3::7:8',
      '1:2:3::8',
      '1:2::',
      '1:2::5:1.2.3.4',
      '1:2::7:8',
      '1:2::8',
      '1::',
      '1::2:3',
      '1::2:3:4',
      '1::2:3:4:5',
      '1::2:3:4:5:6',
      '1::2:3:4:5:6:7',
      '1::5:1.2.3.4',
      '1::5:11.22.33.44',
      '1::7:8',
      '1::8',
      '2001:0000:1234:0000:0000:C1C0:ABCD:0876',
      '2001:0000:4136:e378:8000:63bf:3fff:fdd2',
      '2001:0db8:0000:0000:0000:0000:1428:57ab',
      '2001:0db8:0000:0000:0000::1428:57ab',
      '2001:0db8:0:0:0:0:1428:57ab',
      '2001:0db8:0:0::1428:57ab',
      '2001:0db8:1234:0000:0000:0000:0000:0000',
      '2001:0db8:1234::',
      '2001:0db8:1234:ffff:ffff:ffff:ffff:ffff',
      '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
      '2001:0db8::1428:57ab',
      '2001::CE49:7601:2CAD:DFFF:7C94:FFFE',
      '2001::CE49:7601:E866:EFFF:62C3:FFFE',
      '2001:DB8:0:0:8:800:200C:417A',
      '2001:DB8::8:800:200C:417A',
      '2001:db8:85a3:0:0:8a2e:370:7334',
      '2001:db8:85a3::8a2e:370:7334',
      '2001:db8::',
      '2001:db8::1428:57ab',
      '2001:db8:a::123',
      '2002::',
      '2608::3:5',
      '2608:af09:30:0:0:0:0:134',
      '2608:af09:30::102a:7b91:c239:baff',
      '2::10',
      '3ffe:0b00:0000:0000:0001:0000:0000:000a',
      '7:6:5:4:3:2:1:0',
      '::',
      '::0',
      '::0:0',
      '::0:0:0',
      '::0:0:0:0',
      '::0:0:0:0:0',
      '::0:0:0:0:0:0',
      '::0:0:0:0:0:0:0',
      '::0:a:b:c:d:e:f',
      '::1',
      '::123.123.123.123',
      '::13.1.68.3',
      '::2222:3333:4444:5555:6666:123.123.123.123',
      '::2222:3333:4444:5555:6666:7777:8888',
      '::2:3',
      '::2:3:4',
      '::2:3:4:5',
      '::2:3:4:5:6',
      '::2:3:4:5:6:7',
      '::2:3:4:5:6:7:8',
      '::3333:4444:5555:6666:7777:8888',
      '::4444:5555:6666:123.123.123.123',
      '::4444:5555:6666:7777:8888',
      '::5555:6666:123.123.123.123',
      '::5555:6666:7777:8888',
      '::6666:123.123.123.123',
      '::6666:7777:8888',
      '::7777:8888',
      '::8',
      '::8888',
      '::FFFF:129.144.52.38',
      '::ffff:0:0',
      '::ffff:0c22:384e',
      '::ffff:12.34.56.78',
      '::ffff:192.0.2.128',
      '::ffff:192.168.1.1',
      '::ffff:192.168.1.26',
      '::ffff:c000:280',
      'FF01:0:0:0:0:0:0:101',
      'FF01::101',
      'FF02:0000:0000:0000:0000:0000:0000:0001',
      'a:b:c:d:e:f:0::',
      'fe80:0000:0000:0000:0204:61ff:fe9d:f156',
      'fe80:0:0:0:204:61ff:254.157.241.86',
      'fe80:0:0:0:204:61ff:fe9d:f156',
      'fe80::',
      'fe80::1',
      'fe80::204:61ff:254.157.241.86',
      'fe80::204:61ff:fe9d:f156',
      'fe80::217:f2ff:254.7.237.98',
      'fe80::217:f2ff:fe07:ed62',
      'fedc:ba98:7654:3210:fedc:ba98:7654:3210',
      'ff02::1',
      'ffff::',
      'ffff::3:5',
      'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
      'a:0::0:b',
      'a:0:0::0:b',
      'a:0::0:0:b',
      'a::0:0:b',
      'a::0:b',
      'a:0::b',
      'a:0:0::b',
    ]
    validIpv6.map((ip) => {
      const valid = isValidIP(ip)
      assert.equal(valid, true)
    })
  })
})

describe('xml-parser', () => {
  describe('#listObjects()', () => {
    describe('value type casting', () => {
      const xml = `
          <?xml version="1.0" encoding="UTF-8"?>
          <ListVersionsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
            <Name>some-bucket</Name>
            <Prefix>42</Prefix>
            <Delimiter>/</Delimiter>
            <IsTruncated>false</IsTruncated>
            <EncodingType>url</EncodingType>
            <KeyMarker/>
            <VersionIdMarker/>
            <Version>
              <IsLatest>true</IsLatest>
              <VersionId>1234</VersionId>
              <ETag>"767dedcb515a0e2d995ed95191b75484-29"</ETag>
              <Key>1337</Key>
              <LastModified>2023-07-12T14:41:46.000Z</LastModified>
              <Size>151306240</Size>
            </Version>
            <DeleteMarker>
              <IsLatest>false</IsLatest>
              <Key>1337</Key>
              <LastModified>2023-07-12T14:39:22.000Z</LastModified>
              <VersionId>5678</VersionId>
            </DeleteMarker>
            <CommonPrefixes>
              <Prefix>42</Prefix>
            </CommonPrefixes>
          </ListVersionsResult>
        `

      it('should parse VersionId as string even if number is provided', () => {
        const { objects } = parseListObjects(xml)

        assert.equal(objects[0].versionId, '1234')
        assert.equal(objects[1].versionId, '5678')
        assert.equal(objects[0].name, '1337')
        assert.equal(objects[1].name, '1337')
        assert.deepEqual(objects[2], { prefix: '42', size: 0 })
      })

      it('should parse Size as number', () => {
        const { objects } = parseListObjects(xml)

        assert.equal(objects[0].size, 151306240)
        assert.equal(objects[1].size, undefined)
      })
    })
  })
})

describe('join-host-port', () => {
  it('should be able to parse valid ipv4', () => {
    assert.equal(joinHostPort('192.168.1.1', 3000), '192.168.1.1:3000')
    assert.equal(joinHostPort('192.168.1.1'), '192.168.1.1')
    assert.equal(joinHostPort('01.102.103.104', 3000), '01.102.103.104:3000')
  })

  it('should be able to parse valid ipv6', () => {
    assert.equal(
      joinHostPort('2001:db8:3333:4444:5555:6666:7777:8888', 1234),
      '[2001:db8:3333:4444:5555:6666:7777:8888]:1234',
    )
    assert.equal(joinHostPort('::', 1234), '[::]:1234')
    assert.equal(joinHostPort('2001:db8::', 1234), '[2001:db8::]:1234')
    assert.equal(joinHostPort('::1234:5678', 1234), '[::1234:5678]:1234')
    assert.equal(
      joinHostPort('2001:0db8:0001:0000:0000:0ab9:C0A8:0102', 1234),
      '[2001:0db8:0001:0000:0000:0ab9:C0A8:0102]:1234',
    )
    assert.equal(
      joinHostPort('2001:db8:3333:4444:5555:6666:1.2.3.4', 1234),
      '[2001:db8:3333:4444:5555:6666:1.2.3.4]:1234',
    )
  })

  it('should be able to parse domain', () => {
    assert.equal(joinHostPort('internal.company.com', 5000), 'internal.company.com:5000')
    assert.equal(joinHostPort('internal.company.com'), 'internal.company.com')
  })
})
