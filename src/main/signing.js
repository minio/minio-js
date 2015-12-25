/*
 * Minio Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2016 Minio, Inc.
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

import Moment from 'moment'
import Crypto from 'crypto'
import _ from 'lodash'
import { uriEscape, getScope, isString, isObject } from './helpers.js'
import * as errors from './errors.js'

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
function getCanonicalRequest(request, hashedPayload) {
  if (!isObject(request)) {
    throw new TypeError('request should be of type "object"')
  }
  if (!isString(hashedPayload)) {
    throw new TypeError('hashedPayload should be of type "string"')
  }
  var signedHeaders = getSignedHeaders(request)
  var headers = signedHeaders.reduce((acc, i) => {
      acc.push(`${i.toLowerCase()}:${request.headers[i]}`)
      return acc
    }, [])

  var requestResource = request.path.split('?')[0]
  var requestQuery = request.path.split('?')[1]
  if (!requestQuery) requestQuery = ''

  if (requestQuery) {
    requestQuery = requestQuery
      .split('&')
      .sort()
      .map(element => element.indexOf('=') === -1 ? element + '=' : element)
      .join('&')
  }

  var canonical = []
  canonical.push(request.method.toUpperCase())
  canonical.push(requestResource)
  canonical.push(requestQuery)
  canonical.push(headers.join('\n') + '\n')
  canonical.push(signedHeaders.join(';').toLowerCase())
  canonical.push(hashedPayload)
  return canonical.join('\n')
}

// generate a credential string
function getCredential(accessKey, region, requestDate) {
  if (!isString(accessKey)) {
    throw new TypeError('accessKey should be of type "string"')
  }
  if (!isString(region)) {
    throw new TypeError('region should be of type "string"')
  }
  if (!isObject(requestDate)) {
    throw new TypeError('requestDate should be of type "object"')
  }
  return `${accessKey}/${getScope(region, requestDate)}`
}

// signed headers list - alphabetically sorted
function getSignedHeaders(request) {
  if (!isObject(request)) {
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

  var ignoredHeaders = ['authorization', 'content-length', 'content-type', 'user-agent']
  return _.map(request.headers, (v, header) => header)
                  .filter(header => ignoredHeaders.indexOf(header) === -1)
                  .sort()
}

// returns the key used for calculating signature
function getSigningKey(date, region, secretKey) {
  if (!isObject(date)) {
    throw new TypeError('date should be of type "object"')
  }
  if (!isString(region)) {
    throw new TypeError('region should be of type "string"')
  }
  if (!isString(secretKey)) {
    throw new TypeError('secretKey should be of type "string"')
  }
  var dateLine = date.format('YYYYMMDD'),
    hmac1 = Crypto.createHmac('sha256', 'AWS4' + secretKey).update(dateLine).digest('binary'),
    hmac2 = Crypto.createHmac('sha256', hmac1).update(region).digest('binary'),
    hmac3 = Crypto.createHmac('sha256', hmac2).update('s3').digest('binary')
  return Crypto.createHmac('sha256', hmac3).update('aws4_request').digest('binary')
}

// returns the string that needs to be signed
function getStringToSign(canonicalRequest, requestDate, region) {
  if (!isString(canonicalRequest)) {
    throw new TypeError('canonicalRequest should be of type "string"')
  }
  if (!isObject(requestDate)) {
    throw new TypeError('requestDate should be of type "object"')
  }
  if (!isString(region)) {
    throw new TypeError('region should be of type "string"')
  }
  var hash = Crypto.createHash('sha256').update(canonicalRequest).digest('hex')
  var scope = getScope(region, requestDate)
  var stringToSign = []
  stringToSign.push(signV4Algorithm)
  stringToSign.push(requestDate.format('YYYYMMDDTHHmmss') + 'Z')
  stringToSign.push(scope)
  stringToSign.push(hash)
  return stringToSign.join('\n')
}

// calculate the signature of the POST policy
export function postPresignSignatureV4(region, date, secretKey, policyBase64) {
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
  var signingKey = getSigningKey(date, region, secretKey)
  return Crypto.createHmac('sha256', signingKey).update(policyBase64).digest('hex').toLowerCase()
}

// sings the request and adds the following headers to request.header
// 'x-amz-date', 'x-amz-content-sha256', 'authorization'
export function signV4(request, dataShaSum256, accessKey, secretKey, region) {
  if (!isObject(request)) {
    throw new TypeError('request should be of type "object"')
  }
  if (!isString(dataShaSum256)) {
    throw new TypeError('dataShaSum256 should be of type "string"')
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

  if (!accessKey || !secretKey) {
    // no signing in case of anonymous requests
    return
  }
  // sha256sum is always needed for non-anonymous requests
  if (dataShaSum256.length !== 64) {
    throw new errors.InvalidArgumentError(`invalid dataShaSum256 : ${dataShaSum256}`)
  }

  var requestDate = Moment().utc()

  if (!request.headers) {
    request.headers = {}
  }

  var host = request.host

  if ((request.protocol === 'http:' && request.port !== 80) || (request.protocol === 'https:' && request.port !== 443)) {
    host = `${host}:${request.port}`
  }
  request.headers.host = host
  request.headers['x-amz-date'] = requestDate.format('YYYYMMDDTHHmmss') + 'Z'
  request.headers['x-amz-content-sha256'] = dataShaSum256

  var canonicalRequest = getCanonicalRequest(request, dataShaSum256)

  var stringToSign = getStringToSign(canonicalRequest, requestDate, region)
  var signingKey = getSigningKey(requestDate, region, secretKey)

  var credential = getCredential(accessKey, region, requestDate)
  var signedHeaders = getSignedHeaders(request).join(';').toLowerCase()
  var signature = Crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex').toLowerCase()

  var authorization = `Credential=${credential}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  request.headers.authorization = 'AWS4-HMAC-SHA256 ' + authorization
}

// returns a presigned URL string
export function presignSignatureV4(request, accessKey, secretKey, region) {
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
    throw new Error('accessKey is required for presigning')
  }
  if (!secretKey) {
    throw new Error('secretKey is required for presigning')
  }

  if (!request.expires) {
    throw new Error('expires value required')
  }
  if (request.expires < 1) {
    throw new Error('expires param cannot be less than 1 seconds')
  }
  if (request.expires > 604800) {
    throw new Error('expires param cannot be larger than 7 days')
  }

  var expires = request.expires
  var host = request.host

  if ((request.protocol === 'http' && request.port !== 80) || (request.protocol === 'https' && request.port !== 443)) {
    host = `${host}:${request.port}`
  }

  if (!request.headers) {
    request.headers = {}
  }

  request.headers.host = host

  var requestDate = Moment().utc()
  var iso8601Date = requestDate.format('YYYYMMDDTHHmmss') + 'Z'
  var signedHeaders = getSignedHeaders(request).join(';').toLowerCase()
  var credential = getCredential(accessKey, region, requestDate)
  var hashedPayload = 'UNSIGNED-PAYLOAD'

  var requestQuery = []
  requestQuery.push(`X-Amz-Algorithm=${signV4Algorithm}`)
  requestQuery.push(`X-Amz-Credential=${uriEscape(credential)}`)
  requestQuery.push(`X-Amz-Date=${iso8601Date}`)
  requestQuery.push(`X-Amz-Expires=${expires}`)
  requestQuery.push(`X-Amz-SignedHeaders=${uriEscape(signedHeaders)}`)

  request.path += '?' + requestQuery.join('&')

  var canonicalRequest = getCanonicalRequest(request, hashedPayload)

  var stringToSign = getStringToSign(canonicalRequest, requestDate, region)
  var signingKey = getSigningKey(requestDate, region, secretKey)
  var signature = Crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex').toLowerCase()
  var presignedUrl = request.protocol + '//' + host + request.path + `&X-Amz-Signature=${signature}`
  return presignedUrl
}
