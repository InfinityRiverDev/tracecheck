// Проверка движка отчёта без браузера: node checks/assessment.check.ts
// Критерий задачи #13: два разных набора ответов дают разные объяснимые результаты.
import { questions, riskRules, recommendations } from '../content.ts'
import { evaluateHabits, type Answers } from '../client/src/engine/assessment.ts'

let failed = 0
function expect(condition: boolean, message: string) {
  if (!condition) {
    failed += 1
    console.error('✗', message)
  } else {
    console.log('✓', message)
  }
}

// Набор А: билеты публикует, код виден.
const answersA: Answers = { 'ticket-details': 'visible' }
const resultA = evaluateHabits(answersA, { questions, riskRules, recommendations })

// Набор Б: не публикует / скрывает детали.
const answersB: Answers = { 'ticket-details': 'hidden' }
const resultB = evaluateHabits(answersB, { questions, riskRules, recommendations })

// Набор В: не уверен.
const answersC: Answers = { 'ticket-details': 'unknown' }
const resultC = evaluateHabits(answersC, { questions, riskRules, recommendations })

expect(resultA.risksFired.includes('visible-ticket-details'), 'A: сработал риск видимых деталей билета')
expect(resultA.topAdvice.length === 1, 'A: ровно один совет сверху')
expect(resultA.topAdvice[0].recommendation.id === 'hide-ticket-details', 'A: совет — скрыть детали')
expect(resultA.topAdvice[0].status === 'В первую очередь', 'A: статус «В первую очередь»')
expect(
  resultA.topAdvice[0].causes.some(cause => cause.ruleExplanation.includes('видны')),
  'A: у совета есть объяснение-причина',
)
expect(resultA.keptHabits.length === 0, 'A: сохранять нечего')

expect(resultB.risksFired.length === 0, 'Б: рисков нет')
expect(resultB.topAdvice.length === 0, 'Б: советов нет')
expect(resultB.keptHabits.length === 1, 'Б: привычка «скрываю» попала в сохраняемые')
expect(
  resultB.keptHabits[0].answerLabel.includes('Скрываю'),
  'Б: подпись привычки берётся из варианта ответа',
)

expect(resultC.risksFired.includes('unknown-ticket-details'), 'В: «не уверен» дал риск уточнения')
expect(
  resultC.topAdvice[0].recommendation.id === 'check-ticket-details',
  'В: совет — проверить фото билетов',
)
expect(resultC.topAdvice[0].status === 'Стоит пересмотреть', 'В: статус «Стоит пересмотреть»')
expect(resultC.unknowns.length === 1, 'В: неизвестный параметр показан отдельно')

// Некорректные данные не ломают расчёт и отфильтровываются.
const dirty = evaluateHabits(
  { 'no-such-question': 'visible', 'ticket-details': 'no-such-option' } as Answers,
  { questions, riskRules, recommendations },
)
expect(dirty.risksFired.length === 0, 'мусорные ответы отфильтрованы, рисков нет')

const a = JSON.stringify(resultA.topAdvice.map(item => item.recommendation.id))
const b = JSON.stringify(resultB.topAdvice.map(item => item.recommendation.id))
const c = JSON.stringify(resultC.topAdvice.map(item => item.recommendation.id))
expect(a !== b && b !== c && a !== c, 'три набора ответов дают три разных результата')

if (failed > 0) {
  console.error(`\n${failed} проверок не прошло`)
  process.exit(1)
}
console.log('\nВсе проверки прошли')
