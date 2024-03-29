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

function addProcessTags (metric) {
  try {
    const processTags = JSON.parse(process.env.processTags)
    if (!metric.tags['process.pid']) {
      metric.tags['process.pid'] = processTags.process.pid
    }
    if (!metric.tags['process.ppid']) {
      metric.tags['process.ppid'] = processTags.process.ppid
    }
    if (!metric.tags['process.name']) {
      metric.tags['process.name'] = processTags.process.name
    }
    if (!metric.tags['process.type']) {
      metric.tags['process.type'] = processTags.process.type
    }
  } catch (err) {
    if (process.env.DEBUG === 'true' || process.env.DEBUG === true) {
      console.log('Error adding Process tags.', err)
    }
  }
}

function addK8sTags (metric) {
  try {
    const isK8s = process.env.isKubernetes === 'true'
    if (isK8s) {
      const kubernetesTags = JSON.parse(process.env.kubernetesTags)
      // don't set default tags, when already provided
      if (!metric.tags['os.host'] && kubernetesTags.os.host) {
        metric.tags['os.host'] = kubernetesTags.os.host
      }
      if (
        !metric.tags['container.id'] &&
        kubernetesTags &&
        kubernetesTags.container &&
        kubernetesTags.container.id
      ) {
        metric.tags['container.id'] = kubernetesTags.container.id
      }
      if (
        !metric.tags['container.name'] &&
        kubernetesTags &&
        kubernetesTags.container &&
        kubernetesTags.container.name
      ) {
        metric.tags['container.name'] = kubernetesTags.container.name
      }
      if (
        !metric.tags['container.image.name'] &&
        kubernetesTags &&
        kubernetesTags.image &&
        kubernetesTags.image.name
      ) {
        metric.tags['container.image.name'] = kubernetesTags.image.name
      }
      if (
        !metric.tags['container.image.tag'] &&
        kubernetesTags &&
        kubernetesTags.image &&
        kubernetesTags.image.tag
      ) {
        metric.tags['container.image.tag'] = kubernetesTags.image.tag
      }
      if (
        !metric.tags['container.image.digest'] &&
        kubernetesTags &&
        kubernetesTags.image &&
        kubernetesTags.image.digest
      ) {
        metric.tags['container.image.digest'] = kubernetesTags.image.digest
      }
      if (!metric.tags['kubernetes.pod.name'] && process.env.POD_NAME) {
        metric.tags['kubernetes.pod.name'] = process.env.POD_NAME
      }
      if (
        !metric.tags['kubernetes.pod.namespace'] &&
        process.env.POD_NAMESPACE
      ) {
        metric.tags['kubernetes.pod.namespace'] = process.env.POD_NAMESPACE
      }
    }
  } catch (err) {
    if (process.env.DEBUG === 'true' || process.env.DEBUG === true) {
      console.log('Error adding K8s tags.', err)
    }
  }
}

