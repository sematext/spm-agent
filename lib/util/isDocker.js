'use strict'

const fs = require('fs')
const hasDockerEnv = function () {
  try {
    fs.statSync('/.dockerenv')
    return true
  } catch {
    return false
  }
}
const hasDockerCGroup = function () {
  try {
    return fs.readFileSync('/proc/self/cgroup', 'utf8').includes('docker')
  } catch {
    return false
  }
}

const isDocker = function () {
  return hasDockerEnv() || hasDockerCGroup()
}

module.exports = isDocker
