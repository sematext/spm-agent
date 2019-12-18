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
var unflatten = require('flat').unflatten
var RC = require('rc-yaml-2')
var fs = require('fs')
var os = require('os')
// load SPM receivers from file containing
// env vars e.g. SPM_RECEIVER_URL, EVENTS_RECEIVER_URL, LOGSENE_RECEIVER_URL
// the file overwrites the actual environment
// and is used by Sematext Enterprise or multi-region setups to
// setup receiver URLs
function loadEnvFromFile (fileName) {
  try {
    var receivers = fs.readFileSync(fileName).toString()
    if (receivers) {
      var lines = receivers.split('\n')
    }
    // console.log(new Date(), 'loading Sematext receiver URLs from ' + fileName)
    lines.forEach(function (line) {
      var kv = line.split('=')
      if (kv.length === 2 && kv[1].length > 0) {
        process.env[kv[0].trim()] = kv[1].trim()
      // console.log(kv[0].trim() + ' = ' + kv[1].trim())
      }
    })
  } catch (error) {
    // ignore missing file or wrong format
    // console.error(error.message)
  }
}
var envFileName = '/etc/sematext/receivers.config'
/**
  if (/win/.test(os.platform()) {
    envFileName = process.env.ProgramData + '\\Sematext\\receivers.config'
  }
**/
loadEnvFromFile(envFileName)

var spmDefaultConfig = {
  tokens: {
    spm: process.env.SPM_TOKEN || process.env.MONITORING_TOKEN,
    // prepare move to MONITORING_TOKEN and config.token.monitoring
    monitoring: process.env.MONITORING_TOKEN || process.env.SPM_TOKEN
  },
  influx: {
    dbName: 'metrics',
    // example: "USER,PWD" adds user and working directory from ENV as tags
    // example with static tags and ENV tags: "USER, customer_id=1234"
    // - takes USER from ENV,
    // - adds static tag "customer_id" with value 1234
    // accepts comma separated Strings or an Array in config file
    tagsFromEnv: process.env.MONITORING_TAGS_FROM_ENV
    // alternative format as Array in config files
    // tagsFromEnv: ['USER', 'client_id=1']
  },
  maxDbSize: Number(process.env.SPM_MAX_DB_SIZE) || 1024 * 1024 * 100,
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
    dir: process.env.SPM_LOG_DIRECTORY || process.env.Temp || './spmlogs',
    level: process.env.SPM_LOG_LEVEL || 'error',
    console: process.env.SPM_LOG_TO_CONSOLE || false,
    maxfiles: Number(process.env.SPM_LOG_MAX_FILES) || '2',
    maxsize: Number(process.env.SPM_LOG_MAX_FILE_SIZE) || '524288',
    filename: process.env.SPM_LOG_FILE_PREFIX || 'spm',
    useLogstashFormat: process.env.SPM_LOG_LOGSTASH_FORMAT || false,
    silent: process.env.SPM_LOG_SILENT || false
  }
}
if (os.platform().indexOf('win') > -1) {
  // windows meteor apps can't write to local directory
  // if no SPM_DB_DIR or SPM_LOG_DIRECTORY is set, we use windows TEMP folder
  spmDefaultConfig.logger.dir = process.env.SPM_LOG_DIRECTORY || process.env.TEMP || process.env.TMP
  spmDefaultConfig.dbDir = process.env.SPM_DB_DIR || process.env.TEMP || process.env.TMP
}
var SpmConfig = function (appType) {
  var rc = new RC(appType, spmDefaultConfig)
  Object.assign(this, rc)
  this.rcFlat = flatten(this)
  return this
}

SpmConfig.prototype.get = function (flatKey) {
  return this.rcFlat[flatKey]
}

SpmConfig.prototype.set = function (flatKey, value) {
  var kv = {}
  kv[flatKey] = value
  kv.object = true
  var result = unflatten(kv)
  delete result.object
  delete this.rcFlat
  Object.assign(this, result)
  this.rcFlat = flatten(this)
  return this
}

module.exports = new SpmConfig(process.env.SPM_AGENT_APP_TYPE || 'spmagent')
