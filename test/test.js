require('source-map-support').install();

var assert = require('assert');
var nock = require('nock')

var minio = require('../..');

describe ('Client', function() {
    "use strict";
    var client = minio.getClient({address: 'localhost:9000'})
    describe ('#createBucket(bucket, callback)', function() {
        it('should call the callback on success', function(done) {
            nock('http://localhost:8080').put('/bucket').reply(200)
            client.createBucket('bucket', done)
        })
        it('pass an error into the callback on failure', function(done) {
            nock('http://localhost:8080').put('/bucket').reply(400)
            client.createBucket('bucket', checkError(done))
        })
    })
})

var checkError = function(done) {
    return function(e) {
        "use strict";
        if(e === null) {
            done('expected error, got success')
        }
        done()
    }
}
