//
// remote_http_sync_procedure.js
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

var async = require('async');
var createTestChatRoom = require('../test/test_helpers').createTestChatRoom;
var createTestContext = require('../test/test_context');
var Scope = require('../../lib/scope');
var sinon = require('sinon');
var SyncFragment = require('../../lib/sync_fragment');
var SyncProcedureResult = require('../../lib/procedures/sync_procedure_result');
var redtape = require('redtape');
var uuid = require('node-uuid');

var context = createTestContext('RemoteHttpSyncProcedure');
var describe = context.describe;
var method = context.method;

var sandbox;
var test = redtape({
    beforeEach: function(callback) {
        sandbox = sinon.sandbox.create();
        callback();
    },
    afterEach: function(callback) {
        sandbox.restore();
        callback();
    }
});

describe(method('execute'), 'when executing procedures', function(thing) {

    test(thing('should bind incoming and scope expression values'), function t(assert) {
        var chatRoom = createTestChatRoom();
        var user = chatRoom.users.objectAtIndex(0);

        var newMessageUUID = uuid.v4();
        var newMessagePostedAt = new Date().getTime();
        var newMessageText = 'This is a new message';

        var existingMessageUUIDs = chatRoom.messages.map(function(message) {
            return message.uuid;
        });

        var syncFragments = [
            new SyncFragment({
                uuid: chatRoom.uuid,
                type: 'change',
                clsName: 'ChatRoom',
                properties: {
                    messages: existingMessageUUIDs.concat(newMessageUUID)
                }
            }),
            new SyncFragment({
                uuid: newMessageUUID,
                type: 'add',
                clsName: 'Message',
                properties: {
                    author: user.uuid,
                    postedAt: newMessagePostedAt,
                    text: newMessageText
                }
            })
        ];

        var accessToken = uuid.v4();
        var scope = new Scope({name: 'TestScope', params: {accessToken: accessToken}});

        var procedure = chatRoom.getProcedure('postMessage');
        assert.ok(procedure);
        sandbox.stub(procedure, 'httpClient', mockHttpClient);

        function mockHttpClient(options, callback) {
            assert.equal(options.url, 'http://chatRoomAPI/room/' + chatRoom.uuid + '/messages');

            assert.equal(options.method, 'POST');

            assert.deepEqual(options.headers, {
                'Content-Type': 'application/json',
                'Authorization': scope.params.accessToken,
                'X-Locale': 'en_US'
            });

            assert.deepEqual(options.json, {
                uuid: newMessageUUID,
                authorUUID: user.uuid,
                postedAt: newMessagePostedAt,
                text: newMessageText
            });

            callback(null, {statusCode: 200}, '{"posted": true}');
        }

        async.waterfall([
            function setRoot(nextCallback) {
                scope.setRoot(chatRoom, function(err) {
                    assert.ifError(err);
                    nextCallback();
                });
            },

            function executeProcedure(nextCallback) {
                procedure.execute(scope, syncFragments, nextCallback);
            },

            function verifyProcedureResult(result, nextCallback) {
                assert.ok(result instanceof SyncProcedureResult);
                assert.equal(result.additionalFragments.length, 0);
                nextCallback();
            }

        ], function(err) {
            assert.ifError(err);
            assert.end();
        });
    });

});
