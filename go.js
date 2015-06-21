module.exports = go

function go(block) {
  return run(block())
}

go.run = run

function run(gen) {
  var itm
    , error
    , value
    , ret = new Future
    , aborted = false
    , running = false

  loop(function(next) {
    if (aborted) return
    if (itm && itm.done) return ret.done(error, value)

    running = true

    try {
      itm = error ? gen.throw(error) : gen.next(value)
    } catch(e) {
      return ret.done(toError(e))
    }

    running = false

    // We've got abort while been in generator, do it now
    if (aborted && !itm.done) return ret.onabort()

    error = undefined
    value = undefined

    if (itm.value instanceof Future) {
      itm.value.next(function(err, val) {
        error = err
        value = val
        next()
      })
      return
    }

    if (isPromise(itm.value)) {
      itm.value.then(function(v) {
        value = v
        next()
      }, function(e) {
        error = toError(e)
        next()
      })
      return
    }

    value = itm.value
    next()
  })

  if (!ret.ready) ret.onabort = function () {
    aborted = true

    // Since our strategy is to yield results immediately
    // without going through event loop, in some
    // rare but still valid cases we can receive abortion
    // while generator is still running.
    // In such cases we must defer abortion until
    // generator step completes.
    if (running) return

    try {
      gen.throw(go.abortException)
    } catch(e) {
      if (e !== go.abortException) console.log(e)
    } finally {
      itm.value && itm.value.abort && itm.value.abort()
    }
  }

  return ret
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
  if (this.promise) {
    if (err) {
      this.reject(err)
    } else {
      this.resolve(val)
    }
    this.reject = null
    this.resolve = null
    this.promise = null
  }
  var cb = this.cb
  this.cb = null
  cb && cb(err, val)
}

Future.prototype.next = function(cb) {
  if (this.ready) return cb(this.error, this.value)
  this.cb = cb
}

Future.prototype.abort = function() {
  if (this.aborted || this.ready) return
  this.aborted = true
  this.cb = null
  this.promise = null
  this.reject = null
  this.resolve = null
  this.onabort && this.onabort()
}

Future.prototype.getPromise = function() {
  if (this.aborted) return new Promise(function() {})

  if (this.ready) return this.error
    ? Promise.reject(this.error)
    : Promise.resolve(this.value)

  if (this.promise) return this.promise

  var self = this

  return this.promise = new Promise(function(resolve, reject) {
    self.resolve = resolve
    self.reject = reject
  })
}

Future.prototype.then = function(onsucc, onerr) {
  return this.getPromise().then(onsucc, onerr)
}

Future.prototype.catch = function(cb) {
  return this.getPromise().catch(cb)
}

function toError(e) {
  if (e instanceof Error) return e
  var err = new Error('Non-error object was throwed')
  err.value = e
  return err
}

function loop(fn) {
  var sync = true
  while(sync) {
    var done = false
    fn(function() {
      done = true
      if (!sync) loop(fn)
    })
    sync = done
  }
}

function isPromise(obj) {
  return obj && typeof obj.then == 'function'
}

go.abortException = new Error('Abort exception')

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