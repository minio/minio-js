import type { ServerResponse } from 'node:http'
import type stream from 'node:stream'

import { XMLParser } from 'fast-xml-parser'
import Through2 from 'through2'

import * as errors from '../errors.ts'
import { isFunction, parseXml } from './helper.ts'

// parse XML response for bucket region
export function parseBucketRegion(xml: string): string {
  // return region information
  return parseXml(xml).LocationConstraint
}

const fxp = new XMLParser()

// Parse XML and return information as Javascript types
// parse error XML response
export function parseError(xml: string, headerInfo: Record<string, any>) {
  let xmlErr = {}
  const xmlObj = fxp.parse(xml)
  if (xmlObj.Error) {
    xmlErr = xmlObj.Error
  }
  const e = new errors.S3Error() as unknown as Record<string, any>
  Object.entries(xmlErr).forEach(([key, value]) => {
    e[key.toLowerCase()] = value
  })
  Object.entries(headerInfo).forEach(([key, value]) => {
    e[key] = value
  })
  return e
}

// Generates an Error object depending on http statusCode and XML body
export function getErrorTransformer(response: ServerResponse) {
  const statusCode = response.statusCode
  let code: string, message: string
  if (statusCode === 301) {
    code = 'MovedPermanently'
    message = 'Moved Permanently'
  } else if (statusCode === 307) {
    code = 'TemporaryRedirect'
    message = 'Are you using the correct endpoint URL?'
  } else if (statusCode === 403) {
    code = 'AccessDenied'
    message = 'Valid and authorized credentials required'
  } else if (statusCode === 404) {
    code = 'NotFound'
    message = 'Not Found'
  } else if (statusCode === 405) {
    code = 'MethodNotAllowed'
    message = 'Method Not Allowed'
  } else if (statusCode === 501) {
    code = 'MethodNotAllowed'
    message = 'Method Not Allowed'
  } else {
    code = 'UnknownError'
    message = `${statusCode}`
  }
  const headerInfo: Record<string, string | undefined | null> = {}
  // A value created by S3 compatible server that uniquely identifies the request.
  headerInfo.amzRequestid = response.headersSent ? (response.getHeader('x-amz-request-id') as string | undefined) : null
  // A special token that helps troubleshoot API replies and issues.
  headerInfo.amzId2 = response.headersSent ? (response.getHeader('x-amz-id-2') as string | undefined) : null
  // Region where the bucket is located. This header is returned only
  // in HEAD bucket and ListObjects response.
  headerInfo.amzBucketRegion = response.headersSent
    ? (response.getHeader('x-amz-bucket-region') as string | undefined)
    : null

  return getConcater((xmlString) => {
    const getError = () => {
      // Message should be instantiated for each S3Errors.
      const e = new errors.S3Error(message, { cause: headerInfo })
      // S3 Error code.
      e.code = code
      Object.entries(headerInfo).forEach(([key, value]) => {
        // @ts-expect-error force set error properties
        e[key] = value
      })
      return e
    }
    if (!xmlString) {
      return getError()
    }
    let e
    try {
      e = parseError(xmlString, headerInfo)
    } catch (ex) {
      return getError()
    }
    return e
  }, true)
}

// getConcater returns a stream that concatenates the input and emits
// the concatenated output when 'end' has reached. If an optional
// parser function is passed upon reaching the 'end' of the stream,
// `parser(concatenated_data)` will be emitted.
export function getConcater(parser?: undefined | ((xml: string) => any), emitError?: boolean): stream.Transform {
  let objectMode = false
  const bufs: Buffer[] = []
  if (parser && !isFunction(parser)) {
    throw new TypeError('parser should be of type "function"')
  }
  if (parser) {
    objectMode = true
  }
  return Through2(
    { objectMode },
    function (chunk, enc, cb) {
      bufs.push(chunk)
      cb()
    },
    function (cb) {
      if (emitError) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        cb(parser(Buffer.concat(bufs).toString()))
        // cb(e) would mean we have to emit 'end' by explicitly calling this.push(null)
        this.push(null)
        return
      }
      if (bufs.length) {
        if (parser) {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          this.push(parser(Buffer.concat(bufs).toString()))
        } else {
          this.push(Buffer.concat(bufs))
        }
      }
      cb()
    },
  )
}
