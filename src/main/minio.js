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

var concat = require('concat-stream')
var http = require('http')
var parseXml = require('xml-parser')
var stream = require('stream')
var through = require('through')
var xml = require('xml')

class Client {
    constructor(params) {
        "use strict"
        this.transport = http
        this.params = params
    }

    createBucket(bucket, callback) {
        "use strict"

        var requestParams = {
            host: this.params.host,
            port: this.params.port,
            method: 'PUT',
            path: `/${bucket}`
        }

        signV4(requestParams)

        var req = this.transport.request(requestParams, response => {
            if (response.statusCode !== 200) {
                parseError(response, callback)
            } else {
                response.pipe(through(null, end))
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

    getObject(bucket, object, callback) {
        "use strict";

        var requestParams = {
            host: this.params.host,
            port: this.params.port,
            path: `/${bucket}/${object}`,
            method: 'GET',
        }

        signV4(requestParams)

        var req = http.request(requestParams, (response) => {
            if (response.statusCode !== 200) {
                return parseError(response, callback)
            }
            callback(null, response.pipe(through(write, end)))
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

        signV4(requestParams)

        var request = http.request(requestParams, (response) => {
            if (response.statusCode !== 200) {
                return parseError(response, callback)
            }
            response.pipe(through(null, end))
            function end() {
                callback()
            }
        })
        r.pipe(request)
    }
}

var parseError = (response, callback) => {
    "use strict";
    response.pipe(concat(errorXml => {
        var parsedXml = parseXml(errorXml.toString())
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

var signV4 = (request, dataShaSum1, accessKey, secretKey) => {
    "use strict";

    var requestDate = new Date()

    if(!dataShaSum1) {
        dataShaSum1 = 'df57d21db20da04d7fa30298dd4488ba3a2b47ca3a489c74750e0f1e7df1b9b7'
    }


    if (!request.headers) {
        request.headers = {}
    }

    request.headers['x-amz-date'] = requestDate.toISOString()
    request.headers['x-amz-content-sha256'] = dataShaSum1


    var canonicalRequest = getCanonicalRequest(request, dataShaSum1, requestDate)

    function getSigningKey(date, region, secretKey) {

    }

    function getCanonicalRequest(request, dataShaSum1, requestDate) {


        var headers = []
        var signedHeaders = ""

        for (var key in request.headers) {
            if (request.headers.hasOwnProperty(key)) {
                key = key.trim().toLocaleLowerCase()
                var value = request.headers[key]
                headers.push(`${key}: ${value}`)
                if(signedHeaders) {
                    signedHeaders += ';'
                }
                signedHeaders += key
            }
        }
        //request.headers.forEach( (value, key) => {
        //})

        headers.sort()

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
    }
}

var inst = Client
module.exports = inst
