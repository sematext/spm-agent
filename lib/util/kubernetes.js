const isK8s = process.env.POD_NAME && process.env.POD_NAMESPACE
process.env.isKubernetes = isK8s
console.log('isK8s: ', isK8s)

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
    const pod = await client.api.v1
      .namespaces(namespace)
      .pods(podName)
      .get()
    return pod
  } catch (error) {
    return new Error('Kubernetes API not ready')
  }
}

;(async () => {
  const pod = await getPod(process.env.POD_NAMESPACE, process.env.POD_NAME)
  console.log(pod)
})()
