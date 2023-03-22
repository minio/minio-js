import Http from 'http'
import Https from 'https'

export interface Transport {
    request(options: string | URL | Http.RequestOptions | Https.RequestOptions, callback?: (res: Http.IncomingMessage) => void): Http.ClientRequest
}