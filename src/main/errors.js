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

export class InvalidArgumentException extends Error {
  constructor(message) {
    super(message)
    this.name = 'InvalidArgumentException'
  }
}

export class InvalidEndPointException extends Error {
  constructor(message) {
    super(message)
    this.name = 'InvalidEndPointException'
  }
}

export class InvalidBucketNameException extends Error {
  constructor(message) {
    super(message)
    this.name = 'InvalidBucketNameException'
  }
}

export class InvalidObjectNameException extends Error {
  constructor(message) {
    super(message)
    this.name = 'InvalidObjectNameException'
  }
}

export class AccessKeyRequiredException extends Error {
  constructor(message) {
    super(message)
    this.name = 'AccessKeyRequiredException'
  }
}

export class SecretKeyRequiredException extends Error {
  constructor(message) {
    super(message)
    this.name = 'SecretKeyRequiredException'
  }
}

export class InvalidProtocolException extends Error {
  constructor(message) {
    super(message)
    this.name = 'InvalidProtocolException'
  }
}

export class ExpiresParamException extends Error {
  constructor(message) {
    super(message)
    this.name = 'ExpiresParamException'
  }
}

export class InvalidEmptyACLException extends Error {
  constructor(message) {
    super(message)
    this.name = 'InvalidEmptyACLException'
  }
}

export class InternalClientException extends Error {
  constructor(message) {
    super(message)
    this.name = 'InternalClientException'
  }
}
