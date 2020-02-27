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

const SpmAgent = require('spm-agent')
const client = new SpmAgent()
const os = require('os')

// configure client, with non-default values
// or use the file ./.spmagentrc in YAML format
// the default configuration contains values for Sematext Cloud US
// SpmAgent.Config.tokens.spm = process.env.MONITORING_TOKEN
SpmAgent.Config.influx = {
  dbName: 'metrics',
  // change receiver to Sematext Cloud EU
  // default is spm-receiver.sematext.com for US region
  host: 'spm-receiver.eu.sematext.com',
  port: 443,
  protocol: 'https'
}

// a monitoring agent needs a start an stop function
class MemoryMonitor {
  start (agent) {
    this.agent = agent
    // initialize your metrics collector ...
    // Typically agents collect metrics periodically, every N seconds. The time between // two collection activities is the collectionInterval, specified in milliseconds.
    this.tid = setInterval(function () {
      const measurement = {
        // measurment namespace
        measurement: 'process.memory',
        timestap: new Date(),
        tags: {
          role: 'frontend',
          'os.host': os.hostname()
          // The monitoring token can be set as 'tags.token' value
          // Routing a metrics to a different monitoring app
          // requires setting the `token` tag
          // ,token = process.env.OTHER_APP_TOKEN
        },
        // metrics names and values
        fields: {
          rss: process.memoryUsage().rss
        }
      }
      // pass metrics to sender schedule
      agent.addMetrics(measurement)
    }, SpmAgent.Config.collectionInterval)
  }

  stop () {
    if (this.tid) {
      clearInterval(this.tid)
    }
  }
}

client.createAgent(new SpmAgent.Agent(new MemoryMonitor()))

// log collected metrics to console
// observe all metrics for testing/debuggin
client.on('metrics', console.log)
// observe a specific metric using the measurment name
client.on('process.memory', console.log)

```

## Metric Tags

The agent is able to use environment variables as metrics tags. 
Define a list of environment variables to be used as metric tags.

Let's assume this is the enviroment of the monitored application: 

```
> env
TERM_PROGRAM=Apple_Terminal
TERM=xterm-256color
SHELL=/bin/bash
TMPDIR=/var/folders/v6/bh2q1xsn27g4d2g54z2ylv100000gn/T/
TERM_PROGRAM_VERSION=404.1
TERM_SESSION_ID=F12E0DBD-BF40-466D-85EC-08E89EDC3440
USER=stefan
PWD=/Users/stefan
HOME=/Users/stefan
LOGNAME=stefan
LC_CTYPE=UTF-8
DISPLAY=/private/tmp/com.apple.launchd.J60ybGpban/org.macosforge.xquartz:0
_=/usr/bin/env
```

You want to see later the performance metrics aggregated or filtered for specific user. 
In this case the agent should collect the user name as tag. You can find the user name in the process environment variable `USER`. 
Let's also assume the workingdirectory of the application `PWD` is another relevant identifier for your monitored application. 

To configure the agent collecting USER and PWD as tags you can specify a commaseparated list of environment variables for the the agent configuration: 

```
# add the values of env. variables USER, PWD as tags to metrics
export MONITORING_TAGS_FROM_ENV="USER, PWD"
```

The generated metrics include then the environment variable name and its value as tags. The result in Influx Line Protocol (ILP) format, produced by the agent for metric called `swap`: 

```
swap, USER=stefan,PWD=/Users/stefan out=0i,in=0i 1576765680000000000
```

Define static tags in `key:value` format 

```
export MONITORING_TAGS_FROM_ENV="organisation:sematext, service:api"

```

The result in in ILP format: 

```
swap, organisation=sematext,service=api out=0i,in=0i 1576765680000000000
```


Both types of tags can be mixed: 

```
export MONITORING_TAGS_FROM_ENV="organisation:sematext, service:api, USER, PWD"

```

The result in in ILP format: 

```
swap, organisation=sematext,service=api,USER=stefan,PWD=/Users/stefan,os.host=imac.local out=0i,in=0i 1576765680000000000
```


The config file entry `influx.tagsFromEnv` in `.spmagenrc` works as well: 

```
tokens: 
  spm: 'YOUR_MONITORING_TOKEN'
  infra: 'YOUR_INFRA_MONITROING_TOKEN'
influx:
  tagsFromEnv: 'organisation:sematext, USER, PWD' 
  dbName: 'metrics'
  host: spm-receiver.sematext.com
  protocol: https
  port: 443
  
```     

# Contribute 

Let us know about monitoring agents you need, maybe you like to contribute with your domain expertise!

# Related Modules

- [Node.js Monitoring](http://sematext.com/spm/integrations/nodejs-monitoring.html)
- [spm-agent-nodejs](https://github.com/sematext/spm-agent-nodejs), 
- [spm-agent-mongodb](https://github.com/sematext/spm-agent-mongodb), 
- [sematext-agent-nginx](https://github.com/sematext/sematext-agent-nginx), 
- [sematext-agent-httpd](https://github.com/sematext/sematext-agent-httpd) 
- [Sematext Cloud](https://sematext.com/cloud) - one platform for metrics and logs
