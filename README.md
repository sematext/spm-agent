# SPM Agent Framework for Node.js

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

Currently spm-agent is part of 
-  [spm-agent-nodejs](https://github.com/sematext/spm-agent-nodejs) and 
-  [spm-agent-docker](https://github.com/sematext/spm-agent-docker) 

Let us know about monitoring agents you need, maybe you like to contribute with your domain expertise!

## Related Modules
Please check [spm-metrics-js](https://github.com/sematext/spm-metrics-js) to ship your application specific metrics to SPM. 

 
