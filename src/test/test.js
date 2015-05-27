/*
 * Minimal Object Storage Library, (C) 2015 Minio, Inc.
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

require('source-map-support').install();

var assert = require('assert');
var concat = require('concat-stream')
var nock = require('nock')
var through = require('through')
var stream = require('stream')

var minio = require('../..');

describe('Client', () => {
    "use strict";
    var client = new minio({host: 'localhost', port: 9000, accessKey: "accesskey", secretKey: "secretkey"})
    describe("service level", () => {
        describe('#createBucket(bucket, callback)', () => {
            it('should call the callback on success', (done) => {
                nock('http://localhost:9000').put('/bucket').reply(200)
                client.createBucket('bucket', done)
            })
            it('pass an error into the callback on failure', (done) => {
                nock('http://localhost:9000').put('/bucket').reply(400, "<Error><Status>status</Status><Message>message</Message><RequestId>requestid</RequestId><Resource>/bucket</Resource></Error>")
                client.createBucket('bucket', checkError("status", "message", "requestid", "/bucket", done))
            })
        })
    })

    describe("bucket level", () => {
    })
    describe("object level", () => {
        describe('#getObject(bucket, object, callback)', () => {
            it('should return a stream object', (done) => {
                nock('http://localhost:9000').get('/bucket/object').reply(200, "hello world")
                client.getObject("bucket", "object", (e, r) => {
                    assert.equal(e, null)
                    r.pipe(concat(buf => {
                        assert.equal(buf, "hello world")
                        done()
                    }))
                })
            })
            it('should pass error to callback', (done) => {
                nock('http://localhost:9000').get('/bucket/object').reply(400, "<Error><Status>status</Status><Message>message</Message><RequestId>requestid</RequestId><Resource>/bucket/object</Resource></Error>")
                client.getObject("bucket", "object", checkError("status", "message", "requestid", "/bucket/object", (r) => {
                    assert.equal(r, null)
                    done()
                }))
            })
        })
        describe("#putObject(bucket, object, size, source, callback)", () => {
            it('should put an object', (done) => {
                nock('http://localhost:9000').put('/bucket/object', 'hello world').reply(200)
                var s = new stream.Readable()
                s._read = function () {
                }
                s.push('hello world')
                s.push(null)
                client.putObject("bucket", "object", '', 11, s, done)
            })
            it('should report failures properly', (done) => {
                nock('http://localhost:9000').put('/bucket/object', 'hello world').reply(400, "<Error><Status>status</Status><Message>message</Message><RequestId>requestid</RequestId><Resource>/bucket/object</Resource></Error>")
                var s = new stream.Readable()
                s._read = function () {
                }
                s.push('hello world')
                s.push(null)
                client.putObject("bucket", "object", '', 11, s, checkError('status', 'message', 'requestid', '/bucket/object', done))
            })
        })
        describe("#listBuckets()", ()=> {
            it('should generate a bucket iterator', (done) => {
                nock('http://localhost:9000').get('/').reply(200, "<ListAllMyBucketsResult xmlns=\"http://doc.s3.amazonaws.com/2006-03-01\"><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner><Buckets><Bucket><Name>bucket</Name><CreationDate>2015-05-05T20:35:51.410Z</CreationDate></Bucket><Bucket><Name>foo</Name><CreationDate>2015-05-05T20:35:47.170Z</CreationDate></Bucket></Buckets></ListAllMyBucketsResult>")
                client.listBuckets((e, r) => {
                    assert.equal(r[0].name ,'bucket')
                    assert.equal(r[1].name ,'foo')
                    done()
                })
            })
        })
        describe("#listObjects(prefix)", (done) => {
            it('should iterate with prefix', (done) => {
                nock('http://localhost:9000').get('/').reply(200, "")
                nock('http://localhost:9000').get('/').reply(200, "")
                var stream = client.listObjects()
                stream.pipe(through(success, end))
                var results = []
                function success(bucket) {
                    results.push(bucket)
                }
                function end() {
                    assert.deepEqual(results, [
                        { name: 'object1' },
                        { name: 'object2' },
                        { name: 'object3' }
                    ])
                    done()
                }
            })
        })
    })
})

var checkError = (status, message, requestid, resource, callback) => {
    return (e, ...rest) => {
        "use strict";
        if (e === null) {
            callback('expected error, received success')
        }
        assert.equal(e.status, status)
        assert.equal(e.message, message)
        assert.equal(e.requestid, requestid)
        assert.equal(e.resource, resource)
        if (rest.length === 0) {
            callback()
        } else {
            callback(rest)
        }
    }
}
