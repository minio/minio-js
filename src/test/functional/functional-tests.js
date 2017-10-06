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

const os = require('os')
const stream = require('stream')
const crypto = require('crypto')
const async = require('async')
const _ = require('lodash')
const fs = require('fs')
const http = require('http')
const https = require('https')
const url = require('url')
const chai = require('chai')
const assert = chai.assert
const superagent = require('superagent')
const uuid = require("uuid")
const step = require("mocha-steps").step
let minio

try {
  minio = require('../../../dist/main/minio')
} catch (err) {
  minio = require('minio')
}

const Policy = minio.Policy

require('source-map-support').install()

describe('functional tests', function() {
  this.timeout(30 * 60 * 1000)
  var playConfig = {}
  // If credentials aren't given, default to play.minio.io.
  if (process.env['SERVER_ENDPOINT']) {
    var res = process.env['SERVER_ENDPOINT'].split(":")
    playConfig.endPoint = res[0]
    playConfig.port = parseInt(res[1])
  } else {
    playConfig.endPoint = 'play.minio.io'
    playConfig.port = 9000
  }
  playConfig.accessKey = process.env['ACCESS_KEY'] || 'Q3AM3UQ867SPQQA43P2F'
  playConfig.secretKey = process.env['SECRET_KEY'] || 'zuf+tfteSlswRu7BJ86wekitnifILbZam1KYY3TG'

  // If the user provides ENABLE_HTTPS, 1 = secure, anything else = unsecure.
  // Otherwise default to secure.
  if (process.env['ENABLE_HTTPS'] !== undefined) {
    playConfig.secure = (process.env['ENABLE_HTTPS'] == '1')
  } else {
    playConfig.secure = true
  }

  // dataDir is falsy if we need to generate data on the fly. Otherwise, it will be
  // a directory with files to read from, i.e. /mint/data.
  var dataDir = process.env['MINT_DATA_DIR']

  var client = new minio.Client(playConfig)
  var usEastConfig = playConfig
  usEastConfig.region = 'us-east-1'
  var clientUsEastRegion = new minio.Client(usEastConfig)

  var bucketName = "minio-js-test-" + uuid.v4()
  var objectName = uuid.v4()

  var _1byteObjectName = 'datafile-1-b'
  var _1byte = dataDir ? fs.readFileSync(dataDir + '/' + _1byteObjectName) : (new Buffer(1)).fill(0)

  var _100kbObjectName = 'datafile-100-kB'
  var _100kb = dataDir ? fs.readFileSync(dataDir + '/' + _100kbObjectName) : (new Buffer(100 * 1024)).fill(0)
  var _100kbObjectNameCopy = _100kbObjectName + '_copy'

  var _100kbObjectBufferName = `${_100kbObjectName}.buffer`
  var _MultiPath100kbObjectBufferName = `path/to/${_100kbObjectName}.buffer`
  var _100kbmd5 = crypto.createHash('md5').update(_100kb).digest('hex')
  var _100kb1kboffsetmd5 = crypto.createHash('md5').update(_100kb.slice(1024)).digest('hex')

  var _6mbObjectName = 'datafile-6-MB'
  var _6mb = dataDir ? fs.readFileSync(dataDir + '/' + _6mbObjectName) : (new Buffer(6 * 1024 * 1024)).fill(0)
  var _6mbmd5 = crypto.createHash('md5').update(_6mb).digest('hex')
  var _6mbObjectNameCopy = _6mbObjectName + '_copy'

  var _5mbObjectName = 'datafile-5-MB'
  var _5mb = dataDir ? fs.readFileSync(dataDir + '/' + _5mbObjectName) : (new Buffer(5 * 1024 * 1024)).fill(0)
  var _5mbmd5 = crypto.createHash('md5').update(_5mb).digest('hex')

  var customContentType = 'application/octet-stream'

  var tmpDir = os.tmpdir()

  var traceStream

  // FUNCTIONAL_TEST_TRACE env variable contains the path to which trace
  // will be logged. Set it to /dev/stdout log to the stdout.
  if (process.env['FUNCTIONAL_TEST_TRACE']) {
    var filePath = process.env['FUNCTIONAL_TEST_TRACE']
    // This is necessary for windows.
    if (filePath === 'process.stdout') {
      traceStream = process.stdout
    } else {
      traceStream = fs.createWriteStream(filePath, { flags: 'a' })
    }
    traceStream.write('====================================\n')
    client.traceOn(traceStream)
  }

  before(done => client.makeBucket(bucketName, '', done))
  after(done => client.removeBucket(bucketName, done))

  if (traceStream) {
    after(() => {
      client.traceOff()
      if (filePath !== 'process.stdout') {
        traceStream.end()
      }
    })
  }

  describe('makeBucket with period and region', () => {
    if (playConfig.endPoint === 's3.amazonaws.com') {
      step('makeBucket(bucketName, region, cb)_region:eu-central-1_', done => client.makeBucket(`${bucketName}.sec.period`,
                                                                                                'eu-central-1', done))
      step('removeBucket(bucketName, cb)__', done => client.removeBucket(`${bucketName}.sec.period`, done))
    }
  })

  describe('listBuckets', () => {
    step('listBuckets(cb)__', done => {
      client.listBuckets((e, buckets) => {
        if (e) return done(e)
        if (_.find(buckets, { name: bucketName })) return done()
        done(new Error('bucket not found'))
      })
    })
    step('listBuckets()__', done => {
      client.listBuckets()
        .then(buckets => {
          if (!_.find(buckets, { name: bucketName }))
            throw new Error('bucket not found')
        })
        .then(() => done())
        .catch(done)
    })
  })

  describe('makeBucket with region', () => {
    step('makeBucket(bucketName, region, cb)_region:us-east-2_', done => {
      try {
        clientUsEastRegion.makeBucket(`${bucketName}.region`, 'us-east-2', assert.fail)
      } catch (e) {
        done()
      }
    })
    step('makeBucket(bucketName, region, cb)__', done => {
      clientUsEastRegion.makeBucket(`${bucketName}.region`, 'us-east-1', done)
    })
    step('removeBucket(bucketName, cb)__', done => {
      clientUsEastRegion.removeBucket(`${bucketName}.region`, done)
    })
    step('makeBucket(bucketName, region)__', done => {
      clientUsEastRegion.makeBucket(`${bucketName}.region`, 'us-east-1')
        .then(() => done())
        .catch(done)
    })
    step('removeBucket(bucketName)__', done => {
      clientUsEastRegion.removeBucket(`${bucketName}.region`)
        .then(() => done())
        .catch(done)
    })
  })

  describe('bucketExists', () => {
    step('bucketExists(bucketName, cb)__', done => client.bucketExists(bucketName, done))
    step('bucketExists(bucketName, cb)_bucketName:nonexistentbucket_', done => {
      client.bucketExists(bucketName + 'random', (e) => {
        if (e.code === 'NoSuchBucket') return done()
        done(new Error())
      })
    })
    step('bucketExists(bucketName)__', done => {
      client.bucketExists(bucketName)
        .then(() => done())
        .catch(done)
    })
  })


  describe('removeBucket', () => {
    step('removeBucket(bucketName, cb)_bucketName:nonexistentbucket_', done => {
      client.removeBucket("nonexistentbucket", (e) => {
        if (e.code === 'NoSuchBucket') return done()
        done(new Error())
      })
    })
    step('makeBucket(bucketName, region)_region:us-east-1_', done => {
      client.makeBucket(`${bucketName}.region`, 'us-east-1')
        .then(client.removeBucket(`${bucketName}.region`))
        .then(() => done())
        .catch(done)
    })
  })
  describe('tests for putObject getObject removeObject with multipath', function() {
    step('putObject(bucketName, objectName, stream, contentType)_objectName:MultiPath100kbObjectBufferName,stream:100Kib_', done => {
      client.putObject(bucketName, _MultiPath100kbObjectBufferName, _100kb, '')
        .then(() => done())
        .catch(done)
    })

    step('getObject(bucketName, objectName, callback)_objectName:MultiPath100kbObjectBufferName_download 100KiB Buffer and match content', done => {
      var hash = crypto.createHash('md5')
      client.getObject(bucketName, _MultiPath100kbObjectBufferName, (e, stream) => {
        if (e) return done(e)
        stream.on('data', data => hash.update(data))
        stream.on('error', done)
        stream.on('end', () => {
          if (hash.digest('hex') === _100kbmd5) return done()
          done(new Error('content mismatch'))
        })
      })
    })

    step('removeObject(bucketName, objectName)_objectName:MultiPath100kbObjectBufferName_', done => {
      client.removeObject(bucketName, _MultiPath100kbObjectBufferName)
        .then(() => done())
        .catch(done)
    })

  })
  describe('tests for putObject copyObject getObject getPartialObject statObject removeObject', function() {
    
    var tmpFileUpload = `${tmpDir}/${_100kbObjectName}`
    step('fPutObject(bucketName, objectName, filePath, contentType, callback)__', done => {
      fs.writeFileSync(tmpFileUpload, _100kb)
      client.fPutObject(bucketName, _100kbObjectName, tmpFileUpload, '', done)
    })

    step('putObject(bucketName, objectName, stream, size, contentType, callback)_objectName:100kbObjectName_', done => {
      var stream = readableStream(_100kb)
      client.putObject(bucketName, _100kbObjectName, stream, _100kb.length, customContentType, done)
    })

    step('putObject(bucketName, objectName, stream, size, contentType, callback)_objectName:100kbObjectName_', done => {
      var stream = readableStream(_100kb)
      client.putObject(bucketName, _100kbObjectName, stream, _100kb.length, '', done)
    })

    step('getObject(bucketName, objectName, callback)_objectName:100kbObjectName_', done => {
      var hash = crypto.createHash('md5')
      client.getObject(bucketName, _100kbObjectName, (e, stream) => {
        if (e) return done(e)
        stream.on('data', data => hash.update(data))
        stream.on('error', done)
        stream.on('end', () => {
          if (hash.digest('hex') === _100kbmd5) return done()
          done(new Error('content mismatch'))
        })
      })
    })

    step('putObject(bucketName, objectName, stream, callback)_objectName:100kbObjectName, stream:100kb_', done => {
      client.putObject(bucketName, _100kbObjectBufferName, _100kb, '', done)
    })

    step('getObject(bucketName, objectName, callback)_objectName:100kbObjectName_download 100KiB Buffer and match content', done => {
      var hash = crypto.createHash('md5')
      client.getObject(bucketName, _100kbObjectBufferName, (e, stream) => {
        if (e) return done(e)
        stream.on('data', data => hash.update(data))
        stream.on('error', done)
        stream.on('end', () => {
          if (hash.digest('hex') === _100kbmd5) return done()
          done(new Error('content mismatch'))
        })
      })
    })

    step('putObject(bucketName, objectName, stream, contentType)_stream:100Kib_', done => {
      client.putObject(bucketName, _100kbObjectBufferName, _100kb, '')
        .then(() => done())
        .catch(done)
    })

    step('getPartialObject(bucketName, objectName, offset, length, cb)_offset:0, length=1024_', done => {
      client.getPartialObject(bucketName, _100kbObjectBufferName, 0, 1024)
        .then(stream => {
          stream.on('data', function() {})
          stream.on('end', done)
        })
        .catch(done)
    })

    step('getPartialObject(bucketName, objectName, offset, length, cb)_offset:1024, length=1024_', done => {
      var expectedHash = crypto.createHash('md5').update(_100kb.slice(1024,2048)).digest('hex')
      var hash = crypto.createHash('md5')
      client.getPartialObject(bucketName, _100kbObjectBufferName, 1024, 1024)
        .then(stream => {
          stream.on('data', data => hash.update(data))
          stream.on('end', () => {
            if (hash.digest('hex') === expectedHash) return done()
            done(new Error('content mismatch'))
          })
        })
        .catch(done)
    })

    step('getPartialObject(bucketName, objectName, offset, length, cb)_offset:1024', done => {
      var hash = crypto.createHash('md5')
      client.getPartialObject(bucketName, _100kbObjectBufferName, 1024)
        .then(stream => {
          stream.on('data', data => hash.update(data))
          stream.on('end', () => {
            if (hash.digest('hex') === _100kb1kboffsetmd5) return done()
            done(new Error('content mismatch'))
          })
        })
        .catch(done)
    })

    step('getObject(bucketName, objectName)__', done => {
      client.getObject(bucketName, _100kbObjectBufferName)
        .then(stream => {
          stream.on('data', function() {})
          stream.on('end', done)
        })
        .catch(done)
    })

    step('putObject(bucketName, objectName, stream, cb)_objectName:_6mbObjectName_', done => {
      var stream = readableStream(_6mb)
      client.putObject(bucketName, _6mbObjectName, stream, done)
    })

    step('getObject(bucketName, objectName, cb)_objectName:_6mbObjectName_download 6mb and match content', done => {
      var hash = crypto.createHash('md5')
      client.getObject(bucketName, _6mbObjectName, (e, stream) => {
        if (e) return done(e)
        stream.on('data', data => hash.update(data))
        stream.on('error', done)
        stream.on('end', () => {
          if (hash.digest('hex') === _6mbmd5) return done()
          done(new Error('content mismatch'))
        })
      })
    })

    step('getPartialObject(bucketName, objectName, offset, length, cb)_length:100*1024_download partial data (100kb of the 6mb file) and match content', done => {
      var hash = crypto.createHash('md5')
      var expectedHash = crypto.createHash('md5').update(_6mb.slice(0,100*1024)).digest('hex')
      client.getPartialObject(bucketName, _6mbObjectName, 0, 100 * 1024, (e, stream) => {
        if (e) return done(e)
        stream.on('data', data => hash.update(data))
        stream.on('error', done)
        stream.on('end', () => {
          if (hash.digest('hex') === expectedHash) return done()
          done(new Error('content mismatch'))
        })
      })
    })

    step('copyObject(bucketName, objectName, srcObject, cb)__', done => {
      client.copyObject(bucketName, _6mbObjectNameCopy, "/" + bucketName + "/" + _6mbObjectName, (e) => {
        if (e) return done(e)
        done()
      })
    })

    step('copyObject(bucketName, objectName, srcObject)__', done => {
      client.copyObject(bucketName, _6mbObjectNameCopy, "/" + bucketName + "/" + _6mbObjectName)
        .then(() => done())
        .catch(done)
    })

    step('statObject(bucketName, objectName, cb)__', done => {
      client.statObject(bucketName, _6mbObjectName, (e, stat) => {
        if (e) return done(e)
        if (stat.size !== _6mb.length) return done(new Error('size mismatch'))
        done()
      })
    })

    step('statObject(bucketName, objectName)__', done => {
      client.statObject(bucketName, _6mbObjectName)
        .then(stat => {
          if (stat.size !== _6mb.length)
            throw new Error('size mismatch')
        })
        .then(() => done())
        .catch(done)
    })

    step('removeObject(bucketName, objectName)__remove objects created for test', done => {
      client.removeObject(bucketName, _100kbObjectName)
        .then(function() {
          async.map([_100kbObjectBufferName, _6mbObjectName, _6mbObjectNameCopy], (objectName, cb) => client.removeObject(bucketName, objectName, cb), done)
        })
        .catch(done)
    })

  })

  describe('tests for copyObject statObject', function() {
    var etag
    var modifiedDate
    step('putObject(bucketName, objectName, stream, contentType, cb)_contentType: custom/content-type_', done => {
      client.putObject(bucketName, _100kbObjectName, _100kb, 'custom/content-type', done)
    })

    step('copyObject(bucketName, objectName, srcObject, cb)__', done => {
      client.copyObject(bucketName, _100kbObjectNameCopy, "/" + bucketName + "/" + _100kbObjectName, (e) => {
        if (e) return done(e)
        done()
      })
    })

    step('statObject(bucketName, objectName, cb)__', done => {
      client.statObject(bucketName, _100kbObjectNameCopy, (e, stat) => {
        if (e) return done(e)
        if (stat.size !== _100kb.length) return done(new Error('size mismatch'))
        if (stat.contentType !== 'custom/content-type') return done(new Error('content-type mismatch'))
        etag = stat.etag
        modifiedDate = stat.modifiedDate
        done()
      })
    })
    
    step('copyObject(bucketName, objectName, srcObject, conditions, cb)__', done => {
      var conds = new minio.CopyConditions()
      conds.setMatchETagExcept('TestEtag')
      client.copyObject(bucketName, _100kbObjectNameCopy, "/" + bucketName + "/" + _100kbObjectName, conds, (e) => {
        if (e) return done(e)
        done()
      })
    })

    step('copyObject(bucketName, objectName, srcObject, conditions, cb)__', done => {
      var conds = new minio.CopyConditions()
      conds.setMatchETagExcept(etag)
      client.copyObject(bucketName, _100kbObjectNameCopy, "/" + bucketName + "/" + _100kbObjectName, conds)
        .then(() => {
          done(new Error("CopyObject should have failed."))
        })
        .catch(() => done())
    })

    step('copyObject(bucketName, objectName, srcObject, conditions, cb)__', done => {
      var conds = new minio.CopyConditions()
      conds.setMatchETag(etag)
      client.copyObject(bucketName, _100kbObjectNameCopy, "/" + bucketName + "/" + _100kbObjectName, conds, (e) => {
        if (e) return done(e)
        done()
      })
    })

    step('copyObject(bucketName, objectName, srcObject, conditions, cb)__', done => {
      var conds = new minio.CopyConditions()
      conds.setMatchETag('TestETag')
      client.copyObject(bucketName, _100kbObjectNameCopy, "/" + bucketName + "/" + _100kbObjectName, conds)
        .then(() => {
          done(new Error("CopyObject should have failed."))
        })
        .catch(() => done())
    })

    step('copyObject(bucketName, objectName, srcObject, conditions, cb)__', done => {
      var conds = new minio.CopyConditions()
      conds.setUnmodified(new Date(modifiedDate))
      client.copyObject(bucketName, _100kbObjectNameCopy, "/" + bucketName + "/" + _100kbObjectName, conds, (e) => {
        if (e) return done(e)
        done()
      })
    })

    step('copyObject(bucketName, objectName, srcObject, conditions, cb)__', done => {
      var conds = new minio.CopyConditions()
      conds.setUnmodified(new Date("2010-03-26T12:00:00Z"))
      client.copyObject(bucketName, _100kbObjectNameCopy, "/" + bucketName + "/" + _100kbObjectName, conds)
        .then(() => {
          done(new Error("CopyObject should have failed."))
        })
        .catch(() => done())
    })

    step('statObject(bucketName, objectName, cb)__', done => {
      client.statObject(bucketName, _100kbObjectNameCopy, (e, stat) => {
        if (e) return done(e)
        if (stat.size !== _100kb.length) return done(new Error('size mismatch'))
        if (stat.contentType !== 'custom/content-type') return done(new Error('content-type mismatch'))
        done()
      })
    })

    step('removeObject(bucketName, objectName, cb)__remove objects created for test', done => {
      async.map([_100kbObjectName, _100kbObjectNameCopy], (objectName, cb) => client.removeObject(bucketName, objectName, cb), done)
    })

  })
  
  describe('listIncompleteUploads removeIncompleteUpload', () => {
    step('initiateNewMultipartUpload(bucketName, objectName, contentType, cb)__', done => {
      client.initiateNewMultipartUpload(bucketName, _6mbObjectName, 'application/octet-stream', done)
    })
    step('listIncompleteUploads(bucket, prefix, recursive)_recursive: true_', function(done) {
      // Minio's ListIncompleteUploads returns an empty list, so skip this on non-AWS.
      // See: https://github.com/minio/minio/commit/75c43bfb6c4a2ace
      if (!client.host.includes('s3.amazonaws.com')) {
        this.skip()
      }

      var found = false
      client.listIncompleteUploads(bucketName, _6mbObjectName, true)
        .on('error', e => done(e))
        .on('data', data => {
          if (data.key === _6mbObjectName) found = true
        })
        .on('end', () => {
          if (found) return done()
          done(new Error(`${_6mbObjectName} not found during listIncompleteUploads`))
        })
    })
    step('listIncompleteUploads(bucket, prefix, recursive)_prefix: empty, recursive: true_', function(done) {
      // Minio's ListIncompleteUploads returns an empty list, so skip this on non-AWS.
      // See: https://github.com/minio/minio/commit/75c43bfb6c4a2ace
      if (!client.host.includes('s3.amazonaws.com')) {
        this.skip()
      }

      var found = false
      client.listIncompleteUploads(bucketName, "", true)
        .on('error', e => done(e))
        .on('data', data => {
          if (data.key === _6mbObjectName) found = true
        })
        .on('end', () => {
          if (found) return done()
          done(new Error(`${_6mbObjectName} not found during listIncompleteUploads`))
        })
    })
    step('removeIncompleteUploads(bucket, prefix)__', done => {
      client.removeIncompleteUpload(bucketName, _6mbObjectName)
        .then(done)
        .catch(done)
    })
  })

  describe('fPutObject fGetObject', function() {
    var tmpFileUpload = `${tmpDir}/${_6mbObjectName}`
    var tmpFileDownload = `${tmpDir}/${_6mbObjectName}.download`

    step('fPutObject(bucketName, objectName, filePath, contentType, callback)__', done => {
      fs.writeFileSync(tmpFileUpload, _6mb)
      client.fPutObject(bucketName, _6mbObjectName, tmpFileUpload, '', done)
    })

    step('fPutObject(bucketName, objectName, filePath, contentType, callback)_contentType: customContentType_', done => client.fPutObject(bucketName, _6mbObjectName, tmpFileUpload, customContentType, done))
    step('fGetObject(bucketName, objectName, filePath, callback)__verify checksum', done => {
      client.fGetObject(bucketName, _6mbObjectName, tmpFileDownload)
        .then(() => {
          var md5sum = crypto.createHash('md5').update(fs.readFileSync(tmpFileDownload)).digest('hex')
          if (md5sum === _6mbmd5) return done()
          throw new Error('md5sum mismatch')
        })
        .catch(done)
    })

    step('removeObject(bucketName, objectName, filePath, callback)__', done => {
      fs.unlinkSync(tmpFileDownload)
      client.removeObject(bucketName, _6mbObjectName)
        .then(() => done())
        .catch(done)
    })

    step('fPutObject(bucketName, objectName, filePath, contentType)__', done => {
      client.fPutObject(bucketName, _6mbObjectName, tmpFileUpload, '')
        .then(() => done())
        .catch(done)
    })

    step('fGetObject(bucketName, objectName, filePath)__', done => {
      client.fGetObject(bucketName, _6mbObjectName, tmpFileDownload)
        .then(() => done())
        .catch(done)
    })

    step('removeObject(bucketName, objectName, filePath, callback)__', (done) => {
      fs.unlinkSync(tmpFileUpload)
      fs.unlinkSync(tmpFileDownload)
      client.removeObject(bucketName, _6mbObjectName, done)
    })
  })
  describe('fGetObject-resume', () => {
    var localFile = `${tmpDir}/${_5mbObjectName}`
    step('putObject(bucketName, objectName, stream, contentType, cb)__', done => {
      var stream = readableStream(_5mb)
      client.putObject(bucketName, _5mbObjectName, stream, _5mb.length, '', done)
    })
    step('fGetObject(bucketName, objectName, filePath, callback)_filePath: resumePartialDownload_', done => {
      var tmpFile = `${tmpDir}/${_5mbObjectName}.${_5mbmd5}.part.minio`
      // create a partial file
      fs.writeFileSync(tmpFile, _100kb)
      client.fGetObject(bucketName, _5mbObjectName, localFile)
        .then(() => {
          var md5sum = crypto.createHash('md5').update(fs.readFileSync(localFile)).digest('hex')
          if (md5sum === _5mbmd5) return done()
          throw new Error('md5sum mismatch')
        })
        .catch(done)
    })
    step('removeObject(bucketName, objectName, filePath, callback)__', done => {
      fs.unlinkSync(localFile)
      client.removeObject(bucketName, _5mbObjectName, done)
    })
  })

  describe('bucket policy', () => {
    let policies = [Policy.READONLY, Policy.WRITEONLY, Policy.READWRITE]

    // Iterate through the basic policies ensuring it can set and check each of them.
    policies.forEach(policy => {
      step(`setBucketPolicy(bucketName, objectPrefix, bucketPolicy, cb)_bucketPolicy:${policy}_`, done => {
        client.setBucketPolicy(bucketName, '', policy, err => {
          if (err) return done(err)
          done()
        })
      })
      step('getBucketPolicy(bucketName, objectPrefix, cb)__', done => {
        client.getBucketPolicy(bucketName, '', (err, response) => {
          if (err) return done(err)

          if (response != policy) {
            return done(new Error(`policy is incorrect (${response} != ${policy})`))
          }
          done()
        })
      })
    })

    step('setBucketPolicy(bucketName, objectPrefix, bucketPolicy)__', done => {
      client.setBucketPolicy(bucketName, '', Policy.READONLY)
        .then(() => done())
        .catch(done)
    })

    step('getBucketPolicy(bucketName, objectPrefix)__', done => {
      client.getBucketPolicy(bucketName, '')
        .then(response => {
          if (response != Policy.READONLY)
            throw new Error(`policy is incorrect (${response} != ${Policy.READONLY})`)
          done()
        })
        .catch(done)
    })

    step('setBucketPolicy(bucketName, objectPrefix, bucketPolicy)_objectPrefix: prefix_', done => {
      client.setBucketPolicy(bucketName, 'prefix', Policy.READWRITE)
        .then(() => done())
        .catch(done)
    })

    step('getBucketPolicy(bucketName, objectPrefix)_objectPrefix: prefix_', done => {
      client.getBucketPolicy(bucketName, 'prefix')
        .then(response => {
          if (response != Policy.READWRITE)
            throw new Error(`policy is incorrect (${response} != ${Policy.READWRITE})`)
          done()
        })
        .catch(done)
    })

    step('getBucketPolicy(bucketName, objectPrefix)_objectPrefix: wrongprefix_', done => {
      client.getBucketPolicy(bucketName, 'wrongprefix')
        .then(response => {
          if (response == Policy.READWRITE)
            throw new Error(`policy is incorrect (${response} == ${Policy.READWRITE})`)
          done()
        })
        .catch(done)
    })

    step('setBucketPolicy(bucketName, objectPrefix, bucketPolicy, cb)_bucketPolicy: NONE_', done => {
      client.setBucketPolicy(bucketName, '', Policy.NONE, err => {
        if (err) return done(err)
        done()
      })
    })

    step('getBucketPolicy(bucketName, objectPrefix, cb)__', done => {
      // Check using the client — this should error.
      client.getBucketPolicy(bucketName, '', (err) => {
        if (!err) return done(new Error('getBucketPolicy should error'))

        if (!(/does not have a bucket policy/.test(err.message)) &&
                      !(/bucket policy does not exist/.test(err.message))) {
          return done(new Error(`error message is incorrect (${err.message})`))
        }
        done()
      })
    })
  })

  describe('presigned operations', () => {
    step('presignedPutObject(bucketName, objectName, expires, cb)__', done => {
      client.presignedPutObject(bucketName, _1byteObjectName, 1000, (e, presignedUrl) => {
        if (e) return done(e)
        var transport = http
        var options = _.pick(url.parse(presignedUrl), ['hostname', 'port', 'path', 'protocol'])
        options.method = 'PUT'
        options.headers = {
          'content-length': _1byte.length
        }
        if (options.protocol === 'https:') transport = https
        var request = transport.request(options, (response) => {
          if (response.statusCode !== 200) return done(new Error(`error on put : ${response.statusCode}`))
          response.on('error', e => done(e))
          response.on('end', () => done())
          response.on('data', () => {})
        })
        request.on('error', e => done(e))
        request.write(_1byte)
        request.end()
      })
    })

    step('presignedPutObject(bucketName, objectName, expires)_expires:-123_', done => {
      // negative values should trigger an error
      client.presignedPutObject(bucketName, _1byteObjectName, -123)
        .then(() => {
          done(new Error('negative values should trigger an error'))
        })
        .catch(() => done())
    })

    step('presignedPutObject(bucketName, objectName)__', done => {
      // negative values should trigger an error
      client.presignedPutObject(bucketName, _1byteObjectName)
        .then(() => done())
        .catch(done)
    })

    step('presignedGetObject(bucketName, objectName, expires, cb)__', done => {
      client.presignedGetObject(bucketName, _1byteObjectName, 1000, (e, presignedUrl) => {
        if (e) return done(e)
        var transport = http
        var options = _.pick(url.parse(presignedUrl), ['hostname', 'port', 'path', 'protocol'])
        options.method = 'GET'
        if (options.protocol === 'https:') transport = https
        var request = transport.request(options, (response) => {
          if (response.statusCode !== 200) return done(new Error(`error on put : ${response.statusCode}`))
          var error = null
          response.on('error', e => done(e))
          response.on('end', () => done(error))
          response.on('data', (data) => {
            if (data.toString() !== _1byte.toString()) {
              error = new Error('content mismatch')
            }
          })
        })
        request.on('error', e => done(e))
        request.end()
      })
    })

    step('presignedGetObject(bucketName, objectName, cb)__', done => {
      client.presignedGetObject(bucketName, _1byteObjectName, (e, presignedUrl) => {
        if (e) return done(e)
        var transport = http
        var options = _.pick(url.parse(presignedUrl), ['hostname', 'port', 'path', 'protocol'])
        options.method = 'GET'
        if (options.protocol === 'https:') transport = https
        var request = transport.request(options, (response) => {
          if (response.statusCode !== 200) return done(new Error(`error on put : ${response.statusCode}`))
          var error = null
          response.on('error', e => done(e))
          response.on('end', () => done(error))
          response.on('data', (data) => {
            if (data.toString() !== _1byte.toString()) {
              error = new Error('content mismatch')
            }
          })
        })
        request.on('error', e => done(e))
        request.end()
      })
    })

    step('presignedGetObject(bucketName, objectName, expires)__', done => {
      client.presignedGetObject(bucketName, 'this.does.not.exist', 2938)
        .then(assert.fail)
        .catch(() => done())
    })

    step('presignedGetObject(bucketName, objectName, expires, respHeaders, cb)__', done => {
      var respHeaders = {
        'response-content-type': 'text/html',
        'response-content-language': 'en',
        'response-expires': 'Sun, 07 Jun 2020 16:07:58 GMT',
        'response-cache-control': 'No-cache',
        'response-content-disposition': 'attachment; filename=testing.txt',
        'response-content-encoding': 'gzip'
      }
      client.presignedGetObject(bucketName, _1byteObjectName, 1000, respHeaders, (e, presignedUrl) => {
        if (e) return done(e)
        var transport = http
        var options = _.pick(url.parse(presignedUrl), ['hostname', 'port', 'path', 'protocol'])
        options.method = 'GET'
        if (options.protocol === 'https:') transport = https
        var request = transport.request(options, (response) => {
          if (response.statusCode !== 200) return done(new Error(`error on get : ${response.statusCode}`))
          if (respHeaders['response-content-type'] != response.headers['content-type']) {
            return done(new Error(`content-type header mismatch`))
          }
          if (respHeaders['response-content-language'] != response.headers['content-language']) {
            return done(new Error(`content-language header mismatch`))
          }
          if (respHeaders['response-expires'] != response.headers['expires']) {
            return done(new Error(`expires header mismatch`))
          }
          if (respHeaders['response-cache-control'] != response.headers['cache-control']) {
            return done(new Error(`cache-control header mismatch`))
          }
          if (respHeaders['response-content-disposition'] != response.headers['content-disposition']) {
            return done(new Error(`content-disposition header mismatch`))
          }
          if (respHeaders['response-content-encoding'] != response.headers['content-encoding']) {
            return done(new Error(`content-encoding header mismatch`))
          }
          response.on('data', () => {})
          done()
        })
        request.on('error', e => done(e))
        request.end()
      })
    })

    step('presignedPostPolicy(postPolicy, cb)__', done => {
      var policy = client.newPostPolicy()
      policy.setKey(_1byteObjectName)
      policy.setBucket(bucketName)
      var expires = new Date
      expires.setSeconds(24 * 60 * 60 * 10)
      policy.setExpires(expires)

      client.presignedPostPolicy(policy, (e, urlStr, formData) => {
        if (e) return done(e)
        var req = superagent.post(`${urlStr}`)
        _.each(formData, (value, key) => req.field(key, value))
        req.attach('file', new Buffer([_1byte]), 'test')
        req.end(function(e) {
          if (e) return done(e)
          done()
        })
        req.on('error', e => done(e))
      })
    })

    step('presignedPostPolicy(postPolicy)_postPolicy: null_', done => {
      client.presignedPostPolicy(null)
        .then(() => {
          done(new Error('null policy should fail'))
        })
        .catch(() => done())
    })

    step('removeObject(bucketName, objectName, done)__', done => {
      client.removeObject(bucketName, _1byteObjectName, done)
    })
  })

  describe('listObjects', function() {
    var listObjectPrefix = 'miniojsPrefix'
    var listObjectsNum = 10
    var objArray = []
    var listArray = []
    var listPrefixArray = []

    step(`putObject(bucketName, objectName, stream, size, contentType, callback)__Create ${listObjectsNum} objects`, done => {
      _.times(listObjectsNum, i => objArray.push(`${listObjectPrefix}.${i}`))
      objArray = objArray.sort()
      async.mapLimit(
        objArray,
        20,
        (objectName, cb) => client.putObject(bucketName, objectName, readableStream(_1byte), _1byte.length, '', cb),
        done
      )
    })

    step('listObjects(bucketName, prefix, recursive)_prefix: miniojsprefix, recursive:true_', done => {
      client.listObjects(bucketName, listObjectPrefix, true)
        .on('error', done)
        .on('end', () => {
          if (_.isEqual(objArray, listPrefixArray)) return done()
          return done(new Error(`listObjects lists ${listPrefixArray.length} objects, expected ${listObjectsNum}`))
        })
        .on('data', data => {
          listPrefixArray.push(data.name)
        })
    })

    step('listObjects(bucketName, prefix, recursive)_bucketName: empty, recursive:true_', done => {
      try {
        client.listObjects("", "", true)
          .on('end', () => {
            return done(new Error(`listObjects should throw exception when empty bucketname is passed`))               
          })
      } catch (e) {
        if (e.name == 'InvalidBucketNameError') {
          done()
        } else {
          done(e)
        }
      }
    })

    step('listObjects(bucketName, prefix, recursive)_recursive:false_', done => {
      client.listObjects(bucketName, '', false)
        .on('error', done)
        .on('end', () => {
          if (_.isEqual(objArray, listArray)) return done()
          return done(new Error(`listObjects lists ${listArray.length} objects, expected ${listObjectsNum}`))
        })
        .on('data', data => {
          listArray.push(data.name)
        })
    })

    step('listObjectsV2(bucketName, prefix, recursive)_recursive:true_', done => {
      listArray = []
      client.listObjectsV2(bucketName, '', true)
        .on('error', done)
        .on('end', () => {
          if (_.isEqual(objArray, listArray)) return done()
          return done(new Error(`listObjects lists ${listArray.length} objects, expected ${listObjectsNum}`))
        })
        .on('data', data => {
          listArray.push(data.name)
        })
    })

    step(`removeObject(bucketName, objectName, callback)__Remove ${listObjectsNum} objects`, done => {
      async.mapLimit(
        listArray,
        20,
        (objectName, cb) => client.removeObject(bucketName, objectName, cb),
        done
      )
    })
  })
  
  function readableStream(data) {
    var s = new stream.Readable()
    s._read = () => {}
    s.push(data)
    s.push(null)
    return s
  }

  describe('bucket notifications', () => {
    describe('#listenBucketNotification', () => {
      before(function() {
        // listenBucketNotification only works on Minio, so skip if
        // the host is Amazon.
        if (client.host.includes('s3.amazonaws.com')) {
          this.skip()
        }
      })

      step('listenBucketNotification(bucketName, prefix, suffix, events)_events:bad_', done => {
        let poller = client.listenBucketNotification(bucketName, 'photos/', '.jpg', ['bad'])
        poller.on('error', error => {
          if (error.code != 'NotImplemented') {
            assert.match(error.message, /A specified event is not supported for notifications./)
            assert.equal(error.code, 'InvalidArgument')
          }
          done()
        })
      })
      step('listenBucketNotification(bucketName, prefix, suffix, events)_events: ObjectCreated_', done => {
        let poller = client.listenBucketNotification(bucketName, '', '', ['s3:ObjectCreated:*'])
        let records = 0
        let notImplemented = false
        poller.on('notification', record => {
          records++

          assert.equal(record.eventName, 's3:ObjectCreated:Put')
          assert.equal(record.s3.bucket.name, bucketName)
          assert.equal(record.s3.object.key, objectName)
        })
        poller.on('error', error => {
          if (error.code != 'NotImplemented') {
            done(error)
          } else {
            notImplemented = true
          }
        })
        client.putObject(bucketName, objectName, 'stringdata', (err) => {
          if (err) return done(err)
          // It polls every five seconds, so wait for two-ish polls, then end.
          setTimeout(() => {
            if (notImplemented == false) {
              assert.equal(records, 1)
            }
            poller.stop()
            client.removeObject(bucketName, objectName, done)
          }, 11 * 1000)
        })
      })
 
      // This test is very similar to that above, except it does not include
      // Minio.ObjectCreatedAll in the config. Thus, no events should be emitted.
      step('listenBucketNotification(bucketName, prefix, suffix, events)_events:ObjectRemoved_', done => {
        let poller = client.listenBucketNotification(bucketName, '', '', ['s3:ObjectRemoved:*'])
        poller.on('notification', assert.fail)

        client.putObject(bucketName, objectName, 'stringdata', (err) => {
          if (err) return done(err)
          // It polls every five seconds, so wait for two-ish polls, then end.
          setTimeout(() => {
            poller.stop()
            poller.removeAllListeners('notification')
            // clean up object now
            client.removeObject(bucketName, objectName, done)
          }, 11 * 1000)
        })
      })
    })
  })
})
