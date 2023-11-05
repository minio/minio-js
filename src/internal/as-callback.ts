import { isFunction } from './helper.ts'

export function asCallback<T = void>(
  cb: undefined | ((err: unknown | null, result: T) => void),
  promise: Promise<T>,
): Promise<T> | void {
  if (cb === undefined) {
    return promise
  }

  if (!isFunction(cb)) {
    throw new TypeError(`callback should be of type "function", got ${cb}`)
  }

  promise.then(
    (result) => {
      cb(null, result)
    },
    (err) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      cb(err)
    },
  )
}

export function asCallbackFn<T = void>(
  cb: undefined | ((err: unknown | null, result: T) => void),
  asyncFn: () => Promise<T>,
): Promise<T> | void {
  return asCallback(cb, asyncFn())
}
