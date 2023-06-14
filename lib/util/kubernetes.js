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

  const k8s = require('@kubernetes/client-node')
  const kubeConfig = new k8s.KubeConfig()
  const k8sApi = kubeConfig.makeApiClient(k8s.CoreV1Api)

  if (process.env.KUBERNETES_PORT_443_TCP !== undefined) {
    kubeConfig.loadFromCluster()
  } else {
    kubeConfig.loadFromDefault()
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

  // 1:name=systemd:/kubepods/besteffort/podff89dddf-c58b-4b31-a791-9ca5ec31b803/b50973d3d4fe9a1dbc2a13b9731749f220961cd2cc1040c7285516bb132d0f27
  const getId = data => {
    if (!data) {
      return null
    }

    let id = null
    // Break each line up
    const lines = data.split('\n')
    // look for the id
    lines.some(line => {
      if (!line.includes('name=systemd')) {
        return false
      }
      // split the line into an array on the '/'
      const path = line.split('/')
      // pop the last array item because it's the container id
      id = path.pop()
      if (id) {
        return true
      }
      return false
    })
    return id
  }

  const getContainerId = async () => {
    try {
      const cgroups = await readFileAsync(CGROUP_FILE)
      return getId(cgroups)
    } catch (e) {
      console.log(
        'cgroupContainerId > Error in kubernetes.js: ',
        e
      )
      return null
    }
  }

  const getPod = async ({ podNamespace, podName }) => {
    return await k8sApi.readNamespacedPod(podName, podNamespace)
  }

  try {
    // Ping Cgroups to get ContainerId
    const containerIdFromCgroup = await getContainerId()

    // Ping K8s API to get Pod data
    const res = await getPod({ podNamespace, podName })

    // Destructure response body object
    const {
      spec: { nodeName },
      status: { containerStatuses }
    } = res.body

    // Map container statuses into better structure
    const mappedContainerStatuses = containerStatuses
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

    // Filter out the container that the spm-agent is running in
    const filteredContainer = mappedContainerStatuses
      .filter(c => c.container.id === containerIdFromCgroup)
      .pop()

    if (!filteredContainer) {
      const kubernetesTags = {
        os: {
          host: nodeName
        },
        ...mappedContainerStatuses[0]
      }

      process.env.kubernetesTags = JSON.stringify(kubernetesTags)
      return
    }

    const kubernetesTags = {
      os: {
        host: nodeName
      },
      ...filteredContainer
    }
    process.env.kubernetesTags = JSON.stringify(kubernetesTags)
  } catch (error) {
    console.log('error in kubernetes.js: ', error)
  }
})()
