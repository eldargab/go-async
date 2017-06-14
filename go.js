
var exports = module.exports = go


function go(block) {
  var future = new Future
  block().__yield_to_go_future(future)
  return future
}


exports.Future = Future
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
    for(var i = 0; i < cbs.length; i++) {
      safecall(cbs[i], err, val)
    }
  }
}


Future.prototype.abort = function() {
  this.aborted = true
  var abort = this.onabort
  if (abort) {
    this.onabort = null
    safecall(abort)
  }
}


Future.prototype.get = function(cb) {
  if (this.ready) return cb(this.error, this.value)
  if (this.cbs) return this.cbs.push(cb)
  this.cbs = [cb]
}


Future.prototype.__yield_to_go_future = function(f) {
  if (this.ready) {
    f.done(this.error, this.value)
  } else {
    var self = this
    f.onabort = function() {
      self.abort()
    }
    this.get(function(err, val) {
      f.done(err, val)
    })
  }
}


Future.prototype.__is_go_async = true


Future.prototype.toPromise = function() {
  var self = this
  return new Promise(function(resolve, reject) {
    self.get(function(err, val) {
      if (err) {
        reject(err)
      } else {
        resolve(val)
      }
    })
  })
}


exports.upgradePromise = upgradePromise
function upgradePromise(promise) {
  Object.defineProperty(promise, '__yield_to_go_future', {value: function(f) {
    this.then(function(val) {
      f.done(null, val)
    })

    this.catch(function(err) {
      f.done(toError(err))
    })
  }})

  Object.defineProperty(promise, '__is_go_async', {value: true})
}


upgradePromise(Promise.prototype)


function run(gen, future, err, val) {
  while(!future.aborted) {
    try {
      var itm = err ? gen.throw(err) : gen.next(val)
    } catch(e) {
      future.done(toError(e))
      return
    }

    if (future.aborted) {
      if (!itm.done) yieldAbort(gen)
      return
    }

    if (itm.done) {
      if (itm.value == null || !itm.value.__is_go_async) {
        future.done(null, itm.value)
      } else {
        itm.value.__yield_to_go_future(future)
      }
      return
    }

    if (itm.value == null || !itm.value.__is_go_async) {
      err = null
      val = itm.value
      continue
    }

    var wait = new Future

    itm.value.__yield_to_go_future(wait)

    if (wait.ready) {
      err = wait.error
      val = wait.value
      continue
    }

    future.onabort = function() {
      wait.abort()
      yieldAbort(gen)
    }

    wait.get(function(err, val) {
      future.onabort = null
      run(gen, future, err, val)
    })

    return
  }
}


function yieldAbort(gen) {
  var abortException = new Error('Abort exception')
  abortException.go_abort_exception = true
  try {
    gen.throw(abortException)
    setTimeout(function() {
      throw new Error('go blocks should not catch abort exceptions')
    })
  } catch(e) {
    if (e !== abortException) process.nextTick(function() {
      throw e
    })
  }
}


var Gen = (function*() { yield 1})().__proto__.__proto__


Object.defineProperty(Gen, '__yield_to_go_future', {value: function(f) {
  run(this, f, null, null)
}})


Object.defineProperty(Gen, '__is_go_async', {value: true})


function safecall(cb, err, val) {
  try {
    cb(err, val)
  } catch(e) {
    setTimeout(function() {
      throw e
    })
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
  this.fn(function(err, val) {
    future.done(err, val)
  })
}


Thunk.prototype.__is_go_async = true


exports.thunk = function(fn) {
  return new Thunk(fn)
}