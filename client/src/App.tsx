import { useEffect } from 'react'
import { useRoute } from './router'
import { HomePage } from './pages/HomePage'
import { CheckupPage } from './pages/CheckupPage'
import { ReportPage } from './pages/ReportPage'
import { GameRoute } from './game/GameRoute'
import { Quiz } from './game/Quiz'
import { PixelIcon } from './design/PixelIcon'

const titles: Record<string, string> = {
  home: 'TraceCheck — досье за 5 минут',
  case: 'Лента Димы · TraceCheck',
  dossier: 'Досье · TraceCheck',
  edit: 'Редактор публикации · TraceCheck',
  checkup: 'Самооценка · TraceCheck',
  report: 'Личный отчёт · TraceCheck',
}

export default function App() {
  const route = useRoute()
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
          <a href="#/" aria-current={route === 'home' ? 'page' : undefined}><PixelIcon name="home" size={20} />Главная</a>
          <a href="#/case" aria-current={gameRoute ? 'page' : undefined}><PixelIcon name="levels" size={20} />Игра</a>
        </nav>
      </header>
      <main id="main" className="main" tabIndex={-1}>
        {route === 'home' && <HomePage />}
        {route === 'case' && <Quiz />}
        {route === 'dossier' && <GameRoute screen="dossier" />}
        {route === 'edit' && <GameRoute screen="edit" />}
        {route === 'checkup' && <CheckupPage />}
        {route === 'report' && <ReportPage />}
      </main>
      <footer className="footer">
        Ответы и объяснения не публикуются. Пароли хешируются на сервере. Учебный проект TraceCheck.
        <br />
        Переходите в наш телеграм-бот — <a href="https://t.me/tracecheck_helper_bot" target="_blank" rel="noopener noreferrer">@tracecheck_helper_bot</a>
      </footer>
    </div>
  )
}
