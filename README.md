# go-async

This library appeared because neither standard `async/await` functions nor
numerous polyfills have the following properties.

### Fast synchronous execution

Sometimes potentially async values are more often immediately available than not.
Typical examples of such cases are caching and lazy initialisation.
Also for streaming parsers it's often the case that
single network packet contains many syntactic constructs and hence polling
for the next chunk more often succeeds than not.

Standard control flow utilities wrap and defer synchronous values
what leads to a very slow execution (100, 1000, 1000000+ times slower than analogous synchronous code).

To the contrary, with `go-async` you can `yield` synchronous values directly without any overhead.

At the time of writing `sumSync()` below is just 20 times faster than `sumAsync()`.

```javascript
function sumSync() {
  var sum = 0
  for(var i = 0; i < arr.length; i++) {
    sum += arr[i]
  }
  return sum
}

function* sumAsync() {
  var sum = 0
  for(var i = 0; i < arr.length; i++) {
    sum += yield arr[i]
  }
  return sum
}
```

### Abortion

It should be possible to abort long running computations and release all resources.

```javascript
var go = require('go-async')

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

Abortion is done by raising a special abort exception (`e.go_abort_exception == true`)
on a current yield statement.

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
  // By the time execution reaches this line all of the `process()` resources will be freed.
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