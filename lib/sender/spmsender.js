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
/**
 * How this module works:
 * - buffer data points
 * - send them when buffer size is > max
 * - on failure store records to NeDB
 * - onStart & Interval(todo) retransmit records from NeDB again
 * - onSuccesfulRetransmit - remove records from NeDB
 *
 * - Old records are deleted when DB file reaches 50 MB (only last hour is kept)
 * @type {request|exports}
 */
var request = require('request')
var cluster = require('cluster')
var os = require('os')
var events = require('events')
var extend = require('extend')
var config = require('../util/spmconfig.js')
var Datastore = require('nedb')
var util = require('util')
var fs = require('fs')
var logger = require('../util/logger.js')
var defaultSpmSenderUrl = 'https://spm-receiver.sematext.com:443/receiver/v1/_bulk'
var dbDirCreated = false
var DB_DIR = config.dbDir || 'spmdb'
var clientVersion = require('../../package.json').version
var dbFileName = null

function getFileNameForDb () {
  if (dbFileName !== null) {
    return dbFileName
  }
  if (!dbDirCreated && !fs.existsSync(DB_DIR)) {
    try {
      fs.mkdirSync(DB_DIR)
    } catch (err) {
      // it could happen that another worker has created it after ds.existsSync has checked
      if (fs.existsSync(DB_DIR)) {
        dbDirCreated = true
      } else {
        logger.error('could not create db directory, it might already exist')
      }
    } finally {
      dbDirCreated = true
    }
  }
  if (cluster.isMaster === false) {
    dbFileName = DB_DIR + '/' + 'metrics.db.' + (cluster.worker.id || '0') + '.' + process.pid
    return dbFileName
  } else {
    dbFileName = DB_DIR + '/' + 'metrics.db.0.' + process.pid
    return dbFileName
  }
}

var db = new Datastore({filename: getFileNameForDb(), autoload: true})
// DB compaction every 10 minutes
db.persistence.setAutocompactionInterval(10 * 60 * 1000)

/**
 *
 * @param {string} token - your token for your app (created in SPM UI)
 * @param {int} processMetricsInterval - 0 disabled, >0 interval in milliseconds to send metrics from  collected data
 * @param {string} metricsApiEndpoint - default value is 'http://spm-receiver.sematext.com/receiver/custom/receive.json?token='
 * @constructor
 */
function SpmSender (spmToken, processMetricsInterval, metricsApiEndpoint) {
  var self = this
  this.MAX_DATAPOINTS = config.maxDataPoints || 100
  this.MAX_WAIT_TIME = 60 * 1000
  this.spmToken = spmToken
  this.tid = null
  this.metricsUrl = (metricsApiEndpoint || config.get('spmSenderBulkInsertUrl') || defaultSpmSenderUrl) + '?agentType=nodejs&v=' + clientVersion + '&host=' + os.hostname() + '&token=' + spmToken
  // duplicate metrics to a second App
  if (process.env.SPM_MIRROR_TOKEN) {
    this.metricsUrlMirror = (metricsApiEndpoint || config.get('spmSenderBulkInsertUrl') || defaultSpmSenderUrl) + '?agentType=nodejs&v=' + clientVersion + '&host=' + os.hostname() + '&token=' + process.env.SPM_MIRROR_TOKEN
  }

  this.datapoints = []
  this.datapointsToShip = []
  this.spmToken = spmToken
  events.EventEmitter.call(this)
  process.on('exit', function () {
    // remove empty DB files
    cleanUpDbFile(getFileNameForDb())
  })
  var tid = setInterval(function () {
    logger.debug('SpmSender check maxfile size')
    checkMaxDbSize()
    self.retransmitFromDb(db)
  }, config.recoverInterval || 30000)
  tid.unref()
  setTimeout(function () {
    self.sendClientInfo()
  }, 10)
  self.startSender()
  logger.debug('SpmSender created for API endpoint: %s', this.metricsUrl)

}
util.inherits(SpmSender, events.EventEmitter)

