// Returns a wrapper function that will promisify a given callback function.
// It will preserve 'this'.
export function promisify(fn) {
  return function () {
    // If the last argument is a function, assume its the callback.
    let callback = arguments[arguments.length - 1]

    // If the callback is given, don't promisify, just pass straight in.
    if (typeof callback === 'function') {
      return fn.apply(this, arguments)
    }

    // Otherwise, create a new set of arguments, and wrap
    // it in a promise.
    let args = [...arguments]

    return new Promise((resolve, reject) => {
      // Add the callback function.
      args.push((err, value) => {
        if (err) {
          return reject(err)
        }

        resolve(value)
      })

      // Call the function with our special adaptor callback added.
      fn.apply(this, args)
    })
  }
}
