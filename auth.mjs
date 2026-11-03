import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const NICKNAME = /^[\p{L}\p{N}_-]{3,24}$/u
const PASSWORD_MIN = 10
const PASSWORD_MAX = 128
const SCRYPT_N = 32768
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LENGTH = 32

export const AUTH_COOKIE = 'tracecheck_session'
export const SECURE_AUTH_COOKIE = '__Host-tracecheck_session'
export const AUTH_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export function normalizeNickname(value) {
  if (typeof value !== 'string') return null
  const display = value.normalize('NFKC').trim()
  if (!NICKNAME.test(display)) return null
  return { display, key: display.toLocaleLowerCase('ru-RU') }
}

export function isValidPassword(value) {
  return typeof value === 'string' && value.length >= PASSWORD_MIN && value.length <= PASSWORD_MAX &&
    Buffer.byteLength(value, 'utf8') <= 512
}

export async function hashPassword(password) {
  if (!isValidPassword(password)) throw new TypeError('invalid_password')
  const salt = randomBytes(16)
  const key = await scrypt(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  })
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64url')}$${key.toString('base64url')}`
}

export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || typeof encoded !== 'string') return false
  const [algorithm, n, r, p, saltText, keyText, extra] = encoded.split('$')
  if (algorithm !== 'scrypt' || extra !== undefined) return false
  const N = Number(n)
  const R = Number(r)
  const P = Number(p)
  if (N !== SCRYPT_N || R !== SCRYPT_R || P !== SCRYPT_P) return false
  try {
    const salt = Buffer.from(saltText, 'base64url')
    const expected = Buffer.from(keyText, 'base64url')
    if (salt.length !== 16 || expected.length !== KEY_LENGTH) return false
    const actual = await scrypt(password, salt, expected.length, {
      N,
      r: R,
      p: P,
      maxmem: 64 * 1024 * 1024,
    })
    return timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

export function createSessionToken() {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  return createHash('sha256').update(token).digest('base64url')
}

export function readSessionToken(cookieHeader) {
  if (typeof cookieHeader !== 'string') return null
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0) continue
    const name = part.slice(0, separator).trim()
    if (name === AUTH_COOKIE || name === SECURE_AUTH_COOKIE) {
      const token = part.slice(separator + 1).trim()
      return hashSessionToken(token) ? token : null
    }
  }
  return null
}

export function sessionCookie(token, { secure = false } = {}) {
  const securePart = secure ? '; Secure' : ''
  const name = secure ? SECURE_AUTH_COOKIE : AUTH_COOKIE
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(AUTH_SESSION_TTL_MS / 1000)}${securePart}`
}

export function clearSessionCookie({ secure = false } = {}) {
  const securePart = secure ? '; Secure' : ''
  const name = secure ? SECURE_AUTH_COOKIE : AUTH_COOKIE
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${securePart}`
}

export function publicUser(user) {
  return {
    id: String(user._id ?? user.id),
    nickname: user.nickname,
    createdAt: user.createdAt,
  }
}
