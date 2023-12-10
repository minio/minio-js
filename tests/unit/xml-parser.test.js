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

import { parseListObjects } from '../../src/xml-parsers.js'

describe('xml-parser', () => {
    describe('#listObjects()', () => {
      describe('value type casting', () => {
        const xml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <ListVersionsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
              <Name>some-bucket</Name>
              <Prefix>42</Prefix>
              <Delimiter>/</Delimiter>
              <IsTruncated>false</IsTruncated>
              <EncodingType>url</EncodingType>
              <KeyMarker/>
              <VersionIdMarker/>
              <Version>
                <IsLatest>true</IsLatest>
                <VersionId>1234</VersionId>
                <ETag>"767dedcb515a0e2d995ed95191b75484-29"</ETag>
                <Key>1337</Key>
                <LastModified>2023-07-12T14:41:46.000Z</LastModified>
                <Size>151306240</Size>
              </Version>
              <DeleteMarker>
                <IsLatest>false</IsLatest>
                <Key>1337</Key>
                <LastModified>2023-07-12T14:39:22.000Z</LastModified>
                <VersionId>5678</VersionId>
              </DeleteMarker>
              <CommonPrefixes>
                <Prefix>42</Prefix>
              </CommonPrefixes>
            </ListVersionsResult>
          `
  
        it('should parse VersionId as string even if number is provided', () => {
          const { objects } = parseListObjects(xml)
  
          assert.equal(objects[0].versionId, '1234')
          assert.equal(objects[1].versionId, '5678')
          assert.equal(objects[0].name, '1337')
          assert.equal(objects[1].name, '1337')
          assert.deepEqual(objects[2], { prefix: '42', size: 0 })
        })
  
        it('should parse Size as number', () => {
          const { objects } = parseListObjects(xml)
  
          assert.equal(objects[0].size, 151306240)
          assert.equal(objects[1].size, undefined)
        })
      })
    })
  })
  
  