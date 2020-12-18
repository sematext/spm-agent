const isDocker = require('is-docker')
if (isDocker()) {
  console.log('spm-agent > lib > util > dockerInspect.js')
  process.env.isDocker = true
  console.log('process.env.isDocker: ', process.env.isDocker)

  const Docker = require('dockerode')
  const docker = new Docker()
  const os = require('os')
  const containerId = os.hostname()

  ;(async () => {
    const data = await docker.getContainer(containerId).inspect()
    process.env.containerId = data.Id
    process.env.containerName = data.Name
    process.env.containerImage = data.Config.Image
  })()
}
