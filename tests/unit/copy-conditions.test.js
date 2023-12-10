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

import * as Minio from '../../src/minio.js'

describe('CopyConditions', () => {
    let date = 'Fri, 11 Aug 2017 19:34:18 GMT'
  
    let cc = new Minio.CopyConditions()
  
    describe('#setModified', () => {
      it('should take a date argument', () => {
        cc.setModified(new Date(date))
  
        assert.equal(cc.modified, date)
      })
  
      it('should throw without date', () => {
        assert.throws(() => {
          cc.setModified()
        }, /date must be of type Date/)
  
        assert.throws(() => {
          cc.setModified({ hi: 'there' })
        }, /date must be of type Date/)
      })
    })
  
    describe('#setUnmodified', () => {
      it('should take a date argument', () => {
        cc.setUnmodified(new Date(date))
  
        assert.equal(cc.unmodified, date)
      })
  
      it('should throw without date', () => {
        assert.throws(() => {
          cc.setUnmodified()
        }, /date must be of type Date/)
  
        assert.throws(() => {
          cc.setUnmodified({ hi: 'there' })
        }, /date must be of type Date/)
      })
    })
  })