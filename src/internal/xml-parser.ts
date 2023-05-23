import type * as http from 'node:http'

import { XMLParser } from 'fast-xml-parser'

import * as errors from '../errors.ts'
import { parseXml } from './helper.ts'
import { readAsString } from './response.ts'

// parse XML response for bucket region
export function parseBucketRegion(xml: string): string {
  // return region information
  return parseXml(xml).LocationConstraint
}

const fxp = new XMLParser()

// Parse XML and return information as Javascript types
// parse error XML response
export function parseError(xml: string, headerInfo: Record<string, unknown>) {
  let xmlErr = {}
  const xmlObj = fxp.parse(xml)
  if (xmlObj.Error) {
    xmlErr = xmlObj.Error
  }
  const e = new errors.S3Error() as unknown as Record<string, unknown>
  Object.entries(xmlErr).forEach(([key, value]) => {
    e[key.toLowerCase()] = value
  })
  Object.entries(headerInfo).forEach(([key, value]) => {
    e[key] = value
  })
  return e
}

// Generates an Error object depending on http statusCode and XML body
export async function parseResponseError(response: http.IncomingMessage) {
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
  headerInfo.amzRequestid = response.headers['x-amz-request-id'] as string | undefined
  // A special token that helps troubleshoot API replies and issues.
  headerInfo.amzId2 = response.headers['x-amz-id-2'] as string | undefined

  // Region where the bucket is located. This header is returned only
  // in HEAD bucket and ListObjects response.
  headerInfo.amzBucketRegion = response.headers['x-amz-bucket-region'] as string | undefined

  const xmlString = await readAsString(response)

  if (xmlString) {
    throw parseError(xmlString, headerInfo)
  }

  // Message should be instantiated for each S3Errors.
  const e = new errors.S3Error(message, { cause: headerInfo })
  // S3 Error code.
  e.code = code
  Object.entries(headerInfo).forEach(([key, value]) => {
    // @ts-expect-error force set error properties
    e[key] = value
  })

  throw e
}
