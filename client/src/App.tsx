import { useEffect } from 'react'
import { useRoute } from './router'
import { HomePage } from './pages/HomePage'
import { CheckupPage } from './pages/CheckupPage'
import { ReportPage } from './pages/ReportPage'
import { GameRoute } from './game/GameRoute'
import { Footprint } from './design/Footprint'

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
  const gameRoute = route !== 'home' && route !== 'report'
  document.title = titles[route] ?? titles.home
  useEffect(() => {
    document.getElementById('main')?.focus()
  }, [route])

  return (
    <div className="shell">
      <header className="topbar">
        <a href="#/" className="brand"><Footprint />TraceCheck</a>
        <nav className="topnav" aria-label="Этапы TraceCheck">
          <a href="#/" aria-current={route === 'home' ? 'page' : undefined}>1 Главная</a>
          <a href="#/case" aria-current={gameRoute ? 'page' : undefined}>2 Игра</a>
          <a href="#/report" aria-current={route === 'report' ? 'page' : undefined}>3 Результат</a>
        </nav>
      </header>
      <main id="main" className="main" tabIndex={-1}>
        {route === 'home' && <HomePage />}
        {route === 'case' && <GameRoute screen="case" />}
        {route === 'dossier' && <GameRoute screen="dossier" />}
        {route === 'edit' && <GameRoute screen="edit" />}
        {route === 'checkup' && <CheckupPage />}
        {route === 'report' && <ReportPage />}
      </main>
      <footer className="footer">
        Ответы остаются в этой вкладке и никуда не отправляются. Учебный проект TraceCheck.
      </footer>
    </div>
  )
}
