import { posts } from '@content'
import { Link } from '../router'

// Заглушка игровой ветки до переноса на React (задача #12).
// Показывает контент из общего content.ts, чтобы конвейер данных был виден сразу.
export function GameStubPage({ variant }: { variant: 'case' | 'dossier' | 'edit' }) {
  const titles = {
    case: 'Лента Димы',
    dossier: 'Досье',
    edit: 'Редактор публикации',
  } as const
  const notes = {
    case: 'Выбор улик и проверка связей переносятся задачей #12.',
    dossier: 'Выводы с источниками появятся после #12.',
    edit: 'Правки поста с пересчётом досье появятся после #12.',
  } as const

  return (
    <section className="page game-stub">
      <h2>{titles[variant]}</h2>
      <p className="lead">{notes[variant]}</p>
      <ul className="post-list">
        {posts.map(post => (
          <li key={post.id} className="card">
            <h3>{post.title}</h3>
            <p>{post.visual}</p>
            {post.location && <p className="muted">📍 {post.location}</p>}
          </li>
        ))}
      </ul>
      <div className="stepper">
        <Link to="home" className="button-link secondary">
          ← На главную
        </Link>
      </div>
    </section>
  )
}
