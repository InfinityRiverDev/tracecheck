import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { questions } from '@content'

function validAnswer(questionId: string, optionId: string): boolean {
  return questions.some(question => question.id === questionId && question.options.some(option => option.id === optionId))
}

// Самооценка: ответы (questionId → optionId) и позиция в анкете.
export interface CheckupSlice {
  answers: Record<string, string>
  current: number
  done: boolean
}

const initialState: CheckupSlice = {
  answers: {},
  current: 0,
  done: false,
}

export const checkupStorageKey = 'tracecheck-react-checkup-v1'

function isAnswers(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return Object.entries(value).every(([key, item]) => typeof key === 'string' && typeof item === 'string')
}

export function loadInitialCheckup(): CheckupSlice {
  try {
    const saved = JSON.parse(sessionStorage.getItem(checkupStorageKey) ?? 'null')
    if (
      isAnswers(saved?.answers) &&
      typeof saved?.current === 'number' &&
      Number.isInteger(saved?.current) &&
      saved?.current >= 0 &&
      typeof saved?.done === 'boolean'
    ) {
      const answers = Object.fromEntries(Object.entries(saved.answers as Record<string, string>)
        .filter(([questionId, optionId]) => validAnswer(questionId, optionId)))
      const missing = questions.findIndex(question => !answers[question.id])
      return {
        answers,
        current: missing >= 0 ? missing : Math.min(saved.current, Math.max(0, questions.length - 1)),
        done: saved.done && questions.length > 0 && missing === -1,
      }
    }
  } catch {
    // Повреждённое сохранение игнорируем.
  }
  return initialState
}

const checkupSlice = createSlice({
  name: 'checkup',
  initialState: loadInitialCheckup(),
  reducers: {
    answer(state, action: PayloadAction<{ questionId: string; optionId: string }>) {
      if (!validAnswer(action.payload.questionId, action.payload.optionId)) return
      state.answers[action.payload.questionId] = action.payload.optionId
    },
    goToQuestion(state, action: PayloadAction<number>) {
      state.current = Number.isInteger(action.payload)
        ? Math.min(Math.max(0, action.payload), Math.max(0, questions.length - 1)) : 0
      state.done = false
    },
    finishCheckup(state) {
      state.done = questions.length > 0 && questions.every(question =>
        question.options.some(option => option.id === state.answers[question.id]),
      )
    },
    resetCheckup() {
      return initialState
    },
  },
})

export const { answer, goToQuestion, finishCheckup, resetCheckup } = checkupSlice.actions
export default checkupSlice.reducer
