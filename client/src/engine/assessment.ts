// Движок личного отчёта. Чистые функции без зависимостей от React/Redux —
// импортируются UI (client) и проверки (node checks/assessment.check.ts).

export interface QuestionLite {
  id: string
  topic: string
  label: string
  options: readonly { id: string; label: string }[]
}

export interface RiskRuleLite {
  id: string
  conditions: readonly { questionId: string; optionId: string }[]
  priority: number
  explanation: string
  recommendationIds: readonly string[]
}

export interface RecommendationLite {
  id: string
  title: string
  action: string
  topic: string
}

export type Answers = Record<string, string>

export function hasCompleteAnswers(answers: Answers, questions: readonly QuestionLite[]): boolean {
  return questions.length > 0 && questions.every(question =>
    question.options.some(option => option.id === answers[question.id]),
  )
}

export interface AdviceCause {
  questionLabel: string
  answerLabel: string
  ruleExplanation: string
}

export type AdviceStatus = 'В первую очередь' | 'Стоит пересмотреть' | 'Стоит уточнить'

export interface Advice {
  recommendation: RecommendationLite
  status: AdviceStatus
  priority: number
  causes: AdviceCause[]
}

export interface KeptHabit {
  topic: string
  questionLabel: string
  answerLabel: string
}

export interface AssessmentResult {
  risksFired: string[]
  topAdvice: Advice[]
  otherAdvice: Advice[]
  keptHabits: KeptHabit[]
  unknowns: KeptHabit[]
}

const STATUS_ORDER: Record<AdviceStatus, number> = {
  'В первую очередь': 0,
  'Стоит пересмотреть': 1,
  'Стоит уточнить': 2,
}

function statusForPriority(priority: number): AdviceStatus {
  if (priority <= 1) return 'В первую очередь'
  if (priority === 2) return 'Стоит пересмотреть'
  return 'Стоит уточнить'
}

// Ответ «не уверен» — отдельное значение: риск не срабатывает,
// но отчёт показывает, что параметр неизвестен (ARCHITECTURE.md, «Самооценка»).
function isUnknownOption(optionId: string): boolean {
  return optionId === 'unknown' || optionId === 'unsure'
}

export function evaluateHabits(
  answers: Answers,
  content: {
    questions: readonly QuestionLite[]
    riskRules: readonly RiskRuleLite[]
    recommendations: readonly RecommendationLite[]
  },
): AssessmentResult {
  const { questions, riskRules, recommendations } = content

  const questionById = new Map(questions.map(question => [question.id, question]))
  const recommendationById = new Map(recommendations.map(item => [item.id, item]))

  // 1. Нормализация: остаются только ответы на существующие вопросы и опции.
  const validAnswers: Answers = {}
  for (const [questionId, optionId] of Object.entries(answers)) {
    const question = questionById.get(questionId)
    if (!question) continue
    if (question.options.some(option => option.id === optionId)) {
      validAnswers[questionId] = optionId
    }
  }

  // 2. Правила: правило срабатывает, когда выполнены ВСЕ его условия.
  const firedRules = riskRules.filter(rule =>
    rule.conditions.every(condition => validAnswers[condition.questionId] === condition.optionId),
  )

  // 3. Объединение советов по идентификатору с сохранением причин.
  const adviceById = new Map<string, Advice>()
  for (const rule of firedRules) {
    for (const recommendationId of rule.recommendationIds) {
      const recommendation = recommendationById.get(recommendationId)
      if (!recommendation) continue
      const causes: AdviceCause[] = rule.conditions.map(condition => {
        const question = questionById.get(condition.questionId)
        const option = question?.options.find(item => item.id === condition.optionId)
        return {
          questionLabel: question?.label ?? condition.questionId,
          answerLabel: option?.label ?? condition.optionId,
          ruleExplanation: rule.explanation,
        }
      })
      const existing = adviceById.get(recommendationId)
      if (existing) {
        existing.causes.push(...causes)
        existing.priority = Math.min(existing.priority, rule.priority)
        existing.status = statusForPriority(existing.priority)
      } else {
        adviceById.set(recommendationId, {
          recommendation,
          status: statusForPriority(rule.priority),
          priority: rule.priority,
          causes,
        })
      }
    }
  }

  // 4. Сортировка: статус, затем приоритет.
  const sortedAdvice = Array.from(adviceById.values()).sort((a, b) => {
    const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    return byStatus !== 0 ? byStatus : a.priority - b.priority
  })

  // Привычки, которые стоит сохранить: ответ не участвует ни в одном сработавшем
  // условии и не помечен как неизвестный.
  const riskyPairs = new Set(
    firedRules.flatMap(rule => rule.conditions.map(condition => `${condition.questionId}:${condition.optionId}`)),
  )
  const keptHabits: KeptHabit[] = []
  const unknowns: KeptHabit[] = []
  for (const [questionId, optionId] of Object.entries(validAnswers)) {
    const question = questionById.get(questionId)
    if (!question) continue
    const option = question.options.find(item => item.id === optionId)
    if (!option) continue
    const entry: KeptHabit = {
      topic: question.topic,
      questionLabel: question.label,
      answerLabel: option.label,
    }
    if (isUnknownOption(optionId)) unknowns.push(entry)
    else if (!riskyPairs.has(`${questionId}:${optionId}`)) keptHabits.push(entry)
  }

  return {
    risksFired: firedRules.map(rule => rule.id),
    topAdvice: sortedAdvice.slice(0, 3),
    otherAdvice: sortedAdvice.slice(3),
    keptHabits,
    unknowns,
  }
}
