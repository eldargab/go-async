var should = require('should')
var go = require('../go')

describe('go-async', function() {
  describe('go-block', function() {
    it('Should return future', function() {
      var f = go(function*() {
        yield 1
      })
      f.should.be.instanceOf(go.Future)
    })

    it('Should support generators', function(done) {
      go(function*() {
        return (function*() { return 'a' })()
      }).get(function(err, a) {
        if (err) return done(err)
        a.should.equal('a')
        done()
      })
    })

    it('Should support promises', function(done) {
      go(function*() {
        var a = yield Promise.resolve(1)
        var b = yield Promise.resolve(2)
        return a + b
      }).get(function(err, ab) {
        if (err) return done(err)
        ab.should.equal(3)
        done()
      })
    })

    it('Should support futures', function(done) {
      go(function*() {
        var a = yield go(function*() { return Promise.resolve(10) })
        return a + 1
      }).get(function(err, a) {
        if (err) return done(err)
        a.should.equal(11)
        done()
      })
    })

    it('Should support regular values and complete synchronously if possible', function() {
      var f = go(function*() {
        var a = yield 1
        var b = yield go(function*() { return 10 })
        return a + b
      })
      f.ready.should.be.true()
      f.value.should.equal(11)
    })

    it('Should support abortion', function() {
      var finals = 0
      var caught = false
      var f = go(function*() {
        try {
          yield go(function*() {
            try {
              yield Promise.resolve(5)
            } finally {
              finals++
            }
          })
        } catch(e) {
          caught = true
          e.go_abort_exception.should.be.true()
          throw e
        } finally {
          finals++
        }
      })
      finals.should.equal(0)
      f.abort()
      caught.should.be.true()
      finals.should.equal(2)
    })

    it('Should support abortion within generator', function() {
      var lock = new go.Future
      var seenAbortException = false
      var f = go(function*() {
        yield lock
        should(function() {
          f.abort()
        }).not.throw()
        try {
          yield 1
        } catch(e) {
          e.should.have.property('go_abort_exception').equal(true)
          seenAbortException = true
          throw e
        }
      })
      lock.done()
      seenAbortException.should.be.true()
    })
  })
})
