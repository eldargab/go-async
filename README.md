# go-async

Generator based `async/await` code blocks with support for abortion, form of TCO
and fast synchronous execution.

### Fast synchronous execution

Sometimes potentially async values are more often immediately available than not.
Typical examples of such cases are caching and lazy initialisation.

Standard control flow utilities wrap and defer synchronous values
what leads to a very pure performance (100, 1000, 1000000+ times slower than analogous synchronous code).

To the contrary, `go-async`'s `yield` statement can accept synchronous values directly.
In addition the `Future` object is provided which is analogous to `Promise`,
but can be completed and queried synchronously.

The overall result can be summarised with benchmark below.

```javascript
suite.add('100 element array iteration', function() {
  var future = go(function*() {
    var sum = 0
    for (var i = 0; i < array_100.length; i++) {
      sum += yield array_100[i]
    }
    return sum
  })
  assert.equal(future.value, 100)
})

suite.add('Plain 100 element array iteration via for loop', function() {
  var sum = 0
  for (var i = 0; i < array_100.length; i++) {
    sum += array_100[i]
  }
  assert.equal(sum, 100)
})
```

Async case is still ~ 20 times slower,
but that's better than millions (and comparison is not completely fair).

### Abortion

Async computations can be aborted. This is done by raising
a special abort exception (`e.go_abort_exception == true`) on a current yield statement.

```javascript
var future = go(function* copy() {
  try {
    var src = yield open('foo/src')
    var target = yield open('foo/target', 'w')
    var chunk
    while(null != (chunk = yield src.read())) {
      yield target.write(chunk)
    }
  } finally {
    src && src.close()
    target && target.close()
  }
})

// abort coping if it takes more than 10 secs
setTimeout(function() {
  future.abort()
}, 10000)
```

### Tail calls

```javascript
go(function* process() {
  var resource = open()
  try {
    yield processResource(resource)
    return anotherProcessingMode()
  } finally {
    resource.close()
  }
}).get(function(err, result) {
  assert.equal(result, 1)
})

function* anotherProcessingMode() {
  // By the time execution reaches this line `resource.close()` will be called.
  return 1
}
```

## Usage

```javascript
const go = require('go-async')

let future = go(function*() {
  let v1 = yield Promise.resolve(1) // wait for promise
  let v2 = yield (function*() { return 1 })() // wait for another async code block (i.e. generator)
  let v3 = yield go.thunk(cb => cb(null, 1)) // wait for thunk
  let v4 = yield go.run(1) // wait for go.Future
  let v5 = yield 1 // immediately proceed with the given value
  return v1 + v2 + v3 + v4 + v5
})

// Query for result
if (future.ready) {
  assert.equal(future.value, 5) 
  assert.equal(future.error, null)       
}

// Get the result via node style callback. It might be called immediately.
future.get(function(err, val) {
  assert.equal(err, null)
  assert.equal(val, 5)
})

// Convert to Promise
assert(future.toPromise() instanceof Promise)

// Use Promise methods directly on future
future.then(val => console.log(val))
```

### Async value protocol

`go-async` recognises async values by the presence of special protocol methods. We went with this approach because
it is somewhat faster than duck typing. The downside is that we ought to patch some standard prototypes.

Currently there are 4 types of async values

  * `Generator` (i.e all generators are treated as an async code blocks)
  * `Promise` 
  * `go.Thunk` (created by go.thunk(fn)) - async value which calls lazily given `fn` with a node style callback
  * `go.Future`
  
You can normalize all async values to `go.Future` with `go.run()`.

### Patching Promise.prototype

If you use non-standard Promise implementation, make sure you patched it's prototype with `go.patchPromise()`.

## Installation

Via npm

```
npm install go-async
```

## License

MIT