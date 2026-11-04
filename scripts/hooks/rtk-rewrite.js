#!/usr/bin/env node
'use strict'

// PreToolUse hook for Bash: hands the call to `rtk hook claude`, which rewrites
// commands like `git status` to `rtk git status` for compact output. rtk reads
// the deny rules itself and leaves denied commands alone; bash-guard runs in
// parallel and judges the original command text.
// Commands matching an `ask` rule are not rewritten: `rtk git stash drop` would
// no longer match `Bash(git stash drop*)` and the prompt would be lost.
// Missing rtk, a timeout or any other error exits 0 so the call runs unchanged.

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return {}
  }
}

function askPatterns(cwd) {
  const files = [path.join(os.homedir(), '.claude', 'settings.json')]
  if (cwd) files.push(path.join(cwd, '.claude', 'settings.json'), path.join(cwd, '.claude', 'settings.local.json'))
  return files
    .flatMap((f) => readJson(f).permissions?.ask || [])
    .map((rule) => /^Bash\((.*)\)$/.exec(rule)?.[1])
    .filter(Boolean)
    .map((glob) => new RegExp(`^${glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 's'))
}

function main() {
  let raw = ''
  try {
    raw = fs.readFileSync(0, 'utf8')
  } catch {
    return 0
  }
  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    return 0
  }
  const command = payload.tool_input?.command
  if (typeof command !== 'string' || !command.trim()) return 0
  if (askPatterns(payload.cwd).some((re) => re.test(command.trim()))) return 0

  const result = spawnSync('rtk', ['hook', 'claude'], {
    input: raw,
    encoding: 'utf8',
    timeout: 8000,
    windowsHide: true,
    env: { ...process.env, RTK_TELEMETRY_DISABLED: '1', RTK_ONRAMP_DISABLED: '1' },
  })
  if (result.error || result.status !== 0) return 0
  process.stdout.write(result.stdout || '')
  return 0
}

process.exit(main())
