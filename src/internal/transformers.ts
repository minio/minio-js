import type * as stream from 'node:stream'

import Through2 from 'through2'

import { isFunction } from './helper.ts'
import * as xmlParsers from './xml-parser.ts'

/**
 * getConcater returns a stream that concatenates the input and emits
 * the concatenated output when 'end' has reached. If an optional
 * parser function is passed upon reaching the 'end' of the stream,
 * `parser(concatenated_data)` will be emitted.
 */
export function getConcater(parser?: undefined | ((xml: string) => any), emitError?: boolean): stream.Transform {
  let objectMode = false
  const bufs: Buffer[] = []

  if (parser && !isFunction(parser)) {
    throw new TypeError('parser should be of type "function"')
  }

  if (parser) {
    objectMode = true
  }

  return Through2(
    { objectMode },
    function (chunk, enc, cb) {
      bufs.push(chunk)
      cb()
    },
    function (cb) {
      if (emitError) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        cb(parser(Buffer.concat(bufs).toString()))
        // cb(e) would mean we have to emit 'end' by explicitly calling this.push(null)
        this.push(null)
        return
      }
      if (bufs.length) {
        if (parser) {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          this.push(parser(Buffer.concat(bufs).toString()))
        } else {
          this.push(Buffer.concat(bufs))
        }
      }
      cb()
    },
  )
}

/**
 * Parses listMultipartUploads response.
 */
export function getListMultipartTransformer() {
  return getConcater(xmlParsers.parseListMultipart)
}
