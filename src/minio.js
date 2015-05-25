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

var http = require('http')
var parseXml = require('xml-parser')
var stream = require('stream')
var through = require('through')
var xml = require('xml')
var PassThrough = require('stream').PassThrough

class Client {
    constructor(address) {
        "use strict"
        this.transport = http
        this.address = address
    }
    createBucket(bucket, callback) {
        "use strict"

        var req = this.transport.request({
            host: 'localhost',
            port: 8080,
            method: 'PUT',
            path: `/${bucket}`
        }, response => {
            if(response.statusCode !== 200) {
                this.parseError(response, callback)
            } else {
                response.on('data', chunk => {
                    // do nothing, not expecting any output
                })
                response.on('end', () => {
                    callback()
                })
            }
        })

        req.on('error', e => {
            callback(e)
        })

        req.end()
    }

    getObject(bucket, object, callback) {
        "use strict";
        var req = http.request({
            host: 'localhost',
            port: 8080,
            path: `/${bucket}/${object}`
        }, (response) => {
            if(response.statusCode !== 200){
                return this.parseError(response, callback)
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

    setTransport(transport) {
        "use strict"
        this.transport = transport
    }

    parseError(response, callback) {
        "use strict";
        var errorXml = "";
        response.on('data', chunk => {
            errorXml = errorXml + chunk.toString()
        })
        response.on('end', () => {
            var parsedXml = parseXml(errorXml)
            var e = {}
            parsedXml.root.children.forEach(element => {
                if(element.name === 'Status') {
                    e.status = element.content
                } else if(element.name === 'Message') {
                    e.message = element.content
                } else if(element.name === 'RequestId') {
                    e.requestid = element.content
                } else if(element.name === 'Resource') {
                    e.resource = element.content
                }
            })
            callback(e)
        })
    }

    static getClient(params) {
        "use strict"
        return new Client(params.address)
    }
}
var inst = Client
module.exports = inst