function addDockerTags (metric) {
  try {
    const isDkr = process.env.isDocker === 'true'
    if (isDkr) {
      // don't set default tags, when already provided
      if (!metric.tags['container.id'] && process.env.containerId) {
        metric.tags['container.id'] = process.env.containerId
      }
      if (!metric.tags['container.name'] && process.env.containerName) {
        metric.tags['container.name'] = process.env.containerName
      }
      if (
        !metric.tags['container.image.name'] &&
        process.env.containerImageName
      ) {
        metric.tags['container.image.name'] = process.env.containerImageName
      }
      if (
        !metric.tags['container.image.tag'] &&
        process.env.containerImageTag
      ) {
        metric.tags['container.image.tag'] = process.env.containerImageTag
      }
      if (
        !metric.tags['container.image.digest'] &&
        process.env.containerImageDigest
      ) {
        metric.tags['container.image.digest'] = process.env.containerImageDigest
      }
      if (!metric.tags['swarm.stack.name'] && process.env.swarmStackName) {
        metric.tags['swarm.stack.name'] = process.env.swarmStackName
      }
      if (!metric.tags['swarm.service.name'] && process.env.swarmServiceName) {
        metric.tags['swarm.service.name'] = process.env.swarmServiceName
      }
    }
  } catch (err) {
    if (process.env.DEBUG === 'true' || process.env.DEBUG === true) {
      console.log('Error adding Docker tags.', err)
    }
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
  const events = require('events')
  const util = require('util')
  const eventEmitter = new events.EventEmitter()
  const cluster = require('cluster')
  let workerId = 0 + '-' + process.pid // 0 == Master, default
  const config = require('./util/spmconfig')
  require('./util/docker')
  require('./util/kubernetes')
  require('./util/process')

  if (!cluster.isMaster) {
    workerId = cluster.worker.id + '-' + process.pid
  }
  const agentSuperClass = {
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
      if (!metric) {
        return
      }

      if (!metric.timestamp) {
        metric.timestamp = new Date()
      }
      // numeric values depend on influx-client precision settings
      // while Date objects are correctly converted by influx-client
      if (typeof metric.timestamp === 'number') {
        metric.timestamp = new Date(metric.timestamp)
      }
      this.addInfluxTags(metric)
      this.emit('metric', metric)
      if (metric.measurement) {
        this.emit(metric.measurement, metric)
      }
    },

    addInfluxTags: function (metric) {
      if (!metric.tags) {
        metric.tags = {}
      }
      // Set pid, ppid tags only for nodejs and process metrics
      if (
        metric.measurement.startsWith('nodejs') ||
        metric.measurement.startsWith('process') ||
        metric.measurement.startsWith('container')
      ) {
        // don't set default tags, when already provided
        if (!metric.tags['nodejs.worker.id']) {
          metric.tags['nodejs.worker.id'] = workerId
        }

        // Set process tags
        addProcessTags(metric)

        // Set container tags only for K8s metrics if running in K8s
        addK8sTags(metric)

        // Set container tags only for container metrics if running in Docker
        addDockerTags(metric)

        // save the metric token tag, in case global tags set 'token'
        const token = metric.tags.token
        // add global tags to metrics Object
        Object.assign(metric.tags, this.globalTags || {})
        // set metric specific token, e.g. in case of infra-app token
        if (token) {
          metric.tags.token = token
        }
      }
    },

    collectdFormatLine: function (metric) {
      const now = new Date().getTime().toFixed(0)
      const metricsTs = metric.ts.toFixed(0)
      const metricsTs2 = (metric.ts / 1000).toFixed(0)
      const dateString = moment(metric.ts).format('YYYY-MM-DD')
      let line = ''
      if (/collectd.*-/.test(metric.name)) {
        if (
          /collectd-cpu/.test(metric.name) ||
          /collectd-io-octets/.test(metric.name)
        ) {
          line =
            now +
            '\t' +
            metric.name +
            '-' +
            dateString +
            ',' +
            metricsTs2 +
            ',' +
            metric.value
        } else if (/disk/.test(metric.name)) {
          line =
            now +
            '\t' +
            metric.name +
            '-' +
            dateString +
            ',' +
            metricsTs2 +
            ',' +
            metric.value.toFixed(6)
        } else {
          line =
            now + '\t' + metric.name + '\t' + metricsTs2 + ',' + metric.value
        }
      } else {
        line = now + '\t' + metric.name + '\t' + metricsTs + ',' + metric.value
      }
      return line
    },

    defaultFormatLine: function (metric) {
      const now = new Date().getTime().toFixed(0)
      let line = null
      if (metric.sct === 'OS') {
        line = this.collectdFormatLine(metric)
      } else {
        line = util.format(
          '%d\t%s\t%d\t%s\t%s',
          now,
          (metric.type || this.defaultType) + '-' + metric.name,
          metric.ts,
          formatArray(metric.filters),
          formatArray(metric.value)
        )
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
    generateGlobalTags: function (tagNames, tagObject) {
      if (tagNames) {
        if (typeof tagNames === 'string') {
          // convert comma separated String list to array
          tagNames = tagNames.replace(/\s/g, '').split(',')
        }
        if (tagNames instanceof Array) {
          tagNames.forEach(tagName => {
            if (!tagName || tagName === '') {
              return
            }
            if (tagName.indexOf(':') > -1) {
              // static tag a=b
              const keyValue = tagName.split(':')
              if (keyValue.length === 2) {
                tagObject[keyValue[0]] = keyValue[1]
              }
            } else {
              tagObject[tagName] = process.env[tagName]
            }
          })
        }
      }
    },

    /**
     * Starts the agent - typically agents create listeners or interval checks for metrics,
     * and use 'addMetrics' to inform listeners
     */
    start: function () {
      if (!this.globalTags) {
        this.globalTags = {}
      }
      const tagNames =
        process.env.MONITORING_TAGS_FROM_ENV || config.influx.tagsFromEnv
      this.generateGlobalTags(tagNames, this.globalTags)
      if (this.plugin && this.plugin.start) {
        // this is the place to register for external events that return metrics
        this.plugin.start(this)
      } else {
        console.log('NOT called start')
      }
    },
    /**
     * Stops the plugin - timers could be pushed to plugins 'timers' Array, if timers exists it tries to clearInterval(timerId)
     * and tries to call the stop() method of the agent-plugin
     */
    stop: function () {
      if (this.plugin.timers) {
        this.plugin.timers.forEach(function (tid) {
          clearInterval(tid)
        })
      }
      if (this.plugin.stop) {
        this.plugin.stop()
      } else {
        logger.warn('Plugin ' + plugin.name + ' has no stop() function')
      }
    }
  }
  return Object.assign(eventEmitter, agentSuperClass)
}

module.exports = Agent
