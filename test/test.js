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
var nock = require('nock')

var minio = require('../..');

describe ('Client', () => {
    console.log('weee')
    "use strict";
    var client = minio.getClient({address: 'localhost:9000'})
    describe("service level", () => {
        describe ('#createBucket(bucket, callback)', () =>  {
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
    describe("bucket level", () =>{ })
    describe("object level", () => { })
    describe("helpers", () => { })
    describe("internal helpers", () => { })
})

var checkError = (status, message, requestid, resource, done) => {
    return (e) => {
        "use strict";
        if(e === null) {
            done('expected error, received success')
        }
        assert.equal(e.status, status)
        assert.equal(e.message, message)
        assert.equal(e.requestid, requestid)
        assert.equal(e.resource, resource)
        done()
    }
}
