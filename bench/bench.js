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

function sum(arr) {
  return go(function*() {
    var sum = 0
    for(var i = 0; i < arr.length; i++) {
      sum += yield arr[i]
    }
    return sum
  })
}

function* iterate(arr) {
  for(var i = 0; i < arr.length; i++) {
    yield arr[i]
  }
}

suite.add('Plain return', function() {
  var future = go(function*() { return 10 })
  assert.equal(future.value, 10)
})

suite.add('Sync iterating 10 element array', function() {
  var future = sum(array_10)
  assert.equal(future.value, 10)
})

suite.add('Sync iterating 100 element array', function() {
  var future = sum(array_100)
  assert.equal(future.value, 100)
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

suite.on('cycle', function(ev, bench) {
  console.log(String(ev.target))
})

suite.run({async: true})