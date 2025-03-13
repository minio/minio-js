import type * as http from 'node:http'
import type * as https from 'node:https'
import type * as stream from 'node:stream'
import { pipeline } from 'node:stream'
import { promisify } from 'node:util'

import type { Transport } from './type.ts'

const pipelineAsync = promisify(pipeline)

export async function request(
  transport: Transport,
  opt: https.RequestOptions,
  body: Buffer | string | stream.Readable | null = null,
): Promise<http.IncomingMessage> {
  return new Promise<http.IncomingMessage>((resolve, reject) => {
    const requestObj = transport.request(opt, (response) => {
      resolve(response)
    })

    requestObj.on('error', reject)

    if (!body || Buffer.isBuffer(body) || typeof body === 'string') {
      requestObj.end(body)
    } else {
      pipelineAsync(body, requestObj).catch(reject)
    }
  })
}

const MAX_RETRIES = 10
const EXP_BACK_OFF_BASE_DELAY = 1000 // Base delay for exponential backoff
const ADDITIONAL_DELAY_FACTOR = 1.0 // to avoid synchronized retries

// Retryable error codes for HTTP ( ref: minio-go)
export const retryHttpCodes: Record<string, boolean> = {
  408: true,
  429: true,
  499: true,
  500: true,
  502: true,
  503: true,
  504: true,
  520: true,
}

const isHttpRetryable = (httpResCode: number) => {
  return retryHttpCodes[httpResCode] !== undefined
}

const sleep = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const getExpBackOffDelay = (retryCount: number) => {
  const backOffBy = EXP_BACK_OFF_BASE_DELAY * 2 ** retryCount
  const additionalDelay = Math.random() * backOffBy * ADDITIONAL_DELAY_FACTOR
  return backOffBy + additionalDelay
}

export async function requestWithRetry(
  transport: Transport,
  opt: https.RequestOptions,
  body: Buffer | string | stream.Readable | null = null,
  maxRetries: number = MAX_RETRIES,
): Promise<http.IncomingMessage> {
  let attempt = 0
  let isRetryable = false
  while (attempt <= maxRetries) {
    try {
      const response = await request(transport, opt, body)
      // Check if the HTTP status code is retryable
      if (isHttpRetryable(response.statusCode as number)) {
        isRetryable = true
        throw new Error(`Retryable HTTP status: ${response.statusCode}`) // trigger retry attempt with calculated delay
      }

      return response // Success, return the raw response
    } catch (err) {
      if (isRetryable) {
        attempt++
        isRetryable = false

        if (attempt > maxRetries) {
          throw new Error(`Request failed after ${maxRetries} retries: ${err}`)
        }
        const delay = getExpBackOffDelay(attempt)
        // eslint-disable-next-line no-console
        console.warn(
          `${new Date().toLocaleString()} Retrying request (attempt ${attempt}/${maxRetries}) after ${delay}ms due to: ${err}`,
        )
        await sleep(delay)
      } else {
        throw err // re-throw if any request, syntax errors
      }
    }
  }

  throw new Error(`${MAX_RETRIES} Retries exhausted, request failed.`)
}
