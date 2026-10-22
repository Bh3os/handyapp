// The Docker build context keeps every tracked source file (node --test). A broad .dockerignore rule once dropped
// apps/site/src/coverage and apps/server/src/modules/coverage, so the staging image failed to build while CI, which
// builds from the checkout, stayed green.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// Docker's matcher for the forms this file uses: `**` spans directories, `*` stays within one, a leading `/` anchors
// at the context root (every pattern is anchored there anyway), and a match on a directory excludes all below it.
const toRegExp = (pattern) => {
  const body = pattern
    .replace(/^\/+/, '')
    .split('/')
    .map((part) =>
      part === '**'
        ? '(?:.+/)?'
        : `${part
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '[^/]*')
            .replace(/\?/g, '[^/]')}/`,
    )
    .join('')
  return new RegExp(`^${body.replace(/\/$/, '')}(?:/|$)`)
}

const patterns = readFileSync(new URL('../.dockerignore', import.meta.url), 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line !== '' && !line.startsWith('#'))
const tracked = execFileSync('git', ['ls-files'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)

test('the matcher follows Docker for the forms used here', () => {
  assert.ok(toRegExp('**/node_modules').test('apps/site/node_modules/x/index.js'))
  assert.ok(toRegExp('apps/*/coverage').test('apps/server/coverage/index.html'))
  assert.ok(!toRegExp('apps/*/coverage').test('apps/server/src/modules/coverage/index.ts'))
  assert.ok(toRegExp('.env.*').test('.env.local'))
  assert.ok(!toRegExp('/coverage').test('apps/site/src/coverage/coverage.ts'))
})

test('no tracked source file is left out of the Docker build context', () => {
  const excluded = tracked.filter((path) => patterns.some((pattern) => toRegExp(pattern).test(path)))
  assert.deepEqual(excluded, [])
})
