const pidUsageTree = require('pidusage-tree')
const util = require('util')
const pidUsageTreePromise = util.promisify(pidUsageTree)
const pm2Enabled = process.env.NODE_APP_INSTANCE !== undefined
const isChildProcess = process.send !== undefined
const isMasterProcess = process.send === undefined

const setProcessTags = async ({ pidToCheck, type }) => {
  const results = await pidUsageTreePromise(pidToCheck)
  const processes = Object.keys(results)
    .map(key => results[key])
    .filter(proc => proc)

  const resProc = processes.filter(proc => proc.pid === pidToCheck).pop()

  const processTags = {
    process: {
      type,
      name: 'node',
      pid: resProc.pid,
      ppid: resProc.ppid
    }
  }

  process.env.processTags = JSON.stringify(processTags)
}

const setDefaultProcessTags = async () =>
  isMasterProcess
    ? await setProcessTags({ pidToCheck: process.pid, type: 'master' })
    : await setProcessTags({ pidToCheck: process.pid, type: 'child' })

const setPm2ProcessTags = async () =>
  isChildProcess
    ? await setProcessTags({ pidToCheck: process.ppid, type: 'pm2' })
    : null

;(async () => {
  try {
    if (pm2Enabled) {
      await setPm2ProcessTags()
    } else {
      await setDefaultProcessTags()
    }
  } catch (error) {
    console.log(error)
  }
})()
