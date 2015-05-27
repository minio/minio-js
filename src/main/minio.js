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

var CombinedStream = require('combined-stream') // use MultiStream unless you need lazy append after stream created
var Concat = require('concat-stream')
var Crypto = require('crypto')
var Http = require('http')
var Moment = require('moment')
var ParseXml = require('xml-parser')
var Q = require('q')
var Stream = require('stream')
var Through = require('through')
var Xml = require('xml')
var ParseString = require('xml2js').parseString

require("babel-core/polyfill");

class Client {
    constructor(params) {
        "use strict"
        this.transport = Http
        this.params = params
    }

    // SERIVCE LEVEL CALLS

    createBucket(bucket, callback) {
        "use strict"

        var requestParams = {
            host: this.params.host,
            port: this.params.port,
            method: 'PUT',
            path: `/${bucket}`
        }

        signV4(requestParams, '', this.params.accessKey, this.params.secretKey)

        var req = this.transport.request(requestParams, response => {
            if (response.statusCode !== 200) {
                parseError(response, callback)
            } else {
                response.pipe(Through(null, end))
            }
            function end() {
                callback()
            }
        })

        req.on('error', e => {
            callback(e)
        })

        req.end()
    }

    generatorExample() {
        var iter = {}
        iter[Symbol.iterator] = function* () {
            "use strict";
            for (var i = 1; i <= 100; i++) {
                yield i
            }
        }
        return iter
    }

    listBuckets(callback) {
        var requestParams = {
            host: this.params.host,
            port: this.params.port,
            path: '/',
            method: 'GET'
        }

        signV4(requestParams, '', this.params.accessKey, this.params.secretKey)

        var req = Http.request(requestParams, (response) => {
            if (response.statusCode !== 200) {
                callback(parseError(response, callback))
            }
            response.pipe(Concat(errorXml => {
                "use strict";
                var parsedXml = ParseXml(errorXml.toString())
                var result = []
                parsedXml.root.children.forEach(element => {
                    "use strict";
                    if(element.name === 'Buckets') {
                        element.children.forEach(bucketListing => {
                            var bucket = {}
                            bucketListing.children.forEach( prop => {
                                switch(prop.name) {
                                    case "Name":
                                        bucket.name = prop.content
                                        break
                                    case "CreationDate":
                                        bucket.creationDate = prop.content
                                        break
                                }
                            })
                            result.push(bucket)
                        })
                    }
                })
                result.sort()
                callback(null, result)
            }))
        })
        req.end()
    }

    getObject(bucket, object, callback) {
        "use strict";

        var requestParams = {
            host: this.params.host,
            port: this.params.port,
            path: `/${bucket}/${object}`,
            method: 'GET',
        }

        signV4(requestParams, '', this.params.accessKey, this.params.secretKey)

        var req = Http.request(requestParams, (response) => {
            if (response.statusCode !== 200) {
                return parseError(response, callback)
                callback('error')
            }
            callback(null, response.pipe(Through(write, end)))
            function write(chunk) {
                this.queue(chunk)
            }

            function end() {
                this.queue(null)
            }
        })
        req.end()
    }

    putObject(bucket, object, contentType, size, r, callback) {
        "use strict";

        if (contentType == null || contentType == '') {
            contentType = 'aplication/octet-stream'
        }

        var requestParams = {
            host: this.params.host,
            port: this.params.port,
            path: `/${bucket}/${object}`,
            method: 'PUT',
            headers: {
                "Content-Length": size,
                "Content-Type": contentType
            }
        }

        signV4(requestParams, '', this.params.accessKey, this.params.secretKey)

        var request = Http.request(requestParams, (response) => {
            if (response.statusCode !== 200) {
                return parseError(response, callback)
            }
            response.pipe(Through(null, end))
            function end() {
                callback()
            }
        })
        r.pipe(request)
    }
}

var parseError = (response, callback) => {
    "use strict";
    response.pipe(Concat(errorXml => {
        var parsedXml = ParseXml(errorXml.toString())
        var e = {}
        parsedXml.root.children.forEach(element => {
            if (element.name === 'Status') {
                e.status = element.content
            } else if (element.name === 'Message') {
                e.message = element.content
            } else if (element.name === 'RequestId') {
                e.requestid = element.content
            } else if (element.name === 'Resource') {
                e.resource = element.content
            }
        })
        callback(e)
    }))
}

