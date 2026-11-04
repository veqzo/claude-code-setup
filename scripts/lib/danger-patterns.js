'use strict'

// Second line of defense behind the permission deny rules. Deny rules only match
// the usual spelling of a command; these checks look at the whole command text.

const ROOT_LIKE_TARGETS = new Set([
  '/', '/*', '~', '~/', '~/*', '$HOME', '$HOME/', '$HOME/*', '.', '..', 'C:\\', 'C:/',
])

function hasRecursiveFlag(tokens) {
  return tokens.some((t) => /^-[a-zA-Z]*[rR][a-zA-Z]*$/.test(t) || t === '--recursive')
}

function dangerousRm(command) {
  const invocations = command.match(/\brm\s+[^\n;&|]+/g) || []
  return invocations.some((inv) => {
    const tokens = inv.trim().split(/\s+/).slice(1)
    const targets = tokens.filter((t) => !t.startsWith('-'))
    return hasRecursiveFlag(tokens) && targets.some((t) => ROOT_LIKE_TARGETS.has(t.replace(/^["']|["']$/g, '')))
  })
}

// Commands that print or copy file contents. Deny rules cover only `cat *.env*`
// and similar spellings; this catches the rest (grep, sed, type, cp, paths).
const FILE_READERS = /^(?:cat|head|tail|less|more|bat|type|read|gc|Get-Content|Select-String|sls|sed|awk|grep|rg|strings|xxd|od|base64|source|cp|Copy-Item)$/i
const SAFE_ENV_SUFFIXES = new Set(['example', 'sample', 'template', 'dist'])

function isRealEnvPath(token) {
  const name = token.replace(/^["']|["']$/g, '').split(/[\\/]/).pop()
  const match = /^\.env(?:\.([\w-]+))?$/.exec(name)
  return Boolean(match) && !SAFE_ENV_SUFFIXES.has((match[1] || '').toLowerCase())
}

function readsEnvFile(command) {
  return command.split(/&&|\|\||[;|\n]/).some((segment) => {
    let [cmd, ...args] = segment.trim().split(/\s+/)
    // rtk wraps readers: `rtk read .env`, `rtk grep KEY .env`.
    if (/^rtk(?:\.exe)?$/i.test(cmd || '')) [cmd, ...args] = args
    return FILE_READERS.test(cmd || '') && args.some(isRealEnvPath)
  })
}

const RULES = [
  {
    name: 'reading a real .env file',
    test: readsEnvFile,
    hint: 'Real .env files hold secrets. Read .env.example instead, or ask the user for the variable names.',
  },
  {
    name: 'force push',
    test: (c) => /\bgit\b[^\n;&|]*\bpush\b[^\n;&|]*(?:\s--force(?:-with-lease|-if-includes)?\b|\s-[a-zA-Z]*f[a-zA-Z]*\b|\s\+\S)/.test(c),
    hint: 'Force pushes rewrite shared history. Ask the user to run it themselves.',
  },
  {
    name: 'recursive delete of a root-like path',
    test: dangerousRm,
    hint: 'Delete a specific subdirectory instead.',
  },
  {
    name: 'recursive Remove-Item on a drive root or home folder',
    test: (c) => /Remove-Item[^\n;|&]*-Recurse[^\n;|&]*\s(?:[A-Za-z]:\\?|~|\$HOME|\$env:USERPROFILE)\\?\*?(?=\s|$)/i.test(c),
    hint: 'Delete a specific subdirectory instead.',
  },
  {
    name: 'download piped into a shell',
    test: (c) => /\b(?:curl|wget|Invoke-WebRequest|iwr|irm|Invoke-RestMethod)\b[^\n]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh|iex|Invoke-Expression)\b/i.test(c),
    hint: 'Download the script, read it, then run it.',
  },
  {
    name: 'destructive Docker cleanup',
    test: (c) =>
      /\bdocker\s+system\s+prune\b[^\n;&|]*(?:\s-a\b|\s--all\b|\s--volumes\b)/.test(c) ||
      /\bdocker\s+volume\s+(?:rm|prune)\b/.test(c),
    hint: 'This deletes volumes (database data). Ask the user to run it themselves.',
  },
  {
    name: 'dropping a MongoDB database',
    test: (c) => /dropDatabase/i.test(c),
    hint: 'Ask the user to run destructive database commands themselves.',
  },
]

/** Returns the first matching rule ({name, hint}) or null. */
function findDanger(command) {
  const rule = RULES.find((r) => r.test(command))
  return rule ? { name: rule.name, hint: rule.hint } : null
}

module.exports = { findDanger }
