import { posts, clues, findings, editActions } from './content.js'
import { saveSession } from './session.js'

const finding = findings[0]

export function matchesFinding(clueIds) {
  return finding.requiredClueGroups.every(group => group.some(id => clueIds.includes(id)))
}

export function buildDossier(edits) {
  const hidden = new Set(editActions.filter(edit => edits.includes(edit.id)).flatMap(edit => edit.hidesClueIds))
  const visible = clues.filter(clue => !hidden.has(clue.id))
  return { found: matchesFinding(visible.map(clue => clue.id)), visible }
}

function toggle(values, id, on) {
  return on ? [...new Set([...values, id])] : values.filter(value => value !== id)
}

function postCard(post, selected) {
  return `<article class="card">
    <p class="eyebrow">ПУБЛИКАЦИЯ · ДИМА</p>
    <h3>${post.title}</h3>
    <img class="post-art" src="./${post.id}.svg" alt="${post.visual}">
    <p>${post.caption}</p>
    ${post.location ? `<p class="muted">⌖ ${post.location}</p>` : ''}
    <fieldset><legend>Выбери улики</legend>
    ${clues.filter(clue => clue.postId === post.id).map(clue => `<label class="option">
      <input type="checkbox" name="clue" value="${clue.id}" ${selected.includes(clue.id) ? 'checked' : ''}> ${clue.label}
    </label>`).join('')}</fieldset>
  </article>`
}

function renderFeed(target, session) {
  target.innerHTML = `<p class="eyebrow">01 / ЛЕНТА</p><h2>Лента Димы</h2>
    <p class="intro">Что связывает место на фото и планы на выходные? Отметь детали из двух постов.</p>
    <div class="grid">${posts.map(post => postCard(post, session.selected)).join('')}</div>
    <div class="actions"><button type="button" class="button primary">Проверить связь</button><a href="#dossier">Показать разбор →</a></div>
    <p class="feedback" aria-live="polite"></p>
    <a class="button" href="#dossier" data-result hidden>Открыть досье →</a>`
  const feedback = target.querySelector('.feedback')
  const result = target.querySelector('[data-result]')
  for (const input of target.querySelectorAll('[name="clue"]')) {
    input.addEventListener('change', () => {
      session.selected = toggle(session.selected, input.value, input.checked)
      saveSession(session)
      feedback.textContent = ''
      result.hidden = true
    })
  }
  target.querySelector('button').addEventListener('click', () => {
    const found = matchesFinding(session.selected)
    feedback.textContent = found ? 'Связь найдена. Адрес, подпись о доме и планы поездки складываются в один вывод.' :
      'Поищи источник адреса, указание на дом и деталь, которая раскрывает планы поездки.'
    result.hidden = !found
  })
}

function renderDossier(target) {
  target.innerHTML = `<p class="eyebrow">02 / РАЗБОР</p><h2>Досье</h2>
    <article class="card">
      <p class="eyebrow">${finding.confidence.toUpperCase()}</p>
      <h3>${finding.title}</h3>
      <p>${finding.explanation}</p>
      <p class="muted">${finding.limits}</p>
      <details><summary>Источники вывода</summary><ul>${clues.map(clue => `<li><strong>${posts.find(post => post.id === clue.postId).title}.</strong> ${clue.description}</li>`).join('')}</ul></details>
    </article>
    <div class="actions"><a class="button primary" href="#edit">Изменить публикацию →</a><a href="#case">К публикациям</a></div>`
}

function renderEditor(target, session) {
  target.innerHTML = `<p class="eyebrow">03 / РЕДАКТОР</p><h2>Спрячь детали</h2>
    <p class="intro">Измени селфи и сравни, что было видно до правки и что можно узнать теперь.</p>
    <div class="grid">
      <article class="card">
        <h3>Селфи у подъезда</h3>
        <div class="preview"><img class="post-art" src="./entrance.svg" alt="Селфи Димы у дома"><span class="redaction" hidden>СКРЫТО</span></div>
        <p data-caption>${posts[0].caption}</p><p class="muted" data-location>⌖ ${posts[0].location}</p>
        <fieldset><legend>Что скрыть</legend>
        ${editActions.map(edit => `<label class="option"><input type="checkbox" value="${edit.id}" ${session.edits.includes(edit.id) ? 'checked' : ''}> ${edit.label}</label>`).join('')}
        </fieldset>
      </article>
      <article class="card">
        <h3>Досье до и после</h3>
        <p><strong>До.</strong> ${finding.title}.</p>
        <div data-after aria-live="polite"></div>
      </article>
    </div>
    <div class="actions"><a class="button primary" href="#checkup">Проверить свои привычки →</a><a href="#dossier">Вернуться к досье</a></div>`
  function update() {
    const dossier = buildDossier(session.edits)
    target.querySelector('.redaction').hidden = !session.edits.includes('hide-sign')
    target.querySelector('[data-caption]').hidden = session.edits.includes('remove-caption')
    target.querySelector('[data-location]').hidden = session.edits.includes('remove-location')
    const after = dossier.found ? 'Связь с вероятным домом по-прежнему видна.' : 'Связь поездки с вероятным домом исчезла.'
    target.querySelector('[data-after]').innerHTML = `<p><strong>После.</strong> ${after} Планы поездки по-прежнему видны.</p>
      <p class="muted">Остались улики:</p><ul>${dossier.visible.map(clue => `<li>${clue.label}</li>`).join('')}</ul>`
  }
  for (const input of target.querySelectorAll('input')) {
    input.addEventListener('change', () => {
      session.edits = toggle(session.edits, input.value, input.checked)
      saveSession(session)
      update()
    })
  }
  update()
}

export function renderGame(id, target, session) {
  if (id === 'case') renderFeed(target, session)
  if (id === 'dossier') renderDossier(target)
  if (id === 'edit') renderEditor(target, session)
}
