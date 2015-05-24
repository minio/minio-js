require('source-map-support').install();

var assert = require('assert');
var minio = require('../..');

describe('Object Storage Client', function () {
        "use strict";
        describe("#getClient()", function () {
            it('should return a client', function () {
                var client = minio.getClient();
                assert.equal('hello', client);
            })
            it('should return index when the value is not present', function () {
                assert.equal(0, [2, 3, 4].indexOf(2))
            })
        })
    }
)
