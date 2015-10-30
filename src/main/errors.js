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

function Error() {
  this.name = '';
  this.message = '';
}

Error.prototype = {
  InvalidBucketNameException: function(message) {
    this.message = message;
    this.name = 'InvalidBucketNameException';
  },
  InvalidObjectNameException: function(message) {
    this.message = message;
    this.name = 'InvalidObjectNameException';
  },
  AccessKeyRequiredException: function(message) {
    this.message = message;
    this.name = 'AccessKeyRequiredException';
  },
  SecretKeyRequiredException: function(message) {
    this.message = message;
    this.name = 'SecretKeyRequiredException';
  },
  InvalidProtocolException: function(message) {
    this.message = message;
    this.name = 'InvalidProtocolException';
  },
  ExpiresParamException: function(message) {
    this.message = message;
    this.name = 'ExpiresParamException';
  },
  InvalidUserAgentException: function(message) {
    this.message = message;
    this.name = 'InvalidUserAgentException';
  },
  InvalidEmptyACLException: function(message) {
    this.message = message;
    this.name = 'InvalidEmptyACLException';
  },
  InternalClientException: function(message) {
    this.message = message;
    this.name = 'InvalidClientException';
  }
};

export default Error;
