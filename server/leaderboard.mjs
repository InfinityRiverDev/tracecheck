// Live-рейтинг TraceCheck — автономный сервер на встроенных модулях Node (без зависимостей).
// HTTP: POST /register, POST /login (ник + пароль).
// WebSocket: подключение с ?token=..., сообщения {type:'solve', q:<n>}, рассылка {type:'leaderboard', rows:[...]}.
import { createServer } from 'node:http'
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const DATA = join(HERE, 'data.json')
const PORT = Number(process.env.PORT) || 8787
const ADMIN_NICK = 'админ'
const ADMIN_PW = process.env.ADMIN_PW || '1a2r3t4e'

// ---------- хранилище ----------
let db = { users: {} } // nick -> { salt, hash, solved: { [q]: true } }
if (existsSync(DATA)) {
  try { db = JSON.parse(readFileSync(DATA, 'utf8')) } catch { db = { users: {} } }
}
let saveTimer = null
function save() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try { writeFileSync(DATA, JSON.stringify(db)) } catch { /* ignore */ }
  }, 200)
}

function hashPw(password, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(password, salt, 32).toString('hex') }
}
function verifyPw(password, salt, hash) {
  const a = scryptSync(password, salt, 32)
  const b = Buffer.from(hash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

const sessions = new Map() // token -> nick
function newToken(nick) {
  const t = randomBytes(24).toString('hex')
  sessions.set(t, nick)
  return t
}

function scoreOf(nick) {
  return Object.keys(db.users[nick]?.solved || {}).length
}
function leaderboard() {
  const rows = Object.keys(db.users).map(nick => ({ nick, score: scoreOf(nick) }))
  rows.sort((a, b) => b.score - a.score || a.nick.localeCompare(b.nick))
  return rows.map((r, i) => ({ nick: r.nick, score: r.score, place: i + 1 }))
}

// ---------- WebSocket (ручные фреймы) ----------
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
const clients = new Set() // { socket, nick }

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
  try { socket.write(Buffer.concat([header, payload])) } catch { /* ignore */ }
}
function wsSend(socket, obj) {
  wsFrame(socket, 0x1, Buffer.from(JSON.stringify(obj)))
}
function broadcast() {
  const rows = leaderboard()
  for (const c of clients) wsSend(c.socket, { type: 'leaderboard', rows })
}

// ---------- HTTP (регистрация / вход) ----------
function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
}

const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  if (req.method === 'POST' && (req.url === '/register' || req.url === '/login')) {
    let body = ''
    req.on('data', chunk => {
      body += chunk
      if (body.length > 10000) req.destroy()
    })
    req.on('end', () => {
      let data
      try { data = JSON.parse(body) } catch { return sendJson(res, 400, { error: 'Некорректный запрос' }) }
      const nick = String(data.nick || '').trim()
      const password = String(data.password || '')
      if (nick.length < 2 || nick.length > 24) return sendJson(res, 400, { error: 'Ник: 2–24 символа' })
      if (password.length < 3) return sendJson(res, 400, { error: 'Пароль: минимум 3 символа' })

      if (req.url === '/register') {
        if (nick === ADMIN_NICK) return sendJson(res, 409, { error: 'Этот ник зарезервирован' })
        if (db.users[nick]) return sendJson(res, 409, { error: 'Такой ник уже занят' })
        db.users[nick] = { ...hashPw(password), solved: {} }
        save()
        broadcast()
        return sendJson(res, 200, { token: newToken(nick), nick, score: 0, admin: false })
      }
      // login
      if (nick === ADMIN_NICK) {
        if (password !== ADMIN_PW) return sendJson(res, 401, { error: 'Неверный ник или пароль' })
        return sendJson(res, 200, { token: newToken(nick), nick, score: 0, admin: true })
      }
      const user = db.users[nick]
      if (!user || !verifyPw(password, user.salt, user.hash)) {
        return sendJson(res, 401, { error: 'Неверный ник или пароль' })
      }
      return sendJson(res, 200, { token: newToken(nick), nick, score: scoreOf(nick), admin: false })
    })
    return
  }

  sendJson(res, 404, { error: 'Не найдено' })
})

// ---------- upgrade → WebSocket ----------
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key']
  const token = new URL(req.url, 'http://local').searchParams.get('token')
  const nick = token ? sessions.get(token) : undefined
  if (!key || !nick) {
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

  let buf = Buffer.alloc(0)
  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk])
    while (buf.length >= 2) {
      const opcode = buf[0] & 0x0f
      const masked = (buf[1] & 0x80) !== 0
      let len = buf[1] & 0x7f
      let offset = 2
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); offset = 4 }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); offset = 10 }
      const need = offset + (masked ? 4 : 0) + len
      if (buf.length < need) return
      let payload = Buffer.alloc(len)
      if (masked) {
        const mask = buf.subarray(offset, offset + 4)
        for (let i = 0; i < len; i++) payload[i] = buf[offset + 4 + i] ^ mask[i % 4]
      } else {
        payload = buf.subarray(offset, offset + len)
      }
      buf = buf.subarray(need)

      if (opcode === 0x8) { clients.delete(client); try { socket.end() } catch { /* */ } return }
      if (opcode === 0x9) { wsFrame(socket, 0xA, payload); continue } // ping → pong
      if (opcode !== 0x1) continue
      let msg
      try { msg = JSON.parse(payload.toString('utf8')) } catch { continue }
      if (msg.type === 'solve' && Number.isInteger(msg.q)) {
        const user = db.users[nick]
        if (!user) continue
        if (!user.solved) user.solved = {}
        if (!user.solved[msg.q]) {
          user.solved[msg.q] = true
          save()
          broadcast()
        }
      }
      if (msg.type === 'clear' && nick === ADMIN_NICK) {
        db.users = {}
        save()
        broadcast()
      }
    }
  })
  socket.on('close', () => clients.delete(client))
  socket.on('error', () => clients.delete(client))
})

server.listen(PORT, () => console.log(`TraceCheck leaderboard on :${PORT}`))
