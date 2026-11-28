'use strict'

const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')

const adapter = require.resolve('./hook-io')
const hook = (name) => path.join(__dirname, '..', 'hooks', name)

function run(args, payload) {
  const result = spawnSync(process.execPath, args, {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: 10_000,
  })
  assert.ifError(result.error)
  return result
}

function normalized(payload) {
  const result = run(['-e', `console.log(JSON.stringify(require(${JSON.stringify(adapter)}).readInput()))`], payload)
  assert.equal(result.status, 0)
  return JSON.parse(result.stdout)
}

test('keeps Claude hook input and exposes its raw payload', () => {
  const raw = { hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: 'one.py' }, cwd: process.cwd() }
  const { tool_name, tool_input, cwd } = raw
  assert.deepEqual(normalized(raw), { agent: 'claude', tool_name, tool_input, cwd, raw })
})

test('reads each added and updated Codex file and uses the destination of a move', () => {
  const command = [
    '*** Begin Patch',
    '*** Add File: one file.py',
    '+*** Update File: content.py',
    '*** Update File: two.py',
    '*** Update File: three.py',
    '*** Move to: renamed.py',
    '*** Delete File: removed.py',
    '*** End Patch',
  ].join('\r\n')
  const cwd = process.cwd()
  const raw = { tool_name: 'apply_patch', tool_input: { command }, cwd }
  const file_paths = ['one file.py', 'two.py', 'renamed.py'].map((file) => path.join(cwd, file))
  assert.deepEqual(normalized(raw), { agent: 'codex', tool_name: 'apply_patch', tool_input: { command, file_paths }, cwd, raw })
})

test('reads agy shell and edit arguments from toolCall', () => {
  const cwd = process.cwd()
  const raw = {
    toolCall: { name: 'run_command', args: { CommandLine: 'git status', Cwd: cwd } },
    workspacePaths: [path.dirname(cwd)],
  }
  assert.deepEqual(normalized(raw), { agent: 'agy', tool_name: 'Bash', tool_input: { command: 'git status' }, cwd, raw })
  for (const key of ['TargetFile', 'AbsolutePath']) {
    const toolCall = { name: 'replace_file_content', args: { [key]: 'one.py' } }
    const result = normalized({ toolCall, workspacePaths: [cwd] })
    assert.equal(result.tool_input.file_path, 'one.py')
    assert.equal(result.cwd, cwd)
  }
})

test('uses the Codex shell working directory when present', () => {
  const cwd = process.cwd()
  const result = normalized({ turn_id: 'codex-turn', cwd, tool_name: 'Bash', tool_input: { workdir: 'subdir' } })
  assert.equal(result.cwd, path.join(cwd, 'subdir'))
})

test('formats every patched file with trusted project Prettier', (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'format-hook-'))
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }))
  const bin = path.join(cwd, 'node_modules', 'prettier', 'bin')
  fs.mkdirSync(bin, { recursive: true })
  fs.writeFileSync(path.join(bin, 'prettier.cjs'), "require('node:fs').appendFileSync(process.argv[3], '// formatted')")
  const files = ['one.js', 'two.js']
  files.forEach((file) => fs.writeFileSync(path.join(cwd, file), ''))
  const command = files.map((file) => `*** Update File: ${file}`).join('\n')
  for (const trusted of ['', cwd]) {
    const result = spawnSync(process.execPath, [hook('format-on-edit.js'), '--agent=codex'], {
      env: { ...process.env, AGENT_FORMAT_TRUSTED_ROOTS: trusted },
      input: JSON.stringify({ cwd, tool_name: 'apply_patch', tool_input: { command } }),
      timeout: 10_000,
    })
    assert.ifError(result.error)
    assert.equal(result.status, 0)
    files.forEach((file) => assert.equal(fs.readFileSync(path.join(cwd, file), 'utf8'), trusted ? '// formatted' : ''))
  }
})

test('rejects commands with each provider wire format and leaves safe commands to policy', () => {
  const guard = hook('bash-guard.js')
  const command = 'echo rollout-fixture-dropDatabase'
  const shell = (command) => ({ tool_name: 'Bash', tool_input: { command } })
  const claudeBlocked = run([guard], shell(command))
  assert.equal(claudeBlocked.status, 2)
  assert.match(claudeBlocked.stderr, /Blocked by bash-guard/)
  assert.equal(claudeBlocked.stdout, '')

  const codex = [guard, '--agent=codex']
  const codexBlocked = run(codex, shell(command))
  assert.equal(codexBlocked.status, 0)
  assert.equal(codexBlocked.stderr, '')
  const { hookSpecificOutput } = JSON.parse(codexBlocked.stdout)
  assert.equal(hookSpecificOutput.hookEventName, 'PreToolUse')
  assert.equal(hookSpecificOutput.permissionDecision, 'deny')
  assert.match(hookSpecificOutput.permissionDecisionReason, /Blocked by bash-guard/)
  const codexSafe = run(codex, shell('git status'))
  assert.equal(codexSafe.status, 0)
  assert.equal(codexSafe.stdout, '')

  const agy = (CommandLine) => ({ toolCall: { name: 'run_command', args: { CommandLine } } })
  const blocked = run([guard], agy(command))
  assert.equal(blocked.status, 0)
  assert.equal(blocked.stderr, '')
  const { decision, reason } = JSON.parse(blocked.stdout)
  assert.equal(decision, 'deny')
  assert.match(reason, /Blocked by bash-guard/)
  assert.deepEqual(JSON.parse(run([guard], agy('git status')).stdout), { decision: 'allow' })
})

test('emits agy PostToolUse and SessionStart responses', () => {
  const post = run([hook('format-on-edit.js')], { toolCall: { name: 'write_to_file', args: {} } })
  assert.equal(post.status, 0)
  assert.deepEqual(JSON.parse(post.stdout), {})
  const script = `const io = require(${JSON.stringify(adapter)}); io.addContext('Session note', io.readInput())`
  const start = run(['-e', script, '--', '--agent=agy'], { conversationId: 'agy-session' })
  assert.equal(start.status, 0)
  assert.equal(JSON.parse(start.stdout).injectSteps[0].systemMessage.systemMessage, 'Session note')
})
