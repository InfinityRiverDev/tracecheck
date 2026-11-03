import { renderGame } from './game.js'
import { readSession } from './session.js'

const sections = new Map(Array.from(document.querySelectorAll('main > section'), section => [section.id, section]))
const main = document.querySelector('main')
const session = readSession()
const routes = {
  case: 'Лента Димы',
  dossier: 'Досье',
  edit: 'Редактор публикации',
  checkup: 'Самооценка',
  report: 'Личный отчёт',
}

function renderRoute(moveFocus = true) {
  const requested = location.hash.slice(1)
  const id = sections.has(requested) ? requested : 'home'
  for (const [key, section] of sections) section.hidden = key !== id
  const target = sections.get(id)
  if (id === 'case' || id === 'dossier' || id === 'edit') renderGame(id, target, session)
  else if (id !== 'home' && !target.hasChildNodes()) {
    const title = document.createElement('h2')
    title.textContent = routes[id]
    target.append(title)
  }
  document.title = id === 'home' ? 'TraceCheck — досье за 5 минут' : routes[id] + ' · TraceCheck'
  if (moveFocus) main.focus()
}

document.querySelector('.skip').addEventListener('click', event => {
  event.preventDefault()
  main.focus()
})
window.addEventListener('hashchange', () => renderRoute())
renderRoute(false)
