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
var Agent = require('./agent.js')
/**
 * This module connects the loaded Agents/Plugins from harvester.js to the sender Module sender/spmsender.js
 * It provides a URL parameter to the sender to overwrite config settings (e.g. used in unit tests)
 * In addition it can forward all received metrics as event (also for to monitor them in a unit test)
 * A Metric Object must provide at least this properties: ts - timestamp (int), name - metric name, value - metric value
 *
 * @param spmUrl - URL to SPM receiver, e.g. to use test environment or On Premises version
 */
function SpmAgent (spmUrl) {
  var self = this
  var logger = require('./util/logger.js')
  var Harvester = require('./harvester.js')
  var config = require('./util/spmconfig.js')
  var counters = {
    send: 0,
    error: 0,
    retransmit: 0
  }
  var SpmSender = require('./sender/spmsender.js')
  self.spmSender = new SpmSender(config.get('tokens.spm'), 0, spmUrl)
  events.EventEmitter.call(this)
  /**
   * Event listener method for metrics, pushing metrics to spmsender module
   * @param {Object} metric  Object
   */
  function shipMetrics (metric) {
    try {
      self.emit('metric', metric)
      self.spmSender.collectMetric(metric)
    } catch (ex) {
      logger.error('Error in shipMetrics' + ex.stack)
    }
  }

  this.metricCollector = new Harvester(shipMetrics, config.agentsToLoad)
  // registering for send events, and emitting updated counters as 'stats' event
  self.spmSender.on('send', function () {
    counters.send += 1
    self.emit('stats', counters)
  })
  self.spmSender.on('sendFailed', function (err) {
    counters.error += 1
    // logger.warn ('sendFailed event ' + JSON.stringify (counters))
    self.emit('stats', counters)
  })
  self.spmSender.on('retransmit', function () {
    counters.retransmit += 1
    // logger.warn ('retransmit event ' + JSON.stringify (counters))
    self.emit('stats', counters)
  })
  if (!config.tokens.spm) {
    var msg = 'Please set SPM App Token e.g. export spmagent_tokens__spm="YOUR-SPM-APP-TOKEN"'
    console.error(msg)
    logger.error(msg)
  }
}
util.inherits(SpmAgent, events.EventEmitter)

SpmAgent.prototype.createAgent = function (agent) {
  //var a = new Agent(agent)
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


