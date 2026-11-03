import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve, relative, isAbsolute, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MongoClient } from 'mongodb'
import {
  AUTH_SESSION_TTL_MS,
  clearSessionCookie,
  createSessionToken,
  hashPassword,
  hashSessionToken,
  isValidPassword,
  normalizeNickname,
  publicUser,
  readSessionToken,
  sessionCookie,
  verifyPassword,
} from './auth.mjs'

const SESSION_ID = /^[a-zA-Z0-9_-]{20,80}$/
const VALUE_ID = /^[a-zA-Z0-9_-]{1,80}$/
const MAX_BODY = 32 * 1024
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const distDir = fileURLToPath(new URL('./dist/', import.meta.url))

export function isValidSessionId(value) {
  return typeof value === 'string' && SESSION_ID.test(value)
}

function stringIds(value, max = 64) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter(item => typeof item === 'string' && VALUE_ID.test(item)))].slice(0, max)
}

export function normalizeState(value) {
  const state = value && typeof value === 'object' ? value : {}
  const answers = {}
  if (state.answers && typeof state.answers === 'object' && !Array.isArray(state.answers)) {
    for (const [questionId, optionId] of Object.entries(state.answers).slice(0, 32)) {
      if (VALUE_ID.test(questionId) && typeof optionId === 'string' && VALUE_ID.test(optionId)) answers[questionId] = optionId
    }
  }
  return {
    version: 1,
    selected: stringIds(state.selected),
    edits: stringIds(state.edits),
    answer: typeof state.answer === 'string' && VALUE_ID.test(state.answer) ? state.answer : null,
    answers,
    updatedAt: Number.isSafeInteger(state.updatedAt) && state.updatedAt > 0 ? state.updatedAt : Date.now(),
  }
}

