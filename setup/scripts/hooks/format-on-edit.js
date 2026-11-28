#!/usr/bin/env node
'use strict'

// PostToolUse hook for Edit and Write: formats the edited file with the project's own
// formatter, and only when the project clearly uses it. Never uses the network
// (no npx) and never goes through a shell, so file names cannot inject commands.

const fs = require('fs')
const path = require('path')
const { execHookFile } = require('../lib/hook-exec')
const { readInput, pass } = require('../lib/hook-io')

const TIMEOUT_MS = 20000
const PRETTIER_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css'])
const KOTLIN_EXTENSIONS = new Set(['.kt', '.kts'])
const DEFAULT_RUST_EDITION = '2021'

function findUp(startDir, names) {
  let dir = startDir
  for (;;) {
    const hit = names.find((n) => fs.existsSync(path.join(dir, n)))
    if (hit) return path.join(dir, hit)
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

function run(command, args) {
  try {
    execHookFile(command, args, { timeout: TIMEOUT_MS, stdio: 'ignore' })
  } catch {
    // Missing tool or formatter error: formatting is best effort and must not fail the edit.
  }
}

function projectUsesRuff(dir) {
  if (findUp(dir, ['ruff.toml', '.ruff.toml'])) return true
  const pyproject = findUp(dir, ['pyproject.toml'])
  return Boolean(pyproject) && fs.readFileSync(pyproject, 'utf8').includes('[tool.ruff')
}

function projectUsesKtlint(dir) {
  const build = findUp(dir, ['build.gradle.kts', 'build.gradle', 'settings.gradle.kts'])
  return Boolean(build) && /ktlint/i.test(fs.readFileSync(build, 'utf8'))
}

function localPrettier(dir) {
  const pkgDir = findUp(dir, ['node_modules'])
  if (!pkgDir) return null
  const bin = path.join(pkgDir, 'prettier', 'bin', 'prettier.cjs')
  return fs.existsSync(bin) ? bin : null
}

function trustedPrettier(input, file, prettier) {
  if (input.agent === 'claude') return true
  const resolved = [file, prettier].map((entry) => fs.realpathSync(entry))
  const configured = process.env.AGENT_FORMAT_TRUSTED_ROOTS || ''
  return configured.split(path.delimiter).filter(path.isAbsolute).filter(fs.existsSync).some((entry) => {
    const root = fs.realpathSync(entry)
    return resolved.every((target) => {
      const relative = path.relative(root, target)
      return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
    })
  })
}

// rustfmt on a single file does not read Cargo.toml, so the edition must be passed.
// A crate may inherit it (`edition.workspace = true`); then the workspace manifest further up has it.
function rustEdition(dir) {
  let manifest = findUp(dir, ['Cargo.toml'])
  while (manifest) {
    const match = /^\s*edition\s*=\s*"(\d{4})"/m.exec(fs.readFileSync(manifest, 'utf8'))
    if (match) return match[1]
    const parent = path.dirname(path.dirname(manifest))
    if (parent === path.dirname(manifest)) break
    manifest = findUp(parent, ['Cargo.toml'])
  }
  return DEFAULT_RUST_EDITION
}

function rustfmtArgs(file, dir) {
  if (!findUp(dir, ['Cargo.toml'])) return null
  return ['--edition', rustEdition(dir), file]
}

function formatFile(file, input) {
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) return

  const ext = path.extname(file).toLowerCase()
  const dir = path.dirname(path.resolve(file))

  if (ext === '.py' && projectUsesRuff(dir)) {
    run('ruff', ['format', file])
  } else if (PRETTIER_EXTENSIONS.has(ext)) {
    const prettier = localPrettier(dir)
    if (prettier && trustedPrettier(input, file, prettier)) run(process.execPath, [prettier, '--write', file])
  } else if (KOTLIN_EXTENSIONS.has(ext) && projectUsesKtlint(dir)) {
    run('ktlint', ['-F', file])
  } else if (ext === '.rs') {
    const args = rustfmtArgs(file, dir)
    if (args) run('rustfmt', args)
  }
}

if (require.main === module) {
  const input = readInput()
  if (input.agent !== 'agy' || !input.raw.error) {
    const files = Array.isArray(input.tool_input.file_paths)
      ? input.tool_input.file_paths
      : [input.tool_input.file_path]
    for (const file of files) {
      if (typeof file !== 'string' || !file) continue
      try {
        const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd()
        formatFile(path.resolve(cwd, file), input)
      } catch {
        // Continue formatting the other files if a formatter or lookup fails.
      }
    }
  }
  pass(input, 'PostToolUse')
}

module.exports = { rustEdition, rustfmtArgs }
