// promise helper for stdlib

import * as fs from 'node:fs'
import * as stream from 'node:stream'
import { promisify } from 'node:util'

// TODO: use "node:fs/promise" directly after we stop testing on nodejs 12
export { promises as fsp } from 'node:fs'
export const streamPromise = {
  // node:stream/promises Added in: v15.0.0
  pipeline: promisify(stream.pipeline),
}

export const fstat = promisify(fs.fstat)