export function createMongoStore(uri) {
  if (!uri) return null
  const client = new MongoClient(uri, { appName: 'tracecheck' })
  let collectionsPromise

  async function collections() {
    if (!collectionsPromise) {
      collectionsPromise = (async () => {
        await client.connect()
        const database = client.db()
        const sessions = database.collection('sessions')
        const users = database.collection('users')
        const authSessions = database.collection('authSessions')
        const progress = database.collection('progress')
        const attempts = database.collection('attempts')
        const levels = database.collection('levels')
        const feedback = database.collection('feedback')
        await Promise.all([
          sessions.createIndex({ sessionId: 1 }, { unique: true }),
          sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
          users.createIndex({ nicknameKey: 1 }, { unique: true }),
          authSessions.createIndex({ tokenHash: 1 }, { unique: true }),
          authSessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
          authSessions.createIndex({ userId: 1, expiresAt: 1 }),
          progress.createIndex({ userId: 1 }, { unique: true }),
          attempts.createIndex({ userId: 1, levelId: 1, createdAt: -1 }),
          levels.createIndex({ levelId: 1, version: 1 }, { unique: true }),
          feedback.createIndex({ status: 1, createdAt: 1 }),
        ])
        return { sessions, users, authSessions, progress, attempts, levels, feedback }
      })().catch(error => {
        collectionsPromise = undefined
        throw error
      })
    }
    return collectionsPromise
  }

  return {
    async ping() {
      await client.db().command({ ping: 1 })
    },
    async get(sessionId) {
      return (await collections()).sessions.findOne({ sessionId }, { projection: { _id: 0, state: 1, updatedAt: 1 } })
    },
    async save(sessionId, state) {
      const now = new Date()
      await (await collections()).sessions.updateOne(
        { sessionId },
        {
          $set: { state, updatedAt: now, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true },
      )
      return { state, updatedAt: now }
    },
    async createUser({ nickname, nicknameKey, passwordHash }) {
      const now = new Date()
      const { users, progress } = await collections()
      const result = await users.insertOne({
        nickname,
        nicknameKey,
        passwordHash,
        providers: { password: true },
        avatarKey: 'detective-violet',
        settings: {},
        createdAt: now,
        updatedAt: now,
      })
      try {
        await progress.insertOne({
          userId: result.insertedId,
          exp: 0,
          expReachedAt: now,
          completedLevels: [],
          achievements: [],
          dossierFragments: [],
          habits: null,
          createdAt: now,
          updatedAt: now,
        })
      } catch (error) {
        await users.deleteOne({ _id: result.insertedId })
        throw error
      }
      return { _id: result.insertedId, nickname, createdAt: now }
    },
    async findUserByNickname(nicknameKey) {
      return (await collections()).users.findOne({ nicknameKey })
    },
    async createAuthSession({ userId, tokenHash }) {
      const now = new Date()
      await (await collections()).authSessions.insertOne({
        userId,
        tokenHash,
        createdAt: now,
        expiresAt: new Date(now.getTime() + AUTH_SESSION_TTL_MS),
      })
    },
    async findUserBySession(tokenHash) {
      const { authSessions, users } = await collections()
      const authSession = await authSessions.findOne({ tokenHash, expiresAt: { $gt: new Date() } })
      return authSession ? users.findOne({ _id: authSession.userId }) : null
    },
    async deleteAuthSession(tokenHash) {
      await (await collections()).authSessions.deleteOne({ tokenHash })
    },
    async getProgress(userId) {
      return (await collections()).progress.findOne({ userId })
    },
    async createAttempt(attempt) {
      const now = new Date()
      const result = await (await collections()).attempts.insertOne({ ...attempt, createdAt: now, updatedAt: now })
      return { id: String(result.insertedId), createdAt: now }
    },
    async leaderboard(limit = 20) {
      const safeLimit = Math.max(1, Math.min(100, Number.isSafeInteger(limit) ? limit : 20))
      const { progress } = await collections()
      const rows = await progress.aggregate([
        { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
        { $unwind: '$user' },
        {
          $project: {
            _id: 0,
            nickname: '$user.nickname',
            exp: { $ifNull: ['$exp', 0] },
            completedLevels: {
              $size: { $cond: [{ $isArray: '$completedLevels' }, '$completedLevels', []] },
            },
            expReachedAt: { $ifNull: ['$expReachedAt', { $ifNull: ['$updatedAt', '$createdAt'] }] },
          },
        },
        { $sort: { exp: -1, expReachedAt: 1, nickname: 1 } },
        { $limit: safeLimit },
      ]).toArray()
      return rows
    },
    close: () => client.close(),
  }
}

export function safeLeaderboardEntries(rows) {
  if (!Array.isArray(rows)) return []
  return rows.slice(0, 100).map((row, index) => ({
    rank: index + 1,
    nickname: typeof row?.nickname === 'string' && row.nickname.trim()
      ? row.nickname.trim().slice(0, 40)
      : 'Следопыт',
    exp: Number.isFinite(row?.exp) ? Math.max(0, Math.floor(row.exp)) : 0,
    completedLevels: Number.isFinite(row?.completedLevels)
      ? Math.max(0, Math.min(10, Math.floor(row.completedLevels)))
      : Array.isArray(row?.completedLevels) ? Math.min(10, row.completedLevels.length) : 0,
  }))
}

function sendJson(res, status, value, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers })
  res.end(status === 204 ? undefined : JSON.stringify(value))
}

function acceptsJson(req) {
  return req.headers['content-type']?.split(';', 1)[0].trim().toLowerCase() === 'application/json'
}

function trustedMutationOrigin(req, { publicOrigin, secureCookies }) {
  const origin = req.headers.origin
  if (!origin) return true
  const expected = publicOrigin || `${secureCookies ? 'https' : 'http'}://${req.headers.host}`
  return origin === expected
}

async function readJson(req) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw Object.assign(new Error('body_too_large'), { status: 413 })
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw Object.assign(new Error('invalid_json'), { status: 400 })
  }
}

const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
}

