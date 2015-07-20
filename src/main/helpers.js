/*
 * Minimal Object Storage Library, (C) 2015 Minio, Inc.
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

/*jshint sub: true */

function uriEscape(string) {
  var output = string
  // this was originally escape instead of encodeURIComponent but escape is deprecated.
  output = output.replace(/[^A-Za-z0-9_.~\-%]+/g, encodeURIComponent)

  // AWS percent-encodes some extra non-standard characters in a URI
  output = output.replace(/[*]/g, function(ch) {
    return '%' + ch.charCodeAt(0).toString(16).toUpperCase()
  })

  return output
}

function uriResourceEscape(string) {
  var output = string
  // this was originally escape instead of encodeURIComponent but escape is deprecated.
  output = output.replace(/[^A-Za-z0-9_.~\-%]+/g, encodeURIComponent)
  output = output.replace('%2F', '/')

  return output
}

function getRegion(host) {
  var region = {
    's3.amazonaws.com': 'us-east-1',
    's3-ap-northeast-1.amazonaws.com': 'ap-northeast-1',
    's3-ap-southeast-1.amazonaws.com': 'ap-southeast-1',
    's3-ap-southeast-2.amazonaws.com': 'ap-southeast-2',
    's3-eu-central-1.amazonaws.com': 'eu-central-1',
    's3-eu-west-1.amazonaws.com': 'eu-west-1',
    's3-eu-east-1.amazonaws.com': 'eu-east-1',
    's3-external-1.amazonaws.com': 'us-east-1',
    's3-us-west-1.amazonaws.com': 'us-west-1',
    's3-us-west-2.amazonaws.com': 'us-west-2',
    's3.cn-north-1.amazonaws.com.cn': 'cn-north-1',
    's3-fips-us-gov-west-1.amazonaws.com': 'us-gov-west-1'
  }

  if (region[host] !== undefined) {
    return region[host]
  } else {
    return 'milkyway'
  }
}

function validateBucketName(bucket) {
  // test for null
  if(bucket === null) {
    return false
  }

  // bucket length between 3 and 63
  if (bucket.length < 3 || bucket.length > 63) {
    return false
  }

  // lower case, numbers, hyphens
  // starts and ends with letters or numbers
  var re1 = /^[a-z0-9]+[a-z0-9\-]*[a-z0-9]+$/
  if(bucket.match(re1) === null) {
    return false
  }

  // no ip address style
  var re2 = /[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/
  if(bucket.match(re2) !== null) {
    return false
  }

  return true
}

module.exports = {
  uriEscape: uriEscape,
  getRegion: getRegion,
  uriResourceEscape: uriResourceEscape,
  validBucketName: validateBucketName
}
