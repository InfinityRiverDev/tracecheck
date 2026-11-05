import { useCallback, useEffect, useRef, useState } from 'react'

export type Row = { nick: string; score: number; place: number }
export type Session = { token: string; nick: string; admin: boolean }

// На production HTTP и WebSocket идут через тот же HTTPS origin. Это избегает
// mixed-content и позволяет Render публиковать приложение одним web service.
const ORIGIN = typeof location !== 'undefined' ? location.origin : 'http://localhost:3000'
const HTTP = `${ORIGIN}/quiz-live-api`
const WS = `${ORIGIN.replace(/^http/, 'ws')}/quiz-live-ws`
const KEY = 'tc-session'

export function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.token === 'string' && typeof parsed.nick === 'string') {
      return { token: parsed.token, nick: parsed.nick, admin: !!parsed.admin }
    }
  } catch { /* ignore */ }
  return null
}
export function saveSession(session: Session) {
  try { sessionStorage.setItem(KEY, JSON.stringify(session)) } catch { /* ignore */ }
}
export function clearSession() {
  try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
}

async function auth(path: 'register' | 'login', nick: string, password: string): Promise<Session> {
  let res: Response
  try {
    res = await fetch(`${HTTP}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nick, password }),
    })
  } catch {
    throw new Error('Сервер рейтинга временно недоступен')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Не получилось')
  return { token: data.token, nick: data.nick, admin: !!data.admin }
}

export const register = (nick: string, password: string) => auth('register', nick, password)
export const login = (nick: string, password: string) => auth('login', nick, password)

// Подключение к live-рейтингу: отдаёт строки, флаг связи и функцию solve(q).
export function useLeaderboard(token: string | null) {
  const [rows, setRows] = useState<Row[]>([])
  const [connected, setConnected] = useState(false)
  const [adminNotice, setAdminNotice] = useState('')
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!token) return
    const activeToken = token
    let closed = false
    let retry: number | undefined

    function connect() {
      const ws = new WebSocket(`${WS}/?token=${encodeURIComponent(activeToken)}`)
      wsRef.current = ws
      ws.onopen = () => setConnected(true)
      ws.onmessage = event => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'leaderboard' && Array.isArray(msg.rows)) setRows(msg.rows)
          if (msg.type === 'admin-result') {
            if (msg.ok) {
              setAdminNotice(msg.action === 'clear' ? 'Рейтинг очищен' : `Пользователь ${msg.nick} удалён`)
            } else if (msg.reason === 'protected') {
              setAdminNotice('Администратора удалить нельзя')
            } else if (msg.reason === 'not-found') {
              setAdminNotice('Пользователь уже удалён или не найден')
            } else if (msg.reason === 'storage') {
              setAdminNotice('MongoDB временно недоступна — изменения не применены')
            } else {
              setAdminNotice('Операцию выполнить не удалось')
            }
          }
          if (msg.type === 'session-revoked') {
            clearSession()
            window.location.reload()
          }
        } catch { /* ignore */ }
      }
      ws.onclose = () => {
        setConnected(false)
        if (!closed) retry = window.setTimeout(connect, 1500)
      }
      ws.onerror = () => ws.close()
    }

    connect()
    return () => {
      closed = true
      window.clearTimeout(retry)
      wsRef.current?.close()
    }
  }, [token])

  const solve = useCallback((q: number) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'solve', q }))
  }, [])

  const clearBoard = useCallback(() => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'clear' }))
  }, [])

  const deleteUser = useCallback((nick: string) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'delete-user', nick }))
    }
  }, [])

  return { rows, connected, solve, clearBoard, deleteUser, adminNotice }
}
