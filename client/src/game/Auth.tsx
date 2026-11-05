import { useState, type FormEvent } from 'react'
import { login, register, saveSession, type Session } from './leaderboard'
import './game.css'
import './quiz.css'

export function Auth({ onAuth }: { onAuth: (session: Session) => void }) {
  const [mode, setMode] = useState<'register' | 'login'>('register')
  const [nick, setNick] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const run = mode === 'register' ? register : login
      const session = await run(nick.trim(), password)
      saveSession(session)
      onAuth(session)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="tc-game tc-quiz">
      <p className="q-level">TraceCheck · Доступ</p>
      <h2>{mode === 'register' ? 'Регистрация' : 'Вход'}</h2>
      <p className="q-intro">
        Придумай ник и пароль — твой прогресс попадёт в общий live-рейтинг игроков.
      </p>

      <form className="q-card q-auth" onSubmit={submit}>
        <label className="q-auth-field">
          <span>Ник</span>
          <input
            value={nick}
            onChange={event => setNick(event.target.value)}
            maxLength={24}
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="2–24 символа"
          />
        </label>
        <label className="q-auth-field">
          <span>Пароль</span>
          <input
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            minLength={10}
            maxLength={128}
            placeholder="10–128 символов"
          />
        </label>

        {error && <p className="q-auth-error" role="alert">{error}</p>}

        <div className="q-auth-actions">
          <button type="submit" className="q-check" disabled={busy}>
            {busy ? '…' : mode === 'register' ? 'Зарегистрироваться' : 'Войти'}
          </button>
          <button
            type="button"
            className="q-auth-switch"
            onClick={() => {
              setMode(mode === 'register' ? 'login' : 'register')
              setError('')
            }}
          >
            {mode === 'register' ? 'У меня уже есть аккаунт' : 'Создать аккаунт'}
          </button>
        </div>
      </form>
    </section>
  )
}
