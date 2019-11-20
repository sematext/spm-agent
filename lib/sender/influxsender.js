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

const request = require('request')
const events = require('events')
const extend = require('extend')
const util = require('util')
const os = require('os')
const path = require('path')
const logger = require('../util/logger.js')
const config = require('../util/spmconfig.js')
const Influx = require('influx')
const defaultSpmSenderUrl = 'https://spm-receiver.sematext.com:443'
const maxBufferSize = 10000

function InfluxSender (spmToken, processMetricsInterval, metricsApiEndpoint) {
  const self = this
  this.spmToken = spmToken
  this.datapoints = []
  this.datapointsToShip = []
  events.EventEmitter.call(this)
  const apiEndpoint = (metricsApiEndpoint || process.env.METRICS_RECEIVER_URL || process.env.SPM_RECEIVER_URL || config.get('spmSenderBulkInsertUrl') || defaultSpmSenderUrl)
  const apiUrl = new URL(apiEndpoint) // TODO: use for older node versions url.parse(apiEndpoint)
  this.connectionOptions = {
    host: config.influx.host || apiUrl.hostname,
    port: Number(config.influx.port) || Number(apiUrl.port) || 443,
    database: config.influx.dbName || 'metrics',
    protocol: config.influx.protocol || apiUrl.protocol.replace(':', '')
  }
  this.influxUrl = this.connectionOptions.protocol + '://' + this.connectionOptions.host + ':' + this.connectionOptions.port
  this.influx = new Influx.InfluxDB(this.connectionOptions)
  this.tid = setInterval(this.sendMetrics.bind(self), processMetricsInterval || config.transmitInterval || 15000)
  this.tid.unref()
  process.on('beforeExit', function () {
    // TODO: flush metrics
    self.sendMetrics()
  })
  setTimeout(function () {
    self.sendClientInfo('Start')
  }.bind(this), 10)
  process.on('SIGINT', function () {
    self.sendMetrics()
    self.sendClientInfo('Stop SIGINT')
  })
  process.on('SIGTERM', function () {
    self.sendMetrics()
    self.sendClientInfo('Stop SIGTERM')
  })
  process.on('SIGQUIT', function () {
    self.sendMetrics()
    self.sendClientInfo('Stop SIGQUIT')
  })
}
util.inherits(InfluxSender, events.EventEmitter)

InfluxSender.prototype.addMandatoryTags = function(metric) {
	// add mandatory tags
  metric.tags['os.host'] = process.env.SPM_REPORTED_HOSTNAME || os.hostname()
  metric.tags.token = this.spmToken
  metric.tags['process.pid'] = process.pid
  metric.tags['process.ppid'] = process.ppid
  metric.tags['process.name'] = process.title
  metric.tags['nodejs.version'] = process.version
  metric.tags.user = process.env.USER
}

InfluxSender.prototype.collectMetric = function (metric) {
  if (metric && metric.measurement && metric.tags && metric.fields) {
    // valid influx metric object
    this.addMandatoryTags(metric)
    if (this.datapoints && this.datapoints.length > maxBufferSize) {
      // drop the oldest metric
      this.datapoints.shift()
    }
    this.datapoints.push(metric)
    // logger.debug('InfluxSender: add metric ' + JSON.stringify(metric))
  } else {
    throw new Error('Invalid influx metric object ' + JSON.stringify(metric))
  }
}

InfluxSender.prototype.sendMetrics = function () {
  const self = this
  if (self.datapoints && self.datapoints.length === 0) {
    // nothing to do
    return
  }
  self.influx.writePoints(this.datapoints)
    .then(() => {
      const msg = 'InfluxSender: ' + self.datapoints.length + ' data points successfully sent to ' + self.influxUrl
      logger.debug(msg)
      this.emit('send', {
        msg: msg,
        count: self.datapoints.length,
        url: self.influxUrl
      })
      self.datapoints = []
    })
    .catch((err) => {
      if (err) {
        console.error(err)
        logger.error('InfluxSender: error sending metrics ' + err)
        self.emit('sendFailed', {msg: err.message})
      }
    })
}

InfluxSender.prototype.sendClientInfo = function (action, terminate) {
  if (!this.spmToken) {
    return
  }
  var clientVersion = require('../../package.json').version
  var packageName = 'spm-agent'
  var programVersion = clientVersion
  try {
    // lets try to find program name and version of the calling library
    programVersion = require(path.join(path.dirname(require.main.filename), '/../package.json')).version
    packageName = require(path.join(path.dirname(require.main.filename), '/../package.json')).name
  } catch (e) {
    packageName = 'spm-agent'
    programVersion = clientVersion
  }
  var runtime = 'nodejs'
  if (/[1|2|3]\.\d+\.\d+/.test(process.versions.node)) {
    runtime = 'io.js'
  }
  var info = os.platform() + ', ' + os.arch() + ', ' + runtime + ' ' + process.versions.node

  var serverInfo = {
    title: action + ' ' + packageName + ' ' + programVersion,
    host: (process.env.SPM_REPORTED_HOSTNAME || os.hostname()),
    message: action + ' ' + packageName + ' ' + programVersion + ' / ' + ' on ' + (process.env.SPM_REPORTED_HOSTNAME || os.hostname()),
    tags: info.split(','),
    priority: 0,
    name: (process.env.SPM_REPORTED_HOSTNAME || os.hostname()),
    creator: packageName + ' ' + programVersion + ' / ' + 'spm-agent (nodejs) ' + clientVersion
  }
  this.sendSematextEvent('server-info',
    serverInfo,
    function (err, result) {
      if (err) {
        logger.error('Error sending server-info event:' + err)
      } else {
        logger.debug('InfluxSender server-info event:' + JSON.stringify(serverInfo) + ' ' + result.body)
      }
      if (action === 'Stop') {
        // give other handlers a chance to clean up before exit
        setTimeout(process.exit, 5000)
      }
    })
}

InfluxSender.prototype.sendSematextEvent = function (type, event, callback) {
  if (!this.spmToken) {
    return
  }
  var msg = {
    timestamp: new Date().toISOString()
  }
  msg = extend(msg, event)
  var typeOfEvent = msg._type || type || 'event'
  delete msg._type
  var options = {
    url: config.get('eventsReceiverUrl') + '/' + this.spmToken + '/' + typeOfEvent,
    headers: {
      'User-Agent': 'spm-agent-nodejs',
      'Content-Type': 'application/json',
      'Connection': 'Close'
    },
    body: JSON.stringify(msg),
    method: 'POST'
  }
  var req = request.post(options, function (err, res) {
    if (err) {
      this.emit('error', { source: 'sendEvent', err: err })
    } else {
      this.emit('send event', { source: 'sendEvent', event: msg, err: err })
    }
    if (callback) {
      callback(err, res)
    }
    if (req && req.destroy) {
      req.destroy()
    }
  }.bind(this))
}

module.exports = InfluxSender
