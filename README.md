# SPM Agent Framework for Node.js

## Functionality
- Sender interface to SPM backend receivers
- Buffering metrics to disk in case of network outages (using NeDB)
- Limit the file size of buffers 
- Reconnect after failures
- Logging functions 
- Configuration handling 
- Plugable agents

Currently spm-agent is part of 
-  [spm-agent-nodejs](https://github.com/sematext/spm-agent-nodejs) and 
-  [spm-agent-docker](https://github.com/sematext/spm-agent-docker) 

Let us know about monitoring agents you need, maybe you like to contribute with your domain expertise!

## Related Modules
Please check [spm-metrics-js](https://github.com/sematext/spm-metrics-js) to ship your application specific metrics to SPM. 

 
