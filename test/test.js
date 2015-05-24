require('source-map-support').install();

var assert = require('assert');
var nock = require('nock')

var minio = require('../..');

describe ('Client', function() {
    "use strict";
    var client = minio.getClient({address: 'localhost:9000'})
    describe("service level", function() {
        describe ('#createBucket(bucket, callback)', function() {
            it('should call the callback on success', function(done) {
                nock('http://localhost:8080').put('/bucket').reply(200)
                client.createBucket('bucket', done)
            })
            it('pass an error into the callback on failure', function(done) {
                nock('http://localhost:8080').put('/bucket').reply(400, "<Error><Status>status</Status><Message>message</Message><RequestId>requestid</RequestId><Resource>/bucket</Resource></Error>")
                client.createBucket('bucket', checkError("status", "message", "requestid", "/bucket", done))
            })
        })
    })
    describe("bucket level", function() { })
    describe("object level", function() { })
    describe("helpers", function() { })
    describe("internal helpers", function() { })
})

var checkError = function(status, message, requestid, resource, done) {
    return function(e) {
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
