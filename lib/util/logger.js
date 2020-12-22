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
var config = require('./spmconfig.js')
var winston = require('winston')
var cluster = require('cluster')
var fs = require('fs')

function createLogger () {
  var loggers = []
  var logConfig = config.logger
  var postfix = '.master.' + config.tokens.spm + '.' + process.pid + '.log'
  if (logConfig.dir) {
    try {
      if (!fs.existsSync(logConfig.dir)) {
        fs.mkdirSync(logConfig.dir)
      }
      if (logConfig.filename) {
        loggers.push(new (winston.transports.File)({
          timestamp: true,
          level: logConfig.level || 'error',
          filename: (logConfig.dir || '.') + '/' + logConfig.filename + postfix,
          maxsize: (logConfig.maxsize || (1024 * 1024)),
          json: true,
          // logstash: false, //logConfig.useLogstashFormat || false,
          maxFiles: (logConfig.maxfiles || 3),
          tailable: true,
          silent: logConfig.silent || false
        }))
      }
    } catch (ex) {
      console.error(new Date().toISOString(), 'no write permissions for log directory: ' + logConfig.dir)
    }
  } else {
    console.error('spm - please specify logfile.dir parameter for logging in .spmagentrc')
  }
  if (logConfig.console) {
    loggers.push(new (winston.transports.Console)({
      colorize: 'all',
      timestamp: true,
      json: Number(logConfig.json),
      level: logConfig.level || 'error',
      tailable: true
    }))
  }
  if (!cluster.isMaster) {
    postfix = '.worker' + cluster.worker.id + '.' + config.tokens.spm + '.' + process.pid + '.log'
  }

  var logger = new (winston.Logger)({
    transports: loggers
  })
  logger.debug('config setting: %s', (logConfig.dir || '.') + '/' + logConfig.filename + postfix)
  logger.debug('%s', 'config: ' + JSON.stringify(config))
  return logger
}

module.exports = createLogger()
