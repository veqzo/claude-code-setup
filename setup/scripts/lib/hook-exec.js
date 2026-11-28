'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

function execHookFile(command, args, options) {
  if (process.platform !== 'win32' || path.isAbsolute(command)) return execFileSync(command, args, options)
  // Windows process lookup can otherwise run an executable in the workspace before PATH.
  for (const entry of (process.env.PATH || '').split(path.delimiter)) {
    const dir = entry.replace(/^"(.*)"$/, '$1')
    if (!path.isAbsolute(dir)) continue
    const executable = path.join(dir, `${command}.exe`)
    if (fs.statSync(executable, { throwIfNoEntry: false })?.isFile()) {
      return execFileSync(executable, args, options)
    }
  }
  throw new Error(`Executable not found in PATH: ${command}`)
}

module.exports = { execHookFile }
