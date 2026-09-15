import { strict as assert } from 'node:assert'
import { Readable } from 'node:stream'

import { S3Error } from '../../src/errors.ts'
import { parseError, parseResponseError } from '../../src/internal/xml-parser.ts'

describe('parseResponseError HTTP fallback', () => {
  const headers = {
    'x-amz-request-id': 'header-request-id',
    'x-amz-id-2': 'header-id-2',
    'x-amz-bucket-region': 'us-west-2',
  }

  function response(statusCode, body, responseHeaders = headers) {
    return Object.assign(Readable.from([Buffer.from(body)]), { statusCode, headers: responseHeaders })
  }

  function assertHeaderInfo(error) {
    assert.equal(error.amzRequestid, headers['x-amz-request-id'])
    assert.equal(error.amzId2, headers['x-amz-id-2'])
    assert.equal(error.amzBucketRegion, headers['x-amz-bucket-region'])
  }

  for (const [name, body] of [
    ['plain text', 'Forbidden by the proxy'],
    ['HTML', '<html><body>Forbidden by the proxy</body></html>'],
    ['unrelated XML', '<Response><Message>Forbidden by the proxy</Message></Response>'],
    ['malformed XML', '<html><body>Forbidden by the proxy'],
    ['an empty Error element', '<Error/>'],
    ['an empty response', ''],
  ]) {
    it(`preserves the HTTP error for ${name}`, async () => {
      await assert.rejects(parseResponseError(response(403, body)), (error) => {
        assert.ok(error instanceof S3Error)
        assert.equal(error.code, 'AccessDenied')
        assert.equal(error.message, 'Valid and authorized credentials required')
        assertHeaderInfo(error)
        return true
      })
    })
  }

  it('preserves MinIO error headers for a plain-text response', async () => {
    await assert.rejects(
      parseResponseError(
        response(400, 'Bad request from proxy', {
          ...headers,
          'x-minio-error-code': 'InvalidRequest',
          'x-minio-error-desc': 'The request is invalid',
        }),
      ),
      (error) => {
        assert.ok(error instanceof S3Error)
        assert.equal(error.code, 'InvalidRequest')
        assert.equal(error.message, 'The request is invalid')
        assertHeaderInfo(error)
        return true
      },
    )
  })

  it('preserves S3 XML error details instead of the HTTP fallback', async () => {
    const xml =
      '<Error><Code>InvalidAccessKeyId</Code><Message>XML error message</Message>' +
      '<Region>eu-west-1</Region><RequestId>xml-request-id</RequestId><Resource>/bucket</Resource></Error>'
    const parsed = parseError(xml, {})
    await assert.rejects(parseResponseError(response(403, xml)), (error) => {
      assert.ok(error instanceof S3Error)
      for (const key of ['code', 'message', 'region', 'requestid', 'resource']) {
        assert.equal(error[key], parsed[key])
      }
      assertHeaderInfo(error)
      return true
    })
  })

  it('preserves S3 XML containing only an error message', async () => {
    await assert.rejects(
      parseResponseError(response(403, '<Error><Message>XML error message</Message></Error>')),
      (error) => {
        assert.ok(error instanceof S3Error)
        assert.equal(error.message, 'XML error message')
        assert.equal(error.code, undefined)
        return true
      },
    )
  })

  it('preserves a response stream error', async () => {
    const streamError = new Error('response stream failed')
    const failedResponse = Object.assign(
      new Readable({
        read() {
          this.destroy(streamError)
        },
      }),
      { statusCode: 403, headers },
    )
    await assert.rejects(parseResponseError(failedResponse), (error) => error === streamError)
  })
})
