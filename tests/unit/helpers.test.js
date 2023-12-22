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

import { CopySourceOptions } from '../../src/helpers.ts'
import {
  calculateEvenSplits,
  isValidEndpoint,
  makeDateLong,
  makeDateShort,
  partsRequired,
} from '../../src/internal/helper.ts'

describe('Helpers', () => {
  it('should validate for s3 endpoint', () => {
    assert.equal(isValidEndpoint('s3.amazonaws.com'), true)
  })
  it('should validate for s3 china', () => {
    assert.equal(isValidEndpoint('s3.cn-north-1.amazonaws.com.cn'), true)
  })
  it('should validate for us-west-2', () => {
    assert.equal(isValidEndpoint('s3-us-west-2.amazonaws.com'), true)
  })
  it('should fail for invalid endpoint characters', () => {
    assert.equal(isValidEndpoint('111.#2.11'), false)
  })

  it('should make date short', () => {
    let date = new Date('2012-12-03T17:25:36.331Z')

    assert.equal(makeDateShort(date), '20121203')
  })
  it('should make date long', () => {
    let date = new Date('2017-08-11T17:26:34.935Z')

    assert.equal(makeDateLong(date), '20170811T172634Z')
  })

  // Adopted from minio-go sdk
  const oneGB = 1024 * 1024 * 1024
  const fiveGB = 5 * oneGB

  const OBJ_SIZES = {
    gb1: oneGB,
    gb5: fiveGB,
    gb5p1: fiveGB + 1,
    gb10p1: 2 * fiveGB + 1,
    gb10p2: 2 * fiveGB + 2,
  }

  const maxMultipartPutObjectSize = 1024 * 1024 * 1024 * 1024 * 5

  it('Parts Required Test cases ', () => {
    const expectedPartsRequiredTestCases = [
      { value: 0, expected: 0 },
      { value: 1, expected: 1 },
      {
        value: fiveGB,
        expected: 10,
      },
      { value: OBJ_SIZES.gb5p1, expected: 10 },
      { value: 2 * fiveGB, expected: 20 },
      {
        value: OBJ_SIZES.gb10p1,
        expected: 20,
      },
      { value: OBJ_SIZES.gb10p2, expected: 20 },
      {
        value: OBJ_SIZES.gb10p1 + OBJ_SIZES.gb10p2,
        expected: 40,
      },
      { value: maxMultipartPutObjectSize, expected: 10000 },
    ]

    expectedPartsRequiredTestCases.forEach((testCase) => {
      const fnResult = partsRequired(testCase.value)
      assert.equal(fnResult, testCase.expected)
    })
  })
  it('Even split of Sizes Test cases ', () => {
    // Adopted from minio-go sdk
    const expectedSplitsTestCases = [
      {
        size: 0,
        sourceConfig: new CopySourceOptions({ Start: -1 }),
        expectedStart: null,
        expectedEnd: null,
      },
      {
        size: 1,
        sourceConfig: new CopySourceOptions({ Start: -1 }),
        expectedStart: [undefined],
        expectedEnd: [NaN],
      },
      { size: 1, sourceConfig: new CopySourceOptions({ Start: 0 }), expectedStart: [0], expectedEnd: [0] },
      {
        size: OBJ_SIZES.gb1,
        sourceConfig: new CopySourceOptions({ Start: -1 }),
        expectedStart: [0, 536870912],
        expectedEnd: [536870911, 1073741823],
      },
      {
        size: OBJ_SIZES.gb5,
        sourceConfig: new CopySourceOptions({ Start: -1 }),
        expectedStart: [
          0, 536870912, 1073741824, 1610612736, 2147483648, 2684354560, 3221225472, 3758096384, 4294967296, 4831838208,
        ],
        expectedEnd: [
          536870911, 1073741823, 1610612735, 2147483647, 2684354559, 3221225471, 3758096383, 4294967295, 4831838207,
          5368709119,
        ],
      },

      // 2 part splits
      {
        size: OBJ_SIZES.gb5p1,
        sourceConfig: new CopySourceOptions({ Start: -1 }),
        expectedStart: [
          0, 536870913, 1073741825, 1610612737, 2147483649, 2684354561, 3221225473, 3758096385, 4294967297, 4831838209,
        ],
        expectedEnd: [
          536870912, 1073741824, 1610612736, 2147483648, 2684354560, 3221225472, 3758096384, 4294967296, 4831838208,
          5368709120,
        ],
      },
      {
        size: OBJ_SIZES.gb5p1,
        sourceConfig: new CopySourceOptions({ Start: -1 }),
        expectedStart: [
          0, 536870913, 1073741825, 1610612737, 2147483649, 2684354561, 3221225473, 3758096385, 4294967297, 4831838209,
        ],
        expectedEnd: [
          536870912, 1073741824, 1610612736, 2147483648, 2684354560, 3221225472, 3758096384, 4294967296, 4831838208,
          5368709120,
        ],
      },

      // 3 part splits
      {
        size: OBJ_SIZES.gb10p1,
        sourceConfig: new CopySourceOptions({ Start: -1 }),
        expectedStart: [
          0, 536870913, 1073741825, 1610612737, 2147483649, 2684354561, 3221225473, 3758096385, 4294967297, 4831838209,
          5368709121, 5905580033, 6442450945, 6979321857, 7516192769, 8053063681, 8589934593, 9126805505, 9663676417,
          10200547329,
        ],
        expectedEnd: [
          536870912, 1073741824, 1610612736, 2147483648, 2684354560, 3221225472, 3758096384, 4294967296, 4831838208,
          5368709120, 5905580032, 6442450944, 6979321856, 7516192768, 8053063680, 8589934592, 9126805504, 9663676416,
          10200547328, 10737418240,
        ],
      },
      {
        size: OBJ_SIZES.gb10p2,
        sourceConfig: new CopySourceOptions({ Start: -1 }),
        expectedStart: [
          0, 536870913, 1073741826, 1610612738, 2147483650, 2684354562, 3221225474, 3758096386, 4294967298, 4831838210,
          5368709122, 5905580034, 6442450946, 6979321858, 7516192770, 8053063682, 8589934594, 9126805506, 9663676418,
          10200547330,
        ],
        expectedEnd: [
          536870912, 1073741825, 1610612737, 2147483649, 2684354561, 3221225473, 3758096385, 4294967297, 4831838209,
          5368709121, 5905580033, 6442450945, 6979321857, 7516192769, 8053063681, 8589934593, 9126805505, 9663676417,
          10200547329, 10737418241,
        ],
      },
    ]

    expectedSplitsTestCases.forEach((testCase) => {
      const fnResult = calculateEvenSplits(testCase.size, testCase)
      const { startIndex, endIndex } = fnResult || {}

      if (Array.isArray(startIndex) && Array.isArray(endIndex)) {
        const isExpectedResult =
          startIndex.length === testCase.expectedStart.length && endIndex.length === testCase.expectedEnd.length
        assert.equal(isExpectedResult, true)
      } else {
        // null cases.
        assert.equal(startIndex, expectedSplitsTestCases.expectedStart)
        assert.equal(endIndex, expectedSplitsTestCases.expectedEnd)
      }
    })
  })
})
