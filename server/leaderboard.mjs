// Live-рейтинг TraceCheck.
// HTTP: POST /register, POST /login. WebSocket: solve, clear, delete-user.
import { createServer } from 'node:http'
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { MongoClient } from 'mongodb'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_DATA = join(HERE, 'data.json')
const ADMIN_NICK = 'admin'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const MAX_BODY = 10 * 1024
const MAX_WS_MESSAGE = 16 * 1024
const NICK = /^[\p{L}\p{N}_-]{2,24}$/u

export function hashQuizPassword(password, salt = randomBytes(16).toString('hex')) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) {
    throw new TypeError('invalid_password')
  }
  return { salt, hash: scryptSync(password, salt, 32).toString('hex') }
}

export function verifyQuizPassword(password, salt, hash) {
  if (typeof password !== 'string' || typeof salt !== 'string' || typeof hash !== 'string') return false
  try {
    const actual = scryptSync(password, salt, 32)
    const expected = Buffer.from(hash, 'hex')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

function normalizeStoredNick(value) {
  if (typeof value !== 'string') return null
  const display = value.normalize('NFKC').trim()
  if (display.length < 2 || display.length > 64 || /[\u0000-\u001f\u007f]/u.test(display)) return null
  return display
}

function normalizeNewNick(value) {
  const display = normalizeStoredNick(value)
  return display && NICK.test(display) ? display : null
}

function nickKey(value) {
  return value.normalize('NFKC').toLocaleLowerCase('ru-RU')
}

function safeState(value) {
  const users = value?.users && typeof value.users === 'object' && !Array.isArray(value.users)
    ? value.users
    : {}
  return { users }
}

function readLocal(dataPath) {
  if (!existsSync(dataPath)) return { users: {} }
  try { return safeState(JSON.parse(readFileSync(dataPath, 'utf8'))) } catch { return { users: {} } }
}

function parseSavedState(payload) {
  if (typeof payload !== 'string') return null
  try { return safeState(JSON.parse(payload)) } catch { return null }
}

function sendJson(res, status, value) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(value))
}

async function readJson(req) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw Object.assign(new Error('body_too_large'), { status: 413 })
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {
    throw Object.assign(new Error('invalid_json'), { status: 400 })
  }
}

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

function wsFrame(socket, opcode, payload = Buffer.alloc(0)) {
  const len = payload.length
  let header
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, len])
  } else if (len < 65536) {
    header = Buffer.alloc(4)
    header[0] = 0x80 | opcode
    header[1] = 126
    header.writeUInt16BE(len, 2)
  } else {
    header = Buffer.alloc(10)
    header[0] = 0x80 | opcode
    header[1] = 127
    header.writeBigUInt64BE(BigInt(len), 2)
  }
  try { socket.write(Buffer.concat([header, payload])) } catch { /* disconnected */ }
}

function wsSend(socket, value) {
  wsFrame(socket, 0x1, Buffer.from(JSON.stringify(value)))
}

