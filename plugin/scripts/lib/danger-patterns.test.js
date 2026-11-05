'use strict'

// Run with: node --test scripts/lib/danger-patterns.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const { findDanger } = require('./danger-patterns')

const blocked = (c) => assert.ok(findDanger(c), `expected block: ${c}`)
const allowed = (c) => assert.equal(findDanger(c), null, `expected allow: ${c}`)

test('blocks shell reads of real .env files', () => {
  blocked('cat .env')
  blocked('head -5 apps/api/.env.production')
  blocked('grep TOKEN ./.env.local')
  blocked('Get-Content .\\.env')
  blocked('type "C:\\proj\\.env"')
  blocked('sed -n 1p .env && echo done')
  blocked('cp .env /tmp/x')
  blocked('rtk read .env')
  blocked('rtk grep TOKEN apps/.env.production')
})

test('allows .env.example and commands that only name .env', () => {
  allowed('cat .env.example')
  allowed('Get-Content .env.sample')
  allowed('git check-ignore .env')
  allowed('echo ".env" >> .gitignore')
  allowed('cat environment.ts')
  allowed('rtk read .env.example')
  allowed('rtk git status')
})

test('keeps existing rules', () => {
  blocked('git push --force origin master')
  blocked('rm -rf ~')
  allowed('git push origin review-2026-11')
  allowed('rm -rf build')
})
