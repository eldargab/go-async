module.exports = go

function go(block) {
  var args = [].slice.call(arguments, 1)
  var gen = block.apply(null, args)
  return run(gen)
}

go.run = run

function run(gen) {
  var ret = new Future
  var stack = new Stack(gen, ret)
  stack.run()
  if (!ret.ready) ret.onabort = function() {
    stack.abort()
  }
  return ret
}

function Stack(gen, ret) {
  this.gen = gen
  this.stack = [null, null, null, null]
  this.idx = 0
  this.running = false
  this.aborted = false
  this.waits = null
  this.ret = ret
}

Stack.prototype.push = function(gen) {
  this.stack[this.idx] = this.gen
  this.gen = gen
  this.idx++
}

Stack.prototype.pop = function() {
  if (this.idx == 0) return this.gen = null
  this.idx--
  this.gen = this.stack[this.idx]
  this.stack[this.idx] = null
}

Stack.prototype.run = function(err, val) {
  this.waits = null
  while(true) {
    if (this.aborted) return this.abort()
    if (!this.gen) return this.ret.done(err, val)

    try {
      this.running = true
      var itm = err ? this.gen.throw(err) : this.gen.next(val)
    } catch(e) {
      this.pop()
      err = toError(e)
      val = undefined
      continue
    } finally {
      this.running = false
    }

    if (itm.done) this.pop()

    if (isFuture(itm.value)) {
      if (itm.value.ready) {
        err = itm.value.error
        val = itm.value.value
        continue
      }
      this.waits = itm.value
      if (!this.aborted) return this.waits.get(this.run.bind(this))
    }

    if (this.aborted) return this.abort()

    if (isGenerator(itm.value)) {
      this.push(itm.value)
      err = undefined
      val = undefined
      continue
    }

    if (isPromise(itm.value)) {
      itm.value.then(this.run.bind(this, null), this.run.bind(this))
      return
    }

    err = undefined
    val = itm.value
  }
}

Stack.prototype.abort = function() {
  this.aborted = true

  if (this.running) return

  this.waits && this.waits.abort()

  while(this.gen) {
    try {
      this.gen.throw(abortException)
      process.nextTick(function() {
        throw new Error('go blocks should not catch abort exceptions')
      })
    } catch(e) {
      if (!go.isAbortException(e)) process.nextTick(function() {
        throw e
      })
    }
    this.pop()
  }
}

go.Future = Future

function Future() {
  this.ready = false
  this.aborted = false
}

Future.prototype.done = function(err, val) {
  if (this.aborted || this.ready) return
  this.ready = true
  this.error = err
  this.value = val
  var cbs = this.cbs
  if (!cbs) return
  this.cbs = null
  for(var i = 0; i < cbs.length; i++) {
    safecall(cbs[i], err, val)
  }
}

Future.prototype.get = function(cb) {
  if (this.ready) return cb(this.error, this.value)
  if (this.cbs) return this.cbs.push(cb)
  this.cbs = [cb]
}

Future.prototype.abort = function() {
  if (this.aborted || this.ready) return
  this.aborted = true
  this.cbs = null
  this.onabort && safecall(this.onabort)
}

Future.prototype.go_async_future = true

function safecall(cb, err, val) {
  try {
    cb(err, val)
  } catch(e) {
    process.nextTick(function() {
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

go.isFuture = isFuture

function isFuture(obj) {
  return obj && obj.go_async_future
}

function isPromise(obj) {
  return obj && typeof obj.then == 'function'
}

function isGenerator(obj) {
  return obj && typeof obj.throw == 'function'
}

go.isAbortException = function(e) {
  return e && e.go_abort_exception
}

const abortException = new Error('Abort exception')

abortException.go_abort_exception = true

go.fn = function(block) {
  return function() {
    return run(block.apply(this, arguments))
  }
}

go.thunk = function(thunk) {
  var ret = new Future

  thunk(function(err, val) {
    ret.done(err, val)
  })

  return ret
}
