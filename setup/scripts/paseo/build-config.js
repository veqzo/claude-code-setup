#!/usr/bin/env node
'use strict'

// Builds ~/.paseo/config.json from the commented sources in paseo/.
//
// The Paseo daemon reads plain JSON only. This script merges
//   paseo/config.base.jsonc  ->  paseo/hosts/<host>.jsonc  ->  the current config.json
// keeps the keys the daemon owns (auth hash, pluginsEnabled, installed plugins),
// validates the result against paseo/schema/paseo.config.v1.json and writes it.
//
// Usage:
//   node build-config.js --host windows-pc [--dry-run | --check] [--target <file>]
//
// Stop the daemon before you write the file and start it again after. The
// daemon reads the file at start and does not watch it.
// The script prints key paths only, never values.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { parseArgs } = require('node:util')

const REPO = path.resolve(__dirname, '../..')
const SOURCES = path.join(REPO, 'paseo')
const SCHEMA_FILE = path.join(SOURCES, 'schema', 'paseo.config.v1.json')
const FORBIDDEN = [['daemon', 'auth'], ['pluginsEnabled']]

/** Parses JSON with // and /* comments and trailing commas. */
function parseJsonc(text, name = 'input') {
  const source = text.replace(/^﻿/, '')
  // Returns the index after whitespace and comments that start at `i`.
  const skipTrivia = (i) => {
    for (;;) {
      if (/\s/.test(source[i] ?? '')) i++
      else if (source.startsWith('//', i)) i = source.includes('\n', i) ? source.indexOf('\n', i) : source.length
      else if (source.startsWith('/*', i)) {
        const end = source.indexOf('*/', i + 2)
        if (end === -1) throw new Error(`${name}: unterminated block comment`)
        i = end + 2
      } else return i
    }
  }
  let out = ''
  let i = 0
  while (i < source.length) {
    const c = source[i]
    if (c === '"') {
      let j = i + 1
      while (j < source.length && source[j] !== '"') j += source[j] === '\\' ? 2 : 1
      out += source.slice(i, j + 1)
      i = j + 1
    } else if (/\s/.test(c) || source.startsWith('//', i) || source.startsWith('/*', i)) {
      const next = skipTrivia(i)
      out += source.slice(i, next).replace(/[^\n]/g, ' ')
      i = next
    } else if (c === ',' && '}]'.includes(source[skipTrivia(i + 1)] ?? '')) {
      // Trailing comma before a closing bracket.
      out += ' '
      i++
    } else {
      out += c
      i++
    }
  }
  try {
    return JSON.parse(out)
  } catch (error) {
    throw new Error(`${name}: ${error.message}`)
  }
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/** Replaces ${NAME} in every string. Unknown names are an error. */
function expand(value, vars, at = '') {
  if (typeof value === 'string') {
    return value.replace(/\$\{([A-Z_]+)\}/g, (_, name) => {
      if (!Object.hasOwn(vars, name)) throw new Error(`Unknown variable \${${name}} at ${at || '/'}`)
      return vars[name]
    })
  }
  if (Array.isArray(value)) return value.map((item, index) => expand(item, vars, `${at}/${index}`))
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expand(item, vars, `${at}/${key}`)]))
  }
  return value
}

/**
 * Merges `over` into `base`. Objects merge by key, arrays and scalars replace.
 * With `keepNull`, null stays as a delete marker. Without it, null deletes the key.
 */
function merge(base, over, { keepNull = false } = {}) {
  if (!isObject(base) || !isObject(over)) return over
  const result = { ...base }
  for (const [key, value] of Object.entries(over)) {
    if (value === null && !keepNull) delete result[key]
    else result[key] = isObject(value) && isObject(result[key]) ? merge(result[key], value, { keepNull }) : stripNull(value, keepNull)
  }
  return result
}

function stripNull(value, keepNull) {
  if (keepNull || !isObject(value)) return value
  return merge({}, value)
}

function get(value, keys) {
  return keys.reduce((node, key) => (isObject(node) ? node[key] : undefined), value)
}

const TYPES = {
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  integer: (v) => Number.isInteger(v),
  boolean: (v) => typeof v === 'boolean',
  object: isObject,
  array: Array.isArray,
  null: (v) => v === null,
}

