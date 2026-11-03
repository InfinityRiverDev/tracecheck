import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

// Load the real modules without writing dist/ or depending on a build running elsewhere.
const asModule = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const contentUrl = asModule(stripTypeScriptTypes(await readFile(new URL('../content.ts', import.meta.url), 'utf8')))
const sessionUrl = asModule(await readFile(new URL('../web/session.js', import.meta.url), 'utf8'))
const gameSource = (await readFile(new URL('../web/game.js', import.meta.url), 'utf8'))
  .replaceAll("'./content.js'", JSON.stringify(contentUrl))
  .replaceAll("'./session.js'", JSON.stringify(sessionUrl))
const { matchesFinding, buildDossier } = await import(asModule(gameSource))
const { readSession, saveSession } = await import(sessionUrl)
const empty = () => ({ selected: [], edits: [], answer: null })

function storage(initial = null) {
  let value = initial
  return { getItem: () => value, setItem: (_key, next) => { value = next } }
}

function withStorage(value, action) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  Object.defineProperty(globalThis, 'sessionStorage', { value, configurable: true })
  try { action() } finally {
    if (descriptor) Object.defineProperty(globalThis, 'sessionStorage', descriptor)
    else delete globalThis.sessionStorage
  }
}

test('an address alone cannot reveal a resident and their planned absence', () => {
  assert.equal(matchesFinding([]), false)
  assert.equal(matchesFinding(['address-sign', 'address-location']), false)
  assert.equal(matchesFinding(['home-caption', 'weekend-trip']), false)
  assert.equal(matchesFinding(['address-sign', 'weekend-trip']), false)
  assert.equal(matchesFinding(['address-location', 'home-caption']), false)
})

test('either independent address source can complete the cross-post finding', () => {
  assert.equal(matchesFinding(['address-sign', 'home-caption', 'weekend-trip']), true)
  assert.equal(matchesFinding(['address-location', 'home-caption', 'weekend-trip']), true)
})

test('hiding only one address source leaves the connection visible', () => {
  assert.equal(buildDossier([]).found, true)
  assert.equal(buildDossier(['remove-location']).found, true)
  assert.equal(buildDossier(['hide-sign']).found, true)
})

test('hiding both address sources breaks the home connection but preserves trip evidence', () => {
  const after = buildDossier(['remove-location', 'hide-sign'])
  assert.equal(after.found, false)
  assert.equal(after.visible.some(clue => clue.id === 'weekend-trip'), true)
  assert.equal(after.visible.some(clue => clue.id === 'address-sign' || clue.id === 'address-location'), false)
})

test('removing the home caption prevents treating the photographed address as home', () => {
  const after = buildDossier(['remove-caption'])
  assert.equal(after.found, false)
  assert.equal(after.visible.some(clue => clue.id === 'address-sign'), true)
  assert.equal(after.visible.some(clue => clue.id === 'weekend-trip'), true)
})

test('restoring edits returns the original dossier without changing earlier results', () => {
  const before = buildDossier([])
  buildDossier(['hide-sign', 'remove-location', 'remove-caption'])
  assert.deepEqual(buildDossier([]), before)
  assert.equal(before.found, true)
})

test('absent or broken stored JSON starts a usable empty session', () => {
  for (const raw of [null, '{broken', 'null', '42', '"text"', '[]']) {
    withStorage(storage(raw), () => assert.deepEqual(readSession(), empty()))
  }
})

test('incorrect field types cannot replace the expected session shape', () => {
  const raw = JSON.stringify({ selected: 'address-sign', edits: {}, answer: 42 })
  withStorage(storage(raw), () => assert.deepEqual(readSession(), empty()))
})

test('selected clues, active edits and assessment answer survive a storage round trip', () => {
  const session = { selected: ['address-sign', 'home-caption', 'weekend-trip'], edits: ['hide-sign'], answer: 'visible' }
  withStorage(storage(), () => {
    saveSession(session)
    assert.deepEqual(readSession(), session)
    assert.equal(matchesFinding(readSession().selected), true)
    assert.equal(buildDossier(readSession().edits).found, true)
  })
})

test('disabled browser storage does not prevent playing in memory', () => {
  withStorage({ getItem() { throw new Error('blocked') }, setItem() { throw new Error('quota') } }, () => {
    assert.deepEqual(readSession(), empty())
    const session = { selected: ['address-sign'], edits: [], answer: null }
    assert.doesNotThrow(() => saveSession(session))
    assert.deepEqual(session.selected, ['address-sign'])
  })
})