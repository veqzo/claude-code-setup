'use strict'

const fs = require('node:fs')
const path = require('node:path')

function patchPaths(command, cwd) {
  if (typeof command !== 'string') return []
  const files = new Set()
  let update = null
  for (const line of command.split(/\r?\n/)) {
    const header = /^\*\*\* (Add File|Update File|Delete File|Move to): (.+)$/.exec(line)
    if (!header) continue
    const [, operation, file] = header
    const resolved = path.resolve(cwd, file)
    if (operation === 'Move to' && update) {
      files.delete(update)
      files.add(resolved)
    } else if (operation === 'Add File' || operation === 'Update File') {
      files.add(resolved)
    }
    update = operation === 'Update File' ? resolved : null
  }
  return [...files]
}

function readInput() {
  let raw
  try {
    raw = process.stdin.isTTY ? {} : JSON.parse(fs.readFileSync(0, 'utf8'))
  } catch {
    raw = {}
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {}

  const provider = process.argv.find((arg) => /^--agent=(claude|codex|agy)$/.test(arg))?.slice(8)
  if (provider === 'agy' || raw.toolCall || typeof raw.conversationId === 'string') {
    const { name, args = {} } = raw.toolCall || {}
    const tool_input = name === 'run_command'
      ? { command: args?.CommandLine }
      : { file_path: args?.TargetFile ?? args?.AbsolutePath }
    const cwd = args?.Cwd ?? raw.cwd ?? (Array.isArray(raw.workspacePaths) ? raw.workspacePaths[0] : undefined)
    return { agent: 'agy', tool_name: name === 'run_command' ? 'Bash' : name, tool_input, cwd, raw }
  }

  const { tool_name, tool_input } = raw
  const agent = provider || (tool_name === 'apply_patch' || raw.turn_id ? 'codex' : 'claude')
  const workdir = tool_input?.workdir
  const cwd = agent === 'codex' && tool_name === 'Bash' && typeof workdir === 'string' && workdir
    ? path.resolve(typeof raw.cwd === 'string' ? raw.cwd : process.cwd(), workdir)
    : raw.cwd
  const input = { agent, tool_name, tool_input: tool_input || {}, cwd, raw }
  if (agent === 'codex' && ['apply_patch', 'Edit', 'Write'].includes(tool_name)) {
    const file_paths = patchPaths(tool_input?.command, typeof cwd === 'string' && cwd ? cwd : process.cwd())
    if (file_paths.length) input.tool_input = { ...input.tool_input, file_paths }
  }
  return input
}

function block(lines, { agent }) {
  const reason = [].concat(lines).join('\n')
  if (agent === 'agy') {
    process.stdout.write(`${JSON.stringify({ decision: 'deny', reason })}\n`)
  } else if (agent === 'codex') {
    const hookSpecificOutput = {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    }
    process.stdout.write(`${JSON.stringify({ hookSpecificOutput })}\n`)
  } else {
    process.stderr.write(`${reason}\n`)
    process.exitCode = 2
  }
}

function pass({ agent }, event) {
  if (agent !== 'agy') return
  // Antigravity's allow delegates to the next hook or default permission policy.
  process.stdout.write(event === 'PreToolUse' ? '{"decision":"allow"}\n' : '{}\n')
}

function addContext(text, { agent }) {
  const output = agent === 'agy'
    ? JSON.stringify({ injectSteps: [{ systemMessage: { systemMessage: text } }] })
    : text
  process.stdout.write(`${output}\n`)
}

module.exports = { readInput, block, pass, addContext }
