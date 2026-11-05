import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createQuizLeaderboardServer } from '../server/leaderboard.mjs'
import { createTraceCheckServer } from '../server.mjs'

test('production same-origin HTTP and WebSocket proxies reach the quiz service', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'tracecheck-proxy-'))
  const quiz = createQuizLeaderboardServer({
    mongoUri: '',
    dataPath: join(directory, 'state.json'),
    adminPassword: 'proxy-admin-password-42',
    logger: { error() {} },
  })
  await quiz.ready
  quiz.server.listen(0, '127.0.0.1')
  await once(quiz.server, 'listening')
  process.env.LEADERBOARD_INTERNAL_PORT = String(quiz.server.address().port)

  const publicServer = createTraceCheckServer({ store: null })
  publicServer.listen(0, '127.0.0.1')
  await once(publicServer, 'listening')
  const origin = `http://127.0.0.1:${publicServer.address().port}`
  t.after(async () => {
    await new Promise(resolve => publicServer.listening ? publicServer.close(resolve) : resolve())
    await quiz.close()
    delete process.env.LEADERBOARD_INTERNAL_PORT
    await rm(directory, { recursive: true, force: true })
  })

  const login = await fetch(`${origin}/quiz-live-api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nick: 'admin', password: 'proxy-admin-password-42' }),
  })
  assert.equal(login.status, 200)
  const session = await login.json()
  assert.equal(session.admin, true)

  const socket = new WebSocket(
    `${origin.replace(/^http/, 'ws')}/quiz-live-ws/?token=${encodeURIComponent(session.token)}`,
  )
  const messagePromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket proxy timeout')), 2000)
    socket.addEventListener('message', event => {
      clearTimeout(timer)
      resolve(JSON.parse(String(event.data)))
    }, { once: true })
  })
  await once(socket, 'open')
  const message = await messagePromise
  assert.deepEqual(message, { type: 'leaderboard', rows: [] })
  const closed = once(socket, 'close')
  socket.close()
  await closed
})
