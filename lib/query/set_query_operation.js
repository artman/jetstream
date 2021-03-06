//
// query_set_operation.js
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

module.exports = SetQueryOperation;

var _ = require('lodash');
var AbstractQueryOperation = require('./abstract_query_operation');
var async = require('async');
var Err = require('rust-result').Err;
var KeyPathNotation = require('./key_path_notation');
var LateBoundSyncFragment = require('./late_bound_sync_fragment');
var Ok = require('rust-result').Ok;
var util = require('util');

function SetQueryOperation(options) {
    AbstractQueryOperation.call(this, options);

    this.prepared = false;
    this.executing = false;
    this.executed = false;
    this.lateBoundSyncFragments = [];
}

util.inherits(SetQueryOperation, AbstractQueryOperation);

SetQueryOperation.prototype.prepareAndValidate = function(callback) {
    var modification = this.modification;
    if (this._modificationHasUUIDOrType(modification)) {
        return callback(new Error(
            'Illegal $set modification, $uuid or $cls cannot ' + 
            'be set for an existing ModelObject'));
    }

    var addSyncFragments = [];
    var propertiesAndTypeClassByKeyPath = {};
    async.mapSeries(Object.keys(modification), function(keyPath, doneCallback) {
        var value = modification[keyPath];

        var queryTypeClass = this.typeClass;
        var result = KeyPathNotation.resolveProperty(queryTypeClass, keyPath);
        if (Err(result)) {
            return doneCallback(new Error(
                'Illegal $set modification at keyPath \'' + keyPath + 
                '\': ' + Err(result).message));
        }

        result = Ok(result);

        var property = result.property;
        var key = property.name;
        var ownerTypeClass = result.ownerTypeClass;
        var ownerKeyPath = result.ownerKeyPath;

        var propertiesAndTypeClass = propertiesAndTypeClassByKeyPath[ownerKeyPath];
        if (!propertiesAndTypeClass) {
            propertiesAndTypeClass = {typeClass: ownerTypeClass, properties: {}};
            propertiesAndTypeClassByKeyPath[ownerKeyPath] = propertiesAndTypeClass;
        }

        var properties = propertiesAndTypeClass.properties;
        this._getPropertyValue('$set', property, keyPath, value, function(err, value, createdSyncFragments) {
            if (err) {
                return doneCallback(err);
            }
            properties[key] = value;
            addSyncFragments = addSyncFragments.concat(createdSyncFragments);
            doneCallback();
        });

    }.bind(this), function(err) {
        if (err) {
            return callback(err);
        }

        async.mapSeries(Object.keys(propertiesAndTypeClassByKeyPath), function(keyPath, doneCallback) {
            var propertiesAndTypeClass = propertiesAndTypeClassByKeyPath[keyPath];
            var properties = propertiesAndTypeClass.properties;
            var typeClass = propertiesAndTypeClass.typeClass;

            var syncFragment = new LateBoundSyncFragment({
                type: 'change',
                keyPath: keyPath,
                clsName: typeClass.typeName,
                properties: properties
            });

            syncFragment.verifyPropertiesForType(typeClass, function(err) {
                if (err) {
                    return doneCallback(err);
                }
                doneCallback(null, syncFragment);
            });

        }.bind(this), function(err, changeFragments) {
            if (err) {
                return callback(err);
            }

            this.prepared = true;
            this.lateBoundSyncFragments = changeFragments.concat(addSyncFragments);
            callback();
        }.bind(this));
    }.bind(this));
};

SetQueryOperation.prototype.execute = function(scope, modelObject, callback) {
    if (!this.prepared) {
        return callback(new Error('Cannot execute, not prepared'));
    }
    if (this.executed) {
        return callback(new Error('Cannot execute, already executed'));
    }
    if (modelObject.constructor !== this.typeClass) {
        return callback(new Error('Cannot execute, modelObject does not match typeClass'));
    }
    if (this.executing) {
        return callback(new Error('Cannot execute, currently executing'));
    }
    this.executing = true;

    // Bind all the late bound sync fragments and then apply them
    async.waterfall([
        function bindLateBoundChangeSyncFragments(nextCallback) {
            var changeSyncFragments = _.filter(this.lateBoundSyncFragments, function(syncFragment) {
                return syncFragment.type === 'change';
            });

            async.eachSeries(changeSyncFragments, function(lateBoundSyncFragment, doneCallback) {
                var keyPath = lateBoundSyncFragment.keyPath;
                var result = KeyPathNotation.resolveModelObject(modelObject, keyPath);
                if (Err(result)) {
                    return doneCallback(new Error(
                        'Illegal $set modification at keyPath \'' + keyPath +
                        '\' no such ModelObject exists at keyPath'));
                }

                // Bind the target ModelObject's UUID to the change fragment
                var target = Ok(result);
                lateBoundSyncFragment.bindObjectUUID(target.uuid);
                lateBoundSyncFragment.bindClsName(target.typeName);
                doneCallback();

            }, nextCallback);
        }.bind(this),

        function applySyncFragments(nextCallback) {
            var syncFragments = this.lateBoundSyncFragments;
            var options = this.options;
            scope.applySyncFragments(syncFragments, options, function(err, results) {
                nextCallback(err, syncFragments, results);
            });
        }.bind(this),

        function createQueryResult(syncFragments, results, nextCallback) {
            var result = this._createQueryResult(modelObject, syncFragments, results);
            nextCallback(null, result);
        }.bind(this)

    ], function(err, result) {
        this.executed = true;
        this.executing = false;
        callback(err, result);
    }.bind(this));
};

