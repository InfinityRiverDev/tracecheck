import { useState, type FormEvent } from 'react'
import { PixelIcon } from '../design/PixelIcon'
import { Link, navigate } from '../router'
import { useAuth } from '../auth/AuthContext'

const messages: Record<string, string> = {
  invalid_nickname: 'Ник: 3–24 символа, только буквы, цифры, _ и -.',
  invalid_password: 'Пароль должен содержать от 10 до 128 символов.',
  password_confirmation_mismatch: 'Пароли не совпадают.',
  nickname_taken: 'Этот ник уже занят.',
  invalid_credentials: 'Неверный ник или пароль.',
  rate_limited: 'Слишком много попыток. Попробуй позже.',
  database_not_configured: 'Сервис аккаунтов пока не настроен.',
  network_error: 'Не удалось связаться с сервером.',
}

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const auth = useAuth()
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const register = mode === 'register'

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    const result = register
      ? await auth.register(nickname, password, confirmation)
      : await auth.login(nickname, password)
    setSubmitting(false)
    if (result.ok) navigate('profile')
    else setError(messages[result.error] ?? 'Не удалось выполнить запрос.')
  }

  return (
    <section className="page auth-page">
      <div className="auth-card">
        <PixelIcon name={register ? 'user-add' : 'login'} size={64} />
        <p className="eyebrow">Личный прогресс TraceCheck</p>
        <h1>{register ? 'Создай профиль исследователя' : 'Продолжи расследование'}</h1>
        <p className="lead">
          {register
            ? 'Ник будет виден в рейтинге. Ответы и объяснения останутся приватными.'
            : 'Войди, чтобы вернуть EXP, уровни, достижения и досье.'}
        </p>
        <form className="auth-form" onSubmit={submit}>
          <label>
            <span><PixelIcon name="profile" size={22} /> Ник</span>
            <input autoComplete="username" value={nickname} onChange={event => setNickname(event.target.value)} required minLength={3} maxLength={24} />
          </label>
          <label>
            <span><PixelIcon name="password" size={22} /> Пароль</span>
            <input type="password" autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} required minLength={10} maxLength={128} />
          </label>
          {register && <label>
            <span><PixelIcon name="check" size={22} /> Подтверди пароль</span>
            <input type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} required minLength={10} maxLength={128} />
          </label>}
          {error && <p className="form-error" role="alert"><PixelIcon name="warning" size={24} />{error}</p>}
          <button className="primary auth-submit" disabled={submitting}>
            <PixelIcon name={register ? 'user-add' : 'login'} size={26} />
            {submitting ? 'Подожди…' : register ? 'Зарегистрироваться' : 'Войти'}
          </button>
        </form>
        <p className="auth-switch">
          {register ? 'Уже есть профиль?' : 'Ещё нет профиля?'}{' '}
          <Link to={register ? 'login' : 'register'}>{register ? 'Войти' : 'Зарегистрироваться'}</Link>
        </p>
        {register && <p className="auth-note"><PixelIcon name="email" size={22} /> Позже можно привязать почту для восстановления. Без неё восстановление может быть недоступно.</p>}
      </div>
    </section>
  )
}
