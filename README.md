# Overview

This module provides a convenient way to send/receive complex data objects over streams (pipes and sockets).  It does this by transparently serializing the data to JSON, and parsing it on the other side, emitting a `json` event to your code whenever it has a complete JSON message.

The library handles all buffering for you, and so it will only emit one `json` event for each completed JSON document, pre-parsed into a data object for your callback.  And for sending data, you can pass it a complex object, which will be auto-serialized and streamed over the pipe or socket.

# Usage

Use [npm](https://www.npmjs.com/) to install the module:

```
npm install pixl-json-stream
```

Then use `require()` to load it in your code:

```javascript
const JSONStream = require('pixl-json-stream');
```

To use the module, instantiate an object, and attach it to a stream:

```javascript
let stream = new JSONStream( read_stream, write_stream );
```

Network sockets are both read and write, so you only need to pass in one argument for those:

```javascript
let stream = new JSONStream( socket_handle );
```

You can then add a listener for the `json` event to receive a fully parsed JSON document, or call `write()` to send one.  Example:

```javascript
stream.on('json', function(data) {
	console.log("Got data: ", data);
} );
stream.write({ action: "something", code: 1234 });
```

You will always receive pre-parsed JSON as a data object, and `write()` handles all serialization for you as well.  So you never have to call `JSON.parse()` or `JSON.stringify()` directly.

## Use With Child Processes

Here is a more complete example, which attaches a read/write JSON stream to a child process, sets up a read listener, and writes to the child:

```javascript
const JSONStream = require('pixl-json-stream');

// spawn worker process
let child = require('child_process').spawn( 
	'node', ['my-worker.js'], 
	{ stdio: ['pipe', 'pipe', 'pipe'] }
);

// connect json stream to child's stdio
// (read from child.stdout, write to child.stdin)
let stream = new JSONStream( child.stdout, child.stdin );

stream.on('json', function(data) {
	// received data from child
	console.log("Got data from child: ", data);
} );

// write data to child
stream.write({
	action: 'update_user_record',
	username: 'jhuckaby',
	other: 12345
});

// close child's stdin so it can exit normally
child.stdin.end();
```

You can also use a JSON stream in the child process itself, to handle the other side of the pipe:

```javascript
const JSONStream = require('pixl-json-stream');

let stream = new JSONStream( process.stdin, process.stdout );
stream.on('json', function(data) {
	// got data from parent, send something back
	stream.write({ code: 0, description: "Success from child" });
} );
```

## Use With Network Sockets

You can also use JSON streams over network sockets, providing an easy way to send structured data to/from your clients and servers.  For example, on the server side you could have:

```javascript
let server = require('net').createServer(function(socket) {
	// new connection, attach JSON stream handler
	let stream = new JSONStream(socket);
	
	stream.on('json', function(data) {
		// got gata from client
		console.log("Received data from client: ", data);
		
		// send response
		stream.write({ code: 1234, description: "We hear you" });
	} );
});
server.listen( 3012 );
```

And on the client side...

```javascript
let client = require('net').connect( {port: 3012}, function() {
	// connected to server, now use JSON stream to communicate
	let stream = new JSONStream( client );
	
	stream.on('json', function(data) {
		// got response back from server
		console.log("Received response from server: ", data);
	} );
	
	// send greetings
	stream.write({ code: 2345, description: "Hello from client!" });
} );
```

## Matching JSON records

By default, the library recognizes JSON documents on lines using the following regular expression:

```js
/^\s*\{/
```

This is a very loose pattern match, designed to be performant (i.e. it only matches up to the first opening curly brace, and then assumes the entire line is JSON).  However, if you would like this to be more strict and/or exact, you can change the pattern by setting the `recordRegExp` property on your stream instance, and set it to a custom regular expression of your choice.  Here is an example of this:

```js
let stream = new JSONStream( process.stdin, process.stdout );
stream.recordRegExp = /^\s*\{.+\}\s*$/;
```

This would match both opening and closing curly braces on a line.  While this is slower, it is more exact and would only match full JSON documents on a line.

## Catching Non-JSON Text

When the library detects non-JSON lines, it emits a `text` event.  You can capture these and handle them how you see fit.  Example:

```js
let stream = new JSONStream( process.stdin, process.stdout );

stream.on('text', function(text) {
	// got a line of text that is not JSON
} );
```

### Preserving Whitespace

The library will by default skip lines of text that are purely whitespace (e.g. blank empty lines).  If you would like to change this behavior, set the `preserveWhitespace` property to true.  Then you will receive **all** the raw `text` events regardless of their content.  Example:

```js
let stream = new JSONStream( process.stdin, process.stdout );
stream.preserveWhitespace = true;
```

## End of Lines

By default, the library assumes each JSON record will be delimited by the current operating system's end-of-line character sequence ([os.EOL](https://nodejs.org/api/os.html#os_os_eol)), which is `\n` on Unix/Linux/OSX.  However, you can change this by setting the `EOL` string property on your class instance:

```js
let stream = new JSONStream( process.stdin, process.stdout );
stream.EOL = "\r\n"; // DOS line endings
```

## Maximum Line Length

The library has an "emergency brake" which kicks in if a single line grows beyond 2 MB (1,048,576 UTF-16 characters) by default.  This is to prevent a runaway memory situation.  If this limit is reached, the line is truncated *from the end*.  The idea here is to better handle cases where terminal or script output has overwriting lines (i.e. using `/r` carriage returns), where the most important information will probably be towards the end of the buffer.  To customize the line limit, set the `maxLineLength` property on your stream instance.  Example:

```js
let stream = new JSONStream( process.stdin, process.stdout );
stream.maxLineLength = 1024 * 1024;
```

Note that JavaScript strings are interally encoded in UTF-16, so each character takes up 2 bytes of RAM.

## Performance Tracking

If you happen to use our [pixl-perf](https://www.github.com/jhuckaby/pixl-perf) module in your application, you can pass in a performance tracker by calling `setPerf()` on a JSON Stream.  Example:

```js
let stream = new JSONStream( process.stdin, process.stdout );
stream.setPerf( perf );
```

This will track the total JSON parse time, the JSON compose time, and the JSON payload sizes on both reads and writes.  Also, if any stream `write()` calls happen to return `false` (i.e. buffered), a special `json_stream_write_buffer` perf counter is incremented.  Here are all the performance tracking keys used:

| Perf Key | Type | Description |
|----------|------|-------------|
| `json_stream_parse` | Elapsed Time | Time spent parsing JSON. |
| `json_stream_compose` | Elapsed Time | Time spent composing JSON. |
| `json_stream_bytes_read` | Counter | Number of bytes read from stream. |
| `json_stream_bytes_written` | Counter | Number of bytes written to stream. |
| `json_stream_msgs_read` | Counter | Number of JSON messages read from stream. |
| `json_stream_msgs_written` | Counter | Number of JSON messages written to stream. |
| `json_stream_write_buffer` | Counter | Number of times the stream `write()` call returned `false`. |

# License

**The MIT License**

*Copyright (c) 2014 - 2022 Joseph Huckaby*

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
