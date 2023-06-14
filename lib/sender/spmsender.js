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
 * - Old records are deleted when DB file reaches 100 MB (records older than 12 hours)
 * @type {request|exports}
 */
const fetch = require('node-fetch')
const cluster = require('cluster')
const os = require('os')
const events = require('events')
const config = require('../util/spmconfig.js')
const Datastore = require('@yetzt/nedb')
const util = require('util')
const fs = require('fs')
const logger = require('../util/logger.js')
const defaultSpmSenderUrl = 'https://spm-receiver.sematext.com:443/receiver/v1/_bulk'
let dbDirCreated = false
const DB_DIR = config.dbDir || 'spmdb'
const clientVersion = require('../../package.json').version
const programVersion = clientVersion
let dbFileName = null
let hostname = process.env.SPM_REPORTED_HOSTNAME || process.env.HOSTNAME || os.hostname()
const maxMetricsAge = 12 * 60 * 60 * 1000

function checkSpmDockerHostname (cb) {
  fs.stat('/opt/spm/.docker', function (err, stats) {
    if (!err) {
      fs.readFile('/opt/spm/.docker', function (error, data) {
        if (!error && data) {
          const lines = data.toString().split('\n')
          if (lines.length > 1) {
            const keyVal = lines[1].split('=')
            if (keyVal.length > 1 && keyVal[0] && keyVal[0].trim() === 'docker_hostname') {
              const spmReportedHostname = keyVal[1]
              return cb(null, spmReportedHostname.trim())
            } else {
              cb(new Error('Invalid format /opt/spm/.docker, docker_hostname setting not found'))
            }
          } else {
            cb(new Error('no content in /opt/spm/.docker'))
          }
        } else {
          cb(err)
        }
      })
    } else {
      cb(err)
    }
  })
}

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

const db = new Datastore({ filename: getFileNameForDb(), autoload: true })
// DB compaction every 10 minutes
db.persistence.setAutocompactionInterval(10 * 60 * 1000)
const dockerHostname = null
const containerHostname = null

/**
 *
 * @param {string} token - your token for your app (created in SPM UI)
 * @param {int} processMetricsInterval - 0 disabled, >0 interval in milliseconds to send metrics from  collected data
 * @param {string} metricsApiEndpoint - default value is 'http://spm-receiver.sematext.com/receiver/custom/receive.json?token='
 * @constructor
 */
function SpmSender (spmToken, processMetricsInterval, metricsApiEndpoint) {
  this.MAX_DATAPOINTS = Math.min(Number(config.maxDataPoints) || 100, 300)
  this.spmToken = spmToken
  const apiEndpoint = (metricsApiEndpoint || process.env.SPM_RECEIVER_URL || config.get('spmSenderBulkInsertUrl') || defaultSpmSenderUrl)
  let metricsApiEndpointVerified = apiEndpoint
  if (!/_bulk/.test(apiEndpoint)) {
    // in case users don't specify /_bulk endpoint
    metricsApiEndpointVerified = metricsApiEndpointVerified + '/_bulk'
    logger.log('info', 'changed SPM API endpoint "' + apiEndpoint + '" to "' + metricsApiEndpointVerified + '"')
  }
  const self = this
  checkSpmDockerHostname(function (err, dockerHostName) {
    if (!err && dockerHostName) {
      hostname = dockerHostName
      self.metricsUrl = metricsApiEndpointVerified + '?agentType=nodejs&v=' + programVersion + '&host=' + hostname +
        '&dockerHostname=' + dockerHostName +
        '&containerHostname=' + os.hostname() +
        '&token=' + spmToken
      // duplicate metrics to a second App
      if (process.env.SPM_MIRROR_TOKEN) {
        self.metricsUrlMirror = metricsApiEndpointVerified + '?agentType=nodejs&v=' + programVersion + '&host=' + hostname +
        '&dockerHostname=' + dockerHostname +
        '&containerHostname=' + containerHostname +
        '&token=' + process.env.SPM_MIRROR_TOKEN
      }
    } else {
      logger.log('debug', 'warning, failed to get docker hostname: ' + err)
      self.metricsUrl = metricsApiEndpointVerified + '?agentType=nodejs&v=' + programVersion + '&host=' + hostname +
        '&token=' + spmToken
      // duplicate metrics to a second App
      if (process.env.SPM_MIRROR_TOKEN) {
        self.metricsUrlMirror = metricsApiEndpointVerified + '?agentType=nodejs&v=' + programVersion + '&host=' + hostname +
        '&token=' + process.env.SPM_MIRROR_TOKEN
      }
    }
    logger.info('SpmSender created for API endpoint: %s', self.metricsUrl)
  })
  this.datapoints = []
  this.datapointsToShip = []
  this.spmToken = spmToken
  events.EventEmitter.call(this)
  process.on('beforeExit', function () {
    // remove empty DB files
    cleanUpDbFile(getFileNameForDb())
  })
  const tid = setInterval(function () {
    logger.debug('SpmSender check maxfile size')
    checkMaxDbSize()
    this.retransmitFromDb(db)
  }.bind(this), config.recoverInterval || 30000)
  tid.unref()
  this.startSender()
}
util.inherits(SpmSender, events.EventEmitter)

