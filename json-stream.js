// JSON Buffer Stream
// Handles buffering JSON records over standard streams (pipes or sockets)
//
// Assumes one entire JSON document per line, delimited by Unix EOL (\n).
// Emits 'json' event for each JSON document received.
// write() method accepts object to be JSON-stringified and written to stream.
// Passes errors thru on 'error' event (with addition of JSON parse errors).
//
// Copyright (c) 2014 Joseph Huckaby
// Released under the MIT License

var Class = require("pixl-class");

module.exports = Class.create({
	
	streamIn: null,
	streamOut: null,
	buffer: '',
	perf: null,
	recordRegExp: /\S/,
	
	__construct: function(stream_in, stream_out) {
		// class constructor
		if (!stream_out) stream_out = stream_in;
		
		this.streamIn = stream_in;
		this.streamOut = stream_out;
		
		this.init();
	},
	
	setPerf: function(perf) { this.perf = perf; },
	
	init: function() {
		// hook stream read
		var self = this;
		
		this.streamIn.setEncoding('utf8');
		this.streamIn.on('data', function(data) {
			if (self.buffer) {
				data = self.buffer + data;
				self.buffer = '';
			}
			
			var records = data.split(/\n/);
			
			// see if data ends on EOL -- if not, we have a partial block
			// fill buffer for next read
			if (data.substring(data.length - 1) != "\n") {
				self.buffer = records.pop();
			}
			
			var record = '';
			var json = null;
			
			for (var idx = 0, len = records.length; idx < len; idx++) {
				record = records[idx];
				if (record.match(self.recordRegExp)) {
					json = null;
					
					if (self.perf) self.perf.begin('json_parse');
					try { json = JSON.parse(record); }
					catch (e) {
						self.emit('error', new Error("JSON Parse Error: " + e.message));
					}
					if (self.perf) self.perf.end('json_parse');
					
					if (json) {
						self.emit('json', json);
					}
				} // record has content
			} // foreach record
			
		} );
		
		// passthrough errors, other events
		this.streamIn.on('error', function(e) {
			self.emit('error', e);
		} );
		this.streamIn.on('end', function() {
			self.emit('end');
		} );
	},
	
	write: function(json, callback) {
		// write json data to stream plus EOL
		if (this.perf) this.perf.begin('json_compose');
		var data = JSON.stringify(json);
		if (this.perf) this.perf.end('json_compose');
		
		this.streamOut.write( data + "\n", callback );
	}
	
});
