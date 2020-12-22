;(async () => {
  const podName = process.env.POD_NAME
  const podNamespace = process.env.POD_NAMESPACE
  const podNameExists = !!podName
  const podNamespaceExists = !!podNamespace
  const isK8s = podNameExists && podNamespaceExists
  process.env.isKubernetes = isK8s
  if (!isK8s) {
    return
  }

  const { readFile } = require('fs')
  const { promisify } = require('util')
  const readFileAsync = promisify(readFile)
  const CGROUP_FILE = '/proc/self/cgroup'

  let counter = 0
  const { KubeConfig } = require('kubernetes-client')
  const Client = require('kubernetes-client').Client
  const Request = require('kubernetes-client/backends/request')
  const kubeconfig = new KubeConfig()

  if (process.env.KUBERNETES_PORT_443_TCP !== undefined) {
    kubeconfig.loadFromCluster()
  } else {
    kubeconfig.loadFromDefault()
  }

  const client = new Client({
    backend: new Request({ kubeconfig }),
    version: '1.13'
  })

  try {
    await client.loadSpec()
  } catch (error) {
    console.error('Error in k8s client', error)
  }

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

  const getId = data => {
    if (!data) {
      return null
    }

    let id = null

    // Break each line up
    const lines = data.split('\n')

    // look for the id
    lines.some(line => {
      if (!line.includes('docker')) {
        return false
      }

      const path = line.split('/')

      if (path.length === 3) {
        id = path[2]
        return true
      }

      return false
    })

    return id
  }

  const getContainerId = async () => {
    try {
      const cgroupContainerId = await readFileAsync(CGROUP_FILE, 'utf8')
      console.log(
        'cgroupContainerId in kubernetes.js: ',
        cgroupContainerId
      )
      return getId(cgroupContainerId)
    } catch (e) {
      console.log(
        'cgroupContainerId > Error in kubernetes.js: ',
        e
      )
      return null
    }
  }

  const getPod = async ({ podNamespace, podName }) => {
    return await client.api.v1
      .namespaces(podNamespace)
      .pods(podName)
      .get()
  }

  try {
    // Ping Cgroups to get ContainerId
    const containerIdFromCgroup = await getContainerId()
    console.log(
      'containerIdFromCgroup in kubernetes.js: ',
      containerIdFromCgroup
    )

    // Ping K8s API to get Pod data
    const res = await getPod({ podNamespace, podName })

    // Destructure response body object
    const {
      spec: { nodeName },
      status: { containerStatuses }
    } = res.body

    console.log('containerStatuses in kubernetes.js: ', containerStatuses)
    // Filter out the container that the spm-agent is running in
    const filteredContainer = containerStatuses
      .map(cs => {
        const obj = { container: {}, image: {} }
        obj.container.name = cs.name
        obj.image = parseImage(cs.image)
        obj.image.digest = cs.imageID
          .replace('docker-pullable://', '')
          .replace(obj.image.name, '')
          .replace('@', '')
        obj.container.id = cs.containerID.replace('docker://', '')
        return obj
      })
      .filter(c => c.container.id === containerIdFromCgroup)
      .pop()

    console.log('filteredContainer in kubernetes.js: ', filteredContainer)

    const kubernetesTags = {
      os: {
        host: nodeName
      },
      ...filteredContainer
    }

    console.log('kubernetesTags in kubernetes.js: ', kubernetesTags)
    process.env.kubernetesTags = JSON.stringify(kubernetesTags)
  } catch (error) {
    console.log('error in kubernetes.js: ', error)
  }
})()
