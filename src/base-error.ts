/*
 * MinIO Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2015 MinIO, Inc.
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

/// <reference lib="ES2022.Error" />

/**
 * @internal
 */
export class ExtendableError extends Error {
  constructor(message?: string, opt?: ErrorOptions) {
    // error Option {cause?: unknown} is a 'nice to have',
    // don't use it internally
    super(message, opt)
    // set error name, otherwise it's always 'Error'
    this.name = this.constructor.name
  }
}