var getStringToSign = function (canonicalRequestHash, requestDate, region) {
    "use strict";
    var stringToSign = "AWS4-HMAC-SHA256\n"
    stringToSign += requestDate.format('YYYYMMDDTHHmmSS') + 'Z\n'
    stringToSign += `${requestDate.format('YYYYMMDD')}/${region}/s3/aws4_request\n`
    stringToSign += canonicalRequestHash
    return stringToSign
}
var signV4 = (request, dataShaSum256, accessKey, secretKey) => {
    "use strict";

    if (!accessKey || !secretKey) {
        return
    }

    var requestDate = Moment().utc()

    if (!dataShaSum256) {
        dataShaSum256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    }

    if (!request.headers) {
        request.headers = {}
    }

    var region = getRegion(request.host)

    request.headers['Host'] = request.host
    request.headers['x-amz-date'] = requestDate.format('YYYYMMDDTHHmmSS') + 'Z'
    request.headers['x-amz-content-sha256'] = dataShaSum256

    var canonicalRequestAndSignedHeaders = getCanonicalRequest(request, dataShaSum256, requestDate)
    var canonicalRequest = canonicalRequestAndSignedHeaders[0]
    var signedHeaders = canonicalRequestAndSignedHeaders[1]
    var hash = Crypto.createHash('sha256')
    hash.update(canonicalRequest)
    var canonicalRequestHash = hash.digest('hex')

    var stringToSign = getStringToSign(canonicalRequestHash, requestDate, region)

    var signingKey = getSigningKey(requestDate, region, secretKey)

    var hmac = Crypto.createHmac('sha256', signingKey)

    hmac.update(stringToSign)
    var signedRequest = hmac.digest('hex').toLowerCase().trim()

    var credentials = `${accessKey}/${requestDate.format('YYYYMMDD')}/${region}/s3/aws4_request`

    request.headers['Authorization'] = `AWS4-HMAC-SHA256 Credential=${credentials}, SignedHeaders=${signedHeaders}, Signature=${signedRequest}`

    function getSigningKey(date, region, secretKey) {
        var key = "AWS4" + secretKey
        var dateLine = date.format('YYYYMMDD')

        var hmac1 = Crypto.createHmac('sha256', key).update(dateLine).digest('binary')
        var hmac2 = Crypto.createHmac('sha256', hmac1).update(region).digest('binary')
        var hmac3 = Crypto.createHmac('sha256', hmac2).update("s3").digest('binary')
        return Crypto.createHmac('sha256', hmac3).update("aws4_request").digest('binary')
    }

    function getRegion(host) {
        switch (host) {
            case "s3.amazonaws.com":
                return "us-east-1"
            case "s3-ap-northeast-1.amazonaws.com":
                return "ap-northeast-1"
            case "s3-ap-southeast-1.amazonaws.com":
                return "ap-southeast-1"
            case "s3-ap-southeast-2.amazonaws.com":
                return "ap-southeast-2"
            case "s3-eu-central-1.amazonaws.com":
                return "eu-central-1"
            case "s3-eu-west-1.amazonaws.com":
                return "eu-west-1"
            case "s3-sa-east-1.amazonaws.com":
                return "sa-east-1"
            case "s3.amazonaws.com":
                return "us-east-1"
            case "s3-external-1.amazonaws.com":
                return "us-east-1"
            case "s3-us-west-1.amazonaws.com":
                return "us-west-1"
            case "s3-us-west-2.amazonaws.com":
                return "us-west-2"
            default:
                return "milkyway"
        }
    }

    function getCanonicalRequest(request, dataShaSum1, requestDate) {


        var headerKeys = []
        var headers = []

        for (var key in request.headers) {
            if (request.headers.hasOwnProperty(key)) {
                key = key
                var value = request.headers[key]
                headers.push(`${key.toLowerCase()}:${value}`)
                headerKeys.push(key.toLowerCase())
            }
        }

        headers.sort()
        headerKeys.sort()

        var signedHeaders = ""
        headerKeys.forEach(element => {
            if (signedHeaders) {
                signedHeaders += ';'
            }
            signedHeaders += element
        })


        var canonicalString = ""
        canonicalString += canonicalString + request.method.toUpperCase() + '\n'
        canonicalString += request.path + '\n'
        if (request.query) {
            canonicalString += request.query + '\n'
        } else {
            canonicalString += '\n'
        }
        headers.forEach(element => {
            canonicalString += element + '\n'
        })
        canonicalString += '\n'
        canonicalString += signedHeaders + '\n'
        canonicalString += dataShaSum1
        return [canonicalString, signedHeaders]
    }
}

var inst = Client
module
    .
    exports = inst
