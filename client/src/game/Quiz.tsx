import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Auth } from './Auth'
import { clearSession, loadSession, useLeaderboard, type Row, type Session } from './leaderboard'
import certImage from '../design/certificate.png'
import './game.css'
import './quiz.css'

// Сравнение без регистра, ё→е и без пробелов/слешей: «12/07/2015» == «12072015».
function strip(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/[\s/]+/g, '')
}

// Разделители, которые в маске всегда видны (не закрываются звёздочкой).
const SEPARATORS = new Set([' ', '/', ':'])

const COLORS = ['#c084fc', '#b57bff', '#34d399', '#e2ff72', '#ff8bd0', '#60a5fa']
const ORIGINS = [20, 50, 80]

// Радиальные вспышки из нескольких точек — приближение фейрверка TryHackMe, только CSS.
const FIREWORK = ORIGINS.flatMap((ox, b) =>
  Array.from({ length: 14 }, (_, i) => {
    const angle = (i / 14) * Math.PI * 2
    const dist = 58 + (i % 3) * 30
    return {
      id: `${b}-${i}`,
      ox,
      tx: Math.round(Math.cos(angle) * dist),
      ty: Math.round(Math.sin(angle) * dist),
      color: COLORS[(i + b) % COLORS.length],
      delay: b * 110 + (i % 5) * 45,
    }
  }),
)

function dotStyle(dot: (typeof FIREWORK)[number]): CSSProperties {
  return {
    '--ox': `${dot.ox}%`,
    '--tx': `${dot.tx}px`,
    '--ty': `${dot.ty}px`,
    '--c': dot.color,
    '--d': `${dot.delay}ms`,
  } as unknown as CSSProperties
}

function Fireworks() {
  return (
    <div className="q-fw" aria-hidden="true">
      {FIREWORK.map(dot => (
        <span key={dot.id} className="q-fw-dot" style={dotStyle(dot)} />
      ))}
    </div>
  )
}

type Question = {
  answer: string
  prompt: ReactNode
  // Необязательный плейсхолдер вместо звёздочек: напр. 'DD/MM/YEAR'.
  mask?: string
}

function Riddle({
  index,
  answer: solution,
  prompt,
  mask,
  onSolve,
}: Question & { index: number; onSolve: () => void }) {
  const [value, setValue] = useState('')
  const [status, setStatus] = useState<'idle' | 'wrong' | 'done'>('idle')
  const inputRef = useRef<HTMLInputElement>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const done = status === 'done'

  function check() {
    window.clearTimeout(timer.current)
    if (strip(value) === strip(solution)) {
      setStatus('done')
      onSolve()
    } else {
      setStatus('wrong')
      timer.current = window.setTimeout(() => setStatus('idle'), 2500)
    }
  }

  // Напечатанное показываем как есть; незаполненный хвост — плейсхолдер (mask),
  // иначе звёздочки, причём разделители (пробел, /, :) всегда видны.
  const remainder = Array.from({ length: Math.max(solution.length - value.length, 0) }, (_, k) => {
    const i = value.length + k
    const hint = mask?.[i]
    if (hint !== undefined) return hint
    return SEPARATORS.has(solution[i]) ? solution[i] : '*'
  }).join('')
  const cardStatus = done ? ' is-correct' : status === 'wrong' ? ' is-wrong' : ''

  return (
    <div className={'q-card' + cardStatus}>
      {done && <Fireworks />}
      <p className="q-num">Вопрос {index}</p>
      <p className="q-text">{prompt}</p>
      <div className="q-answer">
        <span className="q-label">Ответ:</span>
        <span className="q-field" onClick={() => inputRef.current?.focus()}>
          <span className="q-mask" aria-hidden="true">
            <span className="q-typed">{value}</span>
            <span className="q-stars">{remainder}</span>
          </span>
          <input
            ref={inputRef}
            className="q-native"
            value={value}
            maxLength={solution.length}
            disabled={done}
            onChange={event => setValue(event.target.value.slice(0, solution.length))}
            onKeyDown={event => {
              if (event.key === 'Enter') check()
            }}
            aria-label={`Ответ на вопрос ${index}`}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        </span>
        <button type="button" className="q-check" disabled={done} onClick={check}>
          Проверить
        </button>
      </div>
      <p className="q-sr" role="status" aria-live="polite">
        {done ? 'Верно' : status === 'wrong' ? 'Неверно' : ''}
      </p>
    </div>
  )
}

