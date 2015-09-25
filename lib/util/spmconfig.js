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
    spm: process.env.SPM_TOKEN
  },
  maxDbSize: 1024*1024*24,
  agentsToLoad: [],
  maxDataPoints: 90,
  recoverInterval: 20000,
  collectionInterval: 20000,
  transmitInterval: 1000,
  maxRetransmitBatchSize: 100,
  spmSenderBulkInsertUrl: 'https://spm-receiver.sematext.com:443/receiver/v1/_bulk',
  dbDir: './spmdb',
  logger: {
    dir: './spmlogs',
    level: 'error',
    console: false,
    maxfiles: '2',
    maxsize: '524288',
    filename: 'spm',
    useLogstashFormat: false,
    silent: false
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

// -e spmagent_retransmitInterval=30000