SpmSender.prototype.setUrl = function (url) {
  this.metricsUrl = url + '?agentType=nodejs&v=' + clientVersion + '&host=' + os.hostname() + '&token=' + this.spmToken
}
SpmSender.prototype.sendClientInfo = function () {
  var runtime = 'nodejs'
  if (/[1|2|3]\.\d+\.\d+/.test(process.versions.node)) {
    runtime = 'io.js'
  }
  var info = os.platform() + ', ' + os.arch() + ', ' + runtime + ' ' + process.versions.node + ', ' + 'spm ' + clientVersion
  var programVersion = null
  var name = ''
  try {
    var path = require('path')
    // lets try to find program name and version of the calling library
    programVersion = require(path.join(path.dirname(require.main.filename), '/../package.json')).version
    name = require(path.join(path.dirname(require.main.filename), '/../package.json')).name
  } catch (e) {
    name = 'spm-agent'
    programVersion = clientVersion
  }
  var serverInfo = {
    message: info,
    tags: info.split(','),
    priority: 0,
    name: name + ' ' + programVersion,
    creator: 'spm-agent (nodejs) ' + clientVersion
  }
  this.sendEvent('server-info',
    serverInfo,
    function (err, result) {
      if (err) {
        logger.error('Error sending clientInfo Event:' + err)
      } else {
        logger.info('SPM client info event:' + JSON.stringify(serverInfo) + ' ' + result.body)
      }
    })
}
SpmSender.prototype.sendEvent = function (type, event, callback) {
  var msg = {
    timestamp: new Date().toISOString()
  }
  msg = extend(msg, event)
  var options = {
    url: 'https://event-receiver.sematext.com/' + this.spmToken + '/' + type,
    headers: {
      'User-Agent': 'spm-agent-nodejs',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(event),
    method: 'POST'
  }
  var self = this
  request.post(options, function (err, res) {
    if (err) {
      self.emit('error', { source: 'sendEvent', err: err })
    } else {
      self.emit('send event', { source: 'sendEvent', event: event, err: err })
    }
    if (callback) {
      callback(err, res)
    }
  })
}
function cleanUpDbFile (filename) {
  try {
    if (fs.existsSync(filename) && fs.statSync(filename).size === 0) {
      fs.unlinkSync(filename)
      logger.debug('removed empty file: %s', filename)
      return true
    } else {
      return false
    }
  } catch (err) {
    return false
  }
}
SpmSender.prototype.retransmitFromDb = function (database) {
  var self = this
  // Find all documents in the collection - TODO: we need on other place watch max DB size < 100 MB so it should fit in Memory
  database.find({}, function (err, docs) {
    if (!err && docs) {
      // to send only 100 lines per http request
      // avoid more than max_http_connections parallel actions -> or delay the requests ...
      self.chunkArray(docs, config.get('maxRetransmitBatchSize')).forEach(function (batchJobChunk, i) {
        logger.debug('start retransmit-job with %d metrics in %d ms', batchJobChunk.length, i * 500)
        setTimeout(function () {
          self.retransmit(batchJobChunk)
        }, i * 500)
      })

    }
  })
}
SpmSender.prototype.chunkArray = function (arr, chunkSize) {
  var R = []
  for (var i = 0, len = arr.length; i < len; i += chunkSize) {
    R.push(arr.slice(i, i + chunkSize))
  }
  return R
}
function formatArray (a) {
  if (a instanceof Array) {
    return a.join('\t')
  } else {
    return a + ''
  }
}
SpmSender.prototype.formatLine = function (metric) {
  var line = metric.spmLine
  logger.debug(line)
  return line
}

SpmSender.prototype.getTagLines = function () {
  var tags = []
  var tagLines = ''
  var tagStrings = process.env.SPM_MONITOR_TAGS || config.SPM_MONITOR_TAGS || config.spm_monitor_tags
  if (tagStrings) {
    tags = tagStrings.split(',')
  }
  if (tags) {
    var ts = new Date().getTime()
    tagLines = tags.map(function (t) {
      var line = ts + '\ttgs\t' + ts + '\t' + t.trim()
      line = JSON.stringify({body: line})
      return line
    })
    tagLines = tagLines.join('\n')
  }
  return tagLines
}

SpmSender.prototype.startSender = function () {
  var self = this
  var tid = setInterval (function () {
    self.datapointsToShip = self.datapoints
    self.datapoints = []
    if (self.datapointsToShip.length > 0) {
      self.send()
    }
  }, Math.max (1000, config.transmissionInterval))
  tid.unref()
}
/**
 * Collects metrics to datapoint array and tries to send it when time or size limits are reached
 *
 * @param metric
 */
SpmSender.prototype.collectMetric = function (metric) {
  var self = this
  metric._id = metric.name + '_' + metric.ts || new Date().getTime()
  this.datapoints.push(metric)
  /*if (this.datapoints.length > this.MAX_DATAPOINTS) {
     if (this.tid !== null) {
      clearTimeout(this.tid)
      this.tid = null
    } 
    this.datapointsToShip = this.datapoints
    this.datapoints = [] 
    this.send()
  } else {
    if (this.tid === null) {
      this.tid = setTimeout(function () {
        self.tid = null
        self.datapointsToShip = self.datapoints
        self.datapoints = []
        self.send()
      }, config.transmitInterval || 50000)
    }
  }*/
}
function fsCheckStats (fileName, cbf) {
  fs.exists(fileName, function (exists) {
    if (exists) {
      fs.stat(fileName, function (err, stats) {
        cbf(err, stats)
      })
    } else {
      cbf(new Error('File not exisits:' + fileName))
    }
  })
}
function checkMaxDbSize () {
  fsCheckStats(getFileNameForDb(), function (err, fsStat) {
    if (!err) {
      if (fsStat.size >= (config.maxDbSize || 1024 * 1024 * 10)) {
        db.remove({ts: {$lt: new Date().getTime() - (1000 * 60 * 60)}}, function (err, numRemoved) {
          try {
            if (err) {
              logger.error('checkMaxDbSize: removing old records from NeDB failed: %s', (err.msg || err.toString()))
            } else {
              logger.info('checkMaxDbSize: maximum reached %d records deleted', numRemoved || 0)
            }
          } catch (error) {
            logger.error('checkMaxDbSize: Unknown error:' + error, {error: error, dbError: err || '-', numRemoved: numRemoved || -1})
          }
        })
      }
    }
  })
}
SpmSender.prototype.sendErrorHandler = function () {
  var self = this
  db.insert(this.datapointsToShip, function (err, data) {
    if (err) {
      self.datapointsToShip.length = 0
      if (!(/it violates the unique constraint/.test(err.message))) {
        logger.debug('Failed to insert data points into NeDB - %s', err.message)
      } else {
        logger.debug('Data points exist already in NeDB - %s', err.message)
      }
    } else {
      // reset datapointsToShip
      var count = self.datapointsToShip.length
      self.datapointsToShip.length = 0
      logger.info(count + ' data points inserted into NeDB')
    }
  })
}

SpmSender.prototype.buildBulkRequest = function (data) {
  var lines = ''
  var self = this
  if (data) {
    if (this.datapointsToShip.length > 0) {
      this.datapointsToShip.forEach(function (dp) {
        lines = lines + JSON.stringify({body: self.formatLine(dp)}) + '\n'
      })
    }
  }
  var bulkRequest = lines + self.getTagLines()
  logger.debug('Bulk Request:\n' + bulkRequest)
  return bulkRequest
}

SpmSender.prototype.retransmit = function (metrics, callback) {
  if (!metrics || metrics.length === 0) {
    return
  }
  var appData = metrics.filter(function (metric) {
    return (metric.sct !== 'OS')
  })
  var osData = metrics.filter(function (metric) {
    return (metric.sct === 'OS')
  })
  var dp = [appData, osData]
  var self = this
  var options = [{
    url: self.metricsUrl + '&sct=APP',
    headers: {
      'User-Agent': 'node-spm',
      'Content-Type': 'application/json'
    // 'Keep-Alive': false
    },
    body: self.buildBulkRequest(appData),
    method: 'POST'
  }, {
    url: self.metricsUrl + '&sct=OS',
    headers: {
      'User-Agent': 'node-spm',
      'Content-Type': 'application/json'
    },
    body: self.buildBulkRequest(osData),
    method: 'POST'
  }]
  for (var xi in options) {
    if (dp[xi].length > 0) {
      var dpIds = dp[xi].map(function (m) {
        return m._id
      })
      request.post(options[xi], function (err, res, body) {
        if ((!err) && (res && res.statusCode < 300)) {
          // remove from NeDB
          db.remove({_id: {$in: dpIds}}, {multi: true}, function (err, numRemoved) {
            dpIds = null
            if (err) {
              logger.error('Error removing record from NeDB:' + err)
              return
            }
            var msg = util.format('retransmit removed %d records from NeDB', numRemoved)
            logger.debug(msg)
            self.emit('retransmit', {msg: msg})
          })
          if (callback) {
            callback(err,
              JSON.stringify(
                {
                  url: options.url,
                  status: res.statusCode,
                  res: res.body
                }, null, 4))
          }
        }
      })
    }
  }
}

SpmSender.prototype.send = function (cb) {
  this.sendToSpm(this.metricsUrl, cb)
  if (this.metricsUrlMirror) {
    logger.debug('MIRROR SEND ' + this.metricsUrlMirror)
    this.sendToSpm(this.metricsUrlMirror, cb)
  }
}
SpmSender.prototype.sendToSpm = function (metricsUrl, callback) {
  var self = this
  var dataToShip = [
    this.datapointsToShip.filter(function (metric) {
      return (metric.sct !== 'OS')
    }),
    this.datapointsToShip.filter(function (metric) {
      return (metric.sct === 'OS')
    })
  ]
  var options = [{
    url: metricsUrl + '&sct=APP',
    headers: {
      'User-Agent': 'node-spm',
      'Content-Type': 'application/json'
    // 'Keep-Alive': false
    },
    body: self.buildBulkRequest(dataToShip[0]),
    method: 'POST',
  }, {
    url: metricsUrl + '&sct=OS',
    headers: {
      'User-Agent': 'node-spm',
      'Content-Type': 'application/json'
    // 'Keep-Alive': false
    },
    body: self.buildBulkRequest(dataToShip[1]),
    method: 'POST'
  }]
  for (var x in options) {
    var url = options[x].url
    var dpCount = dataToShip[x].length
    if (dataToShip[x].length > 0) {
      var responseHandler = getResponseHandler(dpCount, url, self, callback)
      request.post(options[x], responseHandler)
    }
  }
}

function getResponseHandler (dpCount, url, self, callback) {
  return function (err, res, body) {
    try {
      var msg = ''
      if (err || (res && res.statusCode > 299)) {
        msg = util.format('HTTP Error: %d send failed for %d data points to %s, %s', (res ? res.statusCode : -1), dpCount, url, body || err)
        if (!err) {
          err = {}
          err.msg = msg
          err.statusCode = res.statusCode
        }
        logger.error(msg)
        self.emit('sendFailed', {msg: msg})
        self.sendErrorHandler(err)
      } else {
        msg = util.format('HTTP: %d - %d data points successfully sent to spm-receiver %s, %s', res.statusCode, dpCount, url, '' + body)
        self.emit('send', {msg: msg, count: dpCount, url: url})
        logger.info(msg)
        self.datapointsToShip.length = 0
        if (callback) {
          callback(err,
            JSON.stringify(
              {
                body: body,
                status: res.statusCode, res: body
              }, null, 4))
        }
      }
    } catch (ex) {
      console.log(ex.stack)
    }
  }
}
module.exports = SpmSender