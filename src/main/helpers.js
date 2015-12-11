/*
 * Minio Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2015 Minio, Inc.
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

export function uriEscape(string) {
  var output = string
    // this was originally escape instead of encodeURIComponent but escape is deprecated.
  output = output.replace(/[^A-Za-z0-9_.~\-%]+/g, encodeURIComponent)

  // AWS percent-encodes some extra non-standard characters in a URI
  output = output.replace(/[*]/g, function(ch) {
    return '%' + ch.charCodeAt(0).toString(16).toUpperCase()
  })

  return output
}

export function uriResourceEscape(string) {
  var output = string
    // this was originally escape instead of encodeURIComponent but escape is deprecated.
  output = output.replace(/[^A-Za-z0-9_.~\-%]+/g, encodeURIComponent)
  output = output.replace('%2F', '/')

  return output
}

export function getScope(region, date) {
  return `${date.format('YYYYMMDD')}/${region}/s3/aws4_request`
}

export function isValidBucketName(bucket) {
  if (!isString(bucket)) return false

  // bucket length between 3 and 63
  if (bucket.length < 3 || bucket.length > 63) {
    return false
  }
  // should begin with alphabet and end with alphabet/number, with alphabet/number/- in the middle
  if (bucket.match(/^[a-zA-Z][a-zA-Z0-9-]+[a-zA-Z0-9]$/)) {
    return true
  }
  return false
}

// check if objectName is a valid object name
export function isValidObjectName(objectName) {
  if (!isValidPrefix(objectName)) return false
  if (objectName.length === 0) return false
  return true
}

// check if prefix is valid
export function isValidPrefix(prefix) {
  if (!isString(prefix)) return false
  if (prefix.length > 1024) return false
  return true
}

// check for allowed ACLs
export function isValidACL(acl) {
  return acl === 'private' || acl === 'public-read' || acl === 'public-read-write' || acl === 'authenticated-read'
}

// check if typeof arg boolean
export function isBoolean(arg) {
  return typeof(arg) === 'boolean'
}

// check if typeof arg number
export function isNumber(arg) {
  return typeof(arg) === 'number'
}

// check if typeof arg function
export function isFunction(arg) {
  return typeof(arg) === 'function';
}

// check if typeof arg string
export function isString(arg) {
  return typeof(arg) === 'string';
}

// check if typeof arg object
export function isObject(arg) {
  return typeof(arg) === 'object' && arg !== null;
}

// pipesetup sets up pipe() from left to right os streams array
// pipesetup will also make sure that error emitted at any of the upstream Stream
// will be emited at the last stream. This makes error handling simple
export function pipesetup(...streams) {
  return streams.reduce((src, dst) => {
    src.on('error', err => dst.emit('error', err))
    return src.pipe(dst)
  })
}
