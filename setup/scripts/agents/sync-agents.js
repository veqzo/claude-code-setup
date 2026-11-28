#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { parseArgs } = require('node:util')
const manifest = require('./hooks.manifest.json')

const SOURCE = path.resolve(__dirname, '../..')
const MARKER = 'generated from ~/.claude, do not edit'
const WINDOWS = process.platform === 'win32'
const MATCHERS = {
  codex: { shell: 'Bash', edit: 'Edit|Write' },
  agy: { shell: 'run_command', edit: 'write_to_file|replace_file_content|multi_replace_file_content' },
}

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
}

function list(dir) {
  try {
    return fs.readdirSync(dir).sort()
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

function frontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text)
  return match ? { metadata: match[1], body: text.slice(match[0].length) } : { metadata: '', body: text }
}

function scalar(text) {
  const value = text.trim()
  if (value.startsWith('"')) return JSON.parse(value)
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'")
  return value
}

function rulesTable(claude) {
  const dir = path.join(SOURCE, 'rules')
  const rows = list(dir).filter((name) => name.endsWith('.md')).map((name) => {
    const { metadata } = frontmatter(read(path.join(dir, name)))
    const block = /^paths:[ \t]*\n((?:[ \t]+- [^\n]+(?:\n|$))+)/m.exec(metadata)
    const globs = block && [...block[1].matchAll(/^[ \t]+- (.+)$/gm)].map((match) => scalar(match[1]))
    if (/^paths:/m.test(metadata) && !globs) throw new Error(`Unsupported paths list in rules/${name}`)
    const scope = globs ? globs.map((glob) => `\`${glob.replaceAll('|', '\\|')}\``).join(', ') : 'Every task'
    return `| ${scope} | \`${path.join(claude, 'rules', name).split(path.sep).join('/')}\` |`
  })
  return [
    '## Rules',
    '',
    'Read each rule that applies to your task. Read rules with file patterns before you edit matching files.',
    '',
    '| When to read | Rule file |',
    '| --- | --- |',
    ...rows,
  ].join('\n')
}

function globalRules(provider, claude) {
  const shared = read(path.join(SOURCE, 'CLAUDE.md'))
    .replace(/^<!-- claude-only -->\n[\s\S]*?^<!-- \/claude-only -->\n*/gm, '')
    .replace(/^- Stack detail lives in path-scoped rules.*\n/m, '')
    .trim()
  const extraFile = path.join(__dirname, `${provider}-extra.md`)
  const extra = fs.existsSync(extraFile) ? read(extraFile).trim() : ''
  const result = [`<!-- ${MARKER} -->`, shared, rulesTable(claude), extra].filter(Boolean).join('\n\n') + '\n'
  if (provider === 'agy' && Buffer.byteLength(result) > 24_000) {
    throw new Error('Antigravity AGENTS.md exceeds 24 KB')
  }
  return result
}

function command(provider, claude, script) {
  const file = path.join(claude, 'scripts', 'hooks', script).split(path.sep).join('/')
  const node = process.execPath.split(path.sep).join('/')
  const quote = (value) => `'${value.replaceAll("'", WINDOWS ? "''" : "'\\''")}'`
  if (provider === 'agy' && WINDOWS) {
    const systemRoot = process.env.SystemRoot ?? ''
    if (!/^[a-z]:[\\/][a-z0-9_.\\/-]+$/i.test(systemRoot)) {
      throw new Error('Antigravity requires a Windows SystemRoot that can be passed to cmd without quotes')
    }
    const powershell = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    // Antigravity passes the command as a cmd argument. Avoid cmd's quote parsing
    // and pass the absolute paths as data inside the PowerShell command.
    const decodePath = (value) => {
      const encoded = Buffer.from(value, 'utf8').toString('base64')
      return `[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))`
    }
    const launcher = [
      "$ErrorActionPreference = 'Stop'",
      "$ProgressPreference = 'SilentlyContinue'",
      '[Console]::InputEncoding = [Console]::OutputEncoding = $OutputEncoding = [Text.UTF8Encoding]::new($false)',
      `$nodePath = ${decodePath(node)}`,
      `$hookPath = ${decodePath(file)}`,
      '[Console]::In.ReadToEnd() | & $nodePath $hookPath --agent=agy',
      'exit $LASTEXITCODE',
    ].join('\n')
    const encoded = Buffer.from(launcher, 'utf16le').toString('base64')
    return `${powershell} -NoProfile -NonInteractive -EncodedCommand ${encoded}`
  }
  return `${WINDOWS ? '& ' : ''}${quote(node)} ${quote(file)} --agent=${provider}`
}

const json = (value) => JSON.stringify(value, null, 2) + '\n'

function hooks(provider, claude) {
  const generated = {}
  for (const { event, script, timeout, tool } of manifest) {
    const handler = { type: 'command', command: command(provider, claude, script), timeout }
    const matcher = MATCHERS[provider][tool]
    const entry = provider === 'agy' && !matcher ? handler : { ...(matcher && { matcher }), hooks: [handler] }
    generated[event] ??= []
    generated[event].push(entry)
  }
  return provider === 'codex'
    ? json({ description: MARKER, hooks: generated })
    : json({ [MARKER]: { enabled: true, ...generated } })
}

