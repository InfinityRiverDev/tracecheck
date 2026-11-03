import { useDispatch, useSelector } from 'react-redux'
import { posts, questions } from '@content'
import { answer, finishCheckup, goToQuestion } from '../state/checkupSlice'
import type { AppDispatch, RootState } from '../store'
import { navigate } from '../router'

// Анкета: один вопрос на экран, крупные варианты, «Назад»/«Далее» (ARCHITECTURE.md).
export function CheckupPage() {
  const dispatch: AppDispatch = useDispatch()
  const { answers, current } = useSelector((state: RootState) => state.checkup)

  const total = questions.length
  const index = Math.min(current, total - 1)
  const question = questions[index]
  const chosen = answers[question.id]
  const isLast = index === total - 1

  return (
    <section className="page checkup">
      <p className="progress" aria-live="polite">
        Вопрос {index + 1} из {total}
      </p>
      <h2>{question.topic}</h2>
      <p className="question-label">{question.label}</p>

      <div className="options" role="radiogroup" aria-label={question.label}>
        {question.options.map(option => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={chosen === option.id}
            className={`option ${chosen === option.id ? 'option-checked' : ''}`}
            onClick={() => dispatch(answer({ questionId: question.id, optionId: option.id }))}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="stepper">
        <button
          type="button"
          className="secondary"
          disabled={index === 0}
          onClick={() => dispatch(goToQuestion(index - 1))}
        >
          ← Назад
        </button>
        <button
          type="button"
          className="primary"
          disabled={!chosen}
          onClick={() => {
            if (isLast) {
              dispatch(finishCheckup())
              navigate('report')
            } else {
              dispatch(goToQuestion(index + 1))
            }
          }}
        >
          {isLast ? 'Показать отчёт →' : 'Далее →'}
        </button>
      </div>

      <p className="hint">
        Ответы остаются в этой вкладке и никуда не отправляются. Персонаж {posts.length > 0 ? 'Дима' : ''} вымышленный.
      </p>
    </section>
  )
}
