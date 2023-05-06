/**
 * @internal
 *
 * assert js types
 *
 */
import type * as stream from 'node:stream'

import _ from 'lodash'

/**
 * check if typeof arg number
 */
export function isNumber(arg: unknown): arg is number {
  return typeof arg === 'number'
}

export type AnyFunction = (...args: any[]) => any

/**
 * check if typeof arg function
 */
export function isFunction(arg: unknown): arg is AnyFunction {
  return typeof arg === 'function'
}

/**
 * check if typeof arg function or undefined
 */
export function isOptionalFunction(arg: unknown): arg is undefined | AnyFunction {
  if (arg === undefined) {
    return true
  }
  return typeof arg === 'function'
}

/**
 * check if typeof arg string
 */
export function isString(arg: unknown): arg is string {
  return typeof arg === 'string'
}

/**
 * check if typeof arg object
 */
export function isObject(arg: unknown): arg is object {
  return typeof arg === 'object' && arg !== null
}

/**
 * check if object is readable stream
 */
export function isReadableStream(arg: unknown): arg is stream.Readable {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  return isObject(arg) && isFunction((arg as stream.Readable)._read)
}

/**
 * check if arg is boolean
 */
export function isBoolean(arg: unknown): arg is boolean {
  return typeof arg === 'boolean'
}

export function isEmpty(o: unknown): o is null | undefined {
  return _.isEmpty(o)
}

export function isEmptyObject(o: Record<string, unknown>): boolean {
  return Object.values(o).filter((x) => x !== undefined).length !== 0
}

/**
 * check if arg is a valid date
 */
export function isValidDate(arg: unknown): arg is Date {
  // @ts-expect-error TS(2345): Argument of type 'Date' is not assignable to param... Remove this comment to see the full error message
  return arg instanceof Date && !isNaN(arg)
}

export function isDefined<T>(o: T): o is NonNullable<T> {
  return o !== null && o !== undefined
}
