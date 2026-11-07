import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Denial, SyncStatus } from '../types'

const sync = atom({ plugin: 'veqzo-setup', key: 'sync' } as const, null)
const denials = atom({ plugin: 'veqzo-setup', key: 'denials' } as const, [])

const BRANCH_LINE = /^## (\S+?)(?:\.\.\.\S+)?(?: \[(.*)\])?$/
const LOG_LINE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) (.*)$/
const LABEL = /\[([^\]]+)\]/
const FAILURE_MAX_AGE_MS = 7 * 24 * 3600 * 1000

async function configDir($: EngineInterface): Promise<string> {
  const custom = await $.env.get('CLAUDE_CONFIG_DIR')
  if (custom) return custom
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? '~'
  return `${home}/.claude`
}

function parseBranch(line: string): Pick<SyncStatus, 'branch' | 'ahead' | 'behind'> {
  const m = BRANCH_LINE.exec(line)
  const counts = m?.[2] ?? ''
  return {
    branch: m?.[1] ?? '?',
    ahead: Number(/ahead (\d+)/.exec(counts)?.[1] ?? 0),
    behind: Number(/behind (\d+)/.exec(counts)?.[1] ?? 0),
  }
}

// The newest log line, if it reports a failure younger than a week.
function lastFailure(log: string, now: number): string | null {
  const last = log.trim().split('\n').pop() ?? ''
  const m = LOG_LINE.exec(last)
  const [, day, time, message] = m ?? []
  if (!day || !time || !message || !/fail/i.test(message)) return null
  const at = new Date(`${day}T${time}`).getTime()
  if (Number.isNaN(at) || now - at > FAILURE_MAX_AGE_MS) return null
  return `${message} (${age(now - at)} ago)`
}

function age(ms: number): string {
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min}m`
  const h = Math.round(min / 60)
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`
}

function summarize(input: unknown): string {
  const o = (input ?? {}) as Record<string, unknown>
  const text = [o.command, o.file_path, o.url, o.path].find(v => typeof v === 'string')
  return String(text ?? JSON.stringify(input) ?? '').replace(/\s+/g, ' ').slice(0, 120)
}

function syncProblems(s: SyncStatus): string[] {
  const out: string[] = []
  if (s.behind) out.push(`${s.behind} behind origin`)
  if (s.ahead) out.push(`${s.ahead} not pushed`)
  if (s.dirty) out.push(`${s.dirty} local change${s.dirty > 1 ? 's' : ''} (pushed at session end)`)
  if (s.lastFailure) out.push(`last hook: ${s.lastFailure}`)
  return out
}

function denialSummary(list: Denial[]): string {
  const counts = new Map<string, number>()
  for (const d of list) counts.set(d.label, (counts.get(d.label) ?? 0) + 1)
  return [...counts].map(([label, n]) => `[${label}] x${n}`).join(', ')
}

async function refresh($: EngineInterface, doFetch = false) {
  const dir = await configDir($)
  if (doFetch) {
    await $.process
      .run(['git', '-C', dir, 'fetch', '--quiet', 'origin'], { env: { GIT_TERMINAL_PROMPT: '0' }, timeoutMs: 20000 })
      .catch(() => undefined)
  }
  const st = await $.process
    .run(['git', '-C', dir, 'status', '--porcelain=v1', '--branch'], { timeoutMs: 10000 })
    .catch(() => null)
  const now = await $.clock.now()
  if (!st || st.exitCode !== 0) {
    await update($, sync, () => ({ isRepo: false, branch: '', ahead: 0, behind: 0, dirty: 0, lastFailure: null, checkedAt: now }))
    return
  }
  const lines = st.stdout.split('\n').filter(Boolean)
  const log = await $.fs.read(`${dir}/sync-hook.log`).catch(() => '')
  const status: SyncStatus = {
    isRepo: true,
    ...parseBranch(lines[0] ?? ''),
    dirty: Math.max(0, lines.length - 1),
    lastFailure: lastFailure(typeof log === 'string' ? log : '', now),
    checkedAt: now,
  }
  await update($, sync, () => status)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'config-sync', description: 'Fetch and show the ~/.claude sync status' })
    await $.command.register({ name: 'auto-denials', description: 'List auto mode classifier blocks of this session' })
    void refresh($)
    // sync.sh runs at session start too; look again once it has fetched.
    $.clock.after(15000, () => void refresh($))
    $.clock.every(60000, () => void refresh($))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    void refresh($)
    return next(e)
  })

  on('classic.PermissionDenied', async ($, e, next) => {
    const denial: Denial = {
      label: LABEL.exec(e.reason)?.[1] ?? 'Unlabeled',
      tool: e.tool_name,
      detail: summarize(e.tool_input),
      at: await $.clock.now(),
    }
    await update($, denials, list => [...list, denial].slice(-50))
    return next(e)
  })

  on('command.run', { command: 'config-sync' }, async $ => {
    await refresh($, true)
    const s = await read($, sync)
    if (!s?.isRepo) return { text: 'config sync: ~/.claude is not a git checkout.' }
    const problems = syncProblems(s)
    return { text: `config sync (${s.branch}): ${problems.length ? problems.join(' · ') : 'in sync with origin'}` }
  })

  on('command.run', { command: 'auto-denials' }, async $ => {
    const list = await read($, denials)
    if (list.length === 0) return { text: 'No auto mode blocks in this session.' }
    const rows = list.map(d => `- [${d.label}] ${d.tool}: ${d.detail}`)
    return {
      text: [
        `Auto mode blocks this session: ${denialSummary(list)}`,
        ...rows,
        '',
        'Fix a recurring block: add the destination to autoMode.environment, or a rule to autoMode.allow',
        '(/permissions -> Auto mode tab). Retry a single one from /permissions -> Recently denied.',
      ].join('\n'),
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const s = await read($, sync)
    const list = await read($, denials)
    const showSync = s !== null && s.isRepo
    if (!showSync && list.length === 0) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const problems = showSync ? syncProblems(s) : []

    return (
      <Box flexDirection="column">
        {showSync && (
          <Text color={problems.length ? 'warning' : undefined} dimColor={!problems.length} wrap="truncate-end">
            {problems.length ? `config sync ⚠ ${problems.join(' · ')}` : `config sync ✓ in sync (${s.branch})`}
          </Text>
        )}
        {list.length > 0 && (
          <Box>
            <Text color="error" wrap="truncate-end">
              auto mode blocked {list.length}: {denialSummary(list)} · /auto-denials{' '}
            </Text>
            <Button key="clear" label="Clear" onPress={() => update($, denials, () => [])} />
          </Box>
        )}
      </Box>
    )
  })
}
