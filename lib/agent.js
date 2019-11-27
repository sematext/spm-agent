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
var moment = require('moment')
var logger = require('./util/logger.js')

function formatArray (a) {
  if (a instanceof Array) {
    return a.join('\t')
  } else {
    return a + ''
  }
}
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
  var workerId = 0 + '-' + process.pid // 0 == Master, default
  if (!cluster.isMaster) {
    workerId = cluster.worker.id + '-' + process.pid
  }
  var agentSuperClass = {
    plugin: plugin,
    defaultType: 'njs',
    defaultFilters: function () {
      return [workerId || 0, process.pid || 0]
    },
    metricBuffer: [],
    /**
     * Adds a metric value and emits event to listeners on 'metric' or metric.name
     * @param metric
     */
    addMetrics: function (metric) {
      if (metric.measurement && metric.fields) {
        return this.addInfluxMetrics(metric)
      }
      metric.workerId = workerId
      metric.pid = process.pid
      if (!metric.sct) {
        if (metric.name && /collectd/.test(metric.name)) {
          metric.sct = 'OS'
        } else {
          metric.sct = 'APP'
        }
      }
      if (!metric.ts) {
        metric.ts = new Date().getTime()
      }
      if (!metric.type) {
        metric.type = this.defaultType
      }
      if (!metric.filters && metric.type === 'njs') {
        metric.filters = this.defaultFilters()
      }
      metric.spmLine = this.formatLine(metric)
      this.emit('metric', metric)
      if (metric.name) {
        this.emit(metric.name, metric)
      }
    },
    addInfluxMetrics: function (metric) {
      metric.tags['nodejs.worker.id'] = workerId
      metric.tags['nodejs.process.pid'] = process.pid
      metric.tags['nodejs.process.ppid'] = process.ppid
      if (!metric.ts) {
        metric.ts = new Date().getTime()
      }
      if (!metric.type) {
        metric.type = this.defaultType
      }
      this.emit('metric', metric)
      if (metric.measurement) {
        this.emit(metric.measurement, metric)
      }
    },
    collectdFormatLine: function (metric) {
      var now = (new Date().getTime()).toFixed(0)
      var metricsTs = (metric.ts).toFixed(0)
      var metricsTs2 = (metric.ts / 1000).toFixed(0)
      var dateString = moment(metric.ts).format('YYYY-MM-DD')
      var line = ''
      if ((/collectd.*-/.test(metric.name))) {
        if (/collectd-cpu/.test(metric.name) || /collectd-io-octets/.test(metric.name)) {
          line = (now + '\t' + metric.name + '-' + dateString + ',' + metricsTs2 + ',' + metric.value)
        } else if (/disk/.test(metric.name)) {
          line = (now + '\t' + metric.name + '-' + dateString + ',' + metricsTs2 + ',' + metric.value.toFixed(6))
        } else {
          line = now + '\t' + metric.name + '\t' + metricsTs2 + ',' + metric.value
        }
      } else {
        line = now + '\t' + metric.name + '\t' + metricsTs + ',' + metric.value
      }
      return line
    },

    defaultFormatLine: function (metric) {
      var now = (new Date().getTime()).toFixed(0)
      var line = null
      if (metric.sct === 'OS') {
        line = this.collectdFormatLine(metric)
      } else {
        line = util.format('%d\t%s\t%d\t%s\t%s', now, (metric.type || this.defaultType) + '-' + metric.name, metric.ts, formatArray(metric.filters), formatArray(metric.value))
        logger.log(line)
      }
      return line
    },
    /**
     * formats a line for SPM sender, if the plugin does not support this method the default formatter for nodejs and OP metrics is used
     * @maram metric to format
     */
    formatLine: function (metric) {
      if (!this.plugin.formatLine) {
        return this.defaultFormatLine(metric)
      } else {
        return this.plugin.formatLine(metric)
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
  return Object.assign(eventEmitter, agentSuperClass)
}

module.exports = Agent
