import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { request as httpRequest } from 'node:http'
import { createTraceCheckServer } from '../server.mjs'

const sessionId = 'test_12345678901234567890'
const sessionPath = `/api/sessions/${sessionId}`

function fakeStore() {
  const documents = new Map()
  const calls = { get: 0, save: 0, ping: 0 }
  return {
    calls,
    async ping() { calls.ping++ },
    async get(id) { calls.get++; return documents.get(id) ?? null },
    async save(id, state) {
      calls.save++
      const document = { state, updatedAt: '2026-11-03T00:00:00.000Z' }
      documents.set(id, document)
      return document
    },
  }
}

async function fixture(t, store = fakeStore()) {
  // Explicit store avoids consulting MONGODB_URI or making database connections.
  const server = createTraceCheckServer({ store })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
    server.closeAllConnections()
  }))
  const origin = `http://127.0.0.1:${server.address().port}`
  return { store, origin, request: (path, options) => fetch(origin + path, options) }
}

function put(body) {
  return { method: 'PUT', headers: { 'content-type': 'application/json' }, body }
}

test('GET missing session returns 404', async t => {
  const { request, store } = await fixture(t)
  const response = await request(sessionPath)
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { error: 'not_found' })
  assert.equal(store.calls.get, 1)
  assert.equal(store.calls.save, 0)
})

test('PUT stores only normalized anonymous progress and GET restores it', async t => {
  const { request, store } = await fixture(t)
  const response = await request(sessionPath, put(JSON.stringify({ state: {
    version: 999, selected: ['address-sign', 'address-sign', '<script>'],
    edits: ['hide-sign'], answer: 'visible', answers: { audience: 'public', bad: 42 },
    updatedAt: 42, email: 'discard@example.test',
  }, password: 'discard' })))
  assert.equal(response.status, 200)
  const saved = await response.json()
  assert.deepEqual(saved.state, {
    version: 1, selected: ['address-sign'], edits: ['hide-sign'],
    answer: 'visible', answers: { audience: 'public' }, updatedAt: 42,
  })
  assert.equal(store.calls.save, 1)
  const restored = await request(sessionPath)
  assert.equal(restored.status, 200)
  assert.deepEqual(await restored.json(), saved)
  assert.equal(restored.headers.get('cache-control'), 'no-store')
})

test('invalid session IDs return 400 without accessing store', async t => {
  const { request, store } = await fixture(t)
  for (const id of ['short', 'x'.repeat(81), 'invalid%20session%20identifier']) {
    const response = await request(`/api/sessions/${id}`, put('{"state":{}}'))
    assert.equal(response.status, 400, id)
    assert.deepEqual(await response.json(), { error: 'invalid_session_id' })
  }
  assert.deepEqual(store.calls, { get: 0, save: 0, ping: 0 })
})

test('malformed JSON returns 400 without saving', async t => {
  const { request, store } = await fixture(t)
  const response = await request(sessionPath, put('{broken'))
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: 'invalid_json' })
  assert.equal(store.calls.save, 0)
})

test('unconfigured database returns 503 for health and session operations', async t => {
  const { request } = await fixture(t, null)
  for (const [path, options] of [
    ['/api/health'], [sessionPath], [sessionPath, put('{"state":{}}')],
  ]) {
    const response = await request(path, options)
    assert.equal(response.status, 503, path)
    await response.json()
  }
})

test('unsupported method returns 405 without accessing store', async t => {
  const { request, store } = await fixture(t)
  const response = await request(sessionPath, { method: 'DELETE' })
  assert.equal(response.status, 405)
  assert.deepEqual(await response.json(), { error: 'method_not_allowed' })
  assert.deepEqual(store.calls, { get: 0, save: 0, ping: 0 })
})

test('unknown API returns 404 without accessing store', async t => {
  const { request, store } = await fixture(t)
  const response = await request('/api/no-such-resource')
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { error: 'not_found' })
  assert.deepEqual(store.calls, { get: 0, save: 0, ping: 0 })
})

test('oversized body returns 413 without saving', async t => {
  const { request, store } = await fixture(t)
  const response = await request(sessionPath, put(JSON.stringify({ state: { extra: 'x'.repeat(33 * 1024) } })))
  assert.equal(response.status, 413)
  assert.deepEqual(await response.json(), { error: 'body_too_large' })
  assert.equal(store.calls.save, 0)
})

test('null JSON is rejected as a client error without saving', async t => {
  const { request, store } = await fixture(t)
  const response = await request(sessionPath, put('null'))
  assert.equal(response.status, 400)
  assert.equal(store.calls.save, 0)
})
function rawGet(origin, path) {
  const target = new URL(origin)
  return new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: target.hostname, port: target.port, path, method: 'GET' }, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }))
      response.on('error', reject)
    })
    request.on('error', reject)
    request.end()
  })
}

test('invalid absolute request target returns 400 and server remains responsive', async t => {
  const { origin, request, store } = await fixture(t)
  const invalid = await rawGet(origin, 'http://[')
  assert.equal(invalid.status, 400)
  assert.deepEqual(invalid.body, { error: 'invalid_url' })
  const healthy = await request('/api/health')
  assert.equal(healthy.status, 200)
  assert.deepEqual(await healthy.json(), { ok: true, database: 'connected' })
  assert.deepEqual(store.calls, { get: 0, save: 0, ping: 1 })
})

test('encoded traversal cannot access a sibling directory sharing the dist prefix', async t => {
  const { origin, store } = await fixture(t)
  // No file is created or opened: rejection must happen before filesystem access.
  const response = await rawGet(origin, '/%2e%2e%2fdist-private/config.json')
  assert.equal(response.status, 400)
  assert.deepEqual(response.body, { error: 'invalid_path' })
  assert.deepEqual(store.calls, { get: 0, save: 0, ping: 0 })
})

test('malformed percent escapes return 400 rather than an internal error', async t => {
  const { origin, store } = await fixture(t)
  for (const path of ['/bad%ZZ', '/api/sessions/%ZZ']) {
    const response = await rawGet(origin, path)
    assert.equal(response.status, 400)
    assert.deepEqual(response.body, { error: 'invalid_url' })
  }
  assert.deepEqual(store.calls, { get: 0, save: 0, ping: 0 })
})

test('missing or nonobject state returns 400 without overwriting progress', async t => {
  const { request, store } = await fixture(t)
  for (const body of [{}, { state: [] }, { state: null }, []]) {
    const response = await request(sessionPath, put(JSON.stringify(body)))
    assert.equal(response.status, 400, JSON.stringify(body))
    assert.deepEqual(await response.json(), { error: 'invalid_state' })
  }
  assert.equal(store.calls.save, 0)
})