SpmSender.prototype.setUrl = function (url) {
  this.metricsUrl = url + '?agentType=nodejs&v=' + programVersion + '&host=' + hostname + '&token=' + this.spmToken
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
  // Find all documents in the collection - TODO: we need on other place watch max DB size < 100 MB so it should fit in Memory
  database.find({}, function (err, docs) {
    if (!err && docs) {
      // to send only 100 lines per http request
      // avoid more than max_http_connections parallel actions -> or delay the requests ...
      this.chunkArray(docs, config.get('maxRetransmitBatchSize')).forEach(function (batchJobChunk, i) {
        logger.debug('start retransmit-job with %d metrics in %d ms', batchJobChunk.length, i * 500)
        setTimeout(function () {
          this.retransmit(batchJobChunk)
        }.bind(this), i * 500)
      }.bind(this))
    }
  }.bind(this))
}
SpmSender.prototype.chunkArray = function (arr, chunkSize) {
  const R = []
  for (let i = 0, len = arr.length; i < len; i += chunkSize) {
    R.push(arr.slice(i, i + chunkSize))
  }
  return R
}

SpmSender.prototype.formatLine = function (metric) {
  const line = metric.spmLine
  logger.debug(line)
  return line
}

SpmSender.prototype.getTagLines = function () {
  let tags = []
  let tagLines = ''
  const tagStrings = process.env.SPM_MONITOR_TAGS || config.SPM_MONITOR_TAGS || config.spm_monitor_tags
  if (tagStrings) {
    tags = tagStrings.split(',')
  }
  if (tags) {
    const ts = new Date().getTime()
    tagLines = tags.map(function (t) {
      let line = ts + '\ttgs\t' + ts + '\t' + t.trim()
      line = JSON.stringify({ body: line })
      return line
    })
    tagLines = tagLines.join('\n')
  }
  return tagLines
}

SpmSender.prototype.startSender = function () {
  const tid = setInterval(function () {
    if (this.datapoints.length > 0) {
      const reqSize = Math.min(this.datapoints.length, this.MAX_DATAPOINTS || 100)
      this.datapointsToShip = this.datapoints.slice(0, reqSize)
      this.datapoints = this.datapoints.slice(reqSize, this.datapoints.length)
      this.send()
    }
  }.bind(this), Math.max(5000, config.transmitInterval))
  tid.unref()
}
/**
 * Collects metrics to datapoint array and tries to send it when time or size limits are reached
 *
 * @param metric
 */
