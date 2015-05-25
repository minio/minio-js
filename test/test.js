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
    var client = minio.getClient({address: 'localhost:9000'})
    describe("service level", () => {
        describe('#createBucket(bucket, callback)', () => {
            it('should call the callback on success', (done) => {
                nock('http://localhost:8080').put('/bucket').reply(200)
                client.createBucket('bucket', done)
            })
            it('pass an error into the callback on failure', (done) => {
                nock('http://localhost:8080').put('/bucket').reply(400, "<Error><Status>status</Status><Message>message</Message><RequestId>requestid</RequestId><Resource>/bucket</Resource></Error>")
                client.createBucket('bucket', checkError("status", "message", "requestid", "/bucket", done))
            })
        })
    })

    describe("bucket level", () => {
    })
    describe("object level", () => {
        describe('#getObject(bucket, object, callback)', () => {
            it('should return a stream object', (done) => {
                nock('http://localhost:8080').get('/bucket/object').reply(200, "hello world")
                client.getObject("bucket", "object", (e, r) => {
                    assert.equal(e, null)
                    r.pipe(concat(buf => {
                        assert.equal(buf, "hello world")
                        done()
                    }))
                })
            })
            it('should pass error to callback', (done) => {
                nock('http://localhost:8080').get('/bucket/object').reply(400, "<Error><Status>status</Status><Message>message</Message><RequestId>requestid</RequestId><Resource>/bucket</Resource></Error>")
                client.getObject("bucket", "object", checkError("status", "message", "requestid", "/bucket", (r) => {
                    assert.equal(r, null)
                    done()
                }))
            })
        })
        describe("putObject(bucket, object, source, callback)", () => {
            it('should put an object', (done) => {
                nock('http://localhost:8080').put('/bucket/object').reply(200)
                var s = new stream.Readable()
                s._read = function() {}
                s.push('hello world')
                s.push(null)
                client.putObject("bucket", "object", s, done)
            })
        })
    })
    describe("helpers", () => {
    })
    describe("internal helpers", () => {
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
