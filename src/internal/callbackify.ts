/* eslint-disable @typescript-eslint/no-explicit-any */

// Wrapper for an async function that supports callback style API.
// It will preserve 'this'.
export function callbackify(fn: (...args: any[]) => any) {
  return function (this: any, ...args: any[]) {
    const lastArg = args[args.length - 1]

    if (typeof lastArg === 'function') {
      const callback = args.pop()
      return fn.apply(this, args).then(
        (result: any) => callback(null, result),
        (err: any) => callback(err),
      )
    }

    return fn.apply(this, args)
  }
}
