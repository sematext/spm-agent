const isDocker = require('is-docker')
process.env.isDocker = isDocker()
const isTrue = process.env.isDocker === 'true'
if (isTrue) {
  const Docker = require('dockerode')
  const docker = new Docker()
  const containerId = require('os').hostname()
  const parseImageRegex = /^(\S+?\.\S+?\/|\S+?:\d+\/){0,1}(\S+?):(\S+?){0,1}(@\S+?){0,1}$/i
  function parseImage (image) {
    const imageObj = { name: image }
    const parsedImage = parseImageRegex.exec(image)
    if (parsedImage) {
      if (parsedImage.length > 3) {
        if (parsedImage[1]) {
          imageObj.registry = parsedImage[1]
        }
        imageObj.name = parsedImage[2]
        imageObj.tag = parsedImage[3]
        if (parsedImage[4] !== undefined) {
          imageObj.digest = parsedImage[4].substring(1, parsedImage[4].length)
        }
      }
    }
    return imageObj
  }

  ;(async () => {
    const data = await docker.getContainer(containerId).inspect()
    process.env.containerId = data.Id
    process.env.containerName = data.Name

    const imageObj = parseImage(data.Config.Image)
    process.env.containerImageName = imageObj.name
    if (imageObj.tag) {
      process.env.containerImageTag = imageObj.tag
    }
    if (imageObj.digest) {
      process.env.containerImageDigest = imageObj.digest
    }
  })()
}
