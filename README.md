# Sematext Agent Framework for Node.js

A framework for monitoring agents. 
Ship metrics to [Sematext Cloud](https://sematext.com/cloud) or InfluxDB. 

## Functionality

- Sender interface to Sematext backend receivers
- Buffering metrics in case of network outages
- Reconnect after failures
- Logging functions 
- Configuration handling 
- Pluggable agents

## Example to Implement a Monitoring Agent

Sematext Cloud supports the Influx Line Protocol for the metric ingestion. 

Agent modules must provide a `start` and `stop`function.   

The function `agent.addMetrics(metric)` collects a metric, which is shipped in bulk requests via Influx Line Protocol to the metrics receiver. 

All metric objects, must have the mandatory fields `measurement`, `tags` and `fields`: 

- measurement - the name of the measurement e.g. 'process.memry'
- tags - key/value pairs, useful for filtering or aggregation of data
- fields - numeric fields with the measurement values

```js

var SpmAgent = require('spm-agent')
var client = new SpmAgent()
var os = require('os')

// configure client, with non-defautl values
// or use the file ./.spmagentrc in YAML format
// the default configuration contains values for Sematext Cloud US
client.config.tokens.spm = process.env.MONITORING_TOKEN
client.config.influx = {
  dbName: 'metrics',
  // change receiver to Sematext Cloud EU
  host: 'spm-receiver.eu.sematext.com',
  port: 443,
  protocol: 'https'
}

var testAgent = client.createAgent(new SpmAgent.Agent ({
  start: function (agent) {
    // initialize your metrics collector ...
    // Typically agents collect metrics periodically, every N seconds. The time between // two collection activities is the collectionInterval, specified in milliseconds.
    this.tid = setInterval(function () {
      // get every N seconds some metrics
      agent.addMetrics({
        measurement: 'process.memory',
        tags: {role: 'frontend', 'os.host': os.hostname()},
        fields: {rss: process.memoryUsage().rss}}
       )
    }, client.config.collectionInterval)
  },
  stop: function () {
    if (this.tid) {
       cancelInterval(this.tid)
    }
  }
}))

// log collected metrics to console
// observe all metrics
testAgent.on('metrics', console.log)
// observe a specific metric using the measurment name
testAgent.on('process.memory', console.log)
```

Let us know about monitoring agents you need, maybe you like to contribute with your domain expertise!

# Related Modules

- [Node.js Monitoring](http://sematext.com/spm/integrations/nodejs-monitoring.html)
- [spm-agent-nodejs](https://github.com/sematext/spm-agent-nodejs), 
- [spm-agent-mongodb](https://github.com/sematext/spm-agent-mongodb), 
- [sematext-agent-nginx](https://github.com/sematext/sematext-agent-nginx), 
- [sematext-agent-httpd](https://github.com/sematext/sematext-agent-httpd) 
- [Sematext Cloud](https://sematext.com/cloud) - one platform for metrics and logs



