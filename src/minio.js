var http = require('http')
var xml = require('xml')
var parseXml = require('xml-parser')

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
