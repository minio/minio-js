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

import { assert, use } from 'chai'
import chaiAsPromised from 'chai-as-promised'
use(chaiAsPromised)

import { joinHostPort } from '../../src/internal/join-host-port.ts'

describe('join-host-port', () => {
    it('should be able to parse valid ipv4', () => {
      assert.equal(joinHostPort('192.168.1.1', 3000), '192.168.1.1:3000')
      assert.equal(joinHostPort('192.168.1.1'), '192.168.1.1')
      assert.equal(joinHostPort('01.102.103.104', 3000), '01.102.103.104:3000')
    })
  
    it('should be able to parse valid ipv6', () => {
      assert.equal(
        joinHostPort('2001:db8:3333:4444:5555:6666:7777:8888', 1234),
        '[2001:db8:3333:4444:5555:6666:7777:8888]:1234',
      )
      assert.equal(joinHostPort('::', 1234), '[::]:1234')
      assert.equal(joinHostPort('2001:db8::', 1234), '[2001:db8::]:1234')
      assert.equal(joinHostPort('::1234:5678', 1234), '[::1234:5678]:1234')
      assert.equal(
        joinHostPort('2001:0db8:0001:0000:0000:0ab9:C0A8:0102', 1234),
        '[2001:0db8:0001:0000:0000:0ab9:C0A8:0102]:1234',
      )
      assert.equal(
        joinHostPort('2001:db8:3333:4444:5555:6666:1.2.3.4', 1234),
        '[2001:db8:3333:4444:5555:6666:1.2.3.4]:1234',
      )
    })
  
    it('should be able to parse domain', () => {
      assert.equal(joinHostPort('internal.company.com', 5000), 'internal.company.com:5000')
      assert.equal(joinHostPort('internal.company.com'), 'internal.company.com')
    })
  })
  