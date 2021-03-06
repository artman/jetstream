//
// scope_fetch_reply_message.js
// Jetstream
// 
// Copyright (c) 2015 Uber Technologies, Inc.
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
'use strict';

module.exports = ScopeFetchReplyMessage;

var Errors = require('../errors');
var ReplyMessage = require('./reply_message');
var robb = require('robb/src/robb');
var util = require('util');

function ScopeFetchReplyMessage(options) {
    options = options || {};
    ReplyMessage.call(this, options);

    if (robb.isUnsignedInt(options.scopeIndex) && !options.error) {
        this.scopeIndex = options.scopeIndex;
        this.error = null;
    } else if (options.error instanceof Error) {
        this.scopeIndex = null;
        this.error = options.error;
    } else {
        throw new Error('Requires scopeIndex or Error');
    }
}

util.inherits(ScopeFetchReplyMessage, ReplyMessage);

ScopeFetchReplyMessage.type = 'ScopeFetchReply';

ScopeFetchReplyMessage.parseAsJSON = function(json, callback) {
    if (!json || json.type !== this.type) {
        return callback(new Error('Message type was not \'' + this.type + '\''));
    }

    var message;
    try {
        message = new ScopeFetchReplyMessage(json);
    } catch (err) {
        return callback(err);
    }
    
    callback(null, message);
};

ScopeFetchReplyMessage.prototype.toJSON = function() {
    var json = ReplyMessage.prototype.toJSON.call(this);
    if (this.scopeIndex !== null) {
        json.scopeIndex = this.scopeIndex;
    }
    if (this.error) {
        json.error = Errors.jsonify(this.error);
    }
    return json;
};
