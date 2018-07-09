
exports = module.exports = go
exports.run = run
exports.Future = Future
exports.thunk = thunk
exports.patchPromise = patchPromise
exports.toError = toError


/**
 * Safely execute any function and convert the result to Future
 *
 * @param {function} block
 * @param {...*} block_arguments
 * @returns {Future}
 */
function go(block) {
  var val
  try {
    switch (arguments.length) {
      case 1:
        val = block()
        break
      case 2:
        val = block(arguments[1])
        break
      case 3:
        val = block(arguments[1], arguments[2])
        break
      case 4:
        val = block(arguments[1], arguments[2], arguments[3])
        break
      default:
        val = block.apply(null, Array.prototype.slice.call(arguments, 1))
    }
  } catch (e) {
    return finished(toError(e))
  }
  return run(val)
}


function finished(err, val) {
  var future = new Future
  future.done(err, val)
  return future
}


/**
 * Convert any value to {Future}.
 *
 * @param val
 * @returns {Future}
 */
function run(val) {
  if (val == null || !val.__yield_to_go_future) {
    return finished(null, val)
  } else {
    return val.__to_go_future()
  }
}


/**
 * Create a new Future.
 *
 * @constructor
 * @classdesc Analog of Promise, but with support for synchronous completion and abortion
 */
function Future() {
  this.ready = false
  this.aborted = false
}


/**
 * Set the result of computation.
 *
 * This is a one time operation. Subsequent calls to `.done()` have no effect.
 *
 * Examples:
 *
 *    future.done(null, 1)              // Successfully complete with value 1
 *    future.done(new Error('Unknown')) // Complete with error
 *
 * @param {Error?} err
 * @param [val]
 * @public
 */
Future.prototype.done = function(err, val) {
  if (this.ready) return
  this.ready = true
  this.error = err
  this.value = val
  if (this.cbs) this._callCallbacks(err, val)
}


Future.prototype._callCallbacks = function(err, val) {
  var cbs = this.cbs
  this.cbs = null
  for (var i = 0; i < cbs.length; i++) {
    safecall(cbs[i], err, val)
  }
}


/**
 * Signal to async computation that the result is no longer needed.
 *
 * Note that abortion and future readiness are completely unrelated.
 * To provide some result call `.done()` separately.
 */
Future.prototype.abort = function() {
  this.aborted = true
  var onabort = this.onabort
  if (onabort) {
    this.onabort = null
    safecall(onabort)
  }
}


/**
 * Get the result via node style callback.
 *
 * Note that callback might be called immediately.
 *
 * @param cb - Node style callback
 */
Future.prototype.get = function(cb) {
  if (this.ready) {
    safecall(cb, this.error, this.value)
  } else if (this.cbs) {
    this.cbs.push(cb)
  } else {
    this.cbs = [cb]
  }
}


/**
 * Convert this future to a standard `Promise`.
 *
 * @returns {Promise}
 */
Future.prototype.toPromise = function() {
  if (this._promise) return this._promise
  var self = this
  return this._promise = new Promise(function(resolve, reject) {
    self.get(function(err, val) {
      if (err) {
        reject(err)
      } else {
        resolve(val)
      }
    })
  })
}


/**
 * Like {Promise#then}
 *
 * @returns {Promise}
 */
Future.prototype.then = function() {
  return Promise.prototype.then.apply(this.toPromise(), arguments)
}


/**
 * Like {Promise#catch}
 *
 * @returns {Promise}
 */
Future.prototype.catch = function() {
  return Promise.prototype.catch.apply(this.toPromise(), arguments)
}


/**
 * Like {Promise#finally}
 *
 * @returns {Promise}
 */
Future.prototype.finally = function() {
  return Promise.prototype.finally.apply(this.toPromise(), arguments)
}


Future.prototype.__yield_to_go_future = function(future) {
  if (this.ready) {
    future.done(this.error, this.value)
  } else {
    this._yieldAsync(future)
  }
}


Future.prototype._yieldAsync = function(future) {
  var self = this

  future.onabort = function() {
    self.abort()
  }

  this.get(function(err, val) {
    future.onabort = null
    future.done(err, val)
  })
}


Future.prototype.__to_go_future = function() {
  return this
}


function __to_go_future() {
  var future = new Future
  this.__yield_to_go_future(future)
  return future
}


/**
 * Patch the standard `promise` to become compatible with `go-async`'s async value protocol
 *
 * @param promise
 */
function patchPromise(promise) {
  Object.defineProperty(promise, '__yield_to_go_future', {value: function(future) {
    this.then(function(val) {
      future.done(null, val)
    })

    this.catch(function(err) {
      future.done(toError(err))
    })
  }})

  Object.defineProperty(promise, '__to_go_future', {value: __to_go_future})
}


if (Promise.prototype.__yield_to_go_future == null) {
  patchPromise(Promise.prototype)
}


var GeneratorPrototype = Object.getPrototypeOf(
  Object.getPrototypeOf(
    (function*() { yield 1 })()
  )
)


if (GeneratorPrototype.__yield_to_go_future == null) {
  Object.defineProperty(GeneratorPrototype, '__yield_to_go_future', {value: function(future) {
      rungen(this, future)
    }})


  Object.defineProperty(GeneratorPrototype, '__to_go_future', {value: __to_go_future})
}


function rungen(gen, future, err, val) {
  var itm

  while(true) {

    try {
      itm = err ? gen.throw(err) : gen.next(val)
    } catch(e) {
      future.done(toError(e))
      return
    }

    err = null
    val = itm.value

    if (itm.done) {
      if (val == null || !val.__yield_to_go_future) {
        future.done(err, val)
      } else {
        val.__yield_to_go_future(future)
      }
      return
    }

    if (future.aborted) {
      yieldAbort(gen)
      return
    }

    if (val == null || !val.__yield_to_go_future) {
      continue
    }

    var wait = val.__to_go_future()

    if (wait.ready) {
      err = wait.error
      val = wait.value
      continue
    }

    handleAsync(gen, future, wait)

    return
  }
}


function handleAsync(gen, future, wait) {
  future.onabort = function() {
    wait.abort()
    yieldAbort(gen)
  }

  wait.get(function(err, val) {
    if (future.aborted) return
    future.onabort = null
    rungen(gen, future, err, val)
  })
}


function newAbortException() {
  var err = new Error('Abort exception')
  err.go_abort_exception = true
  return err
}


function yieldAbort(gen) {
  var exception = newAbortException()
  try {
    gen.throw(exception)
    tick(function() {
      throw new Error('go blocks should not catch abort exceptions')
    })
  } catch(e) {
    if (e !== exception) tick(function() {
      throw e
    })
  }
}


function safecall(cb, err, val) {
  try {
    cb(err, val)
  } catch(e) {
    tick(function() {
      throw e
    })
  }
}


function tick(cb) {
  if (process && process.nextTick) {
    process.nextTick(cb)
  } else {
    setTimeout(cb)
  }
}


/**
 * If the given value is an instance of {Error} just return it as is, else wrap it with one
 *
 * @param e
 * @returns {Error}
 */
function toError(e) {
  if (e instanceof Error) return e
  var err = new Error('Non-error object was throwed')
  err.value = e
  return err
}



/**
 * Call given function with a node style callback and return a {Future}
 *
 * Example:
 *
 *    go(function*() {
 *      let one = yield thunk(cb => cb(null, 1))
 *      assert.equal(one, 1)
 *    })
 *
 * @param fn
 * @returns {Thunk}
 */
function thunk(fn) {
  var future = new Future
  fn(function(err, result) {
    future.done(err, result)
  })
  return future
}
