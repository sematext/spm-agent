/*
 * @copyright Copyright (c) Sematext Group, Inc. - All Rights Reserved
 *
 * @licence SPM for NodeJS is free-to-use, proprietary software.
 * THIS IS PROPRIETARY SOURCE CODE OF Sematext Group, Inc. (Sematext)
 * This source code may not be copied, reverse engineered, or altered for any purpose.
 * This source code is to be used exclusively by users and customers of Sematext.
 * Please see the full license (found in LICENSE in this distribution) for details on its license and the licenses of its dependencies.
 */

'use strict'
var flatten = require('flat')
var util = require('util')
var spmDefaultConfig = {
  tokens: {
    spm: null
  },
  agentsToLoad: [],
  maxDataPoints: 99,
  recoverInterval: 60000,
  collectionInterval: 10000,
  transmitInterval: 30000,
  maxRetransmitBatchSize: 100,
  spmSenderBulkInsertUrl: 'https://spm-receiver.sematext.com:443/receiver/v1/_bulk',
  dbDir: './spmdb',
  logger: {
    dir: './spmlogs',
    level: 'debug',
    console: false,
    maxfiles: '3',
    maxsize: '1048576',
    filename: 'spm'
  }
}
var SpmConfig = function () {
  var rc = require('rc')('spmagent', spmDefaultConfig)
  util._extend(this, rc)
  this.rcFlat = flatten(this)
  return this
}

SpmConfig.prototype.get = function (key) {
  return this.rcFlat [key]
}


module.exports = new SpmConfig()
