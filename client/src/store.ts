import { configureStore } from '@reduxjs/toolkit'
import gameReducer, { gameStorageKey } from './state/gameSlice'
import checkupReducer, { checkupStorageKey } from './state/checkupSlice'

export const store = configureStore({
  reducer: {
    game: gameReducer,
    checkup: checkupReducer,
  },
})

// Сохранение с дебаунсом: состояние переживает F5 в текущей вкладке.
let persistTimer: number | undefined
store.subscribe(() => {
  window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(() => {
    try {
      const state = store.getState()
      sessionStorage.setItem(gameStorageKey, JSON.stringify(state.game))
      sessionStorage.setItem(checkupStorageKey, JSON.stringify(state.checkup))
    } catch {
      // Хранилище недоступно — приложение продолжает работать без сохранения.
    }
  }, 150)
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
