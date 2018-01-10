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
}).get(funcion(err, result) {
  assert.equal(result, 1)
})

function* anotherProcessingMode() {
  // By the time execution reaches this line `resource.close()` will be called.
  return 1
}
```

## Usage

TODO

## Installation

Via npm

```
npm install go-async
```