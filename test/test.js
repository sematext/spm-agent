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
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0'
var config = require('../lib/util/spmconfig.js')
config.logger.console = false
config.logger.level = 'debug'
if (!config.tokens.spm) {
  config.tokens.spm = process.env.SPM_TOKEN || 'TEST_TEST_TEST_SPM_AGENT_TRAVIS'
}
global.spmSenderUrlParameters = '&countainerCount=1'

describe('SPM for NodeJS tests', function () {
  it('SPM Agent Stats', function (done) {
    try {
      this.timeout(50000)
      config.collectionInterval = 1000
      config.retransmitInterval = 1000
      // config.recoverInterval = 1000
      config.maxDataPoints = 1
      config.logger.console = true
      config.logger.level = 'debug'
      var SpmAgent = require('../lib/index.js')
      var client = new SpmAgent()
      var testAgent = client.createAgent(new SpmAgent.Agent({
        start: function (agent) {
          setTimeout(function () {
            agent.addMetrics({name: 'collectd5-disk-space-used\tdf-xvda1/df_complex-used', value: 3380457472.0, sct: 'OS'})
            agent.addMetrics({name: 'collectd-io-octets  disk-sda2/disk_octets', value: '0.000000,0.000000', sct: 'OS'})
            agent.addMetrics({name: 'test', sct: 'OS', value: [1, 2, 3]})
            agent.addMetrics({name: 'test', value: [1, 2, 3]})
          }, 1000)
        },
        stop: console.log
      }))
      // testAgent.start()
      client.once('metric', function (stats) {
        done()
      })
    } catch (err) {
      console.log(err.stack)
      done(err)
    }
  })
  it('Logger should log', function (done) {
    try {
      var logger = require('../lib/util/logger.js')
      logger.log('Logger test %d', 1)
      done()
    } catch (err) {
      done(err)
    }
  })
  it('SPM Config has defaults', function (done) {
    try {
      var cfgValue = ['tokens.spm', 'recoverInterval', 'maxRetransmitBatchSize', 'spmSenderBulkInsertUrl', 'logger.dir', 'logger.filename', 'logger.level', 'maxDataPoints', 'collectionInterval']
      var checked = cfgValue.filter(function (key) {
        return (config.get(key) === null)
      })
      if (checked.length === 0) {
        done()
      } else {
        done('missing config values: ' + checked)
      }
    } catch (err) {
      done(err)
    }
  })
  it('SPM Config "set" accepts flat key', function (done) {
    try {
      config.set('a.b.0.name', 'test')
      if (config.a.b[0].name === 'test') {
        done()
      } else {
        done(new Error('set flat key: a.b.0.name != test'))
      }
    } catch (err) {
      done(err)
    }
  })
})
