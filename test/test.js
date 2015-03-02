/*
 * Copyright (c) Sematext Group, Inc.
 * All Rights Reserved
 *
 * SPM for NodeJS is free-to-use, proprietary software.
 * THIS IS PROPRIETARY SOURCE CODE OF Sematext Group, Inc. (Sematext)
 * This source code may not be copied, reverse engineered, or altered for any purpose.
 * This source code is to be used exclusively by users and customers of Sematext.
 * Please see the full license (found in LICENSE in this distribution) for details on its license and the licenses of its dependencies.
 */
var assert = require("assert")
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
var config = require('../lib/util/spmconfig.js')
var eventReceived = false
config.logger.console = false
config.logger.level = 'debug'
if (!config.tokens.spm)
  config.tokens.spm = process.env.SPM_TOKEN

describe("SPM for NodeJS tests", function () {

  it("Logger should log", function (done) {
    try {
      var logger = require('../lib/util/logger.js')
      logger.log('Logger test %d', 1)
      done()
    } catch (err) {
      done(err)
    }
  })

  it("SPM Config has defaults", function (done) {
    try {
      var cfgValue = ['tokens.spm', 'recoverInterval', 'maxRetransmitBatchSize', 'spmSenderBulkInsertUrl', 'logger.dir', 'logger.filename', 'logger.level', 'maxDataPoints', 'collectionInterval']
      var checked = cfgValue.filter(function (key) {
        return (config.get(key) != null || false)
      })
      if (cfgValue.length == checked.length)
        done()
      else
        done('not all default values set ' + checked)
    } catch (err) {
      done(err)
    }
  })

  it("SPM Agent Stats", function (done) {
    try {
      this.timeout(95000)
      config.collectionInterval = 200
      config.collectionInterval = 1000
      config.retransmitInterval = 1000
      config.recoverInterval = 1000
      config.maxDataPoints = 2
      config.logger.console = false
      config.logger.level = 'debug'
      var SpmAgent = require('../lib/index.js')
      var client = new SpmAgent()
      var testAgent = client.createAgent(new SpmAgent.Agent ({
        start: function (agent) {
          setTimeout(function () {
            agent.addMetrics({name: 'test', value: [1, 2, 3]})
          }, 100)
        },
        stop: console.log
      }))

      client.once('stats', function (stats) {
        console.log(stats)
        done()
      })

    } catch (err) {
      console.log(err.stack)
      done(err)
    }
  })
})

