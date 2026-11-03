import { useDispatch } from 'react-redux'
import { posts } from '@content'
import heroImage from '../design/dima-hero.png'
import { Footprint } from '../design/Footprint'
import { resetGame } from '../state/gameSlice'
import { resetCheckup } from '../state/checkupSlice'
import type { AppDispatch } from '../store'
import { Link } from '../router'
import { VoxelTraceScene } from '../components/VoxelTraceScene'

export function HomePage() {
  const dispatch: AppDispatch = useDispatch()
  const ticket = posts[1].ticket
  return (
    <section className="page home hero">
      <div className="hero-copy">
      <h1>Мы знаем о тебе <em>больше,</em> чем ты думаешь</h1>
      <p className="lead">Твой цифровой след — за 5 минут.</p>
      <div className="cta">
        <Link to="case" className="primary button-link">
          Начать <span aria-hidden="true">→</span>
        </Link>
        <Link to="checkup" className="secondary button-link">
          Сразу проверить себя
        </Link>
      </div>
      <div className="footprint-trail" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => <Footprint key={index} />)}
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
      </div>
      <div className="hero-scene">
        <div className="hero-image"><img src={heroImage} alt="Вымышленный студент Дима у подъезда" /></div>
        <VoxelTraceScene />
        {ticket && <span className="scene-tag scene-ticket">Билет на поезд<small>{ticket.date} · {ticket.route}</small></span>}
        <span className="scene-tag scene-location">Геометка<small>{posts[0].location}</small></span>
      </div>
    </section>
  )
}
