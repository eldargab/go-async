
exports = module.exports = go
exports.Future = Future
exports.thunk = thunk
exports.patchPromise = patchPromise


function go(block) {
  var future = new Future
  var gen = block()
  run(gen, future)
  return future
}


go.run = function(asyncValue) {
  var future = new Future
  asyncValue.__yield_to_future(future)
  return future
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
  var cbs = this.cbs
  if (cbs) {
    this.cbs = null
    for (var i = 0; i < cbs.length; i++) {
      safecall(cbs[i], err, val)
    }
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


Future.prototype.__yield_to_future = function(future) {
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


function patchPromise(promise) {
  Object.defineProperty(promise, '__yield_to_future', {value: function(future) {
    this.then(function(val) {
      future.done(null, val)
    })

    this.catch(function(err) {
      future.done(toError(err))
    })
  }})
}


if (Promise.prototype.__yield_to_future == null) {
  patchPromise(Promise.prototype)
}


function run(gen, future, err, val) {
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
      if (val == null || !val.__yield_to_future) {
        future.done(err, val)
      } else {
        val.__yield_to_future(future)
      }
      return
    }

    if (future.aborted) {
      yieldAbort(gen)
      return
    }

    if (val == null || !val.__yield_to_future) {
      continue
    }

    var wait = new Future()

    val.__yield_to_future(wait)

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
    future.onabort = null
    if (!future.aborted) run(gen, future, err, val)
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


var GeneratorPrototype = Object.getPrototypeOf(
  Object.getPrototypeOf(
    (function*() { yield 1 })()
  )
)


Object.defineProperty(GeneratorPrototype, '__yield_to_future', {value: function(future) {
  run(this, future)
}})


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


Thunk.prototype.__yield_to_future = function(future) {
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


function thunk(fn) {
  return new Thunk(fn)
}
