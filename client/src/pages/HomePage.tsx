import { posts } from '@content'
import heroImage from '../design/dima-hero.png'
import { Footprint } from '../design/Footprint'
import { Link } from '../router'
import { VoxelTraceScene } from '../components/VoxelTraceScene'
import { LiveLeaderboard } from '../components/LiveLeaderboard'
import { PixelIcon } from '../design/PixelIcon'

export function HomePage() {
  const ticket = posts[1].ticket
  return (
    <section className="page home hero">
      <div className="hero-copy">
      <h1>Мы знаем о тебе <em>больше,</em> чем ты думаешь</h1>
      <p className="lead">Твой цифровой след — за 5 минут.</p>
      <div className="cta">
        <Link to="case" className="primary button-link">
          Начать <PixelIcon name="arrow-right" size={24} />
        </Link>
      </div>
      <div className="footprint-trail" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => <Footprint key={index} />)}
      </div>
      </div>
      <div className="hero-scene">
        <div className="hero-image"><img src={heroImage} alt="Вымышленный студент Дима у подъезда" /></div>
        <VoxelTraceScene />
        {ticket && <span className="scene-tag scene-ticket">Билет на поезд<small>{ticket.date} · {ticket.route}</small></span>}
        <span className="scene-tag scene-location">Геометка<small>{posts[0].location}</small></span>
      </div>
      <LiveLeaderboard />
    </section>
  )
}
