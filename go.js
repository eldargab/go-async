
exports = module.exports = go
exports.run = run
exports.Future = Future
exports.thunk = thunk
exports.patchPromise = patchPromise


function go(block) {
  var gen = block()
  var future = new Future
  rungen(gen, future)
  return future
}


function run(val) {
  if (val == null || !val.__yield_to_go_future) {
    var future = new Future
    future.done(null, val)
    return future
  } else {
    return val.__to_go_future()
  }
}


function Future() {
  this.ready = false
  this.aborted = false
}


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


Future.prototype.abort = function() {
  this.aborted = true
  var onabort = this.onabort
  if (onabort) {
    this.onabort = null
    safecall(onabort)
  }
}


Future.prototype.get = function(cb) {
  if (this.ready) {
    cb(this.error, this.value)
  } else if (this.cbs) {
    this.cbs.push(cb)
  } else {
    this.cbs = [cb]
  }
}


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


Future.prototype.then = function() {
  return Promise.prototype.then.apply(this.toPromise(), arguments)
}


Future.prototype.catch = function() {
  return Promise.prototype.catch.apply(this.toPromise(), arguments)
}


Future.prototype.finally = function() {
  return Promise.prototype.finally.apply(this.toPromise(), arguments)
}


Future.prototype.__yield_to_go_future = function(future) {
  if (this.ready) return future.done(this.error, this.value)
  if (this.aborted) return future.abort()

  var self = this

  future.onabort = function() {
    self.abort()
  }

  this.get(function(err, val) {
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


Object.defineProperty(GeneratorPrototype, '__yield_to_go_future', {value: function(future) {
  rungen(this, future)
}})


Object.defineProperty(GeneratorPrototype, '__to_go_future', {value: __to_go_future})


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


function toError(e) {
  if (e instanceof Error) return e
  var err = new Error('Non-error object was throwed')
  err.value = e
  return err
}


function Thunk(fn) {
  this.fn = fn
}


Thunk.prototype.__yield_to_go_future = function(future) {
  try {
    this.fn(function(err, val) {
      future.done(err, val)
    })
  } catch(e) {
    if (future.ready) {
      tick(function() { throw e })
    } else {
      future.done(toError(e))
    }
  }
}


Thunk.prototype.__to_go_future = __to_go_future


function thunk(fn) {
  return new Thunk(fn)
}
