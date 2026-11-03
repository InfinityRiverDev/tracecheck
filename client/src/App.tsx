import { useEffect } from 'react'
import { useRoute } from './router'
import { HomePage } from './pages/HomePage'
import { CheckupPage } from './pages/CheckupPage'
import { ReportPage } from './pages/ReportPage'
import { GameRoute } from './game/GameRoute'
import { PixelIcon } from './design/PixelIcon'
import { AuthPage } from './pages/AuthPage'
import { ProfilePage } from './pages/ProfilePage'
import { useAuth } from './auth/AuthContext'

const titles: Record<string, string> = {
  home: 'TraceCheck — досье за 5 минут',
  case: 'Лента Димы · TraceCheck',
  dossier: 'Досье · TraceCheck',
  edit: 'Редактор публикации · TraceCheck',
  checkup: 'Самооценка · TraceCheck',
  report: 'Личный отчёт · TraceCheck',
  login: 'Вход · TraceCheck',
  register: 'Регистрация · TraceCheck',
  profile: 'Личный кабинет · TraceCheck',
}

export default function App() {
  const route = useRoute()
  const { user } = useAuth()
  const gameRoute = ['case', 'dossier', 'edit', 'checkup'].includes(route)
  document.title = titles[route] ?? titles.home
  useEffect(() => {
    document.getElementById('main')?.focus()
  }, [route])

  return (
    <div className="shell">
      <header className="topbar">
        <a href="#/" className="brand"><PixelIcon name="fingerprint" size={30} />TraceCheck</a>
        <nav className="topnav" aria-label="Этапы TraceCheck">
          <a href="#/" aria-current={route === 'home' ? 'page' : undefined}><PixelIcon name="home" size={20} />1 Главная</a>
          <a href="#/case" aria-current={gameRoute ? 'page' : undefined}><PixelIcon name="levels" size={20} />2 Игра</a>
          <a href="#/report" aria-current={route === 'report' ? 'page' : undefined}><PixelIcon name="dossier" size={20} />3 Результат</a>
          <a href="#/profile" aria-current={route === 'profile' ? 'page' : undefined}><PixelIcon name="profile" size={20} />{user?.nickname ?? 'Профиль'}</a>
        </nav>
      </header>
      <main id="main" className="main" tabIndex={-1}>
        {route === 'home' && <HomePage />}
        {route === 'case' && <GameRoute screen="case" />}
        {route === 'dossier' && <GameRoute screen="dossier" />}
        {route === 'edit' && <GameRoute screen="edit" />}
        {route === 'checkup' && <CheckupPage />}
        {route === 'report' && <ReportPage />}
        {route === 'login' && <AuthPage mode="login" />}
        {route === 'register' && <AuthPage mode="register" />}
        {route === 'profile' && <ProfilePage />}
      </main>
      <footer className="footer">
        Ответы и объяснения не публикуются. Пароли хешируются на сервере. Учебный проект TraceCheck.
      </footer>
    </div>
  )
}
