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
var http = require('http')
http.createServer(function (req, res) {
  res.writeHead(400, { 'Content-Type': 'text/plain' })
  res.end('{"code":"400"}\n')
}).listen(3314, '127.0.0.1')

config.influx = {
  dbName: 'metrics',
  host: '127.0.0.1',
  protocol: 'http',
  port: 3314
}

describe('SPM for NodeJS tests', function () {
  it('SPM Metrics', function (done) {
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
  it('Influx Agent emits sender-stats, handling metrics rejection on status 400', function (done) {
    try {
      this.timeout(60000)
      config.collectionInterval = 1000
      config.retransmitInterval = 1000
      // config.recoverInterval = 1000
      config.maxDataPoints = 1
      config.logger.console = true
      config.logger.level = 'debug'
      var SpmAgent = require('../lib/index.js')
      process.env.MONITORING_TAGS_FROM_ENV = 'USER,PWD,customer_id:123'
      var client = new SpmAgent()
      var testAgent = client.createAgent(new SpmAgent.Agent({
        start: function (agent) {
          setTimeout(function () {
            var tags = {
              token: process.env.MONITORING_TOKEN || process.SPM_TOKEN,
              PID: process.pid,
              nodeVersion: process.version
            }
            var metric = {
              measurement: 'myapp.process.memory',
              tags: tags,
              fields: { mycounter: new Date().getTime() }
            }
            agent.addMetrics(metric)
          }, 1000)
        },
        stop: console.log
      }))
      // testAgent.start()
      client.once('stats', function (stats) {
        if (stats && stats.send >= 1) {
          console.log('stats', stats)
          done()
        } else {
          throw new Error('Agent does not emit stats object')
        }
      })
    } catch (err) {
      console.log(err.stack)
      done(err)
    }
  })
  it('Influx Agent does not overwrite token', function (done) {
    try {
      this.timeout(60000)
      config.collectionInterval = 1000
      config.transmitInterval = 1000
      config.retransmitInterval = 1000
      // config.recoverInterval = 1000
      config.maxDataPoints = 1
      config.logger.console = true
      config.logger.level = 'debug'
      var SpmAgent = require('../lib/index.js')
      process.env.MONITORING_TAGS_FROM_ENV = 'USER,PWD,customer_id:123'
      var token = 'd8f1bbff-xxxx-xxxx-xxxx-cbda0a33bc44'
      var client = new SpmAgent()
      var testAgent = client.createAgent(new SpmAgent.Agent({
        start: function (agent) {
          setTimeout(function () {
            var tags = {
              token: token,
              PID: process.pid,
              nodeVersion: process.version
            }
            var metric = {
              measurement: 'myapp.process.memory',
              tags: tags,
              fields: { mycounter: new Date().getTime() }
            }
            agent.addMetrics(metric)
          }, 1)
        },
        stop: console.log
      }))
      client.once('metricInSendBuffer', function (m) {
        if (m && m.tags && m.tags.token === token) {
          done()
        } else {
          done(new Error(`token was modified ${m.tags.token} != ${token}`))
        }
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
