require('source-map-support').install();

var assert = require('assert');
var nock = require('nock')

var minio = require('../..');

describe ('Client', function() {
    "use strict";
    var client = minio.getClient({address: 'localhost:9000'})
    client.setTransport(nock)
    describe ('#createBucket(bucket, callback)', function() {
        it('should call the callback on success', function(done) {
            client.createBucket('bucket', done)
        })
        it('should call the callback on success', function(done) {
            client.createBucket('bucket', done)
        })
    })
})
