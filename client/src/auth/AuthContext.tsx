import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type AuthUser = {
  id: string
  nickname: string
  role: 'user' | 'admin'
  createdAt: string
}

export type UserProgress = {
  exp: number
  completedLevels: string[]
  achievements: string[]
  dossierFragments: string[]
}

type AuthResult = { ok: true } | { ok: false; error: string }

type AuthContextValue = {
  user: AuthUser | null
  progress: UserProgress | null
  loading: boolean
  register: (nickname: string, password: string, passwordConfirmation: string) => Promise<AuthResult>
  login: (nickname: string, password: string) => Promise<AuthResult>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const emptyProgress: UserProgress = {
  exp: 0,
  completedLevels: [],
  achievements: [],
  dossierFragments: [],
}

async function api(path: string, options?: RequestInit) {
  return fetch(path, { credentials: 'same-origin', ...options })
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [progress, setProgress] = useState<UserProgress | null>(null)
  const [loading, setLoading] = useState(true)

  async function refresh() {
    try {
      const response = await api('/api/auth/me')
      if (!response.ok) {
        setUser(null)
        setProgress(null)
        return
      }
      const data = await response.json()
      setUser(data.user)
      setProgress(data.progress ?? emptyProgress)
    } catch {
      setUser(null)
      setProgress(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  async function authenticate(path: string, body: Record<string, string>): Promise<AuthResult> {
    try {
      const response = await api(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json()
      if (!response.ok) return { ok: false, error: data.error ?? 'request_failed' }
      setUser(data.user)
      setProgress(data.progress ?? emptyProgress)
      return { ok: true }
    } catch {
      return { ok: false, error: 'network_error' }
    }
  }

  const value = useMemo<AuthContextValue>(() => ({
    user,
    progress,
    loading,
    register: (nickname, password, passwordConfirmation) => authenticate('/api/auth/register', {
      nickname, password, passwordConfirmation,
    }),
    login: (nickname, password) => authenticate('/api/auth/login', { nickname, password }),
    logout: async () => {
      try { await api('/api/auth/logout', { method: 'POST' }) } finally {
        setUser(null)
        setProgress(null)
      }
    },
    refresh,
  }), [user, progress, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