export function createTraceCheckServer({
  store = createMongoStore(process.env.MONGODB_URI),
  secureCookies = process.env.NODE_ENV === 'production',
  publicOrigin = process.env.PUBLIC_ORIGIN,
} = {}) {
  const authLimits = new Map()
  const dummyPasswordHash = hashPassword('tracecheck-dummy-password-never-used')

  function authRateLimited(req, scope, nicknameKey) {
    const now = Date.now()
    const key = `${req.socket.remoteAddress ?? 'unknown'}:${scope}:${nicknameKey ?? 'invalid'}`
    const recent = (authLimits.get(key) ?? []).filter(timestamp => now - timestamp < 15 * 60 * 1000)
    recent.push(now)
    authLimits.set(key, recent)
    return recent.length > 10
  }

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://tracecheck.local')
      if (url.pathname === '/api/health') {
        if (!store) return sendJson(res, 503, { ok: false, database: 'not_configured' })
        await store.ping()
        return sendJson(res, 200, { ok: true, database: 'connected' })
      }

      if (url.pathname === '/api/auth/register' && req.method === 'POST') {
        if (!store?.createUser || !store?.createAuthSession) {
          return sendJson(res, 503, { error: 'database_not_configured' })
        }
        if (!trustedMutationOrigin(req, { publicOrigin, secureCookies })) {
          return sendJson(res, 403, { error: 'untrusted_origin' })
        }
        if (!acceptsJson(req)) return sendJson(res, 415, { error: 'json_required' })
        const body = await readJson(req)
        const nickname = normalizeNickname(body?.nickname)
        if (!nickname) return sendJson(res, 400, { error: 'invalid_nickname' })
        if (authRateLimited(req, 'register', nickname.key)) {
          return sendJson(res, 429, { error: 'rate_limited' }, { 'retry-after': '900' })
        }
        if (!isValidPassword(body?.password)) return sendJson(res, 400, { error: 'invalid_password' })
        if (body.password !== body.passwordConfirmation) {
          return sendJson(res, 400, { error: 'password_confirmation_mismatch' })
        }
        try {
          const user = await store.createUser({
            nickname: nickname.display,
            nicknameKey: nickname.key,
            passwordHash: await hashPassword(body.password),
          })
          const token = createSessionToken()
          await store.createAuthSession({ userId: user._id ?? user.id, tokenHash: hashSessionToken(token) })
          return sendJson(res, 201, { user: publicUser(user) }, {
            'set-cookie': sessionCookie(token, { secure: secureCookies }),
          })
        } catch (error) {
          if (error?.code === 11000) return sendJson(res, 409, { error: 'nickname_taken' })
          throw error
        }
      }

      if (url.pathname === '/api/auth/login' && req.method === 'POST') {
        if (!store?.findUserByNickname || !store?.createAuthSession) {
          return sendJson(res, 503, { error: 'database_not_configured' })
        }
        if (!trustedMutationOrigin(req, { publicOrigin, secureCookies })) {
          return sendJson(res, 403, { error: 'untrusted_origin' })
        }
        if (!acceptsJson(req)) return sendJson(res, 415, { error: 'json_required' })
        const body = await readJson(req)
        const nickname = normalizeNickname(body?.nickname)
        if (!nickname || typeof body?.password !== 'string') {
          return sendJson(res, 401, { error: 'invalid_credentials' })
        }
        if (authRateLimited(req, 'login', nickname.key)) {
          return sendJson(res, 429, { error: 'rate_limited' }, { 'retry-after': '900' })
        }
        const user = await store.findUserByNickname(nickname.key)
        const passwordMatches = await verifyPassword(body.password, user?.passwordHash ?? await dummyPasswordHash)
        if (!user || !passwordMatches) {
          return sendJson(res, 401, { error: 'invalid_credentials' })
        }
        const token = createSessionToken()
        await store.createAuthSession({ userId: user._id ?? user.id, tokenHash: hashSessionToken(token) })
        return sendJson(res, 200, { user: publicUser(user) }, {
          'set-cookie': sessionCookie(token, { secure: secureCookies }),
        })
      }

      if (url.pathname === '/api/auth/me' && req.method === 'GET') {
        if (!store?.findUserBySession) return sendJson(res, 503, { error: 'database_not_configured' })
        const token = readSessionToken(req.headers.cookie)
        const user = token ? await store.findUserBySession(hashSessionToken(token)) : null
        const progress = user && store.getProgress
          ? await store.getProgress(user._id ?? user.id)
          : null
        return user
          ? sendJson(res, 200, {
              user: publicUser(user),
              progress: progress ? {
                exp: Number.isSafeInteger(progress.exp) ? progress.exp : 0,
                completedLevels: stringIds(progress.completedLevels, 10),
                achievements: stringIds(progress.achievements, 64),
                dossierFragments: stringIds(progress.dossierFragments, 64),
              } : null,
            })
          : sendJson(res, 401, { error: 'authentication_required' })
      }

      if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
        if (!store?.deleteAuthSession) return sendJson(res, 503, { error: 'database_not_configured' })
        if (!trustedMutationOrigin(req, { publicOrigin, secureCookies })) {
          return sendJson(res, 403, { error: 'untrusted_origin' })
        }
        const token = readSessionToken(req.headers.cookie)
        if (token) await store.deleteAuthSession(hashSessionToken(token))
        return sendJson(res, 204, null, {
          'set-cookie': clearSessionCookie({ secure: secureCookies }),
        })
      }

      if (url.pathname === '/api/leaderboard' && req.method === 'GET') {
        if (!store?.leaderboard) return sendJson(res, 503, { error: 'database_not_configured' })
        const entries = safeLeaderboardEntries(await store.leaderboard(20))
        return sendJson(res, 200, { entries, updatedAt: new Date().toISOString() })
      }

      if (url.pathname === '/api/leaderboard/stream' && req.method === 'GET') {
        if (!store?.leaderboard) return sendJson(res, 503, { error: 'database_not_configured' })
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-store, no-transform',
          connection: 'keep-alive',
          'x-accel-buffering': 'no',
        })
        res.flushHeaders?.()
        let closed = false
        let busy = false
        let lastEntries = ''
        const publish = async () => {
          if (closed || busy) return
          busy = true
          try {
            const entries = safeLeaderboardEntries(await store.leaderboard(20))
            const serialized = JSON.stringify(entries)
            if (serialized !== lastEntries) {
              lastEntries = serialized
              res.write(`event: leaderboard\ndata: ${JSON.stringify({ entries, updatedAt: new Date().toISOString() })}\n\n`)
            } else {
              res.write(': keepalive\n\n')
            }
          } catch {
            res.write('event: unavailable\ndata: {}\n\n')
          } finally {
            busy = false
          }
        }
        req.on('close', () => {
          closed = true
          clearInterval(timer)
        })
        const timer = setInterval(publish, 2500)
        timer.unref?.()
        await publish()
        return
      }

      const match = url.pathname.match(/^\/api\/sessions\/([^/]+)$/)
      if (match) {
        const sessionId = decodeURIComponent(match[1])
        if (!isValidSessionId(sessionId)) return sendJson(res, 400, { error: 'invalid_session_id' })
        if (!store) return sendJson(res, 503, { error: 'database_not_configured' })
        if (req.method === 'GET') {
          const document = await store.get(sessionId)
          return document ? sendJson(res, 200, document) : sendJson(res, 404, { error: 'not_found' })
        }
        if (req.method === 'PUT') {
          const body = await readJson(req)
          if (!body || typeof body !== 'object' || Array.isArray(body) ||
              !body.state || typeof body.state !== 'object' || Array.isArray(body.state)) {
            return sendJson(res, 400, { error: 'invalid_state' })
          }
          return sendJson(res, 200, await store.save(sessionId, normalizeState(body.state)))
        }
        return sendJson(res, 405, { error: 'method_not_allowed' })
      }

      if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'not_found' })
      const requestedPath = url.pathname === '/' ? './index.html' : `.${decodeURIComponent(url.pathname)}`
      const file = resolve(distDir, requestedPath)
      const fromRoot = relative(distDir, file)
      if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
        return sendJson(res, 400, { error: 'invalid_path' })
      }
      const info = await stat(file)
      if (!info.isFile()) throw Object.assign(new Error('not_found'), { code: 'ENOENT' })
      const body = await readFile(file)
      res.writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream' })
      res.end(body)
    } catch (error) {
      if (error?.code === 'ERR_INVALID_URL' || error instanceof URIError) {
        return sendJson(res, 400, { error: 'invalid_url' })
      }
      if (error?.code === 'ENOENT') return sendJson(res, 404, { error: 'not_found' })
      const status = Number.isInteger(error?.status) ? error.status : 500
      if (status === 500) console.error(error)
      sendJson(res, status, { error: status === 500 ? 'internal_error' : error.message })
    }
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000
  const server = createTraceCheckServer()
  server.listen(port, '0.0.0.0', () => console.log(`TraceCheck: http://localhost:${port}`))
}
