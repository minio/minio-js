import type * as http from 'node:http'
import type * as https from 'node:https'
import type * as stream from 'node:stream'
import { pipeline } from 'node:stream'

import type { Transport } from './type.ts'

export async function request(
  transport: Transport,
  opt: https.RequestOptions,
  body: Buffer | string | stream.Readable | null = null,
): Promise<http.IncomingMessage> {
  return new Promise<http.IncomingMessage>((resolve, reject) => {
    const requestObj = transport.request(opt, (resp) => {
      resolve(resp)
    })

    if (!body || Buffer.isBuffer(body) || typeof body === 'string') {
      requestObj
        .on('error', (e: unknown) => {
          reject(e)
        })
        .end(body)

      return
    }

    // pump readable stream
    pipeline(body, requestObj, (err) => {
      if (err) {
        reject(err)
      }
    })
  })
}
