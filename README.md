# SPM Agent Framework for Node.js
- spm-agent is used in: [spm-agent-nodejs](https://github.com/sematext/spm-agent-nodejs), [spm-agent-mongodb](https://github.com/sematext/spm-agent-mongodb) and [sematext-agent-docker](https://github.com/sematext/sematext-agent-docker) 
- SPM: [http://sematext.com/spm](http://sematext.com/spm) (performance monitoring, alerting, etc.)
- Node.js monitoring: [http://sematext.com/spm/integrations/nodejs-monitoring.html](http://sematext.com/spm/integrations/nodejs-monitoring.html)

## Functionality
- Sender interface to SPM backend receivers
- Buffering metrics to disk in case of network outages (using NeDB)
- Limit the file size of buffers 
- Reconnect after failures
- Logging functions 
- Configuration handling 
- Pluggable agents

Example to implement a monitoring agent:

```js

var SpmAgent = require('spm-agent')
var client = new SpmAgent()
var testAgent = client.createAgent(new SpmAgent.Agent ({
  start: function (agent) {
    // initialize your metrics collector ...
    this.tid = setInterval(function () {
      // get every 30 seconds some metrics 
      // SPM gets an array of metrics for a specific app
       agent.addMetrics({name: 'test-app', value: [1, 2, 3]})
    }, client.config.collectionInterval)
  }
}))
// monitor which values we added by "addMetrics"
testAgent.on ('metrics', console.log)
```

Let us know about monitoring agents you need, maybe you like to contribute with your domain expertise!

## Related Modules
Please check [spm-metrics-js](https://github.com/sematext/spm-metrics-js) to ship your application specific metrics to SPM. 

 
