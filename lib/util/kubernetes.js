const { backOff } = require('exponential-backoff')
const backOffOptions = {
  delayFirstAttempt: true,
  numOfAttempts: 100,
  startingDelay: 3000,
  timeMultiple: 2
}
const podNameExists = !!process.env.POD_NAME
const podNamespaceExists = !!process.env.POD_NAMESPACE
const isK8s = podNameExists && podNamespaceExists
process.env.isKubernetes = isK8s
if (!isK8s) {
  return
}

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
  try {
    const pod = await backOff(
      client.api.v1
        .namespaces(namespace)
        .pods(podName)
        .get(),
      backOffOptions
    )
    return pod
  } catch (error) {
    // return new Error('Kubernetes API not ready')
    return error
  }
}

;(async () => {
  const pod = await getPod(process.env.POD_NAMESPACE, process.env.POD_NAME)
  console.log(pod)
})()
