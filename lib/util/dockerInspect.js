const isDocker = require('is-docker')
process.env.isDocker = isDocker()
const isTrue = (process.env.isDocker === 'true')

if (isTrue) {
  console.log('spm-agent > lib > util > dockerInspect.js')
  console.log('process.env.isDocker: ', process.env.isDocker)
  console.log('process.env.isDocker typeof: ', typeof process.env.isDocker)

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