/** Validates the JSON Schema subset that the Paseo schema uses. Returns error strings. */
function validate(schema, value, at = '') {
  const where = at || '/'
  if (schema === true || !isObject(schema) || Object.keys(schema).length === 0) return []
  if (schema === false) return [`${where}: not allowed`]
  const errors = []
  if (schema.type) {
    const types = [].concat(schema.type)
    if (!types.some((type) => TYPES[type]?.(value))) return [`${where}: expected ${types.join(' or ')}`]
  }
  if ('const' in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) errors.push(`${where}: must be ${JSON.stringify(schema.const)}`)
  if (schema.enum && !schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(value))) {
    errors.push(`${where}: must be one of ${schema.enum.map((item) => JSON.stringify(item)).join(', ')}`)
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${where}: too short`)
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${where}: too long`)
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) errors.push(`${where}: does not match the required pattern`)
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${where}: below ${schema.minimum}`)
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${where}: above ${schema.maximum}`)
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) errors.push(`${where}: must be above ${schema.exclusiveMinimum}`)
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${where}: needs at least ${schema.minItems} items`)
    if (schema.items) value.forEach((item, index) => errors.push(...validate(schema.items, item, `${at}/${index}`)))
  }
  if (isObject(value)) {
    for (const key of schema.required ?? []) if (!(key in value)) errors.push(`${where}: missing "${key}"`)
    for (const [key, item] of Object.entries(value)) {
      if (schema.propertyNames) errors.push(...validate(schema.propertyNames, key, `${at}/${key} (name)`))
      if (schema.properties && key in schema.properties) errors.push(...validate(schema.properties[key], item, `${at}/${key}`))
      else if (schema.additionalProperties === false) errors.push(`${at}/${key}: unknown key`)
      else if (isObject(schema.additionalProperties)) errors.push(...validate(schema.additionalProperties, item, `${at}/${key}`))
    }
  }
  if (schema.anyOf && !schema.anyOf.some((option) => validate(option, value, at).length === 0)) errors.push(`${where}: matches no allowed form`)
  if (schema.oneOf && schema.oneOf.filter((option) => validate(option, value, at).length === 0).length !== 1) {
    errors.push(`${where}: must match exactly one allowed form`)
  }
  return errors
}

/** Lists the key paths whose values differ. Values are never part of the output. */
function changedPaths(before, after, at = '') {
  if (isObject(before) && isObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    return [...keys].sort().flatMap((key) => changedPaths(before[key], after[key], `${at}/${key}`))
  }
  return JSON.stringify(before) === JSON.stringify(after) ? [] : [at || '/']
}

function readSource(file, vars) {
  const name = path.relative(REPO, file).split(path.sep).join('/')
  const value = parseJsonc(fs.readFileSync(file, 'utf8'), name)
  if (!isObject(value)) throw new Error(`${name}: top level must be an object`)
  for (const keys of FORBIDDEN) {
    if (get(value, keys) !== undefined) throw new Error(`${name}: ${keys.join('.')} is owned by the daemon; remove it`)
  }
  return expand(value, vars)
}

function hosts(sources = SOURCES) {
  return fs.readdirSync(path.join(sources, 'hosts')).filter((name) => name.endsWith('.jsonc')).map((name) => name.slice(0, -6)).sort()
}

/** Builds the config object. `existing` is the parsed current config.json or null. */
function build({ host, existing = null, sources = SOURCES, vars = defaultVars(), schema = readSchema() }) {
  if (!hosts(sources).includes(host)) throw new Error(`Unknown host "${host}". Known: ${hosts(sources).join(', ')}`)
  const managed = merge(
    readSource(path.join(sources, 'config.base.jsonc'), vars),
    readSource(path.join(sources, 'hosts', `${host}.jsonc`), vars),
    { keepNull: true },
  )
  const config = merge(isObject(existing) ? existing : {}, managed)
  const errors = validate(schema, config)
  return { config, errors }
}

function slash(value) {
  return value.split(path.sep).join('/')
}

function defaultVars() {
  return { HOME: slash(os.homedir()), CLAUDE_DIR: slash(REPO) }
}

function readSchema() {
  return JSON.parse(fs.readFileSync(SCHEMA_FILE, 'utf8'))
}

function defaultTarget() {
  return path.join(process.env.PASEO_HOME || path.join(os.homedir(), '.paseo'), 'config.json')
}

function readExisting(target) {
  let text
  try {
    text = fs.readFileSync(target, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
  try {
    return JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    throw new Error(`${target} is not valid JSON. Fix or move it, then run again.`)
  }
}

function writeAtomic(target, text) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  if (fs.existsSync(target)) fs.copyFileSync(target, `${target}.bak`)
  const temp = `${target}.${process.pid}.tmp`
  fs.writeFileSync(temp, text, { mode: 0o600 })
  fs.renameSync(temp, target)
}

function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      host: { type: 'string', default: process.env.PASEO_CONFIG_HOST },
      target: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      check: { type: 'boolean', default: false },
    },
  })
  if (!values.host) throw new Error(`Pass --host <${hosts().join('|')}> or set PASEO_CONFIG_HOST.`)
  const target = path.resolve(values.target ?? defaultTarget())
  const existing = readExisting(target)
  const { config, errors } = build({ host: values.host, existing })
  if (errors.length) {
    process.stderr.write(`Schema check failed (${errors.length}):\n${errors.map((error) => `  ${error}`).join('\n')}\n`)
    return 1
  }
  const changes = changedPaths(existing ?? {}, config)
  const oldProfiles = (get(existing, ['daemon', 'agentProfiles']) ?? []).map((profile) => profile?.name)
  const newProfiles = new Set(config.daemon.agentProfiles.map((profile) => profile.name))
  const removed = oldProfiles.filter((name) => name && !newProfiles.has(name))
  const lines = [`Paseo config for host "${values.host}": ${target}`]
  lines.push(changes.length ? `Changed keys (${changes.length}):\n${changes.map((key) => `  ${key}`).join('\n')}` : 'No changes.')
  if (removed.length) lines.push(`Removed profiles: ${removed.join(', ')}`)
  if (config.pluginsEnabled !== true) lines.push('Note: pluginsEnabled is off, so the quota-guard plugin does not load. Turn it on yourself in Settings > Plugins.')
  process.stdout.write(`${lines.join('\n')}\n`)
  if (values.check) return changes.length ? 1 : 0
  if (values['dry-run'] || !changes.length) return 0
  writeAtomic(target, `${JSON.stringify(config, null, 2)}\n`)
  process.stdout.write(`Wrote ${target} (backup: config.json.bak). Restart the daemon to load it.\n`)
  return 0
}

if (require.main === module) {
  try {
    process.exitCode = main()
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}

module.exports = { parseJsonc, expand, merge, validate, changedPaths, build, hosts, main }
