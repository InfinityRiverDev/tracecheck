import { useCallback, useEffect, useState } from 'react'
import { PixelIcon } from '../design/PixelIcon'

type LeaderboardEntry = {
  rank: number
  nickname: string
  exp: number
  completedLevels: number
}

type LeaderboardPayload = {
  entries: LeaderboardEntry[]
  updatedAt: string
}

const isPayload = (value: unknown): value is LeaderboardPayload => {
  if (!value || typeof value !== 'object') return false
  const payload = value as Partial<LeaderboardPayload>
  return Array.isArray(payload.entries) && typeof payload.updatedAt === 'string'
}

export function LiveLeaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [live, setLive] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  const applyPayload = useCallback((payload: unknown) => {
    if (!isPayload(payload)) return
    setEntries(payload.entries.slice(0, 5))
    setLoading(false)
    setUnavailable(false)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/leaderboard', { headers: { accept: 'application/json' } })
      if (!response.ok) throw new Error('leaderboard_unavailable')
      applyPayload(await response.json())
    } catch {
      setLoading(false)
      setUnavailable(true)
    }
  }, [applyPayload])

  useEffect(() => {
    void refresh()
    if (typeof EventSource === 'undefined') {
      const timer = window.setInterval(refresh, 10_000)
      return () => window.clearInterval(timer)
    }

    const stream = new EventSource('/api/leaderboard/stream')
    stream.addEventListener('leaderboard', event => {
      try {
        applyPayload(JSON.parse((event as MessageEvent<string>).data))
        setLive(true)
      } catch {
        setLive(false)
      }
    })
    stream.onerror = () => setLive(false)
    return () => stream.close()
  }, [applyPayload, refresh])

  return (
    <section className="home-live-ranking" aria-labelledby="home-ranking-title">
      <div className="ranking-heading">
        <div>
          <p className="eyebrow"><PixelIcon name="ranking" size={18} /> Рейтинг следопытов</p>
          <h2 id="home-ranking-title">Кто собрал больше EXP</h2>
        </div>
        <span className={`live-status ${live ? 'is-live' : ''}`} role="status">
          <span aria-hidden="true" />{live ? 'В эфире' : 'Обновляем'}
        </span>
      </div>

      {loading && <p className="ranking-note">Загружаем рейтинг…</p>}
      {!loading && unavailable && <p className="ranking-note">Рейтинг временно недоступен — попробуем снова автоматически.</p>}
      {!loading && !unavailable && entries.length === 0 && (
        <p className="ranking-note">Пока здесь пусто. Пройди первый уровень и займи первое место.</p>
      )}
      {entries.length > 0 && (
        <ol className="leaderboard-list">
          {entries.map(entry => (
            <li className="leaderboard-row" key={`${entry.rank}-${entry.nickname}`}>
              <strong className="rank-place">#{entry.rank}</strong>
              <span className="rank-name">{entry.nickname}</span>
              <span className="rank-levels"><PixelIcon name="levels" size={18} />{entry.completedLevels}/10</span>
              <span className="rank-exp"><PixelIcon name="exp" size={18} />{entry.exp} EXP</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
