require('source-map-support').install()

var Concat = require('concat-stream')
var Fs = require('fs')
var Through2 = require('through2')
var Assert = require('assert')
var Stream = require('stream')
var path = require('path')
var credentials = require(path.join(process.env[(process.platform === 'win32') ? 'USERPROFILE' : 'HOME'], 'credentials.json'))
var Minio = require('../../..')

describe('minio', () => {
  var client = new Minio({
    url: 'https://s3-us-west-2.amazonaws.com',
    accessKey: credentials.accesskey,
    secretKey: credentials.secretkey
      // url: 'https://play.minio.io:9000'
  })
  var bucket = 'goroutine-js-integration'
  describe('bucket integration', () => {
    it('should clean up old buckets', (done) => {
      client.bucketExists(bucket, (e) => {
        if (e) {
          return done()
        }
        client.removeBucket(bucket, (e) => {
          done(e)
        })
      })
    })
    it('should create a new bucket', (done) => {
      client.makeBucket(bucket, done)
    })
    it('should fail to create an existing', (done) => {
      client.makeBucket(bucket, done)
    })
    it('should list buckets', (done) => {
      var bucketStream = client.listBuckets()
      var found = false
      var foundError = null
      bucketStream.pipe(Through2.obj(function(chunk, enc, end) {
        if (chunk.name === bucket) {
          found = true
        }
        end()
      }, function(end) {
        end()
        if (foundError) {
          return done(foundError)
        } else if (found === false) {
          return done('bucket not found')
        }
        done()
      }))
      bucketStream.on('error', (e) => {
        foundError = e
      })
    })
    it('should head bucket', (done) => {
      client.bucketExists(bucket, done)
    })
    it('should get acl private', (done) => {
      client.getBucketACL(bucket, (e, r) => {
        Assert.equal(r, 'private')
        done(e)
      })
    })
    it('should set acl authenticated read', (done) => {
      client.setBucketACL(bucket, 'authenticated-read', done)
    })
    it('should get acl authenticated read', (done) => {
      client.getBucketACL(bucket, (e, r) => {
        Assert.equal(r, 'authenticated-read')
        done(e)
      })
    })
    it('should set acl private', (done) => {
      client.setBucketACL(bucket, 'private', done)
    })
    it('should get acl', (done) => {
      client.getBucketACL(bucket, (e, r) => {
        Assert.equal(r, 'private')
        done(e)
      })
    })
  })
  describe('object integration', () => {
    it('get object should return an error on no object', (done) => {
      client.getObject(bucket, 'noobject', (e) => {
        if (!e) {
          done('expecting error')
        }
        done()
      })
    })
    it('should put an object', (done) => {
      var stream = new Stream.Readable()
      stream._read = () => {}
      stream.push('hello')
      stream.push(' ')
      stream.push('world')
      stream.push(null)
      client.putObject(bucket, 'hello/world', '', 11, stream, done)
    })
    it('should get an object', (done) => {
      client.getObject(bucket, 'hello/world', (e, r) => {
        if (e) {
          return done(e)
        }
        r.pipe(Concat((data) => {
          Assert.equal(data, 'hello world')
          done()
        }))
      })
    })
    it('should put a large object', function(done) {
      var file = '11mb'
      var size = 0
      this.timeout(30000)
      Fs.stat(file, function(e) {
        Assert.equal(e, null)
        var fileStream = Fs.createReadStream(file)
        var r = fileStream.pipe(Through2(function(chunk, enc, end) {
          size += chunk.length
          end(null, chunk)
        }, function(end) {
          console.log('amount sent: ' + size)
          end()
        }))
        client.putObject(bucket, 'hello/world2', '', 11 * 1024 * 1024, r, (e) => {
          done(e)
        })
      })
    })
    it('should drop multipart uploads', (done) => {
      client.dropAllIncompleteUploads(bucket, done)
    })
    it('should delete objects', (done) => {
      var objects = client.listObjects(bucket)
      objects.pipe(Through2.obj(function(chunk, enc, end) {
        console.log(chunk)
        client.removeObject(bucket, chunk.name, end)
      }, function(end) {
        end()
        done()
      }))
    })
  })
})
