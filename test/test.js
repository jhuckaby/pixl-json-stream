// Regression tests for stream chunk boundaries.
// Run these using: npm test

var assert = require('assert');
var PassThrough = require('stream').PassThrough;
var JSONStream = require('../json-stream');

// Feed a parser the exact chunks supplied and capture its public events.
function parseChunks(chunks, options) {
	var input = new PassThrough();
	var parser = new JSONStream(input);
	var result = {
		text: [],
		json: [],
		events: []
	};
	
	options = options || {};
	if (options.EOL) parser.EOL = options.EOL;
	parser.preserveWhitespace = !!options.preserveWhitespace;
	
	parser.on('text', function(text) {
		result.text.push(text);
		result.events.push({ type: 'text', data: text });
	} );
	parser.on('json', function(data) {
		result.json.push(data);
		result.events.push({ type: 'json', data: data });
	} );
	
	chunks.forEach(function(chunk) {
		input.write(chunk);
	} );
	
	return result;
}

// Verify that every possible single split point produces identical output.
function testEveryBoundary(data, expected, options) {
	for (var idx = 1; idx < data.length; idx++) {
		var result = parseChunks([ data.substring(0, idx), data.substring(idx) ], options);
		assert.deepStrictEqual(result.events, expected, 'failed at chunk boundary ' + idx);
	}
	
	// Also exercise the extreme case where every character is a separate chunk.
	var result = parseChunks(data.split(''), options);
	assert.deepStrictEqual(result.events, expected, 'failed with one character per chunk');
}

// A chunk ending exactly on EOL should emit one complete text record.
var result = parseChunks([ 'hello\n' ], { EOL: '\n' });
assert.deepStrictEqual(result.text, [ 'hello\n' ]);

// A complete record before a partial tail must retain its EOL.
result = parseChunks([ 'hello\nwor', 'ld\n' ], { EOL: '\n' });
assert.strictEqual(result.text.join(''), 'hello\nworld\n');

// Multiple complete records before a partial tail must all retain their EOL.
result = parseChunks([ 'one\ntwo\nthr', 'ee\n' ], { EOL: '\n' });
assert.strictEqual(result.text.join(''), 'one\ntwo\nthree\n');

// Blank records are emitted only when whitespace preservation is enabled.
result = parseChunks([ 'one\n\n', 'two\n' ], { EOL: '\n', preserveWhitespace: true });
assert.strictEqual(result.text.join(''), 'one\n\ntwo\n');
result = parseChunks([ 'one\n\n', 'two\n' ], { EOL: '\n', preserveWhitespace: false });
assert.strictEqual(result.text.join(''), 'one\ntwo\n');

// Preserve multiple consecutive blank lines without joining adjacent records.
result = parseChunks([ 'one\n\n', '\nthree\n' ], { EOL: '\n', preserveWhitespace: true });
assert.strictEqual(result.text.join(''), 'one\n\n\nthree\n');

// A multi-character EOL may itself be split across chunks.
result = parseChunks([ 'one\r', '\ntwo\r\n' ], { EOL: '\r\n' });
assert.strictEqual(result.text.join(''), 'one\r\ntwo\r\n');

// JSON event ordering must remain intact when followed by partial text.
result = parseChunks([ '{"xy":1}\nhel', 'lo\n' ], { EOL: '\n' });
assert.deepStrictEqual(result.events, [
	{ type: 'json', data: { xy: 1 } },
	{ type: 'text', data: 'hello\n' }
]);

// Exercise all single boundaries, including boundaries inside CRLF itself.
testEveryBoundary('one\r\ntwo\r\n', [
	{ type: 'text', data: 'one\r\n' },
	{ type: 'text', data: 'two\r\n' }
], { EOL: '\r\n' });
testEveryBoundary('{"xy":1}\nhello\n', [
	{ type: 'json', data: { xy: 1 } },
	{ type: 'text', data: 'hello\n' }
], { EOL: '\n' });

console.log('All pixl-json-stream tests passed.');
