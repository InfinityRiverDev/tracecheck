import { useDispatch } from 'react-redux'
import { posts } from '@content'
import { resetGame } from '../state/gameSlice'
import { resetCheckup } from '../state/checkupSlice'
import type { AppDispatch } from '../store'
import { Link } from '../router'

export function HomePage() {
  const dispatch: AppDispatch = useDispatch()
  return (
    <section className="page home">
      <p className="tagline">Мы знаем о тебе больше, чем ты думаешь</p>
      <h1>Что о тебе можно узнать по {posts.length >= 8 ? 'восьми' : 'двум'} постам?</h1>
      <p className="lead">
        Собери досье на студента Диму из его публикаций, отредактируй пост и посмотри,
        какие выводы исчезнут. Потом проверь свои привычки и получи личный план действий.
        Персонаж вымышленный, прохождение — около пяти минут.
      </p>
      <div className="cta">
        <Link to="case" className="primary button-link">
          Начать расследование
        </Link>
        <Link to="checkup" className="secondary button-link">
          Сразу проверить себя
        </Link>
      </div>
      <button
        type="button"
        className="ghost"
        onClick={() => {
          dispatch(resetGame())
          dispatch(resetCheckup())
        }}
      >
        Начать заново
      </button>
    </section>
  )
}
