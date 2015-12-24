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
    endPoint: 'https://s3.amazonaws.com',
    accessKey: 'ACCESS-KEY',
    secretKey: 'SECRET-KEY'
  })
  var bucketName = 'peppatest'
  var objectName = 'peppaobject'
  var _1byte = new Buffer(1).fill('a')
  var _1byteObjectName = 'peppaobject_1byte'
  var _100kb = new Buffer(100*1024).fill('a')
  var _100kbObjectName = 'peppaobject_100kb'
  var _100kbmd5 = crypto.createHash('md5').update(_100kb).digest('hex')
  var _11mb = new Buffer(11*1024*1024).fill('a')
  var _11mbObjectName = 'peppaobject_11mb'
  var _11mbmd5 = crypto.createHash('md5').update(_11mb).digest('hex')

  describe('makeBucket', () => {
    it('should create bucket', done => client.makeBucket(bucketName, '', '', done))
  })

  describe('listBuckets', () => {
    it('should list bucket', done => {
      client.listBuckets((e, buckets) => {
        if (e) return done(e)
        if (buckets.filter(bucket => bucket.name === bucketName).length === 1) return done()
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

  describe('tests for setBucketACL getBucketACL', () => {
    it('should set acl to "private"', done => client.setBucketACL(bucketName, 'private', done))
    it('should verify acl as "private"', done => {
      client.getBucketACL(bucketName, (e, acl) => {
        if (e) return done(e)
        if (acl !== 'private') return done(new Error('acl not "private"'))
        done()
      })
    })

    it('should set acl to "public-read"', done => client.setBucketACL(bucketName, 'public-read', done))
    it('should verify acl as "public-read"', done => {
      client.getBucketACL(bucketName, (e, acl) => {
        if (e) return done(e)
        if (acl !== 'public-read') return done(new Error('acl not "public-read"'))
        done()
      })
    })

    it('should set acl to "public-read-write"', done => client.setBucketACL(bucketName, 'public-read-write', done))
    it('should verify acl as "public-read-write"', done => {
      client.getBucketACL(bucketName, (e, acl) => {
        if (e) return done(e)
        if (acl !== 'public-read-write') return done(new Error('acl not "public-read-write"'))
        done()
      })
    })
  })

  describe('tests for putObject getObject getPartialObject statObject removeObject', function() {
    it('should upload 100KB', done => {
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
      async.map([_100kbObjectName, _11mbObjectName], (objectName, cb) => client.removeObject(bucketName, objectName, cb), done)
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
    var tmpFileUpload = `/tmp/${_11mbObjectName}`
    var tmpFileDownload = `/tmp/${_11mbObjectName}.download`

    it(`should create ${tmpFileUpload}`, () => {
      fs.writeFileSync(tmpFileUpload, _11mb)
    })

    it('should upload object using fPutObject', done => {
      client.fPutObject(bucketName, _11mbObjectName, tmpFileUpload, '', done)
    })

    it('should download object using fGetObject', done => {
      client.fGetObject(bucketName, _11mbObjectName, tmpFileDownload, done)
    })

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

  describe('presigned operatons', () => {
    it('should upload using presignedUrl', done => {
      client.presignedPutObject(bucketName, _1byteObjectName, 1000, (e, presignedUrl) => {
        if(e) return done(e)
        var transport = http
        var options = _.pick(url.parse(presignedUrl), ['host', 'path'])
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
        var options = _.pick(url.parse(presignedUrl), ['host', 'path'])
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

      client.presignedPostPolicy(policy, (e, formData) => {
        if (e) return done(e)
        var req = superagent.post(`https://${bucketName}.s3.amazonaws.com`)
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
    var listObjectPrefix = 'peppaPrefix'
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
          return done(new Error(`listObjects lists ${listArray} objects, expected ${listObjectsNum}`))
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
