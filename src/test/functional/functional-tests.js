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

import minio from '../main/minio.js'
import os from 'os'
import stream from 'stream'
import crypto from 'crypto'
import async from 'async'
import _ from 'lodash'
import fs from 'fs'
import http from 'http'
import https from 'https'
import url from 'url'
import superagent from 'superagent'

require('source-map-support').install()

describe('functional tests', function() {
  this.timeout(30*60*1000)
  var client = new minio({
    endPoint: 's3.amazonaws.com',
    accessKey: process.env['ACCESS_KEY'],
    secretKey: process.env['SECRET_KEY']
  })
  var bucketName = 'miniojs-bucket2'
  var objectName = 'miniojsobject'

  var _1byte = new Buffer(1)
  _1byte.fill('a')
  var _1byteObjectName = 'miniojsobject_1byte'

  var _100kb = new Buffer(100*1024)
  _100kb.fill('a')
  var _100kbObjectName = 'miniojsobject_100kb'
  var _100kbObjectBufferName = `${_100kbObjectName}.buffer`
  var _100kbObjectStringName = `${_100kbObjectName}.string`
  var _100kbmd5 = crypto.createHash('md5').update(_100kb).digest('hex')

  var _11mb = new Buffer(11*1024*1024)
  _11mb.fill('a')
  var _11mbObjectName = 'miniojsobject_11mb'
  var _11mbmd5 = crypto.createHash('md5').update(_11mb).digest('hex')

  var _10mb = new Buffer(10*1024*1024)
  _10mb.fill('a')
  var _10mbObjectName = 'miniojsobject_10mb'
  var _10mbmd5 = crypto.createHash('md5').update(_10mb).digest('hex')

  var _5mb = new Buffer(5*1024*1024)
  _5mb.fill('a')
  var _5mbObjectName = 'miniojsobject_5mb'
  var _5mbmd5 = crypto.createHash('md5').update(_5mb).digest('hex')

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
      traceStream = fs.createWriteStream(filePath, {flags: 'a'})
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

  describe('makeBucket with period', () => {
    it('should create bucket in eu-central-1 with period', done => client.makeBucket(`${bucketName}.sec.period`,
                                                                                     'eu-central-1', done))
    it('should delete bucket', done => client.removeBucket(`${bucketName}.sec.period`, done))
  })

  describe('listBuckets', () => {
    it('should list bucket', done => {
      client.listBuckets((e, buckets) => {
        if (e) return done(e)
        if(_.find(buckets, {name : bucketName})) return done()
        done(new Error('bucket not found'))
      })
    })
  })

  describe('bucketExists', () => {
    it('should check if bucket exists', done => client.bucketExists(bucketName, done))
    it('should check if bucket does not exist', done => {
      client.bucketExists(bucketName+'random', (e) => {
        if (e.code === 'NoSuchBucket') return done()
        done(new Error())
      })
    })
  })

  describe('tests for putObject getObject getPartialObject statObject removeObject', function() {
    it('should upload 100KB stream', done => {
      var stream = readableStream(_100kb)
      client.putObject(bucketName, _100kbObjectName, stream, _100kb.length, '', done)
    })

    it('should download 100KB and match content', done => {
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

    it('should upload 100KB Buffer', done => {
      client.putObject(bucketName, _100kbObjectBufferName, _100kb, '', done)
    })

    it('should download 100KB Buffer upload and match content', done => {
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

    it('should upload 100KB string', done => {
      client.putObject(bucketName, _100kbObjectStringName, _100kb.toString(), '', done)
    })

    it('should download 100KB string upload and match content', done => {
      var hash = crypto.createHash('md5')
      client.getObject(bucketName, _100kbObjectStringName, (e, stream) => {
        if (e) return done(e)
        stream.on('data', data => hash.update(data))
        stream.on('error', done)
        stream.on('end', () => {
          if (hash.digest('hex') === _100kbmd5) return done()
          done(new Error('content mismatch'))
        })
      })
    })

    it('should upload 11mb', done => {
      var stream = readableStream(_11mb)
      client.putObject(bucketName, _11mbObjectName, stream, _11mb.length, '', done)
    })

    it('should download 11mb and match content', done => {
      var hash = crypto.createHash('md5')
      client.getObject(bucketName, _11mbObjectName, (e, stream) => {
        if (e) return done(e)
        stream.on('data', data => hash.update(data))
        stream.on('error', done)
        stream.on('end', () => {
          if (hash.digest('hex') === _11mbmd5) return done()
          done(new Error('content mismatch'))
        })
      })
    })

    it('should download partial data (100kb of the 11mb file) and match content', done => {
      var hash = crypto.createHash('md5')
      client.getPartialObject(bucketName, _11mbObjectName, 0, 100*1024, (e, stream) => {
        if (e) return done(e)
        stream.on('data', data => hash.update(data))
        stream.on('error', done)
        stream.on('end', () => {
          if (hash.digest('hex') === _100kbmd5) return done()
          done(new Error('content mismatch'))
        })
      })
    })

    it('should stat object', done => {
      client.statObject(bucketName, _11mbObjectName, (e, stat) => {
        if (e) return done(e)
        if (stat.size !== _11mb.length) return done(new Error('sise mismatch'))
        done()
      })
    })

    it('should remove objects created for test', done => {
      async.map([_100kbObjectName, _100kbObjectBufferName, _100kbObjectStringName, _11mbObjectName], (objectName, cb) => client.removeObject(bucketName, objectName, cb), done)
    })

  })

  describe('listIncompleteUploads removeIncompleteUpload', () => {
    it('should create multipart request', done => {
      var stream = readableStream('')
      client.putObject(bucketName, _11mbObjectName, stream, _11mb.length, '', (e) => {
        if(!e) return done(new Error('Expecing error'))
        done()
      })
    })
    it('should list incomplete upload', done => {
      var found = false
      client.listIncompleteUploads(bucketName, _11mbObjectName, true)
        .on('error', e => done(e))
        .on('data', data => {
          if (data.key === _11mbObjectName) found = true
        })
        .on('end', () => {
          if (found) return done()
          done(new Error(`${_11mbObjectName} not found during listIncompleteUploads`))
        })
    })
    it('should delete incomplete upload', done => {
      client.removeIncompleteUpload(bucketName, _11mbObjectName, done)
    })
  })

  describe('fPutObject fGetObject', function() {
    var tmpFileUpload = `${tmpDir}/${_11mbObjectName}`
    var tmpFileDownload = `${tmpDir}/${_11mbObjectName}.download`

    it(`should create ${tmpFileUpload}`, () => fs.writeFileSync(tmpFileUpload, _11mb))

    it('should upload object using fPutObject', done => client.fPutObject(bucketName, _11mbObjectName, tmpFileUpload, '', done))

    it('should download object using fGetObject', done => client.fGetObject(bucketName, _11mbObjectName, tmpFileDownload, done))

    it('should verify checksum', done => {
      var md5sum = crypto.createHash('md5').update(fs.readFileSync(tmpFileDownload)).digest('hex')
      if (md5sum === _11mbmd5) return done()
      return done(new Error('md5sum mismatch'))
    })

    it('should remove files and objects created', (done) => {
      fs.unlinkSync(tmpFileUpload)
      fs.unlinkSync(tmpFileDownload)
      client.removeObject(bucketName, _11mbObjectName, done)
    })
  })

  describe('putObject (resume)', () => {
    it('should create an incomplete upload', done => {
      var stream = readableStream(_10mb)
      // write just 10mb, so that it errors out and incomplete upload is created
      client.putObject(bucketName, _11mbObjectName, stream, _11mb.length, '', (e, etag) => {
        if (!e) done(new Error('Expecting Error'))
        done()
      })
    })
    it('should confirm the presence of incomplete upload', done => {
      var stream = client.listIncompleteUploads(bucketName, _11mbObjectName, true)
      var result
      stream.on('error', done)
      stream.on('data', data => {
        if (data.key === _11mbObjectName)
          result = data
      })
      stream.on('end', () => {
        if (result) {
          return done()
        }
        done(new Error('Uploaded part not found'))
      })
    })
    it('should resume upload', done => {
      var stream = readableStream(_11mb)
      client.putObject(bucketName, _11mbObjectName, stream, _11mb.length, '', (e, etag) => {
        if (e) return done(e)
        done()
      })
    })
    it('should remove the uploaded object', done => client.removeObject(bucketName, _11mbObjectName, done))
  })

  describe('fPutObject-resume', () => {
    var _11mbTmpFile = `${tmpDir}/${_11mbObjectName}`
    it('should create tmp file', () => fs.writeFileSync(_11mbTmpFile, _11mb))
    it('should create an incomplete upload', done => {
      var stream = readableStream(_10mb)
      // write just 10mb, so that it errors out and incomplete upload is created
      client.putObject(bucketName, _11mbObjectName, stream, _11mb.length, '', (e, etag) => {
        if (!e) done(new Error('Expecting Error'))
        done()
      })
    })
    it('should confirm the presence of incomplete upload', done => {
      var stream = client.listIncompleteUploads(bucketName, _11mbObjectName, true)
      var result
      stream.on('error', done)
      stream.on('data', data => {
        if (data.key === _11mbObjectName)
          result = data
      })
      stream.on('end', () => {
        if (result) {
          return done()
        }
        done(new Error('Uploaded part not found'))
      })
    })
    it('should resume upload', done => client.fPutObject(bucketName, _11mbObjectName, _11mbTmpFile, '', done))
    it('should remove the uploaded object', done => client.removeObject(bucketName, _11mbObjectName, done))
  })

  describe('fGetObject-resume', () => {
    var localFile = `${tmpDir}/${_5mbObjectName}`
    it('should upload object', done => {
      var stream = readableStream(_5mb)
      client.putObject(bucketName, _5mbObjectName, stream, _5mb.length, '' , done)
    })
    it('should simulate a partially downloaded file', () => {
      var tmpFile = `${tmpDir}/${_5mbObjectName}.${_5mbmd5}.part.minio-js`
      // create a partial file
      fs.writeFileSync(tmpFile, _100kb)
    })
    it('should resume the download', done => client.fGetObject(bucketName, _5mbObjectName, localFile, done))
    it('should verify md5sum of the downloaded file', done => {
      var data = fs.readFileSync(localFile)
      var hash = crypto.createHash('md5').update(data).digest('hex')
      if (hash === _5mbmd5) return done()
      done(new Error('md5 of downloaded file does not match'))
    })
    it('should remove tmp files', done => {
      fs.unlinkSync(localFile)
      client.removeObject(bucketName, _5mbObjectName, done)
    })
  })

  describe('presigned operatons', () => {
    it('should upload using presignedUrl', done => {
      client.presignedPutObject(bucketName, _1byteObjectName, 1000, (e, presignedUrl) => {
        if(e) return done(e)
        var transport = http
        var options = _.pick(url.parse(presignedUrl), ['host', 'path', 'protocol'])
        options.method = 'PUT'
        options.headers = {
          'content-length' : _1byte.length
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

    it('should download using presignedUrl', done => {
      client.presignedGetObject(bucketName, _1byteObjectName, 1000, (e, presignedUrl) => {
        if(e) return done(e)
        var transport = http
        var options = _.pick(url.parse(presignedUrl), ['host', 'path', 'protocol'])
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

    it('should upload using presinged POST', done => {
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
        req.field('file', _1byte)
        req.end(function(e, response) {
          if (e) return done(e)
          done()
        })
        req.on('error', e => done(e))
      })
    })

    it('should delete uploaded objects', done => {
      client.removeObject(bucketName, _1byteObjectName, done)
    })
  })

  describe('listObjects', function() {
    var listObjectPrefix = 'miniojsPrefix'
    var listObjectsNum = 10
    var objArray = []
    var listArray = []

    it(`should create ${listObjectsNum} objects`, done => {
      _.times(listObjectsNum, i => objArray.push(`${listObjectPrefix}.${i}`))
      objArray = objArray.sort()
      async.mapLimit(
        objArray,
        20,
        (objectName, cb) => client.putObject(bucketName, objectName, readableStream(_1byte), _1byte.length, '', cb),
        done
      )
    })

    it('should list objects', done => {
      client.listObjects(bucketName, '', true)
        .on('error', done)
        .on('end', () => {
          if (_.isEqual(objArray, listArray)) return done()
          return done(new Error(`listObjects lists ${listArray.length} objects, expected ${listObjectsNum}`))
        })
        .on('data', data => {
          listArray.push(data.name)
        })
    })

    it(`should delete objects`, done => {
      async.mapLimit(
        listArray,
        20,
        (objectName, cb) => client.removeObject(bucketName, objectName, cb),
        done
      )
    })
  })
})

function readableStream(data) {
   var s = new stream.Readable()
   s._read = () => {}
   s.push(data)
   s.push(null)
   return s
}
