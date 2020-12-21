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
client = new Client({ backend: new Request({ kubeconfig }) })
client.loadSpec().catch(error => {
  console.error('Error in k8s client', error)
})

const getPod = async (namespace, podName) => {
  return await client.api.v1
    .namespaces(namespace)
    .pods(podName)
    .get()
}

const setPodEnvInterval = setInterval(setPodEnv, 1000)

async function setPodEnv () {
  try {
    const pod = await getPod(podName, podNamespace)
    console.log(pod)
    process.env.POD = JSON.stringify(pod)

    if (pod) {
      clearPodEnvInterval()
    }
  } catch (error) {
    console.log('Waiting...')
    console.log('Counter: ', counter++)
    console.log('Kubernetes API not ready. Retrying...')
  }
}

function clearPodEnvInterval () {
  clearInterval(setPodEnvInterval)
}