SpmSender.prototype.collectMetric = function (metric) {
  if (!this.spmToken) {
    return
  }
  const now = new Date().getTime()
  metric.ts = metric.ts || new Date().getTime()
  if ((metric.ts - now) > maxMetricsAge) {
    // ignore metrics older than 9 days
    return
  }
  metric._id = metric.name + '_' + metric.filters + '_' + metric.ts
  this.datapoints.push(metric)
  if (this.datapoints > this.MAX_DATAPOINTS) {
    // try to ship data immediatly
    this.send(function () {})
  }
}
function fsCheckStats (fileName, cbf) {
  fs.stat(fileName, function (err, stats) {
    if (err) {
      cbf(new Error('File not exisits:' + fileName))
    }
    cbf(err, stats)
  })
}
function checkMaxDbSize () {
  fsCheckStats(getFileNameForDb(), function (err, fsStat) {
    if (!err) {
      if (fsStat.size >= (config.maxDbSize || 1024 * 1024 * 100)) {
        db.remove({ ts: { $lt: new Date().getTime() - (maxMetricsAge) } }, function (err, numRemoved) {
          try {
            if (err) {
              logger.error('checkMaxDbSize: removing old records from NeDB failed: %s', (err.msg || err.toString()))
            } else {
              logger.debug('checkMaxDbSize: maximum reached %d records deleted', numRemoved || 0)
            }
          } catch (error) {
            logger.error('checkMaxDbSize: Unknown error:' + error, { error: error, dbError: err || '-', numRemoved: numRemoved || -1 })
          }
        })
      }
    }
  })
}
SpmSender.prototype.sendErrorHandler = function () {
  db.insert(this.datapointsToShip, function (err, data) {
    if (err) {
      this.datapointsToShip.length = 0
      if (!(/it violates the unique constraint/.test(err.message))) {
        logger.debug('Failed to insert data points into NeDB - %s', err.message)
      } else {
        logger.debug('Data points exist already in NeDB - %s', err.message)
      }
    } else {
      // reset datapointsToShip
      const count = this.datapointsToShip.length
      this.datapointsToShip.length = 0
      logger.debug(count + ' data points inserted into NeDB')
    }
  }.bind(this))
}

SpmSender.prototype.buildBulkRequest = function (data) {
  const now = new Date().getTime()
  let lines = ''
  if (data) {
    if (data.length > 0) {
      data.forEach(function (dp) {
        const ts = dp.ts
        if ((ts - now) < maxMetricsAge) {
          lines = lines + JSON.stringify({ body: this.formatLine(dp) }) + '\n'
        } else {
          logger.debug('metrics older than 9 days' + JSON.stringify(dp))
          // ignore metrics older than 9 days
        }
      }.bind(this))
    }
  }
  const bulkRequest = lines + this.getTagLines()
  logger.debug('Bulk Request:\n' + bulkRequest)
  return bulkRequest
}

SpmSender.prototype.retransmit = function (metrics, callback) {
  if (!this.spmToken) {
    return
  }
  if (!metrics || metrics.length === 0) {
    return
  }
  let appData = metrics.filter(function (metric) {
    return (metric.sct !== 'OS')
  })
  if (!appData) {
    appData = []
  }
  let osData = metrics.filter(function (metric) {
    return (metric.sct === 'OS')
  })
  if (!osData) {
    osData = []
  }
  const dp = [appData, osData]
  let dynamicUrlParameters = ''
  if (global.spmSenderUrlParameters !== undefined) {
    dynamicUrlParameters = global.spmSenderUrlParameters
  }
  const options = [{
    url: this.metricsUrl + '&sct=APP' + dynamicUrlParameters,
    headers: {
      'User-Agent': 'node-spm',
      'Content-Type': 'application/json',
      Connection: 'Close'
    },
    body: this.buildBulkRequest(appData),
    method: 'POST'
  }, {
    url: this.metricsUrl + '&sct=OS',
    headers: {
      'User-Agent': 'node-spm',
      'Content-Type': 'application/json',
      Connection: 'Close'
    },
    body: this.buildBulkRequest(osData),
    method: 'POST'
  }]
  for (const xi in options) {
    let dpIds = []
    if (dp[xi].length > 0) {
      dpIds = dp[xi].map(function (m) {
        return m._id
      })
      fetch(options[xi].url, options[xi])
        .then(response => response.json())
        .then(response => {
          if (response && (response.status < 300 || (response.status >= 400 && response.status < 500))) {
            // remove from NeDB
            db.remove({ _id: { $in: dpIds } }, { multi: true }, function (err, numRemoved) {
              dpIds = null
              if (err) {
                logger.error('Error removing record from NeDB:' + err)
                return
              }
              const msg = util.format('retransmit removed %d records from NeDB', numRemoved)
              logger.debug(msg)
              this.emit('retransmit', { msg: msg })
            }.bind(this))
          }
          if (callback) {
            callback(undefined,
              JSON.stringify(
                {
                  // url: options[xi].url,
                  status: response.status,
                  res: response.body
                }, null, 4))
          }
        })
        .catch(err => {
          if (callback) {
            callback(err, undefined)
          }
        })
    }
  }
}

