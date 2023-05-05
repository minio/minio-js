// promise helper for stdlib

import * as fs from 'node:fs'
import * as stream from 'node:stream'
import { promisify } from 'node:util'

export const fsp = {
  fstat: promisify(fs.fstat),
  stat: promisify(fs.stat),
  lstat: promisify(fs.lstat),
  open: promisify(fs.open),
  fclose: promisify(fs.close),
  rename: fs.promises.rename,
  readfile: promisify(fs.readFile),
  read: promisify(fs.read),
}

export const streamPromise = {
  // node:stream/promises Added in: v15.0.0
  pipeline: promisify(stream.pipeline),
}
