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
    describe('Authentication', () => {
        describe('not set', () => {
            var client = new minio({host: 'localhost', port: 9000})
            it('should not sent auth info without keys', (done) => {
                nock('http://localhost:9000').head('/bucket/object').reply(200, '', {
                    'ETag': 'etag',
                    'Content-Length': 11,
                    'Last-Modified': 'lastmodified'
                })
                client.statObject('bucket', 'object', (e, r) => {
                    assert.deepEqual(r, {
                        size: '11',
                        lastModified: 'lastmodified',
                        etag: 'etag'
                    })
                    done()
                })
            })
            it('should not sent auth info without keys', (done) => {
                nock('http://localhost:9000').head('/bucket/object').reply(400, '<Error><Status>status</Status><Message>message</Message><RequestId>requestid</RequestId><Resource>/bucket</Resource></Error>')
                client.statObject('bucket', 'object', (e, r) => {
                    if (!e) {
                        return assert.fail('no error was returned')
                    }
                    done()
                })
            })
        })
        describe('set with access and secret keys', () => {
            it.skip('should send auth info with access keys', (done) => {
            })
            it.skip('should send auth info with signing keys', (done) => {
            })
            it.skip('should prefer access keys over signing keys', (done) => {
            })
        })
    })

    describe('Bucket API calls', () => {
        describe('#makeBucket(bucket, callback)', () => {
            it('should call the callback on success', (done) => {
                nock('http://localhost:9000').put('/bucket').reply(200)
                client.makeBucket('bucket', done)
            })
            it('pass an error into the callback on failure', (done) => {
                nock('http://localhost:9000').put('/bucket').reply(400, "<Error><Status>status</Status><Message>message</Message><RequestId>requestid</RequestId><Resource>/bucket</Resource></Error>")
                client.makeBucket('bucket', checkError("status", "message", "requestid", "/bucket", done))
            })
            it.skip('should set bucket acl properly', (done) => {
            })
            it.skip('should handle already created buckets', (done) => {
            })
            it.skip('should handle buckets with invalid name', (done) => {
            })
        })
        describe("#listBuckets()", ()=> {
            it('should generate a bucket iterator', (done) => {
                nock('http://localhost:9000').get('/').reply(200, "<ListAllMyBucketsResult xmlns=\"http://doc.s3.amazonaws.com/2006-03-01\"><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner><Buckets><Bucket><Name>bucket</Name><CreationDate>2015-05-05T20:35:51.410Z</CreationDate></Bucket><Bucket><Name>foo</Name><CreationDate>2015-05-05T20:35:47.170Z</CreationDate></Bucket></Buckets></ListAllMyBucketsResult>")
                var stream = client.listBuckets()
                var result = []
                stream.pipe(through(success, end))

                function success(bucket) {
                    result.push(bucket)
                }

                function end() {
                    assert.deepEqual(result, [
                        {name: 'bucket', creationDate: "2015-05-05T20:35:51.410Z"},
                        {name: 'foo', creationDate: "2015-05-05T20:35:47.170Z"}
                    ])
                    done()
                }
            })
            it.skip('should handle access denied', (done) => {
            })
        })
        describe.skip('#bucketExists(bucket, cb)', () => {
        })
        describe.skip('#deleteBucket(bucket, cb)', () => {
        })
        describe.skip('#getBucketACL(bucket, cb)', () => {
        })
        describe.skip('#setBucketACL(bucket, acl, cb)', () => {
        })
        describe.skip('#dropAllIncompleteUploads(bucket, acl, cb)', () => {
        })


        describe.skip("setBucketAcl", () => {
            it.skip('set a bucket acl', (done) => {
            })
            it.skip('should handle access denied', (done) => {
            })
            it.skip('should handle bucket does not exist', (done) => {
            })
            it.skip('invalid bucket name', (done) => {
            })
        })

        describe.skip("#getBucketMetadata(bucket, object, callback)", () => {
            it.skip('should retrieve bucket metadata', (done) => {
            })
            it.skip('should handle access denied', (done) => {
            })
            it.skip('should handle bucket does not exist', (done) => {
            })
            it.skip('invalid bucket name', (done) => {
            })
        })
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
            it.skip('should handle bucket access denied', (done) => {
            })
            it.skip('should handle bucket does not exist', (done) => {
            })
            it.skip('invalid bucket name', (done) => {
            })
            it.skip('should handle object access denied', (done) => {
            })
            it.skip('should handle object does not exist', (done) => {
            })
            it.skip('invalid object name', (done) => {
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
            it.skip('should handle bucket access denied', (done) => {
            })
            it.skip('should handle bucket does not exist', (done) => {
            })
            it.skip('invalid bucket name', (done) => {
            })
            it.skip('should handle object access denied', (done) => {
            })
            it.skip('should handle object does not exist', (done) => {
            })
            it.skip('invalid object name', (done) => {
            })
        })

        describe("#listObjects()", (done) => {
            it('should iterate without a prefix', (done) => {
                nock('http://localhost:9000').filteringPath(path => {
                    return '/bucket'
                }).get('/bucket').reply(200, "<ListBucketResult xmlns=\"http://doc.s3.amazonaws.com/2006-03-01\"><Name>bucket</Name><Prefix></Prefix><Marker></Marker><MaxKeys>1000</MaxKeys><Delimiter></Delimiter><IsTruncated>true</IsTruncated><Contents><Key>key1</Key><LastModified>2015-05-05T02:21:15.716Z</LastModified><ETag>5eb63bbbe01eeed093cb22bb8f5acdc3</ETag><Size>11</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents><Contents><Key>key2</Key><LastModified>2015-05-05T20:36:17.498Z</LastModified><ETag>2a60eaffa7a82804bdc682ce1df6c2d4</ETag><Size>1661</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents></ListBucketResult>")
                nock('http://localhost:9000').filteringPath(path => {
                    return '/bucket'
                }).get('/bucket').reply(200, "<ListBucketResult xmlns=\"http://doc.s3.amazonaws.com/2006-03-01\"><Name>bucket</Name><Prefix></Prefix><Marker></Marker><MaxKeys>1000</MaxKeys><Delimiter></Delimiter><IsTruncated>false</IsTruncated><Contents><Key>key3</Key><LastModified>2015-05-05T02:21:15.716Z</LastModified><ETag>5eb63bbbe01eeed093cb22bb8f5acdc3</ETag><Size>11</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents><Contents><Key>key4</Key><LastModified>2015-05-05T20:36:17.498Z</LastModified><ETag>2a60eaffa7a82804bdc682ce1df6c2d4</ETag><Size>1661</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents></ListBucketResult>")
                var stream = client.listObjects('bucket')
                var results = []
                stream.pipe(through(success, end))
                function success(bucket) {
                    results.push(bucket)
                }

                function end() {
                    assert.deepEqual(results, [
                        {
                            "etag": "5eb63bbbe01eeed093cb22bb8f5acdc3",
                            "lastModified": "2015-05-05T02:21:15.716Z",
                            "name": "key1",
                            "size": 11,
                        },
                        {
                            "etag": "2a60eaffa7a82804bdc682ce1df6c2d4",
                            "lastModified": "2015-05-05T20:36:17.498Z",
                            "name": "key2",
                            "size": 1661
                        },
                        {
                            "etag": "5eb63bbbe01eeed093cb22bb8f5acdc3",
                            "lastModified": "2015-05-05T02:21:15.716Z",
                            "name": "key3",
                            "size": 11
                        },
                        {
                            "etag": "2a60eaffa7a82804bdc682ce1df6c2d4",
                            "lastModified": "2015-05-05T20:36:17.498Z",
                            "name": "key4",
                            "size": 1661
                        }
                    ])
                    done()
                }
            })
            it.skip('should handle access denied', (done) => {
            })
            it.skip('should handle bucket does not exist', (done) => {
            })
            it.skip('invalid bucket name', (done) => {
            })
        })

        describe("#statObject(bucket, object, callback)", () => {
            it('should retrieve object metadata', (done) => {
                nock('http://localhost:9000').head('/bucket/object').reply(200, '', {
                    'ETag': 'etag',
                    'Content-Length': 11,
                    'Last-Modified': 'lastmodified'
                })

                client.statObject('bucket', 'object', (e, r) => {
                    assert.deepEqual(r, {
                        size: '11',
                        lastModified: 'lastmodified',
                        etag: 'etag'
                    })
                    done()
                })
            })
            it.skip('should handle bucket access denied', (done) => {
            })
            it.skip('should handle bucket does not exist', (done) => {
            })
            it.skip('invalid bucket name', (done) => {
            })
            it.skip('should handle object access denied', (done) => {
            })
            it.skip('should handle object does not exist', (done) => {
            })
            it.skip('invalid object name', (done) => {
            })
        })
        describe.skip("#removeObject(bucket, object, callback)", () => {
            it.skip('should delete an object', (done) => {
            })
            it.skip('should handle bucket access denied', (done) => {
            })
            it.skip('should handle bucket does not exist', (done) => {
            })
            it.skip('invalid bucket name', (done) => {
            })
            it.skip('should handle object access denied', (done) => {
            })
            it.skip('should handle object does not exist', (done) => {
            })
            it.skip('invalid object name', (done) => {
            })
        })
        describe.skip("#dropIncompleteUpload(bucket, object, callback)", () => {
            it.skip('should delete an object', (done) => {
            })
            it.skip('should handle bucket access denied', (done) => {
            })
            it.skip('should handle bucket does not exist', (done) => {
            })
            it.skip('invalid bucket name', (done) => {
            })
            it.skip('should handle object access denied', (done) => {
            })
            it.skip('should handle object does not exist', (done) => {
            })
            it.skip('invalid object name', (done) => {
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