export function createQuizLeaderboardServer({
  mongoUri = process.env.MONGODB_URI,
  dataPath = process.env.QUIZ_DATA_FILE || DEFAULT_DATA,
  adminPassword = process.env.ADMIN_PW,
  logger = console,
} = {}) {
  let db = readLocal(dataPath)
  let mongoClient = null
  let stateCollection = null
  let mongoPromise = null
  let saveTimer = null
  const sessions = new Map()
  const clients = new Set()
  const authLimits = new Map()

  function findNick(value) {
    const normalized = normalizeStoredNick(value)
    if (!normalized) return null
    const key = nickKey(normalized)
    return Object.keys(db.users).find(existing => nickKey(existing) === key) ?? null
  }

  function userIsAdmin(nick) {
    return db.users[nick]?.role === 'admin'
  }

  function scoreOf(nick) {
    return Object.keys(db.users[nick]?.solved || {}).length
  }

  function leaderboard() {
    const rows = Object.keys(db.users)
      .filter(nick => !userIsAdmin(nick))
      .map(nick => ({ nick, score: scoreOf(nick) }))
    rows.sort((a, b) => b.score - a.score || a.nick.localeCompare(b.nick, 'ru'))
    return rows.map((row, index) => ({ ...row, place: index + 1 }))
  }

  function broadcast() {
    const rows = leaderboard()
    for (const client of clients) wsSend(client.socket, { type: 'leaderboard', rows })
  }

  async function connectMongo() {
    if (!mongoUri) return null
    if (!mongoPromise) {
      mongoPromise = (async () => {
        mongoClient = new MongoClient(mongoUri, { appName: 'tracecheck-quiz-live' })
        await mongoClient.connect()
        stateCollection = mongoClient.db().collection('quizLeaderboardState')
        await stateCollection.createIndex({ key: 1 }, { unique: true })
        return stateCollection
      })().catch(async error => {
        stateCollection = null
        mongoPromise = null
        await mongoClient?.close().catch(() => {})
        mongoClient = null
        throw error
      })
    }
    return mongoPromise
  }

  async function persistNow() {
    const payload = JSON.stringify(db)
    if (mongoUri) {
      const collection = await connectMongo()
      await collection.updateOne(
        { key: 'main' },
        { $set: { payload, updatedAt: new Date() } },
        { upsert: true },
      )
      return
    }
    try {
      await mkdir(dirname(dataPath), { recursive: true })
      await writeFile(dataPath, payload, { encoding: 'utf8', mode: 0o600 })
    } catch (error) {
      logger.error(`Quiz local save failed: ${error.message}`)
      throw error
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      void persistNow().catch(error => logger.error(`Quiz MongoDB save failed: ${error.message}`))
    }, 150)
    saveTimer.unref?.()
  }

  const ready = (async () => {
    if (mongoUri) {
      const collection = await connectMongo()
      const saved = await collection.findOne({ key: 'main' }, { projection: { _id: 0, payload: 1 } })
      const parsed = parseSavedState(saved?.payload)
      if (parsed) db = parsed
    }
    const existingAdmin = findNick(ADMIN_NICK)
    if (!existingAdmin && adminPassword) {
      try {
        db.users[ADMIN_NICK] = { ...hashQuizPassword(adminPassword), solved: {}, role: 'admin' }
        await persistNow()
      } catch {
        logger.error('ADMIN_PW must contain 10–128 characters; admin bootstrap skipped')
      }
    }
  })()

  function newToken(nick) {
    const token = randomBytes(32).toString('base64url')
    sessions.set(token, { nick, expiresAt: Date.now() + SESSION_TTL_MS })
    return token
  }

  function sessionNick(token) {
    const session = token ? sessions.get(token) : null
    if (!session) return null
    if (session.expiresAt <= Date.now() || !db.users[session.nick]) {
      sessions.delete(token)
      return null
    }
    return session.nick
  }

  function rateLimited(req, nick) {
    const key = `${req.socket.remoteAddress ?? 'unknown'}:${nickKey(nick)}`
    const now = Date.now()
    const recent = (authLimits.get(key) ?? []).filter(time => now - time < 15 * 60 * 1000)
    recent.push(now)
    authLimits.set(key, recent)
    return recent.length > 12
  }

  function revokeUser(nick) {
    for (const [token, session] of sessions) {
      if (session.nick === nick) sessions.delete(token)
    }
    for (const client of clients) {
      if (client.nick !== nick) continue
      wsSend(client.socket, { type: 'session-revoked' })
      try { client.socket.end() } catch { /* disconnected */ }
      clients.delete(client)
    }
  }

  async function clearScores(socket) {
    const previous = new Map()
    for (const [userNick, user] of Object.entries(db.users)) {
      if (userIsAdmin(userNick)) continue
      previous.set(userNick, user.solved)
      user.solved = {}
    }
    clearTimeout(saveTimer)
    try {
      await persistNow()
      broadcast()
      wsSend(socket, { type: 'admin-result', action: 'clear', ok: true })
    } catch {
      for (const [userNick, solved] of previous) {
        if (db.users[userNick]) db.users[userNick].solved = solved
      }
      wsSend(socket, { type: 'admin-result', action: 'clear', ok: false, reason: 'storage' })
    }
  }

  async function deleteUser(socket, requestedNick) {
    const target = findNick(requestedNick)
    if (!target || userIsAdmin(target)) {
      wsSend(socket, {
        type: 'admin-result',
        action: 'delete-user',
        ok: false,
        reason: target ? 'protected' : 'not-found',
      })
      return
    }
    const previous = db.users[target]
    delete db.users[target]
    clearTimeout(saveTimer)
    try {
      await persistNow()
      revokeUser(target)
      broadcast()
      wsSend(socket, { type: 'admin-result', action: 'delete-user', ok: true, nick: target })
    } catch {
      db.users[target] = previous
      wsSend(socket, { type: 'admin-result', action: 'delete-user', ok: false, reason: 'storage' })
    }
  }

  const server = createServer(async (req, res) => {
    try {
      await ready
      const url = new URL(req.url ?? '/', 'http://tracecheck.local')
      if (req.method === 'POST' && (url.pathname === '/register' || url.pathname === '/login')) {
        if (req.headers['content-type']?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
          return sendJson(res, 415, { error: 'Нужен JSON-запрос' })
        }
        const data = await readJson(req)
        const requestedNick = normalizeStoredNick(data?.nick)
        const password = typeof data?.password === 'string' ? data.password : ''
        if (!requestedNick) return sendJson(res, 400, { error: 'Ник: 2–24 буквы, цифры, дефис или _' })
        if (rateLimited(req, requestedNick)) return sendJson(res, 429, { error: 'Слишком много попыток. Попробуйте позже' })
        const existingNick = findNick(requestedNick)
        if (url.pathname === '/register') {
          if (!normalizeNewNick(requestedNick)) {
            return sendJson(res, 400, { error: 'Ник: 2–24 буквы, цифры, дефис или _' })
          }
          if (password.length < 10 || password.length > 128) {
            return sendJson(res, 400, { error: 'Пароль: 10–128 символов' })
          }
          if (nickKey(requestedNick) === ADMIN_NICK) return sendJson(res, 409, { error: 'Этот ник зарезервирован' })
          if (existingNick) return sendJson(res, 409, { error: 'Такой ник уже занят' })
          db.users[requestedNick] = { ...hashQuizPassword(password), solved: {}, role: 'user' }
          scheduleSave()
          broadcast()
          return sendJson(res, 201, {
            token: newToken(requestedNick), nick: requestedNick, score: 0, admin: false,
          })
        }

        const nick = existingNick
        const user = nick ? db.users[nick] : null
        if (!password || password.length > 128 || !user || !verifyQuizPassword(password, user.salt, user.hash)) {
          return sendJson(res, 401, { error: 'Неверный ник или пароль' })
        }
        return sendJson(res, 200, {
          token: newToken(nick), nick, score: scoreOf(nick), admin: userIsAdmin(nick),
        })
      }
      sendJson(res, 404, { error: 'Не найдено' })
    } catch (error) {
      sendJson(res, error?.status ?? 500, {
        error: error?.status === 413 ? 'Слишком большой запрос' :
          error?.status === 400 ? 'Некорректный запрос' : 'Внутренняя ошибка',
      })
    }
  })

  server.on('upgrade', async (req, socket) => {
    await ready
    let url
    try { url = new URL(req.url ?? '/', 'http://tracecheck.local') } catch { socket.destroy(); return }
    const key = req.headers['sec-websocket-key']
    const token = url.searchParams.get('token')
    const nick = sessionNick(token)
    if (!key || !nick || req.headers.upgrade?.toLowerCase() !== 'websocket') {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    const accept = createHash('sha1').update(key + WS_GUID).digest('base64')
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    )

    const client = { socket, nick }
    clients.add(client)
    wsSend(socket, { type: 'leaderboard', rows: leaderboard() })
    let buffer = Buffer.alloc(0)
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk])
      if (buffer.length > MAX_WS_MESSAGE + 14) { socket.destroy(); return }
      while (buffer.length >= 2) {
        const opcode = buffer[0] & 0x0f
        const masked = (buffer[1] & 0x80) !== 0
        let length = buffer[1] & 0x7f
        let offset = 2
        if (length === 126) { if (buffer.length < 4) return; length = buffer.readUInt16BE(2); offset = 4 }
        else if (length === 127) {
          if (buffer.length < 10) return
          const longLength = buffer.readBigUInt64BE(2)
          if (longLength > BigInt(MAX_WS_MESSAGE)) { socket.destroy(); return }
          length = Number(longLength)
          offset = 10
        }
        if (!masked || length > MAX_WS_MESSAGE) { socket.destroy(); return }
        const needed = offset + 4 + length
        if (buffer.length < needed) return
        const mask = buffer.subarray(offset, offset + 4)
        const payload = Buffer.alloc(length)
        for (let index = 0; index < length; index++) payload[index] = buffer[offset + 4 + index] ^ mask[index % 4]
        buffer = buffer.subarray(needed)

        if (opcode === 0x8) { clients.delete(client); socket.end(); return }
        if (opcode === 0x9) { wsFrame(socket, 0xA, payload); continue }
        if (opcode !== 0x1) continue
        let message
        try { message = JSON.parse(payload.toString('utf8')) } catch { continue }
        if (message.type === 'solve' && Number.isInteger(message.q) && message.q >= 1 && message.q <= 100) {
          const user = db.users[nick]
          if (!user || userIsAdmin(nick)) continue
          if (!user.solved || typeof user.solved !== 'object') user.solved = {}
          if (!user.solved[message.q]) {
            user.solved[message.q] = true
            scheduleSave()
            broadcast()
          }
          continue
        }
        if (!userIsAdmin(nick)) continue
        if (message.type === 'clear') {
          void clearScores(socket)
        }
        if (message.type === 'delete-user') {
          void deleteUser(socket, message.nick)
        }
      }
    })
    socket.on('close', () => clients.delete(client))
    socket.on('error', () => clients.delete(client))
  })

  return {
    server,
    ready,
    leaderboard,
    async close() {
      clearTimeout(saveTimer)
      await ready
      await persistNow()
      for (const client of clients) client.socket.destroy()
      clients.clear()
      await new Promise(resolveClose => server.listening ? server.close(resolveClose) : resolveClose())
      await mongoClient?.close()
    },
  }
}

export async function startQuizLeaderboardServer({ port = Number(process.env.PORT) || 8787, ...options } = {}) {
  const app = createQuizLeaderboardServer(options)
  await app.ready
  await new Promise((resolveListen, reject) => {
    app.server.once('error', reject)
    app.server.listen(port, '127.0.0.1', resolveListen)
  })
  const actualPort = app.server.address().port
  console.log(`TraceCheck leaderboard on :${actualPort}`)
  return app
}

const entry = process.argv[1] ? resolve(process.argv[1]) : ''
if (entry && entry === resolve(fileURLToPath(import.meta.url))) {
  await startQuizLeaderboardServer()
}
