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

var logger = require('./util/logger.js')

/**
 * Agent super class that provides an EventEmitter for 'metric' event.
 * In addition it fires for each added metric an event named by the property metric.name
 *
 * @param {function} plugin -  Function providing a plugin having start(agent) and stop method. The plugin can use agent.addMetric function.
 * @returns {function} an Agent having start,stop, addMetric function
 */
function Agent (plugin) {
  var events = require('events')
  var util = require('util')
  var eventEmitter = new events.EventEmitter()
  var cluster = require('cluster')
  var workerId = 0  // 0 == Master, default
  if (!cluster.isMaster) {
    workerId = cluster.worker.id
  }
  var agentSuperClass = {
    plugin: plugin,
    metricBuffer: [],
    /**
     * Adds a metric value and emits event to listeners on 'metric' or metric.name
     * @param metric
     */
    addMetrics: function (metric) {
      metric.workerId = workerId
      metric.pid = process.pid
      if (!metric.ts) {
        metric.ts = new Date().getTime()
      }
      this.emit('metric', metric)
      if (metric.name) {
        this.emit(metric.name, metric)
      }
    },
    /**
     * Starts the agent - typically thy create listeners or interval checks for metrics, and use 'addMetrics' to inform listeners
     */
    start: function () {
      if (this.plugin && this.plugin.start) {
        // this is the place to register for external events that return metrics
        this.plugin.start(this)
      } else {
        console.log('NOT called start')
      }
    },
    /**
     * Stops the plugin - timers could be pushed to plugins 'timers' Array, if timers exists it tries to clearInterval(timerId)
     * if no timers are defined it tries to call stop method of the plugin
     */
    stop: function () {
      if (this.plugin.timers) {
        this.plugin.timers.forEach(function (tid) {
          clearInterval(tid)
        })
      } else {
        if (this.plugin.stop) {
          this.plugin.stop()
        } else {
          logger.warn('could not stop agent')
        }
      }
    }
  }
  return util._extend(eventEmitter, agentSuperClass)
}

module.exports = Agent
