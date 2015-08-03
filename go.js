module.exports = go

function go(block) {
  var args = [].slice.call(arguments, 1)
  var gen = block.apply(null, args)
  return run(gen)
}

go.run = run

function run(gen) {
  var ret = new Future
    , stack = [gen]
    , aborted = false
    , running = false
    , waits

  function pop() {
    stack.pop()
    gen = stack.length ? stack[stack.length - 1] : null
  }

  loop(function(err, val, next) {
    if (aborted) return ret.onabort() // We've got abort while been in generator, do it now
    if (!gen) return ret.done(err, val)

    waits = null
    running = true

    try {
      var itm = err ? gen.throw(err) : gen.next(val)
    } catch(e) {
      running = false
      pop()
      return next(toError(e))
    }

    running = false

    if (itm.done) pop()

    if (itm.value instanceof Future) {
      waits = itm.value
      if (!aborted) return waits.get(next)
    }

    if (aborted) return next()

    if (isGenerator(itm.value)) {
      gen = itm.value
      stack.push(gen)
      return next()
    }

    if (isPromise(itm.value)) { // this check slows down the whole thing ~ 10%
      itm.value.then(function(v) {
        next(null, v)
      }, function(e) {
        next(toError(e))
      })
      return
    }

    next(null, itm.value)
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

      while(gen) {
        try {
          gen.throw(go.abortException)
          process.nextTick(function() {
            throw new Error('go blocks should not catch abort exceptions')
          })
        } catch(e) {
          if (e !== go.abortException) process.nextTick(function() {
            throw e
          })
        }
        pop()
      }

      waits && waits.abort()
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

function loop(fn, err, val) {
  var sync = true
  while(sync) {
    var done = false
    fn(err, val, function(e, v) {
      done = true
      if (!sync) return loop(fn, e, v)
      err = e
      val = v
    })
    sync = done
  }
}

function isPromise(obj) {
  return obj && typeof obj.then == 'function'
}

function isGenerator(obj) {
  return obj && typeof obj.throw == 'function'
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