function codexAgents() {
  const dir = path.join(SOURCE, 'agents')
  const agents = new Map()
  for (const file of list(dir).filter((name) => name.endsWith('.md'))) {
    const { metadata, body } = frontmatter(read(path.join(dir, file)))
    const name = scalar(/^name:[ \t]*(.*)$/m.exec(metadata)?.[1] ?? '')
    const description = scalar(/^description:[ \t]*(.*)$/m.exec(metadata)?.[1] ?? '')
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name) || !description || !body.trim() || agents.has(name)) {
      throw new Error(`Invalid or duplicate agent in agents/${file}`)
    }
    const values = { name, description, developer_instructions: body.trim() }
    const toml = Object.entries(values).map(([key, value]) =>
      `${key} = ${JSON.stringify(value).replaceAll('\x7f', '\\u007f')}`)
    agents.set(name, [`# ${MARKER}`, ...toml, ''].join('\n'))
  }
  return agents
}

function stat(file) {
  try {
    return fs.lstatSync(file, { throwIfNoEntry: false })
  } catch (error) {
    if (error.code === 'ENOTDIR') return undefined
    throw error
  }
}

function linkTarget(file, info) {
  if (!info?.isSymbolicLink()) return null
  return path.resolve(path.dirname(file), fs.readlinkSync(file).replace(/^\\\\\?\\/, ''))
}

function samePath(a, b) {
  return WINDOWS ? a.toLowerCase() === b.toLowerCase() : a === b
}

function managed(text) {
  return text.startsWith(`<!-- ${MARKER} -->\n`) || text.startsWith(`# ${MARKER}\n`) ||
    text.startsWith(`{\n  "description": "${MARKER}",\n`) ||
    text.startsWith(`{\n  "$comment": "${MARKER}",\n`) || text.startsWith(`{\n  "${MARKER}": {\n`)
}

function checkParents(home, target) {
  const parts = path.relative(home, target).split(path.sep).slice(0, -1)
  let dir = home
  for (const part of parts) {
    dir = path.join(dir, part)
    const info = stat(dir)
    if (info && !info.isDirectory()) throw new Error(`Expected a regular directory at ${dir}`)
  }
}

function checkLegacyHooks(target, provider) {
  const info = stat(target)
  if (!info) return
  if (!info.isFile()) throw new Error(`Expected a regular hook file at ${target}`)
  const previous = read(target)
  const config = JSON.parse(previous)
  if (managed(previous)) return
  const keys = Object.keys(config)
  if (!keys.length) return
  const legacyCommands = new Set(['rtk-rewrite.js', 'worker-check.js', ...manifest.map(({ script }) => script)]
    .map((script) => `node "$HOME/.claude/scripts/hooks/${script}"`))
  if (provider === 'codex' && config.hooks && keys.every((key) => ['description', 'hooks'].includes(key)) &&
      Object.values(config.hooks).every((entries) => Array.isArray(entries) && entries.every((entry) =>
        Array.isArray(entry.hooks) && entry.hooks.every(({ command }) => legacyCommands.has(command))))) return
  throw new Error(`Review existing hooks before migrating ${target}`)
}

// Skills with disable-model-invocation are started only by the user in Claude Code.
// Other tools may not honor that field, so they do not get these skills.
function userOnly(skillDir) {
  const file = path.join(skillDir, 'SKILL.md')
  if (!stat(file)?.isFile()) return false
  const front = read(file).match(/^---\r?\n([\s\S]*?)\r?\n---/)
  return Boolean(front && /^disable-model-invocation:\s*true\s*$/m.test(front[1]))
}

