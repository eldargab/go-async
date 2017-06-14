# go-async

Non-conformant, generator based async/await blocks
with support for abortion, form of TCO and fast synchronous execution.

## Highlights

### Abortion

```javascript
var future = go(function*() {
  var f = yield open('foo/bar')
  try {
    var line
    while (line = yield f.readLine()) {
      console.log(line)
    }
  } finally {
    f.close()
  }
})

setTimeout(function() {
  future.abort()
}, 10000)
```

Essentially, `future.abort()` raises special abort exception on a current yield statement,
so you can properly release all resources using finally blocks.

### Tail calls

```javascript
go(function* process() {
  var events = subscribe()
  try {
    var event = yield events.receive()
    while (event != 'switch_to_another_mode') {
      handle(event)
    }
    return another_mode()
  } finally {
    events.unsubscribe()
  }
})

function* another_mode() {
  //do something else
}
```

Here we start to process events from some event source until
ordered to switch to another processing mode.
Note, that before `another_mode()` kicks in, the current generator
will be properly completed.


### Fast synchronous execution

```javascript
go(function*() {
  var a = yield 1
  var b = yield 10
  return a + b
})
```

Sometimes async values are immediately available. Sometimes, there are a lot of async
values immediately available. Common practice of wrapping such values in `Promise`
leads to disaster. But within our go blocks `var a = yield 1` is nearly as fast `var a = 1`.

## Installation

Not yet released