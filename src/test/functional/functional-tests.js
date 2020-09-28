/*
 * MinIO Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2015 MinIO, Inc.
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

require('source-map-support').install()

describe('functional tests', function() {
  this.timeout(30 * 60 * 1000)
  var playConfig = {}
  // If credentials aren't given, default to play.min.io.
  if (process.env['SERVER_ENDPOINT']) {
    var res = process.env['SERVER_ENDPOINT'].split(":")
    playConfig.endPoint = res[0]
    playConfig.port = parseInt(res[1])
  } else {
    playConfig.endPoint = 'play.min.io'
    playConfig.port = 9000
  }
  playConfig.accessKey = process.env['ACCESS_KEY'] || 'Q3AM3UQ867SPQQA43P2F'
  playConfig.secretKey = process.env['SECRET_KEY'] || 'zuf+tfteSlswRu7BJ86wekitnifILbZam1KYY3TG'

  // If the user provides ENABLE_HTTPS, 1 = secure, anything else = unsecure.
  // Otherwise default useSSL as true.
  if (process.env['ENABLE_HTTPS'] !== undefined) {
    playConfig.useSSL = (process.env['ENABLE_HTTPS'] == '1')
  } else {
    playConfig.useSSL = true
  }

  // dataDir is falsy if we need to generate data on the fly. Otherwise, it will be
  // a directory with files to read from, i.e. /mint/data.
  var dataDir = process.env['MINT_DATA_DIR']

  // set the partSize to ensure multipart upload chunk size.
  // if not set, putObject with stream data and undefined length will use about 500Mb chunkSize (5Tb/10000).
  playConfig.partSize = 64 * 1024 * 1024

  var client = new minio.Client(playConfig)
  var usEastConfig = playConfig
  usEastConfig.region = 'us-east-1'
  var clientUsEastRegion = new minio.Client(usEastConfig)

  var bucketName = "minio-js-test-" + uuid.v4()
  var objectName = uuid.v4()

  var _1byteObjectName = 'datafile-1-b'
  var _1byte = dataDir ? fs.readFileSync(dataDir + '/' + _1byteObjectName) : Buffer.alloc(1, 0)

  var _100kbObjectName = 'datafile-100-kB'
  var _100kb = dataDir ? fs.readFileSync(dataDir + '/' + _100kbObjectName) : Buffer.alloc(100 * 1024, 0)
  var _100kbObjectNameCopy = _100kbObjectName + '-copy'

  var _100kbObjectBufferName = `${_100kbObjectName}.buffer`
  var _MultiPath100kbObjectBufferName = `path/to/${_100kbObjectName}.buffer`
  var _100kbmd5 = crypto.createHash('md5').update(_100kb).digest('hex')
  var _100kb1kboffsetmd5 = crypto.createHash('md5').update(_100kb.slice(1024)).digest('hex')

  var _65mbObjectName = 'datafile-65-MB'
  var _65mb = dataDir ? fs.readFileSync(dataDir + '/' + _65mbObjectName) : Buffer.alloc(65 * 1024 * 1024, 0)
  var _65mbmd5 = crypto.createHash('md5').update(_65mb).digest('hex')
  var _65mbObjectNameCopy = _65mbObjectName + '-copy'

  var _5mbObjectName = 'datafile-5-MB'
  var _5mb = dataDir ? fs.readFileSync(dataDir + '/' + _5mbObjectName) : Buffer.alloc(5 * 1024 * 1024, 0)
  var _5mbmd5 = crypto.createHash('md5').update(_5mb).digest('hex')

  // create new http agent to check requests release sockets
  var httpAgent = (playConfig.useSSL ? https : http).Agent({ keepAlive: true })
  client.setRequestOptions({ agent: httpAgent })

  var metaData = {
    'Content-Type': 'text/html',
    'Content-Language': 'en',
    'X-Amz-Meta-Testing': 1234,
    'randomstuff': 5678
  }

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
            return done(new Error('bucket not found'))
        })
        .then(() => done())
        .catch(done)
    })
  })

  describe('makeBucket with region', () => {
    step(`makeBucket(bucketName, region, cb)_bucketName:${bucketName}-region, region:us-east-2_`, done => {
      try {
        clientUsEastRegion.makeBucket(`${bucketName}-region`, 'us-east-2', assert.fail)
      } catch (e) {
        done()
      }
    })
    step(`makeBucket(bucketName, region, cb)_bucketName:${bucketName}-region, region:us-east-1_`, done => {
      clientUsEastRegion.makeBucket(`${bucketName}-region`, 'us-east-1', done)
    })
    step(`removeBucket(bucketName, cb)_bucketName:${bucketName}-region_`, done => {
      clientUsEastRegion.removeBucket(`${bucketName}-region`, done)
    })
    step(`makeBucket(bucketName, region)_bucketName:${bucketName}-region, region:us-east-1_`, done => {
      clientUsEastRegion.makeBucket(`${bucketName}-region`, 'us-east-1', (e)=>{
        if (e) {
          // Some object storage servers like Azure, might not delete a bucket rightaway
          // Add a sleep of 40 seconds and retry
          setTimeout(() => {
            clientUsEastRegion.makeBucket(`${bucketName}-region`, 'us-east-1', done)
          }, 40 * 1000)
        } else done()
      })
    })
    step(`removeBucket(bucketName)_bucketName:${bucketName}-region_`, done => {
      clientUsEastRegion.removeBucket(`${bucketName}-region`)
        .then(() => done())
        .catch(done)
    })
  })

  describe('bucketExists', () => {
    step(`bucketExists(bucketName, cb)_bucketName:${bucketName}_`, done => client.bucketExists(bucketName, done))
    step(`bucketExists(bucketName, cb)_bucketName:${bucketName}random_`, done => {
      client.bucketExists(bucketName + 'random', (e, exists) => {
        if (e === null && !exists) return done()
        done(new Error())
      })
    })
    step(`bucketExists(bucketName)_bucketName:${bucketName}_`, done => {
      client.bucketExists(bucketName)
        .then(() => done())
        .catch(done)
    })
  })


  describe('removeBucket', () => {
    step(`removeBucket(bucketName, cb)_bucketName:${bucketName}random_`, done => {
      client.removeBucket(bucketName + 'random', (e) => {
        if (e.code === 'NoSuchBucket') return done()
        done(new Error())
      })
    })
    step(`makeBucket(bucketName, region)_bucketName:${bucketName}-region-1, region:us-east-1_`, done => {
      client.makeBucket(`${bucketName}-region-1`, 'us-east-1')
        .then(() => client.removeBucket(`${bucketName}-region-1`))
        .then(() => done())
        .catch(done)
    })
  })
  describe('tests for putObject getObject removeObject with multipath', function() {
    step(`putObject(bucketName, objectName, stream)_bucketName:${bucketName}, objectName:${_MultiPath100kbObjectBufferName}, stream:100Kib_`, done => {
      client.putObject(bucketName, _MultiPath100kbObjectBufferName, _100kb)
        .then(() => done())
        .catch(done)
    })

    step(`getObject(bucketName, objectName, callback)_bucketName:${bucketName}, objectName:${_MultiPath100kbObjectBufferName}_`, done => {
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

    step(`removeObject(bucketName, objectName)_bucketName:${bucketName}, objectName:${_MultiPath100kbObjectBufferName}_`, done => {
      client.removeObject(bucketName, _MultiPath100kbObjectBufferName)
        .then(() => done())
        .catch(done)
    })

  })
  describe('tests for putObject copyObject getObject getPartialObject statObject removeObject', function() {
    var tmpFileUpload = `${tmpDir}/${_100kbObjectName}`
    step(`fPutObject(bucketName, objectName, filePath, metaData, callback)_bucketName:${bucketName}, objectName:${_100kbObjectName}, filePath: ${tmpFileUpload}_`, done => {
      fs.writeFileSync(tmpFileUpload, _100kb)
      client.fPutObject(bucketName, _100kbObjectName, tmpFileUpload,done)
    })

    step(`statObject(bucketName, objectName, cb)_bucketName:${bucketName}, objectName:${_100kbObjectName}_`, done => {
      client.statObject(bucketName, _100kbObjectName, (e, stat) => {
        if (e) return done(e)
        // As metadata is not provided and there is no file extension,
        // we default to 'application/octet-stream' as per `probeContentType` function
        if (stat.metaData && stat.metaData['content-type'] !== 'application/octet-stream') {
          return done(new Error('content-type mismatch'))
        }
        done()
      })
    })

    var tmpFileUploadWithExt = `${tmpDir}/${_100kbObjectName}.txt`
    step(`fPutObject(bucketName, objectName, filePath, metaData, callback)_bucketName:${bucketName}, objectName:${_100kbObjectName}, filePath: ${tmpFileUploadWithExt}, metaData:${metaData}_`, done => {
      fs.writeFileSync(tmpFileUploadWithExt, _100kb)
      client.fPutObject(bucketName, _100kbObjectName, tmpFileUploadWithExt, metaData, done)
    })

    step(`statObject(bucketName, objectName, cb)_bucketName:${bucketName}, objectName:${_100kbObjectName}_`, done => {
      client.statObject(bucketName, _100kbObjectName, (e, stat) => {
        if (e) return done(e)
        // As metadata is provided, even though we have an extension,
        // the `content-type` should be equal what was declared on the metadata
        if (stat.metaData && stat.metaData['content-type'] !== 'text/html') {
          return done(new Error('content-type mismatch'))
        } else if (!stat.metaData) {
          return done(new Error('no metadata present'))
        }
        done()
      })
    })

    step(`fPutObject(bucketName, objectName, filePath, metaData, callback)_bucketName:${bucketName}, objectName:${_100kbObjectName}, filePath: ${tmpFileUploadWithExt}_`, done => {
      fs.writeFileSync(tmpFileUploadWithExt, _100kb)
      client.fPutObject(bucketName, _100kbObjectName, tmpFileUploadWithExt, done)
    })

    step(`statObject(bucketName, objectName, cb)_bucketName:${bucketName}, objectName:${_100kbObjectName}_`, done => {
      client.statObject(bucketName, _100kbObjectName, (e, stat) => {
        if (e) return done(e)
        // As metadata is not provided but we have a file extension,
        // we need to infer `content-type` from the file extension
        if (stat.metaData && stat.metaData['content-type'] !== 'text/plain') return done(new Error('content-type mismatch'))
        done()
      })
    })

    step(`putObject(bucketName, objectName, stream, size, metaData, callback)_bucketName:${bucketName}, objectName:${_100kbObjectName}, stream:100kb, size:${_100kb.length}, metaData:${metaData}_`, done => {
      var stream = readableStream(_100kb)
      client.putObject(bucketName, _100kbObjectName, stream, _100kb.length, metaData, done)
    })

    step(`putObject(bucketName, objectName, stream, size, metaData, callback)_bucketName:${bucketName}, objectName:${_100kbObjectName}, stream:100kb, size:${_100kb.length}_`, done => {
      var stream = readableStream(_100kb)
      client.putObject(bucketName, _100kbObjectName, stream, _100kb.length, done)
    })

    step(`getObject(bucketName, objectName, callback)_bucketName:${bucketName}, objectName:${_100kbObjectName}_`, done => {
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

    step(`putObject(bucketName, objectName, stream, callback)_bucketName:${bucketName}, objectName:${_100kbObjectBufferName}, stream:100kb_`, done => {
      client.putObject(bucketName, _100kbObjectBufferName, _100kb, '', done)
    })

    step(`getObject(bucketName, objectName, callback)_bucketName:${bucketName}, objectName:${_100kbObjectBufferName}_`, done => {
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

    step(`putObject(bucketName, objectName, stream, metaData)_bucketName:${bucketName}, objectName:${_100kbObjectBufferName}, stream:100kb_, metaData:{}`, done => {
      client.putObject(bucketName, _100kbObjectBufferName, _100kb, {})
        .then(() => done())
        .catch(done)
    })

    step(`getPartialObject(bucketName, objectName, offset, length, cb)_bucketName:${bucketName}, objectName:${_100kbObjectBufferName}, offset:0, length=1024_`, done => {
      client.getPartialObject(bucketName, _100kbObjectBufferName, 0, 1024)
        .then(stream => {
          stream.on('data', function() {})
          stream.on('end', done)
        })
        .catch(done)
    })

    step(`getPartialObject(bucketName, objectName, offset, length, cb)_bucketName:${bucketName}, objectName:${_100kbObjectBufferName}, offset:1024, length=1024_`, done => {
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

    step(`getPartialObject(bucketName, objectName, offset, length, cb)_bucketName:${bucketName}, objectName:${_100kbObjectBufferName}, offset:1024`, done => {
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

    step(`getObject(bucketName, objectName)_bucketName:${bucketName}, objectName:${_100kbObjectBufferName}_`, done => {
      client.getObject(bucketName, _100kbObjectBufferName)
        .then(stream => {
          stream.on('data', function() {})
          stream.on('end', done)
        })
        .catch(done)
    })

    step(`putObject(bucketName, objectName, stream, cb)_bucketName:${bucketName}, objectName:${_65mbObjectName}_`, done => {
      var stream = readableStream(_65mb)
      client.putObject(bucketName, _65mbObjectName, stream, () => {
        setTimeout(() => {
          if (Object.values(httpAgent.sockets).length === 0) return done()
          done(new Error('http request did not release network socket'))
        }, 0)
      })
    })

    step(`getObject(bucketName, objectName, cb)_bucketName:${bucketName}, objectName:${_65mbObjectName}_`, done => {
      var hash = crypto.createHash('md5')
      client.getObject(bucketName, _65mbObjectName, (e, stream) => {
        if (e) return done(e)
        stream.on('data', data => hash.update(data))
        stream.on('error', done)
        stream.on('end', () => {
          if (hash.digest('hex') === _65mbmd5) return done()
          done(new Error('content mismatch'))
        })
      })
    })

    step(`getObject(bucketName, objectName, cb)_bucketName:${bucketName} non-existent object`, done => {
      client.getObject(bucketName, 'an-object-that-does-not-exist', (e, stream) => {
        if (stream) return done(new Error("on errors the stream object should not exist"))
        if (!e) return done(new Error("expected an error object"))
        if (e.code !== 'NoSuchKey') return done(new Error("expected NoSuchKey error"))
        done()
      })
    })

    step(`getPartialObject(bucketName, objectName, offset, length, cb)_bucketName:${bucketName}, objectName:${_65mbObjectName}, offset:0, length:100*1024_`, done => {
      var hash = crypto.createHash('md5')
      var expectedHash = crypto.createHash('md5').update(_65mb.slice(0,100*1024)).digest('hex')
      client.getPartialObject(bucketName, _65mbObjectName, 0, 100*1024, (e, stream) => {
        if (e) return done(e)
        stream.on('data', data => hash.update(data))
        stream.on('error', done)
        stream.on('end', () => {
          if (hash.digest('hex') === expectedHash) return done()
          done(new Error('content mismatch'))
        })
      })
    })

    step(`copyObject(bucketName, objectName, srcObject, cb)_bucketName:${bucketName}, objectName:${_65mbObjectNameCopy}, srcObject:/${bucketName}/${_65mbObjectName}_`, done => {
      client.copyObject(bucketName, _65mbObjectNameCopy, "/" + bucketName + "/" + _65mbObjectName, (e) => {
        if (e) return done(e)
        done()
      })
    })

    step(`copyObject(bucketName, objectName, srcObject)_bucketName:${bucketName}, objectName:${_65mbObjectNameCopy}, srcObject:/${bucketName}/${_65mbObjectName}_`, done => {
      client.copyObject(bucketName, _65mbObjectNameCopy, "/" + bucketName + "/" + _65mbObjectName)
        .then(() => done())
        .catch(done)
    })

    step(`statObject(bucketName, objectName, cb)_bucketName:${bucketName}, objectName:${_65mbObjectName}_`, done => {
      client.statObject(bucketName, _65mbObjectName, (e, stat) => {
        if (e) return done(e)
        if (stat.size !== _65mb.length) return done(new Error('size mismatch'))
        done()
      })
    })

    step(`statObject(bucketName, objectName)_bucketName:${bucketName}, objectName:${_65mbObjectName}_`, done => {
      client.statObject(bucketName, _65mbObjectName)
        .then(stat => {
          if (stat.size !== _65mb.length)
            return done(new Error('size mismatch'))
        })
        .then(() => done())
        .catch(done)
    })

    step(`removeObject(bucketName, objectName)_bucketName:${bucketName}, objectName:${_100kbObjectName}_`, done => {
      client.removeObject(bucketName, _100kbObjectName)
        .then(function() {
          async.map([_100kbObjectBufferName, _65mbObjectName, _65mbObjectNameCopy], (objectName, cb) => client.removeObject(bucketName, objectName, cb), done)
        })
        .catch(done)
    })

  })

  describe('tests for copyObject statObject', function() {
    var etag
    var modifiedDate
    step(`putObject(bucketName, objectName, stream, metaData, cb)_bucketName:${bucketName}, objectName:${_100kbObjectName}, stream: 100kb, metaData:${metaData}_`, done => {
      client.putObject(bucketName, _100kbObjectName, _100kb, metaData, done)
    })

    step(`copyObject(bucketName, objectName, srcObject, cb)_bucketName:${bucketName}, objectName:${_100kbObjectNameCopy}, srcObject:/${bucketName}/${_100kbObjectName}_`, done => {
      client.copyObject(bucketName, _100kbObjectNameCopy, "/" + bucketName + "/" + _100kbObjectName, (e) => {
        if (e) return done(e)
        done()
      })
    })

    step(`statObject(bucketName, objectName, cb)_bucketName:${bucketName}, objectName:${_100kbObjectName}_`, done => {
      client.statObject(bucketName, _100kbObjectName, (e, stat) => {
        if (e) return done(e)
        if (stat.size !== _100kb.length) return done(new Error('size mismatch'))
        assert.equal(stat.metaData['content-type'], metaData['Content-Type'])
        assert.equal(stat.metaData['Testing'], metaData['Testing'])
        assert.equal(stat.metaData['randomstuff'], metaData['randomstuff'])
        etag = stat.etag
        modifiedDate = stat.modifiedDate
        done()
      })
    })

    step(`copyObject(bucketName, objectName, srcObject, conditions, cb)_bucketName:${bucketName}, objectName:${_100kbObjectNameCopy}, srcObject:/${bucketName}/${_100kbObjectName}, conditions:ExceptIncorrectEtag_`, done => {
      var conds = new minio.CopyConditions()
      conds.setMatchETagExcept('TestEtag')
      client.copyObject(bucketName, _100kbObjectNameCopy, "/" + bucketName + "/" + _100kbObjectName, conds, (e) => {
        if (e) return done(e)
        done()
      })
    })

    step(`copyObject(bucketName, objectName, srcObject, conditions, cb)_bucketName:${bucketName}, objectName:${_100kbObjectNameCopy}, srcObject:/${bucketName}/${_100kbObjectName}, conditions:ExceptCorrectEtag_`, done => {
      var conds = new minio.CopyConditions()
      conds.setMatchETagExcept(etag)
      client.copyObject(bucketName, _100kbObjectNameCopy, "/" + bucketName + "/" + _100kbObjectName, conds)
        .then(() => {
          done(new Error("CopyObject should have failed."))
        })
        .catch(() => done())
    })

    step(`copyObject(bucketName, objectName, srcObject, conditions, cb)_bucketName:${bucketName}, objectName:${_100kbObjectNameCopy}, srcObject:/${bucketName}/${_100kbObjectName}, conditions:MatchCorrectEtag_`, done => {
      var conds = new minio.CopyConditions()
      conds.setMatchETag(etag)
      client.copyObject(bucketName, _100kbObjectNameCopy, "/" + bucketName + "/" + _100kbObjectName, conds, (e) => {
        if (e) return done(e)
        done()
      })
    })

    step(`copyObject(bucketName, objectName, srcObject, conditions, cb)_bucketName:${bucketName}, objectName:${_100kbObjectNameCopy}, srcObject:/${bucketName}/${_100kbObjectName}, conditions:MatchIncorrectEtag_`, done => {
      var conds = new minio.CopyConditions()
      conds.setMatchETag('TestETag')
      client.copyObject(bucketName, _100kbObjectNameCopy, "/" + bucketName + "/" + _100kbObjectName, conds)
        .then(() => {
          done(new Error("CopyObject should have failed."))
        })
        .catch(() => done())
    })

    step(`copyObject(bucketName, objectName, srcObject, conditions, cb)_bucketName:${bucketName}, objectName:${_100kbObjectNameCopy}, srcObject:/${bucketName}/${_100kbObjectName}, conditions:Unmodified since ${modifiedDate}`, done => {
      var conds = new minio.CopyConditions()
      conds.setUnmodified(new Date(modifiedDate))
      client.copyObject(bucketName, _100kbObjectNameCopy, "/" + bucketName + "/" + _100kbObjectName, conds, (e) => {
        if (e) return done(e)
        done()
      })
    })

    step(`copyObject(bucketName, objectName, srcObject, conditions, cb)_bucketName:${bucketName}, objectName:${_100kbObjectNameCopy}, srcObject:/${bucketName}/${_100kbObjectName}, conditions:Unmodified since 2010-03-26T12:00:00Z_`, done => {
      var conds = new minio.CopyConditions()
      conds.setUnmodified(new Date("2010-03-26T12:00:00Z"))
      client.copyObject(bucketName, _100kbObjectNameCopy, "/" + bucketName + "/" + _100kbObjectName, conds)
        .then(() => {
          done(new Error("CopyObject should have failed."))
        })
        .catch(() => done())
    })

    step(`statObject(bucketName, objectName, cb)_bucketName:${bucketName}, objectName:${_100kbObjectNameCopy}_`, done => {
      client.statObject(bucketName, _100kbObjectNameCopy, (e, stat) => {
        if (e) return done(e)
        if (stat.size !== _100kb.length) return done(new Error('size mismatch'))
        done()
      })
    })

    step(`removeObject(bucketName, objectName, cb)_bucketName:${bucketName}, objectName:${_100kbObjectNameCopy}_`, done => {
      async.map([_100kbObjectName, _100kbObjectNameCopy], (objectName, cb) => client.removeObject(bucketName, objectName, cb), done)
    })

  })

  describe('listIncompleteUploads removeIncompleteUpload', () => {
    step(`initiateNewMultipartUpload(bucketName, objectName, metaData, cb)_bucketName:${bucketName}, objectName:${_65mbObjectName}, metaData:${metaData}`, done => {
      client.initiateNewMultipartUpload(bucketName, _65mbObjectName, metaData, done)
    })
    step(`listIncompleteUploads(bucketName, prefix, recursive)_bucketName:${bucketName}, prefix:${_65mbObjectName}, recursive: true_`, function(done) {
      // MinIO's ListIncompleteUploads returns an empty list, so skip this on non-AWS.
      // See: https://github.com/minio/minio/commit/75c43bfb6c4a2ace
      if (!client.host.includes('s3.amazonaws.com')) {
        this.skip()
      }

      var found = false
      client.listIncompleteUploads(bucketName, _65mbObjectName, true)
        .on('error', e => done(e))
        .on('data', data => {
          if (data.key === _65mbObjectName) found = true
        })
        .on('end', () => {
          if (found) return done()
          done(new Error(`${_65mbObjectName} not found during listIncompleteUploads`))
        })
    })
    step(`listIncompleteUploads(bucketName, prefix, recursive)_bucketName:${bucketName}, recursive: true_`, function(done) {
      // MinIO's ListIncompleteUploads returns an empty list, so skip this on non-AWS.
      // See: https://github.com/minio/minio/commit/75c43bfb6c4a2ace
      if (!client.host.includes('s3.amazonaws.com')) {
        this.skip()
      }

      var found = false
      client.listIncompleteUploads(bucketName, "", true)
        .on('error', e => done(e))
        .on('data', data => {
          if (data.key === _65mbObjectName) found = true
        })
        .on('end', () => {
          if (found) return done()
          done(new Error(`${_65mbObjectName} not found during listIncompleteUploads`))
        })
    })
    step(`removeIncompleteUploads(bucketName, prefix)_bucketName:${bucketName}, prefix:${_65mbObjectName}_`, done => {
      client.removeIncompleteUpload(bucketName, _65mbObjectName)
        .then(done)
        .catch(done)
    })
  })

  describe('fPutObject fGetObject', function() {
    var tmpFileUpload = `${tmpDir}/${_65mbObjectName}`
    var tmpFileDownload = `${tmpDir}/${_65mbObjectName}.download`

    step(`fPutObject(bucketName, objectName, filePath, callback)_bucketName:${bucketName}, objectName:${_65mbObjectName}, filePath:${tmpFileUpload}_`, done => {
      fs.writeFileSync(tmpFileUpload, _65mb)
      client.fPutObject(bucketName, _65mbObjectName, tmpFileUpload, () => {
        setTimeout(() => {
          if (Object.values(httpAgent.sockets).length === 0) return done()
          done(new Error('http request did not release network socket'))
        }, 0)
      })
    })

    step(`fPutObject(bucketName, objectName, filePath, metaData, callback)_bucketName:${bucketName}, objectName:${_65mbObjectName}, filePath:${tmpFileUpload}, metaData: ${metaData}_`, done => client.fPutObject(bucketName, _65mbObjectName, tmpFileUpload, metaData, done))
    step(`fGetObject(bucketName, objectName, filePath, callback)_bucketName:${bucketName}, objectName:${_65mbObjectName}, filePath:${tmpFileDownload}_`, done => {
      client.fGetObject(bucketName, _65mbObjectName, tmpFileDownload)
        .then(() => {
          var md5sum = crypto.createHash('md5').update(fs.readFileSync(tmpFileDownload)).digest('hex')
          if (md5sum === _65mbmd5) return done()
          return done(new Error('md5sum mismatch'))
        })
        .catch(done)
    })

    step(`removeObject(bucketName, objectName, filePath, callback)_bucketName:${bucketName}, objectName:${_65mbObjectName}_`, done => {
      fs.unlinkSync(tmpFileDownload)
      client.removeObject(bucketName, _65mbObjectName)
        .then(() => done())
        .catch(done)
    })

    step(`fPutObject(bucketName, objectName, filePath, metaData)_bucketName:${bucketName}, objectName:${_65mbObjectName}, filePath:${tmpFileUpload}_`, done => {
      client.fPutObject(bucketName, _65mbObjectName, tmpFileUpload)
        .then(() => done())
        .catch(done)
    })

    step(`fGetObject(bucketName, objectName, filePath)_bucketName:${bucketName}, objectName:${_65mbObjectName}, filePath:${tmpFileDownload}_`, done => {
      client.fGetObject(bucketName, _65mbObjectName, tmpFileDownload)
        .then(() => done())
        .catch(done)
    })

    step(`removeObject(bucketName, objectName, filePath, callback)_bucketName:${bucketName}, objectName:${_65mbObjectName}_`, (done) => {
      fs.unlinkSync(tmpFileUpload)
      fs.unlinkSync(tmpFileDownload)
      client.removeObject(bucketName, _65mbObjectName, done)
    })
  })
  describe('fGetObject-resume', () => {
    var localFile = `${tmpDir}/${_5mbObjectName}`
    var etag = ''
    step(`putObject(bucketName, objectName, stream, metaData, cb)_bucketName:${bucketName}, objectName:${_5mbObjectName}, stream:5mb_`, done => {
      var stream = readableStream(_5mb)
      client.putObject(bucketName, _5mbObjectName, stream, _5mb.length, {})
        .then((resp) => {
          etag = resp
          done()
        })
        .catch(done)
    })
    step(`fGetObject(bucketName, objectName, filePath, callback)_bucketName:${bucketName}, objectName:${_5mbObjectName}, filePath:${localFile}`, done => {
      var bufPart = Buffer.alloc(_100kb.length)
      _5mb.copy(bufPart, 0, 0, _100kb.length)
      var tmpFile = `${tmpDir}/${_5mbObjectName}.${etag}.part.minio`
      // create a partial file
      fs.writeFileSync(tmpFile, bufPart)
      client.fGetObject(bucketName, _5mbObjectName, localFile)
        .then(() => {
          var md5sum = crypto.createHash('md5').update(fs.readFileSync(localFile)).digest('hex')
          if (md5sum === _5mbmd5) return done()
          return done(new Error('md5sum mismatch'))
        })
        .catch(done)
    })
    step(`removeObject(bucketName, objectName, callback)_bucketName:${bucketName}, objectName:${_5mbObjectName}_`, done => {
      fs.unlinkSync(localFile)
      client.removeObject(bucketName, _5mbObjectName, done)
    })
  })

  describe('bucket policy', () => {
    let policy = `{"Version":"2012-10-17","Statement":[{"Action":["s3:GetBucketLocation","s3:ListBucket"],"Effect":"Allow","Principal":{"AWS":["*"]},"Resource":["arn:aws:s3:::${bucketName}"],"Sid":""},{"Action":["s3:GetObject"],"Effect":"Allow","Principal":{"AWS":["*"]},"Resource":["arn:aws:s3:::${bucketName}/*"],"Sid":""}]}`

    step(`setBucketPolicy(bucketName, bucketPolicy, cb)_bucketName:${bucketName}, bucketPolicy:${policy}_`, done => {
      client.setBucketPolicy(bucketName, policy, err => {
        if (err && err.code == 'NotImplemented') return done()
        if (err) return done(err)
        done()
      })
    })

    step(`getBucketPolicy(bucketName, cb)_bucketName:${bucketName}_`, done => {
      client.getBucketPolicy(bucketName, (err, response) => {
        if (err && err.code == 'NotImplemented') return done()
        if (err) return done(err)
        if (!response) {
          return done(new Error(`policy is empty`))
        }
        done()
      })
    })
  })

  describe('presigned operations', () => {
    step(`presignedPutObject(bucketName, objectName, expires, cb)_bucketName:${bucketName}, objectName:${_1byteObjectName}, expires: 1000_`, done => {
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

    step(`presignedPutObject(bucketName, objectName, expires)_bucketName:${bucketName}, objectName:${_1byteObjectName}, expires:-123_`, done => {
      // negative values should trigger an error
      client.presignedPutObject(bucketName, _1byteObjectName, -123)
        .then(() => {
          done(new Error('negative values should trigger an error'))
        })
        .catch(() => done())
    })

    step(`presignedPutObject(bucketName, objectName)_bucketName:${bucketName}, objectName:${_1byteObjectName}_`, done => {
      // Putting the same object should not cause any error
      client.presignedPutObject(bucketName, _1byteObjectName)
        .then(() => done())
        .catch(done)
    })

    step(`presignedGetObject(bucketName, objectName, expires, cb)_bucketName:${bucketName}, objectName:${_1byteObjectName}, expires:1000_`, done => {
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

    step(`presignedUrl(httpMethod, bucketName, objectName, expires, cb)_httpMethod:GET, bucketName:${bucketName}, objectName:${_1byteObjectName}, expires:1000_`, done => {
      client.presignedUrl('GET', bucketName, _1byteObjectName, 1000, (e, presignedUrl) => {
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

    step(`presignedUrl(httpMethod, bucketName, objectName, expires, cb)_httpMethod:GET, bucketName:${bucketName}, objectName:${_1byteObjectName}, expires:86400, requestDate:StartOfDay_`, done => {
      var requestDate = new Date()
      requestDate.setHours(0,0,0,0)
      client.presignedUrl('GET', bucketName, _1byteObjectName, 86400, requestDate, (e, presignedUrl) => {
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

    step(`presignedGetObject(bucketName, objectName, cb)_bucketName:${bucketName}, objectName:${_1byteObjectName}_`, done => {
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

    step(`presignedGetObject(bucketName, objectName, expires)_bucketName:${bucketName}, objectName:this.does.not.exist, expires:2938_`, done => {
      client.presignedGetObject(bucketName, 'this.does.not.exist', 2938)
        .then(assert.fail)
        .catch(() => done())
    })

    step(`presignedGetObject(bucketName, objectName, expires, respHeaders, cb)_bucketName:${bucketName}, objectName:${_1byteObjectName}, expires:1000_`, done => {
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

    step(`presignedGetObject(bucketName, objectName, cb)_bucketName:${bucketName}, objectName:${_1byteObjectName}, expires:86400, requestDate:StartOfDay_`, done => {
      var requestDate = new Date()
      requestDate.setHours(0,0,0,0)
      client.presignedGetObject(bucketName, _1byteObjectName, 86400, {}, requestDate, (e, presignedUrl) => {
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

    step('presignedPostPolicy(postPolicy, cb)_postPolicy:expiresin10days_', done => {
      var policy = client.newPostPolicy()
      policy.setKey(_1byteObjectName)
      policy.setBucket(bucketName)
      var expires = new Date
      expires.setSeconds(24 * 60 * 60 * 10)
      policy.setExpires(expires)

      client.presignedPostPolicy(policy, (e, data) => {
        if (e) return done(e)
        var req = superagent.post(data.postURL)
        _.each(data.formData, (value, key) => req.field(key, value))
        req.attach('file', Buffer.from([_1byte]), 'test')
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

    step(`presignedUrl(httpMethod, bucketName, objectName, expires, reqParams, cb)_httpMethod:GET, bucketName:${bucketName}, expires:1000_`, done => {
      client.presignedUrl('GET', bucketName, '', 1000, {'prefix': 'data', 'max-keys': 1000}, (e, presignedUrl) => {
        if (e) return done(e)
        var transport = http
        var options = _.pick(url.parse(presignedUrl), ['hostname', 'port', 'path', 'protocol'])
        options.method = 'GET'
        options.headers = {
        }
        var str = ''
        if (options.protocol === 'https:') transport = https
        var callback = function (response) {
          if (response.statusCode !== 200) return done(new Error(`error on put : ${response.statusCode}`))
          response.on('error', e => done(e))
          response.on('end', function () {
            if (!str.match(`<Key>${_1byteObjectName}</Key>`)) {
              return done(new Error('Listed object does not match the object in the bucket!'))
            }
            done()
          })
          response.on('data', function (chunk) {
            str += chunk
          })
        }
        var request = transport.request(options, callback)
        request.end()
      })
    })

    step(`presignedUrl(httpMethod, bucketName, objectName, expires, cb)_httpMethod:DELETE, bucketName:${bucketName}, objectName:${_1byteObjectName}, expires:1000_`, done => {
      client.presignedUrl('DELETE', bucketName, _1byteObjectName, 1000, (e, presignedUrl) => {
        if (e) return done(e)
        var transport = http
        var options = _.pick(url.parse(presignedUrl), ['hostname', 'port', 'path', 'protocol'])
        options.method = 'DELETE'
        options.headers = {
        }
        if (options.protocol === 'https:') transport = https
        var request = transport.request(options, (response) => {
          if (response.statusCode !== 204) return done(new Error(`error on put : ${response.statusCode}`))
          response.on('error', e => done(e))
          response.on('end', () => done())
          response.on('data', () => {})
        })
        request.on('error', e => done(e))
        request.end()
      })
    })
  })

  describe('listObjects', function() {
    var listObjectPrefix = 'miniojsPrefix'
    var listObjectsNum = 10
    var objArray = []
    var listArray = []
    var listPrefixArray = []

    step(`putObject(bucketName, objectName, stream, size, metaData, callback)_bucketName:${bucketName}, stream:1b, size:1_Create ${listObjectsNum} objects`, done => {
      _.times(listObjectsNum, i => objArray.push(`${listObjectPrefix}.${i}`))
      objArray = objArray.sort()
      async.mapLimit(
        objArray,
        20,
        (objectName, cb) => client.putObject(bucketName, objectName, readableStream(_1byte), _1byte.length, {}, cb),
        done
      )
    })

    step(`listObjects(bucketName, prefix, recursive)_bucketName:${bucketName}, prefix: miniojsprefix, recursive:true_`, done => {
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

    step('listObjects(bucketName, prefix, recursive)_recursive:true_', done => {
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

    step(`listObjects(bucketName, prefix, recursive)_bucketName:${bucketName}, recursive:false_`, done => {
      listArray = []
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

    step(`listObjectsV2(bucketName, prefix, recursive, startAfter)_bucketName:${bucketName}, recursive:true_`, done => {
      listArray = []
      client.listObjectsV2(bucketName, '', true,'')
        .on('error', done)
        .on('end', () => {
          if (_.isEqual(objArray, listArray)) return done()
          return done(new Error(`listObjects lists ${listArray.length} objects, expected ${listObjectsNum}`))
        })
        .on('data', data => {
          listArray.push(data.name)
        })
    })

    step(`listObjectsV2WithMetadata(bucketName, prefix, recursive, startAfter)_bucketName:${bucketName}, recursive:true_`, done => {
      listArray = []
      client.extensions.listObjectsV2WithMetadata(bucketName, '', true,'')
        .on('error', done)
        .on('end', () => {
          if (_.isEqual(objArray, listArray)) return done()
          return done(new Error(`listObjects lists ${listArray.length} objects, expected ${listObjectsNum}`))
        })
        .on('data', data => {
          listArray.push(data.name)
        })
    })

    step(`removeObject(bucketName, objectName, callback)_bucketName:${bucketName}_Remove ${listObjectsNum} objects`, done => {
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

  describe('removeObjects', function() {
    var listObjectPrefix = 'miniojsPrefix'
    var listObjectsNum = 10
    var objArray = []
    var objectsList = []

    step(`putObject(bucketName, objectName, stream, size, contentType, callback)_bucketName:${bucketName}, stream:1b, size:1_Create ${listObjectsNum} objects`, done => {
      _.times(listObjectsNum, i => objArray.push(`${listObjectPrefix}.${i}`))
      objArray = objArray.sort()
      async.mapLimit(
        objArray,
        20,
        (objectName, cb) => client.putObject(bucketName, objectName, readableStream(_1byte), _1byte.length, '', cb),
        done
      )
    })

    step(`listObjects(bucketName, prefix, recursive)_bucketName:${bucketName}, recursive:false_`, done => {
      client.listObjects(bucketName, listObjectPrefix, false)
        .on('error', done)
        .on('end', () => {
          try {
            client.removeObjects(bucketName, '',function(e) {
              if (e) {
                done()
              }
            })
          } catch (e) {
            if (e.name === "InvalidArgumentError") {
              done()
            }
          }
        })
        .on('data', data => {
          objectsList.push(data.name)
        })
    })

    objectsList = []

    step(`listObjects(bucketName, prefix, recursive)_bucketName:${bucketName}, recursive:false_`, done => {
      client.listObjects(bucketName, listObjectPrefix, false)
        .on('error', done)
        .on('end', () => {
          client.removeObjects(bucketName, objectsList,function(e) {
            if (e) {
              done(e)
            }
            done()
          })
        })
        .on('data', data => {
          objectsList.push(data.name)
        })
    })

    // Non latin characters
    step(`putObject(bucketName, objectName, stream)_bucketName:${bucketName}, objectName:fileΩ, stream:1b`, done => {
      client.putObject(bucketName, 'fileΩ', _1byte)
        .then(() => done())
        .catch(done)
    })
    
    step(`removeObjects with non latin charactes`, done => {
      client.removeObjects(bucketName, ['fileΩ'])
        .then(() => done())
        .catch(done)
    })

  })


  describe('bucket notifications', () => {
    describe('#listenBucketNotification', () => {
      before(function() {
        // listenBucketNotification only works on MinIO, so skip if
        // the host is Amazon.
        if (client.host.includes('s3.amazonaws.com')) {
          this.skip()
        }
      })

      step(`listenBucketNotification(bucketName, prefix, suffix, events)_bucketName:${bucketName}, prefix:photos/, suffix:.jpg, events:bad_`, done => {
        let poller = client.listenBucketNotification(bucketName, 'photos/', '.jpg', ['bad'])
        poller.on('error', error => {
          if (error.code != 'NotImplemented') {
            assert.match(error.message, /A specified event is not supported for notifications./)
            assert.equal(error.code, 'InvalidArgument')
          }
          done()
        })
      })
      step(`listenBucketNotification(bucketName, prefix, suffix, events)_bucketName:${bucketName}, events: s3:ObjectCreated:*_`, done => {
        let poller = client.listenBucketNotification(bucketName, '', '', ['s3:ObjectCreated:*'])
        let records = 0
        let pollerError = null
        poller.on('notification', record => {
          records++

          assert.equal(record.eventName, 's3:ObjectCreated:Put')
          assert.equal(record.s3.bucket.name, bucketName)
          assert.equal(record.s3.object.key, objectName)
        })
        poller.on('error', error => {
          pollerError = error
        })
        setTimeout(() => { // Give it some time for the notification to be setup.
          if (pollerError) {
            if (pollerError.code != 'NotImplemented') {
              done(pollerError)
            } else {
              done()
            }
            return
          }
          client.putObject(bucketName, objectName, 'stringdata', (err) => {
            if (err) return done(err)
            setTimeout(() => { // Give it some time to get the notification.
              poller.stop()
              client.removeObject(bucketName, objectName, err => {
                if (err) return done(err)
                if (!records) return done(new Error('notification not received'))
                done()
              })
            }, 10 * 1000)
          })
        }, 10*1000)
      })

      // This test is very similar to that above, except it does not include
      // Minio.ObjectCreatedAll in the config. Thus, no events should be emitted.
      step(`listenBucketNotification(bucketName, prefix, suffix, events)_bucketName:${bucketName}, events:s3:ObjectRemoved:*`, done => {
        let poller = client.listenBucketNotification(bucketName, '', '', ['s3:ObjectRemoved:*'])
        poller.on('notification', assert.fail)
        poller.on('error', error => {
          if (error.code != 'NotImplemented') {
            done(error)
          }
        })

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
