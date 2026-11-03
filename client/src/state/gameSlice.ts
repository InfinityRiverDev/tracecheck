import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { clues, editActions, findings } from '@content'

const clueIds = new Set(clues.map(item => item.id))
const editIds = new Set(editActions.map(item => item.id))
const findingIds = new Set(findings.map(item => item.id))
const validIds = (values: string[], allowed: Set<string>) => [...new Set(values.filter(id => allowed.has(id)))]

// Игровая ветка: выбранные улики, активные правки поста, найденные выводы.
export interface GameSlice {
  selectedClues: string[]
  activeEdits: string[]
  foundFindings: string[]
}

const initialState: GameSlice = {
  selectedClues: [],
  activeEdits: [],
  foundFindings: [],
}

export const gameStorageKey = 'tracecheck-react-game-v1'

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

export function loadInitialGame(): GameSlice {
  try {
    const saved = JSON.parse(sessionStorage.getItem(gameStorageKey) ?? 'null')
    if (
      isStringArray(saved?.selectedClues) &&
      isStringArray(saved?.activeEdits) &&
      isStringArray(saved?.foundFindings)
    ) {
      return {
        selectedClues: validIds(saved.selectedClues, clueIds),
        activeEdits: validIds(saved.activeEdits, editIds),
        foundFindings: validIds(saved.foundFindings, findingIds),
      }
    }
  } catch {
    // Повреждённое сохранение игнорируем — стартуем с чистого состояния.
  }
  return initialState
}

const gameSlice = createSlice({
  name: 'game',
  initialState: loadInitialGame(),
  reducers: {
    toggleClue(state, action: PayloadAction<string>) {
      const id = action.payload
      if (!clueIds.has(id)) return
      state.selectedClues = state.selectedClues.includes(id)
        ? state.selectedClues.filter(clue => clue !== id)
        : [...state.selectedClues, id]
    },
    toggleEdit(state, action: PayloadAction<string>) {
      const id = action.payload
      if (!editIds.has(id)) return
      state.activeEdits = state.activeEdits.includes(id)
        ? state.activeEdits.filter(edit => edit !== id)
        : [...state.activeEdits, id]
    },
    markFindingFound(state, action: PayloadAction<string>) {
      if (!findingIds.has(action.payload)) return
      if (!state.foundFindings.includes(action.payload)) {
        state.foundFindings.push(action.payload)
      }
    },
    resetGame() {
      return initialState
    },
  },
})

export const { toggleClue, toggleEdit, markFindingFound, resetGame } = gameSlice.actions
export default gameSlice.reducer
