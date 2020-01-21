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
var util = require('util')
var events = require('events')
/**
 * This module connects the loaded Agents/Plugins from harvester.js to the sender Module sender/spmsender.js
 * It provides a URL parameter to the sender to overwrite config settings (e.g. used in unit tests)
 * In addition it can forward all received metrics as event (also for to monitor them in a unit test)
 * A Metric Object must provide at least this properties: ts - timestamp (int), name - metric name, value - metric value
 *
 * @param spmUrl - URL to SPM receiver, e.g. to use test environment or On Premises version
 */
function SpmAgent (spmUrl) {
  var logger = require('./util/logger.js')
  var Harvester = require('./harvester.js')
  var config = require('./util/spmconfig.js')
  var counters = {
    send: 0,
    error: 0,
    retransmit: 0
  }
  var SpmSender = require('./sender/spmsender.js')
  var InfluxSender = require('./sender/influxsender.js')
  this.spmSender = new SpmSender(config.get('tokens.spm'), 0, spmUrl)
  this.influxSender = new InfluxSender(config.get('tokens.spm'), config.get('transmitInterval'), spmUrl)
  events.EventEmitter.call(this)
  /**
   * Event listener method for metrics, pushing metrics to spmsender module
   * @param {Object} metric  Object
   */
  function shipMetrics (metric) {
    try {
      this.emit('metric', metric)
      if (metric && metric.measurement && metric.tags && metric.fields) {
        this.influxSender.collectMetric(metric)
      } else {
        this.spmSender.collectMetric(metric)
      }
    } catch (ex) {
      logger.error('Error in shipMetrics' + ex.stack)
    }
  }

  this.metricCollector = new Harvester(shipMetrics.bind(this), config.agentsToLoad)
  // registering for send events, and emitting updated counters as 'stats' event
  this.spmSender.on('send', function () {
    counters.send += 1
    this.emit('stats', counters)
  }.bind(this))
  this.spmSender.on('sendFailed', function (e) {
    counters.error += 1
    // logger.warn ('sendFailed event ' + JSON.stringify (counters))
    this.emit('stats', counters)
  }.bind(this))
  this.spmSender.on('error', function (e) {
    counters.error += 1
    logger.error('Error in spm-sender ' + JSON.stringify(e))
  })
  this.spmSender.on('retransmit', function () {
    counters.retransmit += 1
    // logger.warn ('retransmit event ' + JSON.stringify (counters))
    this.emit('stats', counters)
  }.bind(this))

  // registering for send events, and emitting updated counters as 'stats' event
  this.influxSender.on('send', function (info) {
    counters.send += 1
    counters.lastBulkSize = info.count
    this.emit('stats', counters)
  }.bind(this))
  this.influxSender.on('sendFailed', function (e) {
    counters.error += 1
    // logger.warn ('sendFailed event ' + JSON.stringify (counters))
    this.emit('stats', counters)
  }.bind(this))
  this.influxSender.on('error', function (e) {
    counters.error += 1
    logger.error('Error in influx-sender ' + JSON.stringify(e))
  })
  this.influxSender.on('metricInSendBuffer', function (metric) {
    this.emit('metricInSendBuffer', metric)
  }.bind(this))
  this.influxSender.on('retransmit', function () {
    counters.retransmit += 1
    // logger.warn ('retransmit event ' + JSON.stringify (counters))
    this.emit('stats', counters)
  }.bind(this))
  if (!config.tokens.spm && !process.env.LOGSENE_STATS_TOKEN) {
    var msg = 'Please set Monitoring App Token e.g. export SPM_TOKEN="YOUR-SPM-APP-TOKEN"'
    console.error(msg)
    logger.error(msg)
  }
}
util.inherits(SpmAgent, events.EventEmitter)

SpmAgent.prototype.createAgent = function (agent) {
  this.metricCollector.addAgent(agent)
  return agent
}

/**
 * Changes SPM sender URL at runtime - mainly for testing of send, fail, retransmit
 * @param url
 */
SpmAgent.prototype.setUrl = function (url) {
  this.spmSender.setUrl(url)
}
/**
 * Stops all loaded Agent plugins (e.g. stop their times, listeners)
 */
SpmAgent.prototype.stop = function () {
  this.metricCollector.stop()
}

module.exports = SpmAgent

/**
 * Published this method for 3rd party plugin developers
 * @type {Agent|exports}
 */
module.exports.Agent = require('./agent.js')
/**
 * Published this method for 3rd party plugin developers
 * @type {Logger|exports}
 */
module.exports.Logger = require('./util/logger.js')
/**
 * Published this method for 3rd party plugin developers
 * @type {Config|exports}
 */
module.exports.Config = require('./util/spmconfig.js')
