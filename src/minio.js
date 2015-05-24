var http = require('http')

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
        }, function(response) {
            if(response.statusCode !== 200) {
                return callback('e')
            }
            response.on('data', function(chunk) {
                console.log(chunk)
            })
            response.on('end', function() {
                callback()
            })
        })

        req.on('error', function(e) {
            callback(e)
        })

        req.end()
    }

    setTransport(transport) {
        "use strict"
        this.transport = transport
    }

    static getClient(params) {
        "use strict"
        return new Client(params.address)
    }
}
var inst = Client
module.exports = inst
