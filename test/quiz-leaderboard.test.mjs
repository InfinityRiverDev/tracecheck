import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createQuizLeaderboardServer, hashQuizPassword } from '../server/leaderboard.mjs'

const ADMIN_PASSWORD = 'admin-test-password-42'
const USER_PASSWORD = 'player-test-password-42'

async function post(origin, path, body) {
  const response = await fetch(origin + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.json() }
}

function socketMessages(socket) {
  const queued = []
  const waiting = []
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data))
    const index = waiting.findIndex(waiter => waiter.predicate(message))
    if (index >= 0) waiting.splice(index, 1)[0].resolve(message)
    else queued.push(message)
  })
  return predicate => {
    const index = queued.findIndex(predicate)
    if (index >= 0) return Promise.resolve(queued.splice(index, 1)[0])
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WebSocket message timeout')), 2000)
      waiting.push({
        predicate,
        resolve: value => { clearTimeout(timer); resolve(value) },
      })
    })
  }
}

async function openSocket(origin, token) {
  const socket = new WebSocket(`${origin.replace(/^http/, 'ws')}/?token=${encodeURIComponent(token)}`)
  const next = socketMessages(socket)
  await once(socket, 'open')
  return { socket, next }
}

async function closeSocket(socket) {
  if (socket.readyState === WebSocket.CLOSED) return
  const closed = once(socket, 'close')
  if (socket.readyState === WebSocket.OPEN) socket.close()
  await closed
}

test('quiz admin is persistent and can clear scores and delete only non-admin users', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'tracecheck-quiz-'))
  const dataPath = join(directory, 'state.json')
  const legacyNick = 'legacy.user@example'
  const legacyPassword = 'legacy-player-password-42'
  await writeFile(dataPath, JSON.stringify({
    users: {
      [legacyNick]: { ...hashQuizPassword(legacyPassword), solved: {}, role: 'user' },
    },
  }))
  const app = createQuizLeaderboardServer({
    mongoUri: '',
    dataPath,
    adminPassword: ADMIN_PASSWORD,
    logger: { error() {} },
  })
  await app.ready
  app.server.listen(0, '127.0.0.1')
  await once(app.server, 'listening')
  const origin = `http://127.0.0.1:${app.server.address().port}`
  t.after(async () => {
    await app.close()
    await rm(directory, { recursive: true, force: true })
  })

  assert.equal((await post(origin, '/register', { nick: 'player_one', password: 'short' })).status, 400)
  const registration = await post(origin, '/register', { nick: 'Player_One', password: USER_PASSWORD })
  assert.equal(registration.status, 201)
  assert.equal(registration.body.admin, false)
  assert.equal((await post(origin, '/register', { nick: 'player_one', password: USER_PASSWORD })).status, 409)
  assert.equal((await post(origin, '/register', { nick: 'new.user', password: USER_PASSWORD })).status, 400)
  assert.equal((await post(origin, '/login', { nick: legacyNick, password: legacyPassword })).status, 200)

  const adminLogin = await post(origin, '/login', { nick: 'ADMIN', password: ADMIN_PASSWORD })
  assert.equal(adminLogin.status, 200)
  assert.equal(adminLogin.body.admin, true)
  assert.equal((await post(origin, '/login', { nick: 'admin', password: 'wrong-password-42' })).status, 401)

  const player = await openSocket(origin, registration.body.token)
  const admin = await openSocket(origin, adminLogin.body.token)
  await player.next(message => message.type === 'leaderboard')
  await admin.next(message => message.type === 'leaderboard')

  const scored = admin.next(message => message.type === 'leaderboard' && message.rows[0]?.score === 1)
  player.socket.send(JSON.stringify({ type: 'solve', q: 1 }))
  assert.equal((await scored).rows[0].nick, 'Player_One')

  const cleared = admin.next(message => message.type === 'leaderboard' && message.rows[0]?.score === 0)
  const clearResult = admin.next(message => message.type === 'admin-result' && message.action === 'clear')
  admin.socket.send(JSON.stringify({ type: 'clear' }))
  assert.equal((await cleared).rows[0].score, 0)
  assert.equal((await clearResult).ok, true)

  const selfDeleteResult = admin.next(message => message.type === 'admin-result' && message.action === 'delete-user')
  admin.socket.send(JSON.stringify({ type: 'delete-user', nick: 'admin' }))
  assert.equal((await selfDeleteResult).ok, false)

  const deletedBoard = admin.next(message => message.type === 'leaderboard' && message.rows.length === 1)
  const deleteResult = admin.next(message => message.type === 'admin-result' && message.nick === 'Player_One')
  admin.socket.send(JSON.stringify({ type: 'delete-user', nick: 'player_one' }))
  assert.equal((await deletedBoard).rows[0].nick, legacyNick)
  assert.equal((await deleteResult).ok, true)
  assert.equal((await post(origin, '/login', { nick: 'Player_One', password: USER_PASSWORD })).status, 401)

  const legacyDeletedBoard = admin.next(message => message.type === 'leaderboard' && message.rows.length === 0)
  const legacyDeleteResult = admin.next(message => message.type === 'admin-result' && message.nick === legacyNick)
  admin.socket.send(JSON.stringify({ type: 'delete-user', nick: legacyNick }))
  assert.deepEqual((await legacyDeletedBoard).rows, [])
  assert.equal((await legacyDeleteResult).ok, true)
  assert.equal((await post(origin, '/login', { nick: legacyNick, password: legacyPassword })).status, 401)

  await Promise.all([closeSocket(player.socket), closeSocket(admin.socket)])
  await app.close()
  const persisted = JSON.parse(await readFile(dataPath, 'utf8'))
  assert.equal(persisted.users.admin.role, 'admin')
  assert.equal(persisted.users.Player_One, undefined)
  assert.equal(persisted.users[legacyNick], undefined)

  const restarted = createQuizLeaderboardServer({ mongoUri: '', dataPath, logger: { error() {} } })
  await restarted.ready
  restarted.server.listen(0, '127.0.0.1')
  await once(restarted.server, 'listening')
  const restartedOrigin = `http://127.0.0.1:${restarted.server.address().port}`
  assert.equal((await post(restartedOrigin, '/login', { nick: 'admin', password: ADMIN_PASSWORD })).status, 200)
  await restarted.close()
})

test('quiz server has no hard-coded fallback administrator password', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'tracecheck-no-admin-'))
  const app = createQuizLeaderboardServer({
    mongoUri: '',
    dataPath: join(directory, 'state.json'),
    adminPassword: '',
    logger: { error() {} },
  })
  await app.ready
  app.server.listen(0, '127.0.0.1')
  await once(app.server, 'listening')
  const origin = `http://127.0.0.1:${app.server.address().port}`
  t.after(async () => {
    await app.close()
    await rm(directory, { recursive: true, force: true })
  })
  assert.equal((await post(origin, '/login', { nick: 'admin', password: '1a2r3t4e00' })).status, 401)
})
