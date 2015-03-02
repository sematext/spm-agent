#!/usr/bin/env node
/*
 * @copyright Copyright (c) Sematext Group, Inc. - All Rights Reserved
 *
 * @licence SPM for NodeJS is free-to-use, proprietary software.
 * THIS IS PROPRIETARY SOURCE CODE OF Sematext Group, Inc. (Sematext)
 * This source code may not be copied, reverse engineered, or altered for any purpose.
 * This source code is to be used exclusively by users and customers of Sematext.
 * Please see the full license (found in LICENSE in this distribution) for details on its license and the licenses of its dependencies.
 */
var config = require('../lib/util/spmconfig.js')
var fs = require('fs')
delete config._
delete config.rcFlat
delete config.config

config.tokens.spm = "YOUR_SPM_APP_TOKEN"
fs.writeFileSync('.spmagentrc', JSON.stringify(config, null, '\t'))
console.log('Create default config to file: ./.spmagentrc \n' + JSON.stringify(config, null, '\t'))

