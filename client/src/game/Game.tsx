import { useState } from 'react'
import { clues, editActions, posts } from '../../../content'
import entranceImage from '../design/dima-post.png'
import avatarImage from '../design/dima-avatar.png'
import { buildDossier, finding, matchesFinding } from './engine'
import './game.css'

type GameScreen = 'case' | 'dossier' | 'edit'
type GamePath = '/case' | '/case/dossier' | '/case/edit' | '/checkup'

export type GameProps = {
  screen: GameScreen
  selected: readonly string[]
  edits: readonly string[]
  onToggleClue: (id: string) => void
  onToggleEdit: (id: string) => void
  onFindingFound: (id: string) => void
  navigate: (path: GamePath) => void
}

const [entrance, ticket] = posts

function Feed({ selected, onToggleClue, onFindingFound, navigate }: GameProps) {
  const [checked, setChecked] = useState(false)
  const found = checked && matchesFinding(selected)

  return <>
    <div className="tc-feed-header">
      <h2>Игра: досье на Диму</h2>
      <span className="tc-clue-count">Улики {clues.filter(clue => selected.includes(clue.id)).length} / {clues.length}</span>
    </div>
    <p className="tc-feed-task">Задание: свяжи место на фото и планы на выходные. Отметь детали из двух публикаций.</p>
    <div className="tc-game-grid tc-feed-grid">
      {[entrance, ticket].map(post => (
        <article className={'tc-game-card tc-post' + (post.clueIds.some(id => selected.includes(id)) ? ' is-selected' : '')} key={post.id}>
          <div className="tc-post-author"><img src={avatarImage} alt="" /><span>Дима</span></div>
          <h3 className="tc-post-title">{post.title}</h3>
          {'ticket' in post && post.ticket
            ? <div className="tc-post-media"><div className="tc-ticket">
                Билет на поезд<br /><span>{post.ticket.date}</span><br />{post.ticket.route}
              </div></div>
            : <div className="tc-post-media"><img className="tc-game-art" src={entranceImage} alt={post.visual} /></div>}
          <p>{post.caption}</p>
          <p className="tc-post-description">{post.visual}</p>
          {'location' in post && <p className="tc-game-muted">⌖ {post.location}</p>}
          <fieldset>
            <legend>Выбери улики</legend>
            {clues.filter(clue => clue.postId === post.id).map(clue => (
              <label className="tc-game-option" key={clue.id}>
                <input type="checkbox" checked={selected.includes(clue.id)} onChange={() => {
                  setChecked(false)
                  onToggleClue(clue.id)
                }} />
                {clue.label}
              </label>
            ))}
          </fieldset>
        </article>
      ))}
      <aside className="tc-game-card tc-clue-panel">
        <h3>Улики</h3>
        <ul>{clues.map(clue => <li key={clue.id} className={selected.includes(clue.id) ? 'is-selected' : undefined}>
          {clue.label}{selected.includes(clue.id) && <span aria-label="выбрано">✓</span>}
        </li>)}</ul>
        <p className={'tc-verdict' + (found ? ' is-selected' : '')} aria-live="polite">
          {found ? 'Связь найдена. Адрес, подпись о доме и планы поездки складываются в один вывод.'
            : checked ? 'Поищи источник адреса, указание на дом и деталь, которая раскрывает планы поездки.'
            : 'Адрес и дата отъезда вместе могут дать догадку. Это предположение, не факт.'}
        </p>
        <button type="button" className="tc-game-primary" onClick={() => {
          setChecked(true)
          if (matchesFinding(selected)) onFindingFound(finding.id)
        }}>Проверить связь</button>
        <button type="button" onClick={() => navigate('/case/dossier')}>{found ? 'В досье →' : 'Показать разбор →'}</button>
      </aside>
    </div>
  </>
}

function Dossier({ navigate }: Pick<GameProps, 'navigate'>) {
  return <>
    <p className="tc-game-label">02 / РАЗБОР</p>
    <h2>Досье</h2>
    <article className="tc-game-card">
      <p className="tc-game-label">{finding.confidence.toUpperCase()}</p>
      <h3>{finding.title}</h3>
      <p>{finding.explanation}</p>
      <p className="tc-game-muted">{finding.limits}</p>
      <details>
        <summary>Источники вывода</summary>
        <ul>{clues.map(clue => (
          <li key={clue.id}><strong>{posts.find(post => post.id === clue.postId)?.title}.</strong> {clue.description}</li>
        ))}</ul>
      </details>
    </article>
    <div className="tc-game-actions">
      <button type="button" className="tc-game-primary" onClick={() => navigate('/case/edit')}>Изменить публикацию →</button>
      <button type="button" onClick={() => navigate('/case')}>К публикациям</button>
    </div>
  </>
}

function Editor({ edits, onToggleEdit, navigate }: GameProps) {
  const dossier = buildDossier(edits)
  const signHidden = edits.includes('hide-sign')

  return <>
    <p className="tc-game-label">03 / РЕДАКТОР</p>
    <h2>Спрячь детали</h2>
    <p>Измени селфи и сравни, что было видно до правки и что можно узнать теперь.</p>
    <div className="tc-game-grid">
      <article className="tc-game-card">
        <h3>{entrance.title}</h3>
        <div className="tc-game-preview">
          <img className="tc-game-art" src={entranceImage} alt={signHidden ? 'Селфи Димы у дома, табличка скрыта' : entrance.visual} />
          {signHidden && <span className="tc-game-redaction" aria-hidden="true">СКРЫТО</span>}
        </div>
        {!edits.includes('remove-caption') && <p>{entrance.caption}</p>}
        {!edits.includes('remove-location') && <p className="tc-game-muted">⌖ {'location' in entrance ? entrance.location : ''}</p>}
        <fieldset>
          <legend>Что скрыть</legend>
          {editActions.map(edit => (
            <label className="tc-game-option" key={edit.id}>
              <input type="checkbox" checked={edits.includes(edit.id)}
                onChange={() => onToggleEdit(edit.id)} />
              {edit.label}
            </label>
          ))}
        </fieldset>
      </article>
      <article className="tc-game-card">
        <h3>Досье до и после</h3>
        <p><strong>До.</strong> {finding.title}.</p>
        <div aria-live="polite">
          <p><strong>После.</strong> {dossier.found
            ? 'Связь с вероятным домом по-прежнему видна.'
            : 'Связь поездки с вероятным домом исчезла.'} Планы поездки по-прежнему видны.</p>
          <p className="tc-game-muted">Остались улики:</p>
          <ul>{dossier.visible.map(clue => <li key={clue.id}>{clue.label}</li>)}</ul>
        </div>
      </article>
    </div>
    <div className="tc-game-actions">
      <button type="button" className="tc-game-primary" onClick={() => navigate('/checkup')}>Проверить свои привычки →</button>
      <button type="button" onClick={() => navigate('/case/dossier')}>Вернуться к досье</button>
    </div>
  </>
}

export function Game(props: GameProps) {
  return <section className="tc-game">
    {props.screen === 'case' && <Feed {...props} />}
    {props.screen === 'dossier' && <Dossier navigate={props.navigate} />}
    {props.screen === 'edit' && <Editor {...props} />}
  </section>
}
