/*
 * MinIO Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2016 MinIO, Inc.
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

import * as crypto from 'node:crypto'

import * as errors from './errors.ts'
import { getScope, isNumber, isObject, isString, makeDateLong, makeDateShort, uriEscape } from './internal/helper.ts'
import type { ICanonicalRequest, IRequest, RequestHeaders } from './internal/type.ts'

const signV4Algorithm = 'AWS4-HMAC-SHA256'

// getCanonicalRequest generate a canonical request of style.
//
// canonicalRequest =
//  <HTTPMethod>\n
//  <CanonicalURI>\n
//  <CanonicalQueryString>\n
//  <CanonicalHeaders>\n
//  <SignedHeaders>\n
//  <HashedPayload>
//
function getCanonicalRequest(
  method: string,
  path: string,
  headers: RequestHeaders,
  signedHeaders: string[],
  hashedPayload: string,
): ICanonicalRequest {
  if (!isString(method)) {
    throw new TypeError('method should be of type "string"')
  }
  if (!isString(path)) {
    throw new TypeError('path should be of type "string"')
  }
  if (!isObject(headers)) {
    throw new TypeError('headers should be of type "object"')
  }
  if (!Array.isArray(signedHeaders)) {
    throw new TypeError('signedHeaders should be of type "array"')
  }
  if (!isString(hashedPayload)) {
    throw new TypeError('hashedPayload should be of type "string"')
  }

  const headersArray = signedHeaders.reduce((acc, i) => {
    // Trim spaces from the value (required by V4 spec)
    const val = `${headers[i]}`.replace(/ +/g, ' ')
    acc.push(`${i.toLowerCase()}:${val}`)
    return acc
  }, [] as string[])

  const requestResource = path.split('?')[0]
  let requestQuery = path.split('?')[1]
  if (!requestQuery) {
    requestQuery = ''
  }

  if (requestQuery) {
    requestQuery = requestQuery
      .split('&')
      .sort()
      .map((element) => (!element.includes('=') ? element + '=' : element))
      .join('&')
  }

  return [
    method.toUpperCase(),
    requestResource,
    requestQuery,
    headersArray.join('\n') + '\n',
    signedHeaders.join(';').toLowerCase(),
    hashedPayload,
  ].join('\n')
}

// generate a credential string
function getCredential(accessKey: string, region: string, requestDate?: Date, serviceName = 's3') {
  if (!isString(accessKey)) {
    throw new TypeError('accessKey should be of type "string"')
  }
  if (!isString(region)) {
    throw new TypeError('region should be of type "string"')
  }
  if (!isObject(requestDate)) {
    throw new TypeError('requestDate should be of type "object"')
  }
  return `${accessKey}/${getScope(region, requestDate, serviceName)}`
}

// Returns signed headers array - alphabetically sorted
function getSignedHeaders(headers: RequestHeaders): string[] {
  if (!isObject(headers)) {
    throw new TypeError('request should be of type "object"')
  }
  // Excerpts from @lsegal - https://github.com/aws/aws-sdk-js/issues/659#issuecomment-120477258
  //
  //  User-Agent:
  //
  //      This is ignored from signing because signing this causes problems with generating pre-signed URLs
  //      (that are executed by other agents) or when customers pass requests through proxies, which may
  //      modify the user-agent.
  //
  //  Content-Length:
  //
  //      This is ignored from signing because generating a pre-signed URL should not provide a content-length
  //      constraint, specifically when vending a S3 pre-signed PUT URL. The corollary to this is that when
  //      sending regular requests (non-pre-signed), the signature contains a checksum of the body, which
  //      implicitly validates the payload length (since changing the number of bytes would change the checksum)
  //      and therefore this header is not valuable in the signature.
  //
  //  Content-Type:
  //
  //      Signing this header causes quite a number of problems in browser environments, where browsers
  //      like to modify and normalize the content-type header in different ways. There is more information
  //      on this in https://github.com/aws/aws-sdk-js/issues/244. Avoiding this field simplifies logic
  //      and reduces the possibility of future bugs
  //
  //  Authorization:
  //
  //      Is skipped for obvious reasons

  const ignoredHeaders = ['authorization', 'content-length', 'content-type', 'user-agent']
  return Object.keys(headers)
    .filter((header) => !ignoredHeaders.includes(header))
    .sort()
}

// returns the key used for calculating signature
function getSigningKey(date: Date, region: string, secretKey: string, serviceName = 's3') {
  if (!isObject(date)) {
    throw new TypeError('date should be of type "object"')
  }
  if (!isString(region)) {
    throw new TypeError('region should be of type "string"')
  }
  if (!isString(secretKey)) {
    throw new TypeError('secretKey should be of type "string"')
  }
  const dateLine = makeDateShort(date)
  const hmac1 = crypto
      .createHmac('sha256', 'AWS4' + secretKey)
      .update(dateLine)
      .digest(),
    hmac2 = crypto.createHmac('sha256', hmac1).update(region).digest(),
    hmac3 = crypto.createHmac('sha256', hmac2).update(serviceName).digest()
  return crypto.createHmac('sha256', hmac3).update('aws4_request').digest()
}

// returns the string that needs to be signed
function getStringToSign(canonicalRequest: ICanonicalRequest, requestDate: Date, region: string, serviceName = 's3') {
  if (!isString(canonicalRequest)) {
    throw new TypeError('canonicalRequest should be of type "string"')
  }
  if (!isObject(requestDate)) {
    throw new TypeError('requestDate should be of type "object"')
  }
  if (!isString(region)) {
    throw new TypeError('region should be of type "string"')
  }
  const hash = crypto.createHash('sha256').update(canonicalRequest).digest('hex')
  const scope = getScope(region, requestDate, serviceName)
  const stringToSign = [signV4Algorithm, makeDateLong(requestDate), scope, hash]

  return stringToSign.join('\n')
}

// calculate the signature of the POST policy
export function postPresignSignatureV4(region: string, date: Date, secretKey: string, policyBase64: string): string {
  if (!isString(region)) {
    throw new TypeError('region should be of type "string"')
  }
  if (!isObject(date)) {
    throw new TypeError('date should be of type "object"')
  }
  if (!isString(secretKey)) {
    throw new TypeError('secretKey should be of type "string"')
  }
  if (!isString(policyBase64)) {
    throw new TypeError('policyBase64 should be of type "string"')
  }
  const signingKey = getSigningKey(date, region, secretKey)
  return crypto.createHmac('sha256', signingKey).update(policyBase64).digest('hex').toLowerCase()
}

// Returns the authorization header
export function signV4(
  request: IRequest,
  accessKey: string,
  secretKey: string,
  region: string,
  requestDate: Date,
  sha256sum: string,
  serviceName = 's3',
) {
  if (!isObject(request)) {
    throw new TypeError('request should be of type "object"')
  }
  if (!isString(accessKey)) {
    throw new TypeError('accessKey should be of type "string"')
  }
  if (!isString(secretKey)) {
    throw new TypeError('secretKey should be of type "string"')
  }
  if (!isString(region)) {
    throw new TypeError('region should be of type "string"')
  }

  if (!accessKey) {
    throw new errors.AccessKeyRequiredError('accessKey is required for signing')
  }
  if (!secretKey) {
    throw new errors.SecretKeyRequiredError('secretKey is required for signing')
  }

  const signedHeaders = getSignedHeaders(request.headers)
  const canonicalRequest = getCanonicalRequest(request.method, request.path, request.headers, signedHeaders, sha256sum)
  const serviceIdentifier = serviceName || 's3'
  const stringToSign = getStringToSign(canonicalRequest, requestDate, region, serviceIdentifier)
  const signingKey = getSigningKey(requestDate, region, secretKey, serviceIdentifier)
  const credential = getCredential(accessKey, region, requestDate, serviceIdentifier)
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex').toLowerCase()

  return `${signV4Algorithm} Credential=${credential}, SignedHeaders=${signedHeaders
    .join(';')
    .toLowerCase()}, Signature=${signature}`
}

export function signV4ByServiceName(
  request: IRequest,
  accessKey: string,
  secretKey: string,
  region: string,
  requestDate: Date,
  contentSha256: string,
  serviceName = 's3',
): string {
  return signV4(request, accessKey, secretKey, region, requestDate, contentSha256, serviceName)
}

// returns a presigned URL string
export function presignSignatureV4(
  request: IRequest,
  accessKey: string,
  secretKey: string,
  sessionToken: string | undefined,
  region: string,
  requestDate: Date,
  expires: number,
) {
  if (!isObject(request)) {
    throw new TypeError('request should be of type "object"')
  }
  if (!isString(accessKey)) {
    throw new TypeError('accessKey should be of type "string"')
  }
  if (!isString(secretKey)) {
    throw new TypeError('secretKey should be of type "string"')
  }
  if (!isString(region)) {
    throw new TypeError('region should be of type "string"')
  }

  if (!accessKey) {
    throw new errors.AccessKeyRequiredError('accessKey is required for presigning')
  }
  if (!secretKey) {
    throw new errors.SecretKeyRequiredError('secretKey is required for presigning')
  }

  if (!isNumber(expires)) {
    throw new TypeError('expires should be of type "number"')
  }
  if (expires < 1) {
    throw new errors.ExpiresParamError('expires param cannot be less than 1 seconds')
  }
  if (expires > 604800) {
    throw new errors.ExpiresParamError('expires param cannot be greater than 7 days')
  }

  const iso8601Date = makeDateLong(requestDate)
  const signedHeaders = getSignedHeaders(request.headers)
  const credential = getCredential(accessKey, region, requestDate)
  const hashedPayload = 'UNSIGNED-PAYLOAD'

  const requestQuery: string[] = []
  requestQuery.push(`X-Amz-Algorithm=${signV4Algorithm}`)
  requestQuery.push(`X-Amz-Credential=${uriEscape(credential)}`)
  requestQuery.push(`X-Amz-Date=${iso8601Date}`)
  requestQuery.push(`X-Amz-Expires=${expires}`)
  requestQuery.push(`X-Amz-SignedHeaders=${uriEscape(signedHeaders.join(';').toLowerCase())}`)
  if (sessionToken) {
    requestQuery.push(`X-Amz-Security-Token=${uriEscape(sessionToken)}`)
  }

  const resource = request.path.split('?')[0]
  let query = request.path.split('?')[1]
  if (query) {
    query = query + '&' + requestQuery.join('&')
  } else {
    query = requestQuery.join('&')
  }

  const path = resource + '?' + query

  const canonicalRequest = getCanonicalRequest(request.method, path, request.headers, signedHeaders, hashedPayload)

  const stringToSign = getStringToSign(canonicalRequest, requestDate, region)
  const signingKey = getSigningKey(requestDate, region, secretKey)
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex').toLowerCase()
  return request.protocol + '//' + request.headers.host + path + `&X-Amz-Signature=${signature}`
}
