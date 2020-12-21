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

  const getPod = async ({ podNamespace, podName }) => {
    return await client.api.v1
      .namespaces(podNamespace)
      .pods(podName)
      .get()
  }

  const setPodEnvInterval = setInterval(setPodEnv, 1000)

  async function setPodEnv () {
    try {
      const res = await getPod({ podNamespace, podName })
      console.log(res.body)
      process.env.POD = JSON.stringify(res.body)

      if (res) {
        clearPodEnvInterval()
      }
    } catch (error) {
      console.log('Waiting...')
      console.log('Counter: ', counter++)
      console.log('Kubernetes API not ready. Retrying...')
      console.log(error)
    }
  }

  function clearPodEnvInterval () {
    clearInterval(setPodEnvInterval)
  }

  // function parsePod (pod) {
  //   if (pod.spec && pod.spec.containers) {
  //     var podContainers = pod.spec.containers
  //     for (var i = 0; i < podContainers.length; i++) {
  //       var container = podContainers[i]
  //       // split imageName:version
  //       var imageInfo = container.image.split(':')
  //       // split registry/imageName
  //       var imageRegistryInfo = container.image.split('/')
  //       var imageKey = pod.metadata.name + container.name
  //       pod.stImageCache[imageKey] = {
  //         image: container.image,
  //         name: imageInfo[0],
  //         registry: imageRegistryInfo[0]
  //       }
  //       if (imageInfo.length > 1) {
  //         pod.stImageCache[imageKey].tag = imageInfo[1]
  //       }
  //       if (imageRegistryInfo.length > 1) {
  //         pod.stImageCache[imageKey].plainImageName = imageRegistryInfo[1]
  //       }
  //     }
  //   }
  // }
})()
