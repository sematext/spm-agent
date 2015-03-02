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
 * This module harvest metrics from agents, registers to all agents and fires own metric events
 * @metricConsumer - an object that listens on "metric" event. The metric event passes a metric object with (name, value, type, ts) properties
 * @agentList a list of agents to be created e.g. ['./agents/osAgent.js', './agents/eventLoopAgent.js']
 */
function harvester (metricConsumer, agentList) {
  var agentsToLoad = []
  this.metricConsumer = metricConsumer
  this.httpAgent = null
  var self = this
  if (agentList) {
    agentsToLoad = agentList
  }
  this.agents = []
  for (var x in agentsToLoad) {
    try {
      var TmpAgentClass = require(agentsToLoad[x])
      var tmpAgentInstance = new TmpAgentClass()
      this.addAgent(tmpAgentInstance)
    } catch (err) {
      logger.error('Loading of agent failed:' + agentsToLoad[x])
      logger.error(err)
    }
  }
  process.on('exit', function () {
    self.stop()
  })
  return this
}

harvester.prototype.addAgent = function (agent) {
  this.agents.push(agent)
  agent.start()
  agent.on('metric', this.metricConsumer)
}

harvester.prototype.stop = function () {
  this.agents.forEach(function (agent) {
    if (agent.stop) {
      agent.stop()
    } else {
      logger.error('Agent has no method stop')
    }
  })
}
module.exports = harvester