SpmSender.prototype.send = function (cb) {
  if (!this.spmToken) {
    return
  }
  this.sendToSpm(this.metricsUrl, cb)
  if (this.metricsUrlMirror) {
    logger.debug('MIRROR SEND ' + this.metricsUrlMirror)
    this.sendToSpm(this.metricsUrlMirror, cb)
  }
}
SpmSender.prototype.sendToSpm = function (metricsUrl, callback) {
  const dataToShip = [
    this.datapointsToShip.filter(function (metric) {
      return (metric.sct !== 'OS')
    }),
    this.datapointsToShip.filter(function (metric) {
      return (metric.sct === 'OS')
    })
  ]
  let dynamicUrlParameters = ''
  if (global.spmSenderUrlParameters !== undefined) {
    dynamicUrlParameters = global.spmSenderUrlParameters
  }
  const options = [{
    url: metricsUrl + '&sct=APP' + dynamicUrlParameters,
    headers: {
      'User-Agent': 'node-spm',
      'Content-Type': 'application/json'
    // 'Keep-Alive': false
    },
    body: this.buildBulkRequest(dataToShip[0]),
    method: 'POST'
  }, {
    url: metricsUrl + '&sct=OS',
    headers: {
      'User-Agent': 'node-spm',
      'Content-Type': 'application/json'
    // 'Keep-Alive': false
    },
    body: this.buildBulkRequest(dataToShip[1]),
    method: 'POST'
  }]
  for (const x in options) {
    const url = options[x].url
    const dpCount = dataToShip[x].length
    if (dataToShip[x].length > 0) {
      const responseHandler = getResponseHandler(dpCount, url, this, callback)
      fetch(options[x].url, options[x])
        .then(response => response.json())
        .then(response => responseHandler(undefined, response, response.body))
    }
  }
}

function getResponseHandler (dpCount, url, self, callback) {
  return function (err, res, body) {
    try {
      let msg = ''
      if ((res && res.statusCode > 499) || err) {
        // err could be DNS problem or TCP timeout
        // Status code 400 might be caused by deactivated tokens -> no retry
        msg = util.format('HTTP Error: %d send failed for %d data points to %s, %s', (res ? res.statusCode : -1), dpCount, url, body || err)
        if (!err) {
          err = {}
          err.msg = msg
          err.statusCode = res.statusCode
        }
        logger.error(msg)
        this.emit('sendFailed', { msg: msg })
        this.sendErrorHandler(err)
      } else {
        msg = util.format('HTTP: %d - %d data points successfully sent to spm-receiver %s, %s', res.statusCode, dpCount, url, '' + body)
        this.emit('send', { msg: msg, count: dpCount, url: url })
        logger.debug(msg)
        this.datapointsToShip.length = 0
        if (callback) {
          callback(err,
            JSON.stringify(
              {
                body: body,
                status: res.statusCode,
                res: body
              }, null, 4))
        }
      }
    } catch (ex) {
      console.log(ex.stack)
    }
  }.bind(self)
}
module.exports = SpmSender
