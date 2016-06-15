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
var RC = require('rc')
var spmDefaultConfig = {
  tokens: {
    spm: process.env.SPM_TOKEN
  },
  maxDbSize: Number(process.env.SPM_MAX_DB_SIZE) || 1024 * 1024 * 24,
  agentsToLoad: [],
  maxDataPoints: Number(process.env.SPM_MAX_DATAPOINTS) || 90,
  recoverInterval: Number(process.env.SPM_RECOVER_INTERVAL_IN_MS) || 10000,
  collectionInterval: Number(process.env.SPM_COLLECTION_INTERVAL_IN_MS) || 10000,
  transmitInterval: Number(process.env.SPM_TRANSMIT_INTERVAL_IN_MS) || 15000,
  maxRetransmitBatchSize: Number(process.env.SPM_MAX_RETRANSMIT_BATCH_SIZE) || 100,
  spmSenderBulkInsertUrl: process.env.SPM_RECEIVER_URL || 'https://spm-receiver.sematext.com:443/receiver/v1/_bulk',
  eventsReceiverUrl: process.env.EVENTS_RECEIVER_URL || 'https://event-receiver.sematext.com',
  dbDir: process.env.SPM_DB_DIR || './spmdb',
  logger: {
    dir: process.env.SPM_LOG_DIRECTORY || './spmlogs',
    level: process.env.SPM_LOG_LEVEL || 'error',
    console: process.env.SPM_LOG_TO_CONSOLE || false,
    maxfiles: Number(process.env.SPM_LOG_MAX_FILES) ||  '2',
    maxsize: Number(process.env.SPM_LOG_MAX_FILE_SIZE) || '524288',
    filename: process.env.SPM_LOG_FILE_PREFIX || 'spm',
    useLogstashFormat: process.env.SPM_LOG_LOGSTASH_FORMAT || false,
    silent: process.env.SPM_LOG_SILENT || false
  }
}
var SpmConfig = function (appType) {
  var rc = new RC(appType, spmDefaultConfig)
  util._extend (this, rc)
  this.rcFlat = flatten(this)
  return this
}

SpmConfig.prototype.get = function (key) {
  return this.rcFlat [key]
}

module.exports = new SpmConfig(process.env.SPM_AGENT_APP_TYPE||'spmagent')
