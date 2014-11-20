//
// app.js
// Jetstream
// 
// Copyright (c) 2014 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// 
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// 
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

var createModel = require('../../').model;
var createScope = require('../../').scope;
var createServer = require('../../');
var createWebsocketTransport = require('../../').transport.WebsocketTransport.configure;
var jetstreamLogger = require('../../').logger;

// Turn on logging and set to "trace", by default it is set to "silent"
jetstreamLogger.setLevel('trace');

var Shape = createModel('Shape', function() {
    this.has('x', Number);
    this.has('y', Number);
    this.has('width', Number);
    this.has('height', Number);
    this.has('color', Number);
});

var Canvas = createModel('Canvas', function() { 
    this.has('name', String);
    this.has('shapes', [Shape]);
});

// Example of connecting multiple clients to a shared scope
var canvas = new Canvas();
canvas.name = 'Shapes Demo';

var scope = createScope({name: 'Canvas'});
scope.setRoot(canvas);

// Start server with default transports
var server = createServer({
    transports: [createWebsocketTransport({port: 3000})]
});
server.on('session', function(session, connection, params, callback) {
    // Accept the session, no authentication or authorization in this example
    callback();

    session.on('fetch', function(name, params, callback) {
        // Verify fetching the scope 
        if (name !== scope.name) {
            return callback(new Error('No such scope'));
        }
        callback(null, scope);
    });
});