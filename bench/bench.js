var Bench = require('benchmark')
var assert = require('assert')
var go = require('../go')

function makeArray(len) {
  var ret = []
  for(var i = 0; i < len; i++) {
    ret.push(1)
  }
  return ret
}

var suite = new Bench.Suite

var array_10 = makeArray(10)
var array_100 = makeArray(100)

function* one() {
  return 1
}

function* sum(arr) {
  var sum = 0
  for(var i = 0; i < arr.length; i++) {
    sum += yield arr[i]
  }
  return sum
}

function* nested() {
  var i = 100
  var ret = 0
  while(i--) {
    ret += yield one()
  }
  return ret
}

function* iterate(arr) {
  for(var i = 0; i < arr.length; i++) {
    yield arr[i]
  }
}

function* gen_nested() {
  var i = 100
  while(i--) {
    for (j of yield_one()) {
      yield j
    }
  }
}

function* yield_one() {
  yield 1
}

suite.add('Plain return', function() {
  var future = go(one)
  assert.equal(future.value, 1)
})

suite.add('Sync iterating 10 element array', function() {
  var future = go(function() {return sum(array_10)})
  assert.equal(future.value, 10)
})

suite.add('Sync iterating 100 element array', function() {
  var future = go(function() {return sum(array_100)})
  assert.equal(future.value, 100)
})

suite.add('Nested 100', function() {
  var future = go(nested)
  assert.equal(future.value, 100)
})

suite.add('4 async values', function() {
  let v1 = new go.Future
  let v2 = new go.Future
  let v3 = new go.Future
  let v4 = new go.Future

  var future = go(function*() {
    return (yield v1) + (yield v2) + (yield v3) + (yield v4)
  })

  v1.done(null, 1)
  v2.done(null, 1)
  v3.done(null, 1)
  v4.done(null, 1)

  assert.equal(future.value, 4)
})

suite.add('Plain 10 element array iteration via generator', function() {
  var sum = 0
  for(var x of iterate(array_10)) {
    sum += x
  }
  assert.equal(sum, 10)
})

suite.add('Plain 100 element array iteration via generator', function() {
  var sum = 0
  for(var x of iterate(array_100)) {
    sum += x
  }
  assert.equal(sum, 100)
})

suite.add('Plain 100 element array iteration via for loop', function() {
  var sum = 0
  for (var i = 0; i < array_100.length; i++) {
    sum += array_100[i]
  }
  assert.equal(sum, 100)
})

suite.add('Gen nested 100', function() {
  var sum = 0
  for(var x of gen_nested()) {
    sum += x
  }
  assert.equal(sum, 100)
})

function sync_one() { return 1 }

suite.on('cycle', function(ev, bench) {
  console.log(String(ev.target))
})

suite.run()
