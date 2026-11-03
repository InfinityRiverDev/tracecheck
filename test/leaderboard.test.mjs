import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { get as httpGet } from 'node:http'
import { createTraceCheckServer, safeLeaderboardEntries } from '../server.mjs'

function leaderboardStore() {
  return {
    calls: 0,
    async leaderboard() {
      this.calls++
      return [
        { nickname: 'Лиса', exp: 740, completedLevels: 7, passwordHash: 'must-not-leak' },
        { nickname: 'Крот', exp: 510.9, completedLevels: ['1', '2', '3'] },
      ]
    },
  }
}

async function fixture(t, store) {
  const server = createTraceCheckServer({ store })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => {
    server.close(() => resolve())
    server.closeAllConnections()
  }))
  return `http://127.0.0.1:${server.address().port}`
}

test('leaderboard response contains ranked public fields only', async t => {
  const store = leaderboardStore()
  const origin = await fixture(t, store)
  const response = await fetch(`${origin}/api/leaderboard`)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const payload = await response.json()
  assert.match(payload.updatedAt, /^\d{4}-\d{2}-\d{2}T/)
  assert.deepEqual(payload.entries, [
    { rank: 1, nickname: 'Лиса', exp: 740, completedLevels: 7 },
    { rank: 2, nickname: 'Крот', exp: 510, completedLevels: 3 },
  ])
  assert.equal(JSON.stringify(payload).includes('passwordHash'), false)
  assert.equal(store.calls, 1)
})

test('leaderboard stream sends the first snapshot as an SSE event', async t => {
  const store = leaderboardStore()
  const origin = await fixture(t, store)
  const target = new URL('/api/leaderboard/stream', origin)
  const firstChunk = await new Promise((resolve, reject) => {
    const request = httpGet(target, response => {
      assert.match(response.headers['content-type'], /^text\/event-stream/)
      response.once('data', chunk => {
        const value = chunk.toString('utf8')
        response.destroy()
        resolve(value)
      })
      response.on('error', error => {
        if (error.code !== 'ECONNRESET') reject(error)
      })
    })
    request.on('error', reject)
  })
  assert.match(firstChunk, /^event: leaderboard\ndata: /)
  assert.match(firstChunk, /"nickname":"Лиса"/)
})

test('leaderboard stream pushes a changed ranking without a page refresh', async t => {
  const store = {
    rows: [{ nickname: 'Лиса', exp: 740, completedLevels: 7 }],
    async leaderboard() { return this.rows },
  }
  const origin = await fixture(t, store)
  const target = new URL('/api/leaderboard/stream', origin)
  const streamBody = await new Promise((resolve, reject) => {
    const request = httpGet(target, response => {
      let body = ''
      response.on('data', chunk => {
        body += chunk.toString('utf8')
        if (!body.includes('"nickname":"Крот"')) {
          store.rows = [
            { nickname: 'Крот', exp: 900, completedLevels: 9 },
            { nickname: 'Лиса', exp: 740, completedLevels: 7 },
          ]
          return
        }
        response.destroy()
        resolve(body)
      })
      response.on('error', error => {
        if (error.code !== 'ECONNRESET') reject(error)
      })
    })
    request.on('error', reject)
  })
  assert.equal((streamBody.match(/event: leaderboard/g) ?? []).length, 2)
  assert.match(streamBody, /"rank":1,"nickname":"Крот","exp":900/)
})

test('leaderboard fails closed without a configured store', async t => {
  const origin = await fixture(t, null)
  for (const path of ['/api/leaderboard', '/api/leaderboard/stream']) {
    const response = await fetch(origin + path)
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { error: 'database_not_configured' })
  }
})

test('leaderboard normalization clamps malformed values', () => {
  assert.deepEqual(safeLeaderboardEntries([
    { nickname: '  Agent  ', exp: -4, completedLevels: 99 },
    { nickname: '', exp: '100', completedLevels: null },
  ]), [
    { rank: 1, nickname: 'Agent', exp: 0, completedLevels: 10 },
    { rank: 2, nickname: 'Следопыт', exp: 0, completedLevels: 0 },
  ])
})
