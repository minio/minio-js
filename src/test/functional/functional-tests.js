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
import { Client, Policy } from '../main/minio.js'
import * as Minio from '../main/minio.js'
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
import { assert } from 'chai'

import uuid from 'uuid'

require('source-map-support').install()

describe('functional tests', function() {
    this.timeout(30 * 60 * 1000)
    var playConfig = {}
    if (process.env['SERVER_ENDPOINT']) {
        var res = process.env['SERVER_ENDPOINT'].split(":")
        playConfig.endPoint = res[0]
        playConfig.port = parseInt(res[1])
    }
    if (process.env['ACCESS_KEY']) {
        playConfig.accessKey = process.env['ACCESS_KEY']
    }
    if (process.env['SECRET_KEY']) {
        playConfig.secretKey = process.env['SECRET_KEY']
    }
    if (process.env['ENABLE_HTTPS'] == "1") {
        playConfig.secure = true
    } else {
        playConfig.secure = false
    }
    var dataDir = "/mint/data"
    if (process.env['DATA_DIR']) {
        dataDir = process.env['DATA_DIR']
    }
    var client = new Minio.Client(playConfig)
    var usEastConfig = playConfig
    usEastConfig.region = 'us-east-1'
    var clientUsEastRegion = new Minio.Client(usEastConfig)

    var bucketName = uuid.v4()
    var objectName = uuid.v4()

    var _1byte = new Buffer(1)
    _1byte.fill('a')
    var _1byteObjectName = 'miniojsobject_1byte'

    var _100kb = fs.readFileSync(dataDir + "/datafile-100-kB")
    var _100kbObjectName = 'miniojsobject_100kb'
    var _100kbObjectNameCopy = _100kbObjectName + '_copy'

    var _100kbObjectBufferName = `${_100kbObjectName}.buffer`
    var _100kbObjectStringName = `${_100kbObjectName}.string`
    var _100kbmd5 = crypto.createHash('md5').update(_100kb).digest('hex')

    var _6mb = fs.readFileSync(dataDir + "/datafile-6-MB")
    var _6mbObjectName = 'miniojsobject_6mb'
    var _6mbmd5 = crypto.createHash('md5').update(_6mb).digest('hex')

    var _6mbObjectNameCopy = _6mbObjectName + '_copy'

    var _5mb = fs.readFileSync(dataDir + "/datafile-5-MB")
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
            it('should create bucket in eu-central-1 with period', done => client.makeBucket(`${bucketName}.sec.period`,
                'eu-central-1', done))
            it('should delete bucket', done => client.removeBucket(`${bucketName}.sec.period`, done))
        }
    })

    describe('listBuckets', () => {
        it('should list bucket', done => {
            client.listBuckets((e, buckets) => {
                if (e) return done(e)
                if (_.find(buckets, { name: bucketName })) return done()
                done(new Error('bucket not found'))
            })
        })
    })

    describe('makeBucket with region', () => {
        it('should fail', done => {
            try {
                clientUsEastRegion.makeBucket(`${bucketName}.region`, 'us-east-2')
            } catch (e) {
                done()
            }
        })
    })

    describe('makeBucket with region', () => {
        it('should succeed', done => {
            clientUsEastRegion.makeBucket(`${bucketName}.region`, 'us-east-1', done)
        })
        it('should delete bucket', done => {
            clientUsEastRegion.removeBucket(`${bucketName}.region`, done)
        })
    })

    describe('bucketExists', () => {
        it('should check if bucket exists', done => client.bucketExists(bucketName, done))
        it('should check if bucket does not exist', done => {
            client.bucketExists(bucketName + 'random', (e) => {
                if (e.code === 'NoSuchBucket') return done()
                done(new Error())
            })
        })
    })


    describe('removeBucket', () => {
        it('should fail for nonexistent bucket', done => {
            client.removeBucket("nonexistentbucket", (e) => {
                if (e.code === 'NoSuchBucket') return done()
                done(new Error())
            })
        })
    })
    describe('tests for putObject copyObject getObject getPartialObject statObject removeObject', function() {
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

        it('should upload 6mb', done => {
            var stream = readableStream(_6mb)
            client.putObject(bucketName, _6mbObjectName, stream, _6mb.length, '', done)
        })

        it('should download 6mb and match content', done => {
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

        it('should download partial data (100kb of the 6mb file) and match content', done => {
            var hash = crypto.createHash('md5')
            client.getPartialObject(bucketName, _6mbObjectName, 0, 100 * 1024, (e, stream) => {
                if (e) return done(e)
                stream.on('data', data => hash.update(data))
                stream.on('error', done)
                stream.on('end', () => {
                    if (hash.digest('hex') === _100kbmd5) return done()
                    done(new Error('content mismatch'))
                })
            })
        })

        it('should copy object', done => {
            client.copyObject(bucketName, _6mbObjectNameCopy, "/" + bucketName + "/" + _6mbObjectName, (e, data) => {
                if (e) return done(e)
                done()
            })
        })

        it('should stat object', done => {
            client.statObject(bucketName, _6mbObjectName, (e, stat) => {
                if (e) return done(e)
                if (stat.size !== _6mb.length) return done(new Error('size mismatch'))
                done()
            })
        })

        it('should remove objects created for test', done => {
            async.map([_100kbObjectName, _100kbObjectBufferName, _100kbObjectStringName, _6mbObjectName, _6mbObjectNameCopy], (objectName, cb) => client.removeObject(bucketName, objectName, cb), done)
        })

    })

    describe('tests for copyObject statObject', function() {
        it('should upload 100KB Buffer with custom content type', done => {
            client.putObject(bucketName, _100kbObjectName, _100kb, 'custom/content-type', done)
        })

        it('should copy object with no conditions specified', done => {
            client.copyObject(bucketName, _100kbObjectNameCopy, "/" + bucketName + "/" + _100kbObjectName, (e, data) => {
                if (e) return done(e)
                done()
            })
        })

        it('should stat copied object', done => {
            client.statObject(bucketName, _100kbObjectNameCopy, (e, stat) => {
                if (e) return done(e)
                if (stat.size !== _100kb.length) return done(new Error('size mismatch'))
                if (stat.contentType !== 'custom/content-type') return done(new Error('content-type mismatch'))
                done()
            })
        })
        it('should copy object with conditions specified', done => {
            var conds = new Minio.CopyConditions()
            conds.setMatchETagExcept('bd891862ea3e22c93ed53a098218791d')
            client.copyObject(bucketName, _100kbObjectNameCopy, "/" + bucketName + "/" + _100kbObjectName, conds, (e, data) => {
                if (e) return done(e)
                done()
            })
        })

        it('should stat copied object', done => {
            client.statObject(bucketName, _100kbObjectNameCopy, (e, stat) => {
                if (e) return done(e)
                if (stat.size !== _100kb.length) return done(new Error('size mismatch'))
                if (stat.contentType !== 'custom/content-type') return done(new Error('content-type mismatch'))
                done()
            })
        })

        it('should remove objects created for test', done => {
            async.map([_100kbObjectName, _100kbObjectNameCopy], (objectName, cb) => client.removeObject(bucketName, objectName, cb), done)
        })

    })

    describe('listIncompleteUploads removeIncompleteUpload', () => {
        it('should create multipart request', done => {
            client.initiateNewMultipartUpload(bucketName, _6mbObjectName, 'application/octet-stream', done)
        })
        it('should list incomplete upload', done => {
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
        it('should delete incomplete upload', done => {
            client.removeIncompleteUpload(bucketName, _6mbObjectName, done)
        })
    })

    describe('fPutObject fGetObject', function() {
        var tmpFileUpload = `${tmpDir}/${_6mbObjectName}`
        var tmpFileDownload = `${tmpDir}/${_6mbObjectName}.download`

        it(`should create ${tmpFileUpload}`, () => fs.writeFileSync(tmpFileUpload, _6mb))

        it('should upload object using fPutObject', done => client.fPutObject(bucketName, _6mbObjectName, tmpFileUpload, '', done))

        it('should download object using fGetObject', done => client.fGetObject(bucketName, _6mbObjectName, tmpFileDownload, done))

        it('should verify checksum', done => {
            var md5sum = crypto.createHash('md5').update(fs.readFileSync(tmpFileDownload)).digest('hex')
            if (md5sum === _6mbmd5) return done()
            return done(new Error('md5sum mismatch'))
        })

        it('should remove files and objects created', (done) => {
            fs.unlinkSync(tmpFileUpload)
            fs.unlinkSync(tmpFileDownload)
            client.removeObject(bucketName, _6mbObjectName, done)
        })
    })

    describe('fGetObject-resume', () => {
        var localFile = `${tmpDir}/${_5mbObjectName}`
        it('should upload object', done => {
            var stream = readableStream(_5mb)
            client.putObject(bucketName, _5mbObjectName, stream, _5mb.length, '', done)
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

    describe('bucket policy', () => {
        let policies = [Policy.READONLY, Policy.WRITEONLY, Policy.READWRITE]

        // Iterate through the basic policies ensuring it can set and check each of them.
        policies.forEach(policy => {
            it(`should set bucket policy to ${policy}, then verify`, done => {
                client.setBucketPolicy(bucketName, '', policy, err => {
                    if (err) return done(err)

                    // Check using the client.
                    client.getBucketPolicy(bucketName, '', (err, response) => {
                        if (err) return done(err)

                        if (response != policy) {
                            return done(new Error(`policy is incorrect (${response} != ${policy})`))
                        }

                        done()
                    })
                })
            })
        })

        it('should set bucket policy only on a prefix', done => {
            // READONLY also works, as long as it can read.
            let policy = Policy.READWRITE

            // Set the bucket policy on `prefix`, and check to make sure it only
            // returns this bucket policy when asked about `prefix`.
            client.setBucketPolicy(bucketName, 'prefix', policy, err => {
                if (err) return done(err)

                // Check on the prefix.
                client.getBucketPolicy(bucketName, 'prefix', (err, response) => {
                    if (err) return done(err)

                    if (response != policy) {
                        return done(new Error(`policy is incorrect (${response} != ${policy})`))
                    }

                    // Check on a different prefix.
                    client.getBucketPolicy(bucketName, 'wrongprefix', (err, response) => {
                        if (err) return done(err)

                        if (response == policy) {
                            return done(new Error(`policy is incorrect (${response} == ${policy})`))
                        }

                        done()
                    })
                })
            })
        })

        it('should set bucket policy to none, then error', done => {
            client.setBucketPolicy(bucketName, '', Policy.NONE, err => {
                if (err) return done(err)

                // Check using the client — this should error.
                client.getBucketPolicy(bucketName, '', (err, response) => {
                    if (!err) return done(new Error('getBucketPolicy should error'))

                    if (!(/does not have a bucket policy/.test(err.message)) &&
                        !(/bucket policy does not exist/.test(err.message))) {
                        return done(new Error(`error message is incorrect (${err.message})`))
                    }
                    done()
                })
            })
        })
    })

    describe('presigned operations', () => {
        it('should upload using presignedUrl', done => {
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

        it('should download using presignedUrl', done => {
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

        it('should set response headers to expected values during download for presignedUrl', done => {
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
                    response.on('data', (data) => {})
                    done()
                })
                request.on('error', e => done(e))
                request.end()
            })
        })

        it('should upload using presigned POST', done => {
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

        it('should list objects using v2 api', done => {
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

        it(`should remove objects`, done => {
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

            it('should forward error with bad events', done => {
                let poller = client.listenBucketNotification(bucketName, 'photos/', '.jpg', ['bad'])
                poller.on('error', error => {
                    assert.match(error.message, /A specified event is not supported for notifications./)
                    assert.equal(error.code, 'InvalidArgument')

                    done()
                })
            })
            it('should give exactly one event for single action', done => {
                let poller = client.listenBucketNotification(bucketName, '', '', ['s3:ObjectCreated:*'])
                let records = 0
                poller.on('notification', record => {
                    records++

                    assert.equal(record.eventName, 's3:ObjectCreated:Put')
                    assert.equal(record.s3.bucket.name, bucketName)
                    assert.equal(record.s3.object.key, objectName)
                })
                client.putObject(bucketName, objectName, 'stringdata', (err, etag) => {
                    if (err) return done(err)
                        // It polls every five seconds, so wait for two-ish polls, then end.
                    setTimeout(() => {
                        assert.equal(records, 1)
                        poller.stop()
                        client.removeObject(bucketName, objectName, done)
                    })
                }, 11 * 1000)
            })

            // This test is very similar to that above, except it does not include
            // Minio.ObjectCreatedAll in the config. Thus, no events should be emitted.
            it('should give no events for single action', done => {
                let poller = client.listenBucketNotification(bucketName, '', '', ['s3:ObjectRemoved:*'])
                poller.on('notification', record => {
                    assert.fail
                })

                client.putObject(bucketName, objectName, 'stringdata', (err, etag) => {
                    if (err) return done(err)
                        // It polls every five seconds, so wait for two-ish polls, then end.
                    setTimeout(() => {
                        poller.stop()
                            // clean up object now
                        client.removeObject(bucketName, objectName, done)
                    })
                }, 11 * 1000)
            })
        })
    })
})