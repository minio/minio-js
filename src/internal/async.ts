// promise helper for stdlib

import * as fs from 'node:fs'
import * as stream from 'node:stream'
import { promisify } from 'node:util'

export const streamPromise = {
  // node:stream/promises Added in: v15.0.0
  pipeline: promisify(stream.pipeline),
}

export const fstat = promisify(fs.fstat)