function planSync(home, only) {
  const claude = path.join(home, '.claude')
  const sourceSkills = path.join(SOURCE, 'skills')
  const claudeSkills = path.join(claude, 'skills')
  const skillNames = list(sourceSkills)
  const changes = []
  function file(target, content) {
    const info = stat(target)
    if (info && !info.isFile() && !info.isSymbolicLink()) throw new Error(`Expected a file at ${target}`)
    const previous = info?.isFile() ? read(target) : null
    if (previous !== content) changes.push({ target, content, backup: Boolean(info && !managed(previous ?? '')) })
  }
  function retire(target) {
    changes.push({ target, backup: true })
  }

  if (only !== 'agy') {
    const codex = path.join(home, '.codex')
    for (const target of [
      path.join(codex, 'agents', 'entry'),
      path.join(home, '.agents', 'skills', 'entry'),
      path.join(claude, 'AGENTS.md'),
    ]) checkParents(home, target)
    checkLegacyHooks(path.join(codex, 'hooks.json'), 'codex')
    file(path.join(codex, 'AGENTS.md'), globalRules('codex', claude))
    file(path.join(codex, 'hooks.json'), hooks('codex', claude))
    const agents = codexAgents()
    for (const [name, content] of agents) file(path.join(codex, 'agents', `${name}.toml`), content)
    for (const name of list(path.join(codex, 'agents')).filter((name) => name.endsWith('.toml'))) {
      if (agents.has(path.basename(name, '.toml'))) continue
      const target = path.join(codex, 'agents', name)
      if (['refactor-cleaner.toml', 'tdd-guide.toml'].includes(name) ||
          (stat(target)?.isFile() && managed(read(target)))) retire(target)
    }

    const codexSkills = path.join(home, '.agents', 'skills')
    const skills = new Set(skillNames.filter((name) =>
      !/^(\.|paseo|synced$)/i.test(name) && stat(path.join(sourceSkills, name, 'SKILL.md'))?.isFile() &&
      !userOnly(path.join(sourceSkills, name))))
    for (const name of skills) {
      const target = path.join(codexSkills, name)
      const link = path.join(claudeSkills, name)
      const info = stat(target)
      const old = linkTarget(target, info)
      if (!old || !samePath(old, link)) changes.push({ target, link, backup: Boolean(info) })
    }
    for (const name of list(codexSkills)) {
      if (skills.has(name) || /^paseo/i.test(name)) continue
      const target = path.join(codexSkills, name)
      const link = linkTarget(target, stat(target))
      const expected = path.join(claudeSkills, name)
      if (link && samePath(link, expected) &&
          (!stat(path.join(sourceSkills, name, 'SKILL.md')) || userOnly(path.join(sourceSkills, name)))) retire(target)
    }

    const staleRules = path.join(claude, 'AGENTS.md')
    if (stat(staleRules)?.isFile() && read(staleRules).includes('~/.Codex/rules/')) retire(staleRules)
  }

  if (only !== 'codex') {
    const agy = path.join(home, '.gemini', 'config')
    checkParents(home, path.join(agy, 'hooks.json'))
    checkLegacyHooks(path.join(agy, 'hooks.json'), 'agy')
    file(path.join(agy, 'AGENTS.md'), globalRules('agy', claude))
    file(path.join(agy, 'hooks.json'), hooks('agy', claude))
    file(path.join(agy, 'skills.json'), json({
      $comment: MARKER,
      entries: [{
        path: claudeSkills.split(path.sep).join('/'),
        exclude: skillNames.filter((name) =>
          /^(\.|paseo|THIRD_PARTY|synced$)/i.test(name) || userOnly(path.join(sourceSkills, name))),
      }],
    }))
  }
  return changes
}

function applyChange({ target, content, link, backup }, home, backupRoot) {
  let saved
  let moved = false
  let pending
  try {
    if (content !== undefined || link) {
      fs.mkdirSync(path.dirname(target), { recursive: true })
      pending = `${target}.${randomUUID()}.tmp`
      if (link) fs.symlinkSync(link, pending, WINDOWS ? 'junction' : 'dir')
      else fs.writeFileSync(pending, content, { flag: 'wx' })
    }
    if (backup && stat(target)) {
      saved = path.join(backupRoot, path.relative(home, target))
      fs.mkdirSync(path.dirname(saved), { recursive: true, mode: 0o700 })
      if (content !== undefined && stat(target)?.isFile()) {
        fs.copyFileSync(target, saved, fs.constants.COPYFILE_EXCL)
      } else {
        fs.renameSync(target, saved)
        moved = true
      }
    }
    if (pending) fs.renameSync(pending, target)
  } catch (error) {
    if (moved && !stat(target)) fs.renameSync(saved, target)
    throw error
  } finally {
    if (pending && stat(pending)) fs.unlinkSync(pending)
  }
}

function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: { 'dry-run': { type: 'boolean' }, home: { type: 'string' }, only: { type: 'string' } },
  })
  if (values.only !== undefined && !Object.hasOwn(MATCHERS, values.only)) {
    throw new Error('--only must be codex or agy')
  }
  if (values.home === '') throw new Error('--home needs a directory')
  const home = path.resolve(values.home ?? os.homedir())
  const changes = planSync(home, values.only)
  if (changes.some(({ backup }) => backup)) checkParents(home, path.join(home, '.claude-sync-backup', 'entry'))
  const date = new Date().toISOString().replaceAll(':', '-')
  const backupRoot = path.join(home, '.claude-sync-backup', `${date}-${randomUUID()}`)
  for (const change of changes) {
    const { target, content, link, backup } = change
    const action = link ? 'Link' : content === undefined ? 'Retire' : 'Write'
    if (!values['dry-run']) applyChange(change, home, backupRoot)
    console.log(`${action} ${target}${link ? ` -> ${link}` : ''}${backup ? ' (backup)' : ''}`)
  }
  if (!changes.length) console.log('Agent configuration is up to date.')
  if (!values['dry-run'] && stat(backupRoot)) console.log(`Backup: ${backupRoot}`)
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(`Agent sync failed: ${error.message}`)
    process.exitCode = 1
  }
}
