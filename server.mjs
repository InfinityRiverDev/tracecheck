import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MongoClient } from 'mongodb'

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
  let collectionPromise

  async function collection() {
    if (!collectionPromise) {
      collectionPromise = (async () => {
        await client.connect()
        const sessions = client.db().collection('sessions')
        await Promise.all([
          sessions.createIndex({ sessionId: 1 }, { unique: true }),
          sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        ])
        return sessions
      })()
    }
    return collectionPromise
  }

  return {
    async ping() {
      await client.db().command({ ping: 1 })
    },
    async get(sessionId) {
      return (await collection()).findOne({ sessionId }, { projection: { _id: 0, state: 1, updatedAt: 1 } })
    },
    async save(sessionId, state) {
      const now = new Date()
      await (await collection()).updateOne(
        { sessionId },
        {
          $set: { state, updatedAt: now, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true },
      )
      return { state, updatedAt: now }
    },
    close: () => client.close(),
  }
}

function sendJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
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

export function createTraceCheckServer({ store = createMongoStore(process.env.MONGODB_URI) } = {}) {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://tracecheck.local')
    try {
      if (url.pathname === '/api/health') {
        if (!store) return sendJson(res, 503, { ok: false, database: 'not_configured' })
        await store.ping()
        return sendJson(res, 200, { ok: true, database: 'connected' })
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
          return sendJson(res, 200, await store.save(sessionId, normalizeState(body.state)))
        }
        return sendJson(res, 405, { error: 'method_not_allowed' })
      }

      if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'not_found' })
      const relative = url.pathname === '/' ? './index.html' : `.${decodeURIComponent(url.pathname)}`
      const file = resolve(distDir, relative)
      if (!file.startsWith(resolve(distDir))) return sendJson(res, 400, { error: 'invalid_path' })
      const info = await stat(file)
      if (!info.isFile()) throw Object.assign(new Error('not_found'), { code: 'ENOENT' })
      const body = await readFile(file)
      res.writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream' })
      res.end(body)
    } catch (error) {
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
