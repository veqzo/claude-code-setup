#!/usr/bin/env node
'use strict'

// Applies this config repo on the current machine in one run:
//   1. fast-forwards ~/.claude (only on the sync branch, never pushes)
//   2. runs scripts/agents/sync-agents.js (agy and Codex rules, hooks, skills)
//   3. prepares ~/.agy-homes/b with scripts/setup/agy-homes.js (separate HOME for agy account B)
//   4. rebuilds ~/.paseo/config.json with scripts/paseo/build-config.js when it is stale
//
// Usage:
//   node ~/.claude/scripts/setup/apply.js --host windows-pc [--dry-run]
//
// Without --host the Paseo step is skipped (for machines without a Paseo host).
// The script never stops Paseo itself: the app can host running agent sessions.
// It asks you to quit the app and checks the health endpoint before it writes.
// For the VPS container use docker/paseo-vps/apply.sh on the VPS host instead.

const path = require('node:path')
const readline = require('node:readline/promises')
const { spawnSync } = require('node:child_process')
const { parseArgs } = require('node:util')

const ROOT = path.resolve(__dirname, '../..')
const SYNC = path.join(ROOT, 'scripts', 'agents', 'sync-agents.js')
const AGY_HOMES = path.join(ROOT, 'scripts', 'setup', 'agy-homes.js')
const BUILD = path.join(ROOT, 'scripts', 'paseo', 'build-config.js')
const QUIT_TRIES = 3

function spawn(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
  if (result.error) return { status: 1, stdout: '', stderr: result.error.message }
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

async function probeHealth(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) })
    return response.ok
  } catch {
    return false
  }
}

function defaultDeps(healthUrl) {
  return {
    git: (args) => spawn('git', ['-C', ROOT, ...args]),
    node: (script, args) => spawn(process.execPath, [script, ...args]),
    daemonUp: () => probeHealth(healthUrl),
    ask: async (question) => {
      if (!process.stdin.isTTY) return null
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      try {
        return await rl.question(question)
      } finally {
        rl.close()
      }
    },
    log: (line) => process.stdout.write(`${line}\n`),
  }
}

function indent(text) {
  return text.trimEnd().split('\n').filter(Boolean).map((line) => `  ${line}`).join('\n')
}

async function apply(options, deps) {
  const { log } = deps
  const summary = []
  const step = (name, state, note = '') => {
    summary.push({ name, state })
    log(`[${name}] ${state}${note ? `: ${note}` : ''}`)
  }
  const output = (result) => {
    const text = indent(`${result.stdout}${result.stderr}`)
    if (text) log(text)
  }

  // 1. Config repo
  const branch = deps.git(['branch', '--show-current']).stdout.trim()
  if (branch !== options.branch) {
    step('pull', 'skipped', `on branch ${branch || '(detached)'}, not ${options.branch}`)
  } else {
    const before = deps.git(['rev-parse', '--short', 'HEAD']).stdout.trim()
    const fetched = deps.git(['fetch', '--quiet', 'origin', options.branch])
    if (fetched.status !== 0) {
      output(fetched)
      step('pull', 'failed', 'git fetch failed')
    } else if (options.dryRun) {
      const behind = deps.git(['rev-list', '--count', `HEAD..origin/${options.branch}`]).stdout.trim()
      step('pull', 'preview', `${behind || '?'} new commit(s) on origin/${options.branch}`)
    } else {
      const pulled = deps.git(['pull', '--ff-only', '--autostash', '--quiet', 'origin', options.branch])
      if (pulled.status !== 0) {
        output(pulled)
        step('pull', 'failed', 'fast-forward not possible')
      } else {
        const after = deps.git(['rev-parse', '--short', 'HEAD']).stdout.trim()
        step('pull', before === after ? 'ok' : 'changed', before === after ? `at ${after}` : `${before} -> ${after}`)
      }
    }
  }

  // 2. Agent sync (runs the version that the pull just fetched)
  const syncArgs = [...(options.pullOnly ? ['--only', 'agy'] : []), ...(options.dryRun ? ['--dry-run'] : [])]
  const synced = deps.node(SYNC, syncArgs)
  output(synced)
  if (synced.status !== 0) step('agents', 'failed', 'sync-agents.js failed')
  else if (options.dryRun) step('agents', 'preview')
  else step('agents', /up to date/i.test(synced.stdout) ? 'ok' : 'changed')

  // 3. Secondary agy account homes
  const homes = deps.node(AGY_HOMES, options.dryRun ? ['--dry-run'] : [])
  output(homes)
  if (homes.status !== 0) step('agy-homes', 'failed', 'agy-homes.js failed')
  else if (options.dryRun) step('agy-homes', 'preview')
  else step('agy-homes', homes.stdout.includes('created') ? 'changed' : 'ok')

  // 4. Paseo config
  if (!options.host) {
    step('paseo', 'skipped', 'no --host given')
  } else {
    const checked = deps.node(BUILD, ['--host', options.host, '--check'])
    output(checked)
    if (checked.status === 0) {
      step('paseo', 'ok', 'config is up to date')
    } else if (!checked.stdout.includes('Changed keys')) {
      step('paseo', 'failed', 'build-config.js --check failed')
    } else if (options.dryRun) {
      step('paseo', 'preview', 'config is stale, nothing written')
    } else {
      let up = await deps.daemonUp()
      for (let i = 0; up && i < QUIT_TRIES; i++) {
        const answer = await deps.ask('The Paseo daemon is running. Quit the Paseo app (tray icon > Quit), then press Enter: ')
        if (answer === null) break
        up = await deps.daemonUp()
      }
      if (up) {
        step('paseo', 'failed', 'the daemon is still running, nothing written')
      } else {
        const written = deps.node(BUILD, ['--host', options.host])
        output(written)
        if (written.status !== 0) step('paseo', 'failed', 'build-config.js failed')
        else step('paseo', 'changed', 'start the Paseo app again to load the new config')
      }
    }
  }

  const failed = summary.filter(({ state }) => state === 'failed').map(({ name }) => name)
  log(failed.length ? `Done with failures: ${failed.join(', ')}` : 'Done.')
  return failed.length ? 1 : 0
}

async function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      host: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  })
  const options = {
    host: values.host,
    dryRun: values['dry-run'],
    branch: process.env.CLAUDE_CONFIG_BRANCH || 'master',
    pullOnly: process.env.CLAUDE_CONFIG_PULL_ONLY === 'true',
  }
  const healthUrl = process.env.PASEO_HEALTH_URL || 'http://127.0.0.1:6767/api/health'
  return apply(options, defaultDeps(healthUrl))
}

if (require.main === module) {
  main().then((code) => { process.exitCode = code }, (error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}

module.exports = { apply, SYNC, AGY_HOMES, BUILD }
