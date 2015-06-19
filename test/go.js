var should = require('should')
var go = require('../go')

describe('go-async', function() {
  describe('go block', function() {
    it('Should return future', function() {
      go(function*() {
        yield 1
      }).should.be.instanceOf(go.Future)
    })

    it('Should support promises', function() {
      return go(function*() {
        var a = yield Promise.resolve(1)
        var b = yield Promise.resolve(2)
        return a + b
      }).then(function(ab) {
        ab.should.equal(3)
      })
    })

    it('Should support futures', function() {
      return go(function*() {
        var a = yield go(function*() { return Promise.resolve(10)})
        return a + 1
      }).then(function(a) {
        a.should.equal(11)
      })
    })

    it('Should support regular values and complete synchronously if possible', function() {
      var f = go(function*() {
        var a = yield 1
        var b = yield go(function*() { return 10 })
        return a + b
      })
      f.ready.should.be.true
      f.value.should.equal(11)
    })

    it('Should support abortion', function() {
      var finals = 0
      var catched = false
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
          catched = true
        } finally {
          finals++
        }
      })
      catched.should.be.false
      finals.should.equal(0)
      f.abort()
      finals.should.equal(2)
      f.aborted.should.be.true
    })
  })
})