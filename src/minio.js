var http = require('http')

class Client {
    constructor(address) {
        "use strict"
        this.transport = http
        this.address = address
    }
    createBucket(bucket, callback) {
        "use strict"

        this.transport(address)

        callback(null)
    }

    setTransport(transport) {
        "use strict"
        this.transport = transport
    }

    static getClient(params) {
        "use strict"
        return new Client(params[address])
    }
}
var inst = Client
module.exports = inst
