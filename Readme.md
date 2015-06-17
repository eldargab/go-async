#go-async

Non-conformant, generator based async/await blocks
with support for abortion and fast synchronous execution.

##Highlights

```javascript
var future = go(function*() {
  var f = yield open('foo/bar')
  try {
    var line = yield f.readLine()
    doSomething(line)
  } finally {
    f.close()
  }
})

setTimeout(function() {
  future.abort() // it takes too long, don't need this anymore
  // by this time everything is properly closed and cleaned up
}, 10000)
```

```javascript
go(function*() {
  var a = yield a()
  var b = yield 10 /* We don't care whether we'v got promise or not
                      We neither going to wrap nor defer
                      Everything runs as fast as it can and mutually interchangable
                      as far as possible.
                   */
  return a + b
})
```

##Installation

Not yet released