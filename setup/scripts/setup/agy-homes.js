#!/usr/bin/env node
'use strict'

// Prepares isolated HOME directories under ~/.agy-homes/<id>/ for secondary
// Antigravity (agy) accounts so each account keeps its own sign-in while
// sharing ~/.gemini/config (and ~/.ssh on Windows).
//
// Usage:
//   node ~/.claude/scripts/setup/agy-homes.js [--account b]... [--home <dir>] [--dry-run]

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { parseArgs } = require('node:util')

const ACCOUNT_ID = /^[a-z0-9-]{1,20}$/

function stat(file) {
  try {
    return { info: fs.lstatSync(file, { throwIfNoEntry: false }), notDir: false }
  } catch (error) {
    if (error.code === 'ENOTDIR') return { info: undefined, notDir: true }
    throw error
  }
}

function samePath(a, b, platform) {
  return platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

function ensureHomes({ accounts = ['b'], home = os.homedir(), dryRun = false, platform = process.platform, log = (line) => process.stdout.write(`${line}\n`) } = {}) {
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error('At least one account id is required')
  }
  for (const id of accounts) {
    if (typeof id !== 'string' || id === 'a' || !ACCOUNT_ID.test(id)) {
      throw new Error(`Invalid account id "${id}": use 1-20 lowercase letters, digits or dashes (not "a")`)
    }
  }

  const rootHome = path.resolve(home)
  const linkType = platform === 'win32' ? 'junction' : 'dir'
  const rel = (target) => path.relative(rootHome, target).split(path.sep).join('/')
  let failed = false

  const report = (id, target, state, detail = '') => {
    if (state === 'failed') failed = true
    log(`[agy-homes] ${id} ${rel(target)}: ${state}${detail ? ` (${detail})` : ''}`)
  }

  const ensureLink = (id, linkPath, targetPath) => {
    const { info: linkInfo, notDir } = stat(linkPath)
    if (notDir) {
      report(id, linkPath, 'failed', 'parent path is not a directory')
      return
    }
    if (linkInfo) {
      if (!linkInfo.isSymbolicLink()) {
        report(id, linkPath, 'failed', 'exists and is not a link')
        return
      }
      try {
        const current = fs.realpathSync(linkPath)
        const expected = fs.realpathSync(targetPath)
        if (samePath(current, expected, platform)) {
          report(id, linkPath, 'ok')
        } else {
          report(id, linkPath, 'failed', 'points to a different target')
        }
      } catch {
        report(id, linkPath, 'failed', 'points to a missing or unreadable target')
      }
      return
    }

    const { info: targetInfo, notDir: targetNotDir } = stat(targetPath)
    if (targetNotDir || !targetInfo) {
      report(id, linkPath, 'skipped', `${rel(targetPath)} missing`)
      return
    }
    if (dryRun) {
      report(id, linkPath, 'would create', `-> ${rel(targetPath)}`)
      return
    }
    try {
      fs.mkdirSync(path.dirname(linkPath), { recursive: true })
      fs.symlinkSync(targetPath, linkPath, linkType)
      report(id, linkPath, 'created', `-> ${rel(targetPath)}`)
    } catch (error) {
      report(id, linkPath, 'failed', error.code || error.message)
    }
  }

  const ensureDir = (id, dirPath) => {
    const { info, notDir } = stat(dirPath)
    if (notDir) {
      report(id, dirPath, 'failed', 'parent path is not a directory')
      return false
    }
    if (info) {
      if (info.isDirectory() && !info.isSymbolicLink()) {
        report(id, dirPath, 'ok')
        return true
      }
      report(id, dirPath, 'failed', 'exists and is not a directory')
      return false
    }
    if (dryRun) {
      report(id, dirPath, 'would create')
      return true
    }
    try {
      fs.mkdirSync(dirPath, { recursive: true })
      report(id, dirPath, 'created')
      return true
    } catch (error) {
      report(id, dirPath, 'failed', error.code || error.message)
      return false
    }
  }

  const ensureSettings = (id, destFile, srcFile, dirOk) => {
    if (!dirOk) {
      report(id, destFile, 'failed', 'parent directory is not usable')
      return
    }
    const { info: destInfo, notDir } = stat(destFile)
    if (notDir) {
      report(id, destFile, 'failed', 'parent path is not a directory')
      return
    }
    if (destInfo) {
      if (destInfo.isFile() && !destInfo.isSymbolicLink()) {
        report(id, destFile, 'ok')
      } else {
        report(id, destFile, 'failed', 'exists and is not a regular file')
      }
      return
    }
    const { info: srcInfo, notDir: srcNotDir } = stat(srcFile)
    if (srcNotDir || !srcInfo || !srcInfo.isFile()) {
      report(id, destFile, 'skipped', `${rel(srcFile)} missing`)
      return
    }
    if (dryRun) {
      report(id, destFile, 'would create', `from ${rel(srcFile)}`)
      return
    }
    try {
      fs.copyFileSync(srcFile, destFile, fs.constants.COPYFILE_EXCL)
      report(id, destFile, 'created', `from ${rel(srcFile)}`)
    } catch (error) {
      report(id, destFile, 'failed', error.code || error.message)
    }
  }

  for (const id of accounts) {
    const accountHome = path.join(rootHome, '.agy-homes', id)
    ensureLink(id, path.join(accountHome, '.gemini', 'config'), path.join(rootHome, '.gemini', 'config'))

    const cliDir = path.join(accountHome, '.gemini', 'antigravity-cli')
    const dirOk = ensureDir(id, cliDir)
    ensureSettings(
      id,
      path.join(cliDir, 'settings.json'),
      path.join(rootHome, '.gemini', 'antigravity-cli', 'settings.json'),
      dirOk,
    )

    if (platform === 'win32') {
      ensureLink(id, path.join(accountHome, '.ssh'), path.join(rootHome, '.ssh'))
    }
  }

  return failed ? 1 : 0
}

function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      account: { type: 'string', multiple: true },
      home: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  })
  const accounts = values.account && values.account.length > 0 ? values.account : ['b']
  return ensureHomes({
    accounts,
    home: values.home || os.homedir(),
    dryRun: values['dry-run'],
  })
}

if (require.main === module) {
  try {
    process.exitCode = main()
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}

module.exports = { ensureHomes }
