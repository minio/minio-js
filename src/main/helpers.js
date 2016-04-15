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

import stream from 'stream'
import _ from 'lodash'

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
  output = output.replace(/%2F/g, '/')

  return output
}

export function getScope(region, date) {
  return `${date.format('YYYYMMDD')}/${region}/s3/aws4_request`
}

// isAmazonEndpoint - true if endpoint is 's3.amazonaws.com'.
export function isAmazonEndpoint(endpoint) {
  return endpoint === 's3.amazonaws.com'
}

// isVirtualHostStyle - verify if bucket name is support with virtual
// hosts. bucketNames with periods should be always treated as path
// style if the protocol is 'https:', this is due to SSL wildcard
// limitation. For all other buckets and Amazon S3 endpoint we will
// default to virtual host style.
export function isVirtualHostStyle(endpoint, protocol, bucket) {
  if (protocol === 'https:' && bucket.indexOf('.') > -1) {
    return false
  }
  return isAmazonEndpoint(endpoint)
}

// isValidEndpoint - true if endpoint is valid domain.
export function isValidEndpoint(endpoint) {
  if (!isValidDomain(endpoint)) {
    return false
  }
  // Endpoint matches amazon, make sure its 's3.amazonaws.com'
  if (endpoint.match('.amazonaws.com$')) {
    if (!isAmazonEndpoint(endpoint)) {
      return false
    }
  }
  // Returning true for all other cases.
  return true
}

// isValidDomain - true if input host is a valid domain.
export function isValidDomain(host) {
  if (!isString(host)) return false
  // See RFC 1035, RFC 3696.
  if (host.length === 0 || host.length > 255) {
    return false
  }
  // Host cannot start or end with a '-'
  if (host[0] === '-' || host.substr(-1) === '-') {
    return false
  }
  // Host cannot start or end with a '_'
  if (host[0] === '_' || host.substr(-1) === '_') {
    return false
  }
  // Host cannot start or end with a '.'
  if (host[0] === '.' || host.substr(-1) === '.') {
    return false
  }
  var alphaNumerics = '`~!@#$%^&*()+={}[]|\\\"\';:><?/'.split('')
  // All non alphanumeric characters are invalid.
  for (var i in alphaNumerics) {
    if (host.indexOf(alphaNumerics[i]) > -1) {
      return false
    }
  }
  // No need to regexp match, since the list is non-exhaustive.
  // We let it be valid and fail later.
  return true
}

// isValidPort - is input port valid.
export function isValidPort(port) {
  // verify if port is a number.
  if (!isNumber(port)) return false
  // port cannot be negative.
  if (port < 0) return false
  // port '0' is valid and special case return true.
  if (port === 0) return true
  var min_port = 1;
  var max_port = 65535;
  // Verify if port is in range.
  return port >= min_port && port <= max_port
}

export function isValidBucketName(bucket) {
  if (!isString(bucket)) return false

  // bucket length should be less than and no more than 63
  // characters long.
  if (bucket.length < 3 || bucket.length > 63) {
    return false
  }
  // bucket with successive periods is invalid.
  if (bucket.indexOf('..') > -1) {
    return false
  }
  // bucket cannot have ip address style.
  if (bucket.match(/[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/)) {
    return false
  }
  // bucket should begin with alphabet/number and end with alphabet/number,
  // with alphabet/number/.- in the middle.
  if (bucket.match(/^[a-z0-9][a-z0-9.-]+[a-z0-9]$/)) {
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

// check if object is readable stream
export function isReadableStream(arg) {
  return isObject(arg) && isFunction(arg._read)
}

// check if arg is boolean
export function isBoolean(arg) {
  return typeof(arg) === 'boolean'
}

// check if arg is array
export function isArray(arg) {
  return Array.isArray(arg)
}

// check if arg is Date
export function isDate(arg) {
  return arg._isAMomentObject
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

// return a Readable stream that emits data
export function readableStream(data) {
  var s = new stream.Readable()
  s._read = () => {}
  s.push(data)
  s.push(null)
  return s
}
