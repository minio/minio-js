import * as crypto from 'node:crypto'

export function hashBinary(buf: Buffer, enableSHA256: boolean) {
  let sha256sum = ''
  if (enableSHA256) {
    sha256sum = crypto.createHash('sha256').update(buf).digest('hex')
  }
  const md5sum = crypto.createHash('md5').update(buf).digest('base64')

  return { md5sum, sha256sum }
}
