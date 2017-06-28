
var exports = module.exports = function go(block) {
  var future = new Future
  var stack = new Stack
  stack.push(block())
  run(stack, future, null, null)
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
  if (this.cbs == null) return
  for(var i = 0; i < this.cbs.length; i++) {
    safecall(this.cbs[i], err, val)
  }
  this.cbs = null
}


Future.prototype.abort = function() {
  this.aborted = true
  if (this.onabort == null) return
  safecall(this.onabort)
  this.onabort = null
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


Future.prototype.__to_go_future = function() {
  return this
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
  Object.defineProperty(promise, '__to_go_future', {value: function() {
    var f = new Future

    this.then(function(val) {
      f.done(null, val)
    })

    this.catch(function(err) {
      f.done(toError(err))
    })

    return f
  }})

  Object.defineProperty(promise, '__is_go_async', {value: true})
}


upgradePromise(Promise.prototype)


function Stack() {
  this.stack = [null, null, null, null, null, null]
  this.idx = -1
  this.gen = null
}


Stack.prototype.push = function(gen) {
  if (this.gen != null) this.stack[++this.idx] = this.gen
  this.gen = gen
}


Stack.prototype.pop = function() {
  if (this.idx < 0) {
    this.gen = null
  } else {
    this.gen = this.stack[this.idx]
    this.stack[this.idx] = null
    this.idx -= 1
  }
}


function run(stack, future, err, val) {
  if (future.aborted) return
  while(true) {
    if (stack.gen == null) {
      future.done(err, val)
      return
    }

    try {
      var itm = err ? stack.gen.throw(err) : stack.gen.next(val)
    } catch(e) {
      err = toError(e)
      val = null
      stack.pop()
      continue
    }

    if (itm.done) {
      stack.pop()
    }

    if (future.aborted) {
      yieldAbort(stack)
      return
    }

    if (itm.value == null || !itm.value.__is_go_async) {
      err = null
      val = itm.value
      continue
    }

    if (itm.value.__is_gen) {
      err = null
      val = null
      stack.push(itm.value)
      continue
    }

    var wait = itm.value.__to_go_future()

    if (wait.ready) {
      err = wait.error
      val = wait.value
      continue
    }

    future.onabort = function() {
      wait.abort()
      yieldAbort(stack)
    }

    wait.get(function(err, val) {
      future.onabort = null
      run(stack, future, err, val)
    })

    return
  }
}


exports.newAbortException = newAbortException


function newAbortException() {
  var err = new Error('Abort exception')
  err.go_abort_exception = true
  return err
}


function yieldAbort(stack) {
  var exception = newAbortException()
  while(stack.gen) {
    try {
      stack.gen.throw(exception)
      tick(function() {
        throw new Error('go blocks should not catch abort exceptions')
      })
    } catch(e) {
      if (e !== exception) tick(function() {
        throw e
      })
    }
    stack.pop()
  }
}


var Gen = (function*() { yield 1})().__proto__.__proto__

Object.defineProperty(Gen, '__is_gen', {value: true})

Object.defineProperty(Gen, '__is_go_async', {value: true})


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


exports.thunk = function(fn) {
  return new Thunk(fn)
}


function Thunk(fn) {
  this.fn = fn
}


Thunk.prototype.__is_go_async = true


Thunk.prototype.__to_go_future = function() {
  var future = new Future
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
  return future
}
