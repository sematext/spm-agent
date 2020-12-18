const isDocker = require('is-docker')
if (isDocker()) {
  process.env.isDocker = true
  const Docker = require('dockerode')
  const docker = new Docker()
  const os = require('os')
  const containerId = os.hostname()
  // const containerId = '2756a95188e8'

  ;(async () => {
    const data = await docker.getContainer(containerId).inspect()
    process.env.containerId = data.Id
    process.env.containerName = data.Name
    process.env.containerImage = data.Config.Image
  })()
}
