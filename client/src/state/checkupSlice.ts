import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

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
  if (typeof value !== 'object' || value === null) return false
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
      return { answers: saved.answers, current: saved.current, done: saved.done }
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
      state.answers[action.payload.questionId] = action.payload.optionId
    },
    goToQuestion(state, action: PayloadAction<number>) {
      state.current = Math.max(0, action.payload)
      state.done = false
    },
    finishCheckup(state) {
      state.done = true
    },
    resetCheckup() {
      return initialState
    },
  },
})

export const { answer, goToQuestion, finishCheckup, resetCheckup } = checkupSlice.actions
export default checkupSlice.reducer
