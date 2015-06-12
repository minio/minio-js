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

var uriEscape = function uriEscape(string) {
  var output = encodeURIComponent(string);
  output = output.replace(/[^A-Za-z0-9_.~\-%]+/g, escape);

  // AWS percent-encodes some extra non-standard characters in a URI
  output = output.replace(/[*]/g, function(ch) {
    return '%' + ch.charCodeAt(0).toString(16).toUpperCase();
  });

  return output;
}

function getRegion(host) {
  switch (host) {
    case "s3.amazonaws.com":
      return "us-east-1"
    case "s3-ap-northeast-1.amazonaws.com":
      return "ap-northeast-1"
    case "s3-ap-southeast-1.amazonaws.com":
      return "ap-southeast-1"
    case "s3-ap-southeast-2.amazonaws.com":
      return "ap-southeast-2"
    case "s3-eu-central-1.amazonaws.com":
      return "eu-central-1"
    case "s3-eu-west-1.amazonaws.com":
      return "eu-west-1"
    case "s3-sa-east-1.amazonaws.com":
      return "sa-east-1"
    case "s3-external-1.amazonaws.com":
      return "us-east-1"
    case "s3-us-west-1.amazonaws.com":
      return "us-west-1"
    case "s3-us-west-2.amazonaws.com":
      return "us-west-2"
    case "s3.cn-north-1.amazonaws.com.cn":
      return "cn-north-1"
    case "s3-fips-us-gov-west-1.amazonaws.com":
      return "us-gov-west-1"
    default:
      return "milkyway"
  }
}

function checkBucket(bucket) {
  if (bucket === null || bucket.trim() === "") {
    return cb('bucket name cannot be empty')
  }
}

module.exports = {
  uriEscape: uriEscape,
  getRegion: getRegion
}
