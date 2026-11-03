import { PixelIcon, type PixelIconName } from '../design/PixelIcon'
import { Link, navigate } from '../router'
import { useAuth } from '../auth/AuthContext'

function Metric({ icon, value, label }: { icon: PixelIconName; value: string | number; label: string }) {
  return <div className="profile-metric"><PixelIcon name={icon} size={38} /><strong>{value}</strong><span>{label}</span></div>
}

export function ProfilePage() {
  const { user, progress, loading, logout } = useAuth()
  if (loading) return <section className="page profile-page"><p>Загружаем профиль…</p></section>
  if (!user) return (
    <section className="page profile-page empty-profile">
      <PixelIcon name="lock" size={72} />
      <h1>Войди в профиль</h1>
      <p className="lead">Аккаунт сохраняет EXP, открытые уровни и собранное досье.</p>
      <div className="cta"><Link to="login" className="primary button-link"><PixelIcon name="login" />Войти</Link><Link to="register" className="secondary button-link"><PixelIcon name="user-add" />Регистрация</Link></div>
    </section>
  )

  const completed = progress?.completedLevels.length ?? 0
  return (
    <section className="page profile-page">
      <header className="profile-heading">
        <div className="avatar-pixel"><PixelIcon name="profile" size={64} /></div>
        <div><p className="eyebrow">Исследователь</p><h1>{user.nickname}</h1><p className="lead">Продолжай собирать цифровые следы.</p></div>
      </header>
      <div className="profile-metrics">
        <Metric icon="exp" value={progress?.exp ?? 0} label="EXP" />
        <Metric icon="levels" value={`${completed}/10`} label="Уровней" />
        <Metric icon="achievement" value={progress?.achievements.length ?? 0} label="Достижений" />
        <Metric icon="dossier" value={progress?.dossierFragments.length ?? 0} label="Фактов в досье" />
      </div>
      <div className="profile-grid">
        <article className="profile-panel"><PixelIcon name="progress" size={44} /><h2>Расследование</h2><p>Следующий уровень откроется на карте расследования.</p><Link to="case" className="primary button-link">Продолжить <PixelIcon name="arrow-right" /></Link></article>
        <article className="profile-panel"><PixelIcon name="checklist" size={44} /><h2>Мои цифровые привычки</h2><p>Рекомендации и выполненные действия из самооценки.</p><Link to="checkup" className="secondary button-link">Открыть тест</Link></article>
      </div>
      <button className="secondary profile-logout" onClick={async () => { await logout(); navigate('home') }}><PixelIcon name="logout" />Выйти</button>
    </section>
  )
}
