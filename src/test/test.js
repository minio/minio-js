/*
 * Minimal Object Storage Library, (C) 2016 Minio, Inc.
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

require('source-map-support').install()

var Assert = require('assert')
var Concat = require('concat-stream')
var Http = require('http')
var Nock = require('nock')
var Through = require('through')
var Stream = require('stream')

var Rewire = require('rewire')
var minio = Rewire('../..')

var MockTransport = require('./transport.js')

describe('Client', () => {
    "use strict";

    beforeEach(() => {
        Nock.cleanAll()
    })
    var client = new minio({host: 'localhost', port: 9000, accessKey: "accesskey", secretKey: "secretkey"})
    describe('Authentication', () => {
        describe('not set', () => {
            var transport = new MockTransport()
            var client = new minio({host: 'localhost', port: 9000}, transport)
            it('should not send auth info without keys', (done) => {
                client.transport.addRequest((params) => {
                    Assert.deepEqual(params, {
                        host: 'localhost',
                        port: 9000,
                        path: '/bucket/object',
                        method: 'HEAD'
                    })
                }, 200, {'etag': 'etag', 'content-length': 11, 'last-modified': 'lastmodified'}, null)
                client.statObject('bucket', 'object', (e, r) => {
                    Assert.deepEqual(r, {
                        size: '11',
                        'lastModified': 'lastmodified',
                        etag: 'etag'
                    })
                    done()
                })
            })
        })
        describe('set with access and secret keys', () => {
            it('should not send auth info without keys', (done) => {
                var transport = new MockTransport()
                var client = new minio({
                    host: 'localhost',
                    port: 9000,
                    accessKey: 'accessKey',
                    secretKey: 'secretKey'
                }, transport)
                client.transport.addRequest((params) => {
                    Assert.equal(true, params.headers.authorization !== null)
                    Assert.equal(true, params.headers.authorization.indexOf('accessKey') > -1)
                    Assert.equal(true, params.headers['x-amz-date'] !== null)
                    delete params.headers.authorization
                    delete params.headers['x-amz-date']
                    Assert.deepEqual(params, {
                            host: 'localhost',
                            port: 9000,
                            path: '/bucket/object',
                            method: 'HEAD',
                            headers: {
                                host: 'localhost',
                                'x-amz-content-sha256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
                            }
                        }
                    )
                }, 200, {'etag': 'etag', 'content-length': 11, 'last-modified': 'lastmodified'}, null)
                client.statObject('bucket', 'object', (e, r) => {
                    Assert.deepEqual(r, {
                        size: '11',
                        'lastModified': 'lastmodified',
                        etag: 'etag'
                    })
                    done()
                })
            })
        })
    })

    describe('Bucket API calls', () => {
        describe('#makeBucket(bucket, callback)', () => {
            it('should call the callback on success', (done) => {
                Nock('http://localhost:9000').put('/bucket').reply(200)
                client.makeBucket('bucket', done)
            })
            it('pass an error into the callback on failure', (done) => {
                Nock('http://localhost:9000').put('/bucket').reply(400, generateError('status', 'message', 'requestid', '/bucket'))
                client.makeBucket('bucket', checkError("status", "message", "requestid", "/bucket", done))
            })
        })

        describe("#listBuckets()", ()=> {
            it('should generate a bucket iterator', (done) => {
                Nock('http://localhost:9000').get('/').reply(200, "<ListAllMyBucketsResult xmlns=\"http://doc.s3.amazonaws.com/2006-03-01\"><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner><Buckets><Bucket><Name>bucket</Name><CreationDate>2015-05-05T20:35:51.410Z</CreationDate></Bucket><Bucket><Name>foo</Name><CreationDate>2015-05-05T20:35:47.170Z</CreationDate></Bucket></Buckets></ListAllMyBucketsResult>")
                var stream = client.listBuckets()
                var result = []
                stream.pipe(Through(success, end))

                function success(bucket) {
                    result.push(bucket)
                }

                function end() {
                    Assert.deepEqual(result, [
                        {name: 'bucket', creationDate: "2015-05-05T20:35:51.410Z"},
                        {name: 'foo', creationDate: "2015-05-05T20:35:47.170Z"}
                    ])
                    done()
                }
            })
            it('should pass error to callback', (done) => {
                Nock('http://localhost:9000').get('/').reply(400, generateError('status', 'message', 'requestid', '/'))
                var stream = client.listBuckets()
                stream.pipe(Through(success, end))

                stream.on('error', (e) => {
                    checkError('status', 'message', 'requestid', '/')(e)
                    done()
                })

                function success() {
                }

                function end() {
                }
            })
        })

        describe('#bucketExists(bucket, cb)', () => {
            it('should call callback with no options if successful', (done) => {
                Nock('http://localhost:9000').head('/bucket').reply(200)
                client.bucketExists('bucket', (e) => {
                    Assert.equal(e, null)
                    done()
                })
            })
            it('should pass error to callback', (done) => {
                Nock('http://localhost:9000').head('/bucket').reply(400, generateError('status', 'message', 'requestid', 'resource'))
                client.bucketExists('bucket', checkError('status', 'message', 'requestid', 'resource', (r) => {
                    Assert.equal(r, null)
                    done()
                }))
            })
        })

        describe('#removeBucket(bucket, cb)', () => {
            it('should remove a bucket', (done) => {
                Nock('http://localhost:9000').delete('/bucket').reply(200)
                client.removeBucket('bucket', () => {
                    done()
                })
            })
            it('should pass error to callback', (done) => {
                Nock('http://localhost:9000').head('/bucket').reply(400, generateError('status', 'message', 'requestid', 'resource'))
                client.bucketExists('bucket', checkError('status', 'message', 'requestid', 'resource', (r) => {
                    Assert.equal(r, null)
                    done()
                }))
            })
        })

        describe('#getBucketACL(bucket, cb)', () => {
            it.skip('should return acl', () => {
            })
            it.skip('should pass error to callback', () => {
            })
        })

        describe('#setBucketACL(bucket, acl, cb)', () => {
            it('should set acl', (done) => {
                var transport = new MockTransport()
                var client = new minio({
                    host: 'localhost',
                    port: 9000
                }, transport)
                client.transport.addRequest((params) => {
                    Assert.deepEqual(params, {
                            host: 'localhost',
                            port: 9000,
                            path: '/bucket?acl',
                            method: 'PUT',
                            headers: {
                                'x-amz-acl': 'public'
                            }
                        }
                    )
                }, 200, {'etag': 'etag', 'content-length': 11, 'last-modified': 'lastmodified'}, null)
                client.setBucketACL('bucket', 'public', (e) => {
                    Assert.equal(e, null)
                })
                done()
            })
            it('should pass error to callback', (done) => {
                Nock('http://localhost:9000').put('/bucket?acl').reply(400, generateError('status', 'message', 'requestid', 'resource'))
                client.setBucketACL('bucket', 'public', checkError('status', 'message', 'requestid', 'resource', (r) => {
                    Assert.equal(r, null)
                    done()
                }))
            })
        })

        describe('#dropAllIncompleteUploads(bucket, cb)', () => {
            it('should drop all incomplete multipart uploads', (done) => {
                Nock('http://localhost:9000').get('/golang?uploads&max-uploads=1000').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker>keymarker</NextKeyMarker><NextUploadIdMarker>uploadidmarker</NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncted>true</IsTruncted><Upload><Key>go1.4.2</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Upload><Key>go1.5.0</Key><UploadId>uploadid2</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T15:00:07.759Z</Initiated></Upload><Prefix></Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
                Nock('http://localhost:9000').delete('/golang/go1.4.2?uploadId=uploadid').reply(200)
                Nock('http://localhost:9000').delete('/golang/go1.5.0?uploadId=uploadid2').reply(200)
                Nock('http://localhost:9000').get('/golang?uploads&max-uploads=1000').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker>keymarker</NextKeyMarker><NextUploadIdMarker>uploadidmarker</NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncted>false</IsTruncted><Upload><Key>go1.4.2</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Upload><Key>go1.5.0</Key><UploadId>uploadid2</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T15:00:07.759Z</Initiated></Upload><Prefix></Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
                Nock('http://localhost:9000').delete('/golang/go1.4.2?uploadId=uploadid').reply(200)
                Nock('http://localhost:9000').delete('/golang/go1.5.0?uploadId=uploadid2').reply(200)
                client.dropAllIncompleteUploads('golang', done)
            })
            it.skip('should pass error to callback', () => {
            })
        })
    })

    describe("object level", () => {
        describe('#getObject(bucket, object, callback)', () => {
            it('should return a stream object', (done) => {
                Nock('http://localhost:9000').get('/bucket/object').reply(200, "hello world")
                client.getObject("bucket", "object", (e, r) => {
                    Assert.equal(e, null)
                    r.pipe(Concat(buf => {
                        Assert.equal(buf, "hello world")
                        done()
                    }))
                })
            })
            it('should pass error to callback', (done) => {
                Nock('http://localhost:9000').get('/bucket/object').reply(400, generateError('status', 'message', 'requestid', '/bucket/object'))
                client.getObject("bucket", "object", checkError("status", "message", "requestid", "/bucket/object", (r) => {
                    Assert.equal(r, null)
                    done()
                }))
            })
        })

        describe("#putObject(bucket, object, size, source, callback)", () => {
            describe('with small objects using single put', () => {
                it('should put an object', (done) => {
                    Nock('http://localhost:9000').put('/bucket/object', 'hello world').reply(200)
                    var s = new Stream.Readable()
                    s._read = function () {
                    }
                    s.push('hello world')
                    s.push(null)
                    client.putObject("bucket", "object", '', 11, s, done)
                })
                it('should pass error to callback', (done) => {
                    Nock('http://localhost:9000').put('/bucket/object', 'hello world').reply(400, "<Error><Status>status</Status><Message>message</Message><RequestId>requestid</RequestId><Resource>/bucket/object</Resource></Error>")
                    var s = new Stream.Readable()
                    s._read = function () {
                    }
                    s.push('hello world')
                    s.push(null)
                    client.putObject("bucket", "object", '', 11, s, checkError('status', 'message', 'requestid', '/bucket/object', done))
                })
            })
            describe('with large objects using multipart', () => {
                var uploadBlock = ''
                for (var i = 0; i < 1024; i++) {
                    uploadBlock += 'a'
                }
                it('should put an object', (done) => {
                    Nock('http://localhost:9000').post('/bucket/object?uploads').reply(200, '<?xml version="1.0" encoding="UTF-8"?>\n<InitiateMultipartUploadResult><Bucket>bucket</Bucket><Key>object</Key><UploadId>uploadid</UploadId></InitiateMultipartUploadResult>')
                    Nock('http://localhost:9000').put('/bucket/object?partNumber=1&uploadId=uploadid', (body) => {
                        if (body.length === 5 * 1024 * 1024) {
                            return true
                        }
                        return false
                    }).reply(200, '', {etag: 'etag1'})
                    Nock('http://localhost:9000').put('/bucket/object?partNumber=2&uploadId=uploadid', (body) => {
                        if (body.length === 5 * 1024 * 1024) {
                            return true
                        }
                        return false
                    }).reply(200, '', {etag: 'etag2'})
                    Nock('http://localhost:9000').put('/bucket/object?partNumber=3&uploadId=uploadid', (body) => {
                        if (body.length === 5 * 1024 * 1024) {
                            return true
                        }
                        return false
                    }).reply(200, '', {etag: 'etag3'})
                    Nock('http://localhost:9000').put('/bucket/object?uploadId=uploadid').reply(200, '<?mxl version="1.0" encoding="UTF-8"?><InitiateMultipartUploadResult><Bucket>bucket</Bucket><Key>object</Key><UploadId>uploadid</UploadId></InitiateMultipartUploadResult>')
                    Nock('http://localhost:9000').put('/bucket/object?partNumber=1&uploadId=uploadid', (body) => {
                        if (body.length === 4 * 1024 * 1024) {
                            return true
                        }
                        return false
                    }).reply(200)
                    Nock('http://localhost:9000').post('/bucket/object?uploadId=uploadid').reply(200)
                    var s = new Stream.Readable()
                    s._read = function () {
                    }
                    for (var i = 0; i < 11 * 1024; i++) {
                        s.push(uploadBlock)
                    }
                    s.push(null)
                    client.putObject("bucket", "object", '', 11 * 1024 * 1024, s, done)
                })
                it.skip('should resume an object upload', (done) => {
                })
                it.skip('should abort an object upload when uploaded data does not match', (done) => {
                })
                it.skip('should pass error to callback', (done) => {
                })
            })
        })

        describe("#listObjects()", (done) => {
            it('should iterate without a prefix', (done) => {
                Nock('http://localhost:9000').filteringPath(_ => {
                    return '/bucket'
                }).get('/bucket').reply(200, "<ListBucketResult xmlns=\"http://doc.s3.amazonaws.com/2006-03-01\"><Name>bucket</Name><Prefix></Prefix><Marker></Marker><MaxKeys>1000</MaxKeys><Delimiter></Delimiter><IsTruncated>true</IsTruncated><Contents><Key>key1</Key><LastModified>2015-05-05T02:21:15.716Z</LastModified><ETag>5eb63bbbe01eeed093cb22bb8f5acdc3</ETag><Size>11</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents><Contents><Key>key2</Key><LastModified>2015-05-05T20:36:17.498Z</LastModified><ETag>2a60eaffa7a82804bdc682ce1df6c2d4</ETag><Size>1661</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents></ListBucketResult>")
                Nock('http://localhost:9000').filteringPath(_ => {
                    return '/bucket'
                }).get('/bucket').reply(200, "<ListBucketResult xmlns=\"http://doc.s3.amazonaws.com/2006-03-01\"><Name>bucket</Name><Prefix></Prefix><Marker></Marker><MaxKeys>1000</MaxKeys><Delimiter></Delimiter><IsTruncated>false</IsTruncated><Contents><Key>key3</Key><LastModified>2015-05-05T02:21:15.716Z</LastModified><ETag>5eb63bbbe01eeed093cb22bb8f5acdc3</ETag><Size>11</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents><Contents><Key>key4</Key><LastModified>2015-05-05T20:36:17.498Z</LastModified><ETag>2a60eaffa7a82804bdc682ce1df6c2d4</ETag><Size>1661</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents></ListBucketResult>")
                var stream = client.listObjects('bucket')
                var results = []
                stream.pipe(Through(success, end))
                function success(bucket) {
                    results.push(bucket)
                }

                function end() {
                    Assert.deepEqual(results, [
                        {
                            "etag": "5eb63bbbe01eeed093cb22bb8f5acdc3",
                            "lastModified": "2015-05-05T02:21:15.716Z",
                            "name": "key1",
                            "size": 11
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
            it('should pass error on stream', (done) => {
                Nock('http://localhost:9000').filteringPath(() => {
                    return '/bucket'
                }).get('/bucket').reply(400, generateError('status', 'message', 'requestid', 'resource'))
                var stream = client.listObjects('bucket')
                stream.on('error', (e) => {
                    checkError('status', 'message', 'requestid', 'resource')(e)
                    done()
                })
                stream.pipe(Through(success, end))
                function success() {
                }

                function end() {
                }
            })
            it('should pass error in stream on subsequent error', (done) => {
                Nock('http://localhost:9000').filteringPath(() => {
                    return '/bucket'
                }).get('/bucket').reply(200, "<ListBucketResult xmlns=\"http://doc.s3.amazonaws.com/2006-03-01\"><Name>bucket</Name><Prefix></Prefix><Marker></Marker><MaxKeys>1000</MaxKeys><Delimiter></Delimiter><IsTruncated>true</IsTruncated><Contents><Key>key1</Key><LastModified>2015-05-05T02:21:15.716Z</LastModified><ETag>5eb63bbbe01eeed093cb22bb8f5acdc3</ETag><Size>11</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents><Contents><Key>key2</Key><LastModified>2015-05-05T20:36:17.498Z</LastModified><ETag>2a60eaffa7a82804bdc682ce1df6c2d4</ETag><Size>1661</Size><StorageClass>STANDARD</StorageClass><Owner><ID>minio</ID><DisplayName>minio</DisplayName></Owner></Contents></ListBucketResult>")
                Nock('http://localhost:9000').filteringPath(() => {
                    return '/bucket'
                }).get('/bucket').reply(400, generateError('status', 'message', 'requestid', 'resource'))
                var stream = client.listObjects('bucket')
                stream.on('error', (e) => {
                    checkError('status', 'message', 'requestid', 'resource')(e)
                    done()
                })
                stream.pipe(Through(success, end))
                function success() {
                }

                function end() {
                }
            })
        })

        describe("#statObject(bucket, object, callback)", () => {
            it('should retrieve object metadata', (done) => {
                Nock('http://localhost:9000').head('/bucket/object').reply(200, '', {
                    'ETag': 'etag',
                    'Content-Length': 11,
                    'Last-Modified': 'lastmodified'
                })

                client.statObject('bucket', 'object', (e, r) => {
                    Assert.deepEqual(r, {
                        size: '11',
                        lastModified: 'lastmodified',
                        etag: 'etag'
                    })
                    done()
                })
            })
            it('should pass error to callback', (done) => {
                Nock('http://localhost:9000').head('/bucket/object')
                    .reply(400, generateError('status', 'message', 'requestid', 'resource'))

                client.statObject('bucket', 'object', checkError('status', 'message', 'requestid', 'resource', (r) => {
                    Assert.equal(r, null)
                    done()
                }))
            })
        })

        describe("#removeObject(bucket, object, callback)", () => {
            it('should delete an object', (done) => {
                Nock('http://localhost:9000').delete('/bucket/object').reply(200)
                client.removeObject('bucket', 'object', (e) => {
                    Assert.equal(e, null)
                    done()
                })
            })
            it('should pass error to callback', (done) => {
                Nock('http://localhost:9000').delete('/bucket/object')
                    .reply(400, generateError('status', 'message', 'requestid', 'resource'))
                client.removeObject('bucket', 'object', checkError('status', 'message', 'requestid', 'resource', (r) => {
                    Assert.equal(r, null)
                    done()
                }))
            })
        })

        describe("#dropIncompleteUpload(bucket, object, callback)", () => {
            it('should drop an incomplete upload', (done) => {
                Nock('http://localhost:9000').get('/golang?uploads&max-uploads=1000&prefix=go1.4.2').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker>keymarker</NextKeyMarker><NextUploadIdMarker>uploadmarker</NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>true</IsTruncated><Upload><Key>go1.4.2</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Upload><Key>go1.4.2</Key><UploadId>uploadid2</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T15:00:07.759Z</Initiated></Upload><Upload><Key>go1.5.0</Key><UploadId>uploadid2</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T15:00:07.759Z</Initiated></Upload><Prefix></Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
                Nock('http://localhost:9000').delete('/golang/go1.4.2?uploadId=uploadid').reply(200)
                Nock('http://localhost:9000').delete('/golang/go1.4.2?uploadId=uploadid2').reply(200)
                client.dropIncompleteUpload('golang', 'go1.4.2', done)
            })
            it('should pass error to callback on list failure', (done) => {
                Nock('http://localhost:9000').get('/golang?uploads&max-uploads=1000&prefix=go1.4.2').reply(400, generateError('status', 'message', 'requestid', 'resource'))
                client.dropIncompleteUpload('golang', 'go1.4.2', checkError('status', 'message', 'requestid', 'resource', done))
            })
            it('should pass error to callback on second list failure', (done) => {
                Nock('http://localhost:9000').get('/golang?uploads&max-uploads=1000&prefix=go1.4.2').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker>keymarker</NextKeyMarker><NextUploadIdMarker>uploadmarker</NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>true</IsTruncated><Upload><Key>go1.4.2</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Upload><Key>go1.4.2</Key><UploadId>uploadid2</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T15:00:07.759Z</Initiated></Upload><Prefix></Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
                Nock('http://localhost:9000').delete('/golang/go1.4.2?uploadId=uploadid').reply(200)
                Nock('http://localhost:9000').delete('/golang/go1.4.2?uploadId=uploadid2').reply(200)
                Nock('http://localhost:9000').get('/golang?uploads&key-marker=keymarker&max-uploads=1000&prefix=go1.4.2&upload-id-marker=uploadmarker').reply(400, generateError('status', 'message', 'requestid', 'resource'))
                client.dropIncompleteUpload('golang', 'go1.4.2', checkError('status', 'message', 'requestid', 'resource', done))
            })
            it('should skip errors and continue', (done) => {
                Nock('http://localhost:9000').get('/golang?uploads&max-uploads=1000&prefix=go1.4.2').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker>keymarker</NextKeyMarker><NextUploadIdMarker>uploadmarker</NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>true</IsTruncated><Upload><Key>go1.4.2</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Upload><Key>go1.4.2</Key><UploadId>uploadid2</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T15:00:07.759Z</Initiated></Upload><Prefix></Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
                Nock('http://localhost:9000').delete('/golang/go1.4.2?uploadId=uploadid').reply(400, generateError('status', 'message', 'requestid', 'resource'))
                Nock('http://localhost:9000').delete('/golang/go1.4.2?uploadId=uploadid2').reply(400, generateError('status2', 'message2', 'requestid2', 'resource2'))
                Nock('http://localhost:9000').get('/golang?uploads&key-marker=keymarker&max-uploads=1000&prefix=go1.4.2&upload-id-marker=uploadmarker').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker>keymarker</NextKeyMarker><NextUploadIdMarker>uploadmarker</NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>true</IsTruncated><Upload><Key>go1.4.2</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Upload><Key>go1.4.2</Key><UploadId>uploadid2</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T15:00:07.759Z</Initiated></Upload><Prefix></Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
                client.dropIncompleteUpload('golang', 'go1.4.2', checkError('status', 'message', 'requestid', 'resource', done))
            })
        })
    })

    describe('unexposed functions', () => {
        describe('listMultipartUploads(transport, params, bucket, key, objectMarker, uploadIdMarker, callback', () => {
            var method = minio.__get__('listMultipartUploads')
            var params = {
                host: 'localhost',
                port: 9000
            }
            describe('without a key', () => {
                it('should list uploads', (done) => {
                    Nock('http://localhost:9000').get('/golang?uploads&max-uploads=1000').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker></NextKeyMarker><NextUploadIdMarker></NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>false</IsTruncated><Upload><Key>go1.4.2</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Upload><Key>go1.5.0</Key><UploadId>uploadid2</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T15:00:07.759Z</Initiated></Upload><Prefix></Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
                    method(Http, params, 'golang', null, null, null, (e, result) => {
                        Assert.equal(e, null)
                        Assert.deepEqual(result, {
                            isTruncated: false,
                            uploads: [
                                {bucket: 'golang', key: 'go1.4.2', uploadId: 'uploadid'},
                                {bucket: 'golang', key: 'go1.5.0', uploadId: 'uploadid2'}
                            ],
                            nextJob: null,
                        })
                        done()
                    })
                })
                it('should list uploads with new job', (done) => {
                    Nock('http://localhost:9000').get('/golang?uploads&max-uploads=1000').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker>keymarker</NextKeyMarker><NextUploadIdMarker>uploadmarker</NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>true</IsTruncated><Upload><Key>go1.4.2</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Upload><Key>go1.5.0</Key><UploadId>uploadid2</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T15:00:07.759Z</Initiated></Upload><Prefix></Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
                    method(Http, params, 'golang', null, null, null, (e, result) => {
                        Assert.equal(e, null)
                        Assert.deepEqual(result, {
                            isTruncated: true,
                            uploads: [
                                {bucket: 'golang', key: 'go1.4.2', uploadId: 'uploadid'},
                                {bucket: 'golang', key: 'go1.5.0', uploadId: 'uploadid2'}
                            ],
                            nextJob: {
                                bucket: 'golang',
                                key: null,
                                keyMarker: 'keymarker',
                                uploadIdMarker: 'uploadmarker'
                            },
                        })
                        done()
                    })
                })
                it('should list uploads with markers', (done) => {
                    Nock('http://localhost:9000').get('/golang?uploads&key-marker=keymarker&max-uploads=1000&upload-id-marker=uploadidmarker').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker></NextKeyMarker><NextUploadIdMarker></NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>false</IsTruncated><Upload><Key>go1.4.2</Key><UploadId>uploadid</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Upload><Key>go1.5.0</Key><UploadId>uploadid2</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T15:00:07.759Z</Initiated></Upload><Prefix></Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
                    method(Http, params, 'golang', null, 'keymarker', 'uploadidmarker', (e, result) => {
                        Assert.equal(e, null)
                        Assert.deepEqual(result, {
                            isTruncated: false,
                            uploads: [
                                {bucket: 'golang', key: 'go1.4.2', uploadId: 'uploadid'},
                                {bucket: 'golang', key: 'go1.5.0', uploadId: 'uploadid2'}
                            ],
                            nextJob: null,
                        })
                        done()
                    })
                })
                it('should pass error to callback', (done) => {
                    Nock('http://localhost:9000').get('/golang?uploads&max-uploads=1000').reply(400, generateError('status', 'message', 'requestid', 'resource'))
                    method(Http, params, 'golang', null, null, null, checkError('status', 'message', 'requestid', 'resource', (result) => {
                        Assert.equal(result, null)
                        checkError('status', 'message', 'requestid', 'resource', (r) => {
                            Assert.equal(r, null)
                        })
                        done()
                    }))
                })
            })
            describe('with a key', () => {
                it('should list uploads', (done) => {
                    Nock('http://localhost:9000').get('/golang?uploads&max-uploads=1000&prefix=go1.4.2').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker></NextKeyMarker><NextUploadIdMarker></NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>false</IsTruncated><Upload><Key>go1.4.2</Key><UploadId>lpF5gD3b1bFxPjseZwJSf4FR_3UjP0grnAMy2iRwzXx5Ph0</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T16:34:57.199Z</Initiated></Upload><Upload><Key>go1.4.2</Key><UploadId>0Elr5Z_OhUOdiivZabenC5JOaHCH0ThAdpC0rrLT5ns-pqh</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T16:34:57.199Z</Initiated></Upload><Upload><Key>go1.4.2.linux-amd64.tar.gz</Key><UploadId>vYir4Iyo0-wVnZqxZ7PK6KwNVZktv-5uULHiM-t50bO3_LJ</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Prefix>go1.4.2</Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
                    method(Http, params, 'golang', 'go1.4.2', null, null, (e, result) => {
                        Assert.equal(e, null)
                        Assert.deepEqual(result, {
                            isTruncated: false,
                            uploads: [
                                {
                                    bucket: 'golang',
                                    key: 'go1.4.2',
                                    uploadId: 'lpF5gD3b1bFxPjseZwJSf4FR_3UjP0grnAMy2iRwzXx5Ph0'
                                },
                                {
                                    bucket: 'golang',
                                    key: 'go1.4.2',
                                    uploadId: '0Elr5Z_OhUOdiivZabenC5JOaHCH0ThAdpC0rrLT5ns-pqh'
                                }
                            ],
                            nextJob: null
                        })
                        done()
                    })
                })
                it('should list uploads with a new job', (done) => {
                    Nock('http://localhost:9000').get('/golang?uploads&max-uploads=1000&prefix=go1.4.2').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker>keymarker</NextKeyMarker><NextUploadIdMarker>uploadidmarker</NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>true</IsTruncated><Upload><Key>go1.4.2</Key><UploadId>lpF5gD3b1bFxPjseZwJSf4FR_3UjP0grnAMy2iRwzXx5Ph0</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T16:34:57.199Z</Initiated></Upload><Upload><Key>go1.4.2</Key><UploadId>0Elr5Z_OhUOdiivZabenC5JOaHCH0ThAdpC0rrLT5ns-pqh</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T16:34:57.199Z</Initiated></Upload><Prefix>go1.4.2</Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
                    method(Http, params, 'golang', 'go1.4.2', null, null, (e, result) => {
                        Assert.equal(e, null)
                        Assert.deepEqual(result, {
                            isTruncated: true,
                            uploads: [
                                {
                                    bucket: 'golang',
                                    key: 'go1.4.2',
                                    uploadId: 'lpF5gD3b1bFxPjseZwJSf4FR_3UjP0grnAMy2iRwzXx5Ph0'
                                },
                                {
                                    bucket: 'golang',
                                    key: 'go1.4.2',
                                    uploadId: '0Elr5Z_OhUOdiivZabenC5JOaHCH0ThAdpC0rrLT5ns-pqh'
                                }
                            ],
                            nextJob: {
                                bucket: 'golang',
                                key: 'go1.4.2',
                                keyMarker: 'keymarker',
                                uploadIdMarker: 'uploadidmarker'
                            }
                        })
                        done()
                    })
                })
                it('should list uploads with markers', (done) => {
                    Nock('http://localhost:9000').get('/golang?uploads&key-marker=keymarker&max-uploads=1000&prefix=go1.4.2&upload-id-marker=uploadidmarker').reply(200, '<ListMultipartUploadsResult xmlns="http://doc.s3.amazonaws.com/2006-03-01"><Bucket>golang</Bucket><KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker><NextKeyMarker></NextKeyMarker><NextUploadIdMarker></NextUploadIdMarker><EncodingType></EncodingType><MaxUploads>1000</MaxUploads><IsTruncated>false</IsTruncated><Upload><Key>go1.4.2</Key><UploadId>lpF5gD3b1bFxPjseZwJSf4FR_3UjP0grnAMy2iRwzXx5Ph0</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T16:34:57.199Z</Initiated></Upload><Upload><Key>go1.4.2</Key><UploadId>0Elr5Z_OhUOdiivZabenC5JOaHCH0ThAdpC0rrLT5ns-pqh</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T16:34:57.199Z</Initiated></Upload><Upload><Key>go1.4.2.linux-amd64.tar.gz</Key><UploadId>vYir4Iyo0-wVnZqxZ7PK6KwNVZktv-5uULHiM-t50bO3_LJ</UploadId><Initiator><ID></ID><DisplayName></DisplayName></Initiator><Owner><ID></ID><DisplayName></DisplayName></Owner><StorageClass></StorageClass><Initiated>2015-05-30T14:43:35.349Z</Initiated></Upload><Prefix>go1.4.2</Prefix><Delimiter></Delimiter></ListMultipartUploadsResult>')
                    method(Http, params, 'golang', 'go1.4.2', 'keymarker', 'uploadidmarker', (e, result) => {
                        Assert.equal(e, null)
                        Assert.deepEqual(result, {
                            isTruncated: false,
                            uploads: [
                                {
                                    bucket: 'golang',
                                    key: 'go1.4.2',
                                    uploadId: 'lpF5gD3b1bFxPjseZwJSf4FR_3UjP0grnAMy2iRwzXx5Ph0'
                                },
                                {
                                    bucket: 'golang',
                                    key: 'go1.4.2',
                                    uploadId: '0Elr5Z_OhUOdiivZabenC5JOaHCH0ThAdpC0rrLT5ns-pqh'
                                }
                            ],
                            nextJob: null
                        })
                        done()
                    })
                })
            })
        })
        describe('abortMultipartUpload', () => {
            var method = minio.__get__('abortMultipartUpload')
            var params = {
                host: 'localhost',
                port: 9000
            }
            it('should drop an incomplete upload', (done) => {
                Nock('http://localhost:9000').delete('/bucket/object?uploadId=uploadid').reply(200)
                method(Http, params, 'bucket', 'object', 'uploadid', (e) => {
                    Assert.equal(e, null)
                    done()
                })
            })
            it('should pass error to callback', (done) => {
                Nock('http://localhost:9000').delete('/bucket/object?uploadId=uploadid').reply(200)
                method(Http, params, 'bucket', 'object', 'uploadid', (e) => {
                    Assert.equal(e, null)
                    done()
                })
            })
        })
        describe('#initiateNewMultipartUpload(transport, params, bucket, object, cb)', () => {
            var method = minio.__get__('initiateNewMultipartUpload')
            var params = {
                host: 'localhost',
                port: 9000
            }
            it('should initiate a new multipart upload', (done) => {
                Nock('http://localhost:9000').post('/bucket/object?uploads').reply(200, '<?xml version="1.0" encoding="UTF-8"?>\n<InitiateMultipartUploadResult><Bucket>bucket</Bucket><Key>object</Key><UploadId>uploadid</UploadId></InitiateMultipartUploadResult>')
                method(Http, params, 'bucket', 'object', (e, uploadID) => {
                    Assert.equal(e, null)
                    Assert.equal(uploadID, 'uploadid')
                    done()
                })
            })
            it('should pass error to callback', (done) => {
                Nock('http://localhost:9000').post('/bucket/object?uploads').reply(400, generateError('status', 'message', 'requestid', 'resource'))
                method(Http, params, 'bucket', 'object', checkError('status', 'message', 'requestid', 'resource', done))
            })
        })
        describe('#completeMultipartUpload(transport, params, bucket, object, uploadID, etags cb)', () => {
            var method = minio.__get__('completeMultipartUpload')
            var params = {
                host: 'localhost',
                port: 9000
            }
            var etags = [
                {part: 1, etag: 'etag1'},
                {part: 2, etag: 'etag2'},
                {part: 3, etag: 'etag3'}
            ]
            it('should complete a multipart upload', (done) => {
                Nock('http://localhost:9000').post('/bucket/object?uploadId=uploadid', '<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>etag1</ETag></Part><Part><PartNumber>2</PartNumber><ETag>etag2</ETag></Part><Part><PartNumber>3</PartNumber><ETag>etag3</ETag></Part></CompleteMultipartUpload>').reply(200)
                method(Http, params, 'bucket', 'object', 'uploadid', etags, done)
            })
            it('should pass error to callback', (done) => {
                Nock('http://localhost:9000').post('/bucket/object?uploadId=uploadid').reply(400, generateError('status', 'message', 'requestid', 'resource'))
                method(Http, params, 'bucket', 'object', 'uploadid', etags, checkError('status', 'message', 'requestid', 'resource', done))
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
        Assert.equal(e.status, status)
        Assert.equal(e.message, message)
        Assert.equal(e.requestid, requestid)
        Assert.equal(e.resource, resource)
        if (callback) {
            if (rest.length === 0) {
                callback()
            } else {
                callback(rest)
            }
        } else {
            if (rest.length > 0) {
                Assert.fail('Data returned with no callback registered')
            }
        }
    }
}

var generateError = (status, message, requestid, resource) => {
    return `<Error><Status>${status}</Status><Message>${message}</Message><RequestId>${requestid}</RequestId><Resource>${resource}</Resource></Error>`
}