function Leaderboard({
  rows,
  me,
  connected,
  admin,
  onClear,
  onDelete,
  adminNotice,
}: {
  rows: Row[]
  me: string
  connected: boolean
  admin: boolean
  onClear: () => void
  onDelete: (nick: string) => void
  adminNotice: string
}) {
  return (
    <div className="q-board">
      <div className="q-board-head">
        <h3>
          Рейтинг <span className="q-live">{connected ? '● live' : '○ нет связи'}</span>
        </h3>
        <div className="q-board-tools">
          <span className="q-board-score">{rows.length} игрок(ов)</span>
          {admin && (
            <button
              type="button"
              className="q-clear"
              onClick={() => {
                if (window.confirm('Очистить весь рейтинг?')) onClear()
              }}
            >
              Очистить рейтинг
            </button>
          )}
        </div>
      </div>
      {admin && adminNotice && <p className="q-admin-notice" role="status">{adminNotice}</p>}
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Пользователь</th>
            <th>Рейтинг</th>
            {admin && <th>Действия</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={admin ? 4 : 3} className="q-board-empty">Пока никого — ответь первым!</td>
            </tr>
          )}
          {rows.map(row => (
            <tr key={row.nick} className={row.nick === me ? 'is-me' : undefined}>
              <td>{row.place}</td>
              <td>
                {row.nick}
                {row.nick === me && <span className="q-you"> (вы)</span>}
              </td>
              <td>{row.score}</td>
              {admin && (
                <td>
                  <button
                    type="button"
                    className="q-delete-user"
                    onClick={() => {
                      if (window.confirm(`Удалить пользователя «${row.nick}»? Это действие нельзя отменить.`)) {
                        onDelete(row.nick)
                      }
                    }}
                  >
                    Удалить
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const QUESTIONS: Question[] = [
  {
    answer: 'собака',
    prompt: (
      <>
        Что изображено на фото профиля{' '}
        <span className="q-handle">@PotterPit</span> во ВКонтакте?
      </>
    ),
  },
  { answer: 'Казань', prompt: 'В каком городе живёт пользователь?' },
  { answer: 'Декабристов 129', prompt: 'На каком адресе проживает пользователь?' },
  { answer: 'Кот', prompt: 'Что у Питера на аватарке в другой социальной сети?' },
  { answer: 'Индия гуджарат', prompt: 'Какую страну и штат недавно посетил Питер?' },
  {
    answer: '12/07/2015',
    prompt: 'Когда он последний раз путешествовал?',
    mask: 'DD/MM/YEAR',
  },
  {
    answer: 'Piter:Byte20112007',
    prompt: (
      <>
        Какой у него логин и пароль? <span className="q-hint">(логин:пароль)</span>
      </>
    ),
  },
]

function Certificate() {
  const [last, setLast] = useState('')
  const [first, setFirst] = useState('')
  const [url, setUrl] = useState('')

  function generate() {
    const fio = `${last.trim()} ${first.trim()}`.trim()
    if (!fio) return
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(img, 0, 0)
      ctx.textAlign = 'center'
      ctx.fillStyle = '#4a1d8a'
      ctx.font = `700 ${Math.round(img.naturalHeight * 0.052)}px Manrope, Arial, sans-serif`
      ctx.fillText(fio, img.naturalWidth / 2, img.naturalHeight * 0.602)
      ctx.fillStyle = '#2a0f52'
      ctx.font = `600 ${Math.round(img.naturalHeight * 0.028)}px Manrope, Arial, sans-serif`
      ctx.fillText(new Date().toLocaleDateString('ru-RU'), img.naturalWidth * 0.47, img.naturalHeight * 0.862)
      setUrl(canvas.toDataURL('image/png'))
    }
    img.src = certImage
  }

  return (
    <div className="q-cert">
      <h3>🎉 Все вопросы пройдены!</h3>
      <p>Впиши фамилию и имя — и забери именной сертификат.</p>
      <div className="q-cert-form">
        <input value={last} onChange={e => setLast(e.target.value)} placeholder="Фамилия" aria-label="Фамилия" />
        <input value={first} onChange={e => setFirst(e.target.value)} placeholder="Имя" aria-label="Имя" />
        <button
          type="button"
          className="q-check"
          onClick={generate}
          disabled={!last.trim() || !first.trim()}
        >
          Получить сертификат
        </button>
      </div>
      {url && (
        <div className="q-cert-result">
          <img src={url} alt="Сертификат TraceCheck" />
          <a className="q-check" href={url} download="TraceCheck-сертификат.png">Скачать</a>
        </div>
      )}
    </div>
  )
}

function QuizGame({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const { rows, connected, solve, clearBoard, deleteUser, adminNotice } = useLeaderboard(session.token)
  const [solved, setSolved] = useState<Set<number>>(() => new Set())
  const allDone = solved.size === QUESTIONS.length

  return (
    <section className="tc-game tc-quiz">
      <div className="q-topline">
        <p className="q-level">
          {session.admin ? 'Панель администратора' : 'Расследование · Цифровой след'}
        </p>
        <span className="q-user">
          <span className={'q-dot' + (connected ? ' is-on' : '')} aria-hidden="true" />
          {session.nick}
          {session.admin && <span className="q-badge">admin</span>}
          <button type="button" className="q-logout" onClick={onLogout}>Выйти</button>
        </span>
      </div>
      <h2>Питер Поттер</h2>
      <p className="q-intro">
        Питер уверен, что в сети он аноним. Но везде оставляет один ник —{' '}
        <span className="q-handle">@PotterPit</span>. Найди его страницу и ответь на вопросы.
      </p>

      <Leaderboard
        rows={rows}
        me={session.nick}
        connected={connected}
        admin={session.admin}
        onClear={clearBoard}
        onDelete={deleteUser}
        adminNotice={adminNotice}
      />

      {allDone && <Certificate />}

      {QUESTIONS.map((question, i) => (
        <Riddle
          key={i}
          index={i + 1}
          answer={question.answer}
          prompt={question.prompt}
          mask={question.mask}
          onSolve={() => {
            solve(i + 1)
            setSolved(prev => {
              const next = new Set(prev)
              next.add(i + 1)
              return next
            })
          }}
        />
      ))}
    </section>
  )
}

export function Quiz() {
  const [session, setSession] = useState<Session | null>(() => loadSession())

  if (!session) return <Auth onAuth={setSession} />

  return (
    <QuizGame
      session={session}
      onLogout={() => {
        clearSession()
        setSession(null)
      }}
    />
  )
}
