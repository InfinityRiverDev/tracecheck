import { useDispatch, useSelector } from 'react-redux'
import { questions, recommendations, riskRules } from '@content'
import { evaluateHabits, hasCompleteAnswers } from '../engine/assessment'
import { goToQuestion } from '../state/checkupSlice'
import type { AppDispatch, RootState } from '../store'
import { Link } from '../router'

const statusClass: Record<string, string> = {
  'В первую очередь': 'status-first',
  'Стоит пересмотреть': 'status-review',
  'Стоит уточнить': 'status-clarify',
}

export function ReportPage() {
  const dispatch: AppDispatch = useDispatch()
  const { answers } = useSelector((state: RootState) => state.checkup)
  const result = evaluateHabits(answers, { questions, riskRules, recommendations })

  if (!hasCompleteAnswers(answers, questions)) {
    return (
      <section className="page report">
        <h2>Личный отчёт</h2>
        <p>Сначала пройди короткую самооценку — на неё уйдёт меньше минуты.</p>
        <Link to="checkup" className="primary button-link">
          Начать самооценку
        </Link>
      </section>
    )
  }

  return (
    <section className="page report">
      <h2>Личный отчёт</h2>

      {result.topAdvice.length === 0 ? (
        <div className="card calm">
          <h3>По твоим ответам риски не выявлены</h3>
          <p>Вот привычки, которые стоит сохранять:</p>
          <ul>
            {result.keptHabits.map(habit => (
              <li key={habit.questionLabel}>
                <strong>{habit.topic}:</strong> {habit.answerLabel}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        result.topAdvice.map(advice => (
          <article key={advice.recommendation.id} className={`card ${statusClass[advice.status]}`}>
            <p className={`status ${statusClass[advice.status]}`}>{advice.status}</p>
            <h3>{advice.recommendation.title}</h3>
            <p>{advice.recommendation.action}</p>
            <details className="why">
              <summary>Почему я это вижу</summary>
              <ul>
                {advice.causes.map((cause, position) => (
                  <li key={position}>
                    <strong>{cause.questionLabel}</strong> → {cause.answerLabel}. {cause.ruleExplanation}
                  </li>
                ))}
              </ul>
            </details>
          </article>
        ))
      )}

      {result.unknowns.length > 0 && (
        <div className="card clarify">
          <h3>Стоит уточнить</h3>
          <ul>
            {result.unknowns.map(item => (
              <li key={item.questionLabel}>{item.questionLabel}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="map">
        <h3>Карта привычек</h3>
        <dl>
          {questions.map(question => {
            const option = question.options.find(item => item.id === answers[question.id])
            return (
              <div key={question.id} className="map-row">
                <dt>{question.topic}</dt>
                <dd>{option ? option.label : '— не отвечено —'}</dd>
              </div>
            )
          })}
        </dl>
      </div>

      <div className="stepper">
        <button
          type="button"
          className="secondary"
          onClick={() => {
            dispatch(goToQuestion(0))
            window.location.hash = '/checkup'
          }}
        >
          Изменить ответы
        </button>
        <Link to="case" className="button-link secondary">
          Пройти игровой кейс
        </Link>
      </div>
    </section>
  )
}
