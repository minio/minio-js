// wrapper an async function that support callback style API.
// It will preserve 'this'.
export function callbackify(fn) {
  return function () {
    const args = [...arguments]
    const callback = args.pop()

    // If the last argument is a function, assume it's the callback.
    if (typeof callback === 'function') {
      return fn.apply(this, args).then(
        (result) => callback(null, result),
        (err) => callback(err),
      )
    }

    return fn.apply(this, arguments)
  }
}
