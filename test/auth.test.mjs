import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import {
  SECURE_AUTH_COOKIE,
  hashPassword,
  hashSessionToken,
  isValidPassword,
  normalizeNickname,
  verifyPassword,
} from '../auth.mjs'
import { createTraceCheckServer } from '../server.mjs'

function authStore() {
  const users = new Map()
  const sessions = new Map()
  let nextId = 1
  return {
    users,
    sessions,
    async createUser(input) {
      if (users.has(input.nicknameKey)) throw Object.assign(new Error('duplicate'), { code: 11000 })
      const user = { _id: String(nextId++), ...input, createdAt: new Date('2026-11-03T00:00:00Z') }
      users.set(input.nicknameKey, user)
      return user
    },
    async findUserByNickname(key) { return users.get(key) ?? null },
    async createAuthSession({ userId, tokenHash }) { sessions.set(tokenHash, userId) },
    async findUserBySession(tokenHash) {
      const userId = sessions.get(tokenHash)
      return [...users.values()].find(user => user._id === userId) ?? null
    },
    async deleteAuthSession(tokenHash) { sessions.delete(tokenHash) },
  }
}

async function fixture(t, store = authStore()) {
  const server = createTraceCheckServer({ store, secureCookies: true })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
    server.closeAllConnections()
  }))
  const origin = `http://127.0.0.1:${server.address().port}`
  return { store, request: (path, options) => fetch(origin + path, options) }
}

function post(body, cookie) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  }
}

test('nickname normalization and password hashing reject unsafe input', async () => {
  assert.deepEqual(normalizeNickname('  Исследователь_7  '), {
    display: 'Исследователь_7', key: 'исследователь_7',
  })
  assert.equal(normalizeNickname('a b'), null)
  assert.equal(normalizeNickname('../admin'), null)
  assert.equal(isValidPassword('short'), false)
  assert.equal(isValidPassword('достаточно-длинный'), true)
  const encoded = await hashPassword('correct horse battery staple')
  assert.match(encoded, /^scrypt\$/)
  assert.equal(encoded.includes('correct horse'), false)
  assert.equal(await verifyPassword('correct horse battery staple', encoded), true)
  assert.equal(await verifyPassword('wrong password', encoded), false)
})

test('register, me, logout and login use an opaque HttpOnly session', async t => {
  const { store, request } = await fixture(t)
  const registration = await request('/api/auth/register', post({
    nickname: 'Trace_Player',
    password: 'strong-password-42',
    passwordConfirmation: 'strong-password-42',
  }))
  assert.equal(registration.status, 201)
  assert.deepEqual(await registration.json(), {
    user: { id: '1', nickname: 'Trace_Player', createdAt: '2026-11-03T00:00:00.000Z' },
  })
  const setCookie = registration.headers.get('set-cookie')
  assert.match(setCookie, new RegExp(`^${SECURE_AUTH_COOKIE}=[A-Za-z0-9_-]{43};`))
  assert.match(setCookie, /HttpOnly/)
  assert.match(setCookie, /SameSite=Lax/)
  assert.match(setCookie, /Secure/)
  assert.equal(setCookie.includes('strong-password-42'), false)
  const cookie = setCookie.split(';', 1)[0]
  const token = cookie.slice(cookie.indexOf('=') + 1)
  assert.equal(store.sessions.has(token), false, 'only a digest is stored')
  assert.equal(store.sessions.has(hashSessionToken(token)), true)

  const me = await request('/api/auth/me', { headers: { cookie } })
  assert.equal(me.status, 200)
  assert.equal((await me.json()).user.nickname, 'Trace_Player')

  const logout = await request('/api/auth/logout', post({}, cookie))
  assert.equal(logout.status, 204)
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/)
  assert.equal((await request('/api/auth/me', { headers: { cookie } })).status, 401)

  const login = await request('/api/auth/login', post({ nickname: 'trace_player', password: 'strong-password-42' }))
  assert.equal(login.status, 200)
  assert.equal((await login.json()).user.nickname, 'Trace_Player')
})

test('registration validates confirmation and does not reveal which credential failed', async t => {
  const { request } = await fixture(t)
  const mismatch = await request('/api/auth/register', post({
    nickname: 'new_player', password: 'strong-password-42', passwordConfirmation: 'different-password',
  }))
  assert.equal(mismatch.status, 400)
  assert.deepEqual(await mismatch.json(), { error: 'password_confirmation_mismatch' })

  const unknown = await request('/api/auth/login', post({ nickname: 'missing_player', password: 'strong-password-42' }))
  assert.equal(unknown.status, 401)
  assert.deepEqual(await unknown.json(), { error: 'invalid_credentials' })
  const malformed = await request('/api/auth/login', post({ nickname: '../bad', password: 'strong-password-42' }))
  assert.equal(malformed.status, 401)
  assert.deepEqual(await malformed.json(), { error: 'invalid_credentials' })
})

test('duplicate normalized nickname returns conflict', async t => {
  const { request } = await fixture(t)
  const body = { nickname: 'Player_One', password: 'strong-password-42', passwordConfirmation: 'strong-password-42' }
  assert.equal((await request('/api/auth/register', post(body))).status, 201)
  const duplicate = await request('/api/auth/register', post({ ...body, nickname: 'player_one' }))
  assert.equal(duplicate.status, 409)
  assert.deepEqual(await duplicate.json(), { error: 'nickname_taken' })
})

test('auth mutations require same-origin JSON and are rate limited', async t => {
  const { request } = await fixture(t)
  const crossSite = await request('/api/auth/register', {
    ...post({ nickname: 'safe_player', password: 'strong-password-42', passwordConfirmation: 'strong-password-42' }),
    headers: { 'content-type': 'application/json', origin: 'https://attacker.example' },
  })
  assert.equal(crossSite.status, 403)
  assert.deepEqual(await crossSite.json(), { error: 'untrusted_origin' })

  const wrongType = await request('/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}',
  })
  assert.equal(wrongType.status, 415)
  assert.deepEqual(await wrongType.json(), { error: 'json_required' })

  let response
  for (let index = 0; index < 11; index++) {
    response = await request('/api/auth/register', post({
      nickname: 'limited_player', password: 'short', passwordConfirmation: 'short',
    }))
  }
  assert.equal(response.status, 429)
  assert.equal(response.headers.get('retry-after'), '900')
})

test('auth routes fail closed without a configured database', async t => {
  const { request } = await fixture(t, null)
  assert.equal((await request('/api/auth/register', post({}))).status, 503)
  assert.equal((await request('/api/auth/login', post({}))).status, 503)
  assert.equal((await request('/api/auth/me')).status, 503)
  assert.equal((await request('/api/auth/logout', post({}))).status, 503)
})
