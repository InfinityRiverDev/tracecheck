import { configureStore } from '@reduxjs/toolkit'
import gameReducer, { gameStorageKey } from './state/gameSlice'
import checkupReducer, { checkupStorageKey } from './state/checkupSlice'

export const store = configureStore({
  reducer: {
    game: gameReducer,
    checkup: checkupReducer,
  },
})

// Небольшое состояние записывается сразу, чтобы быстрый F5 не терял последний выбор.
store.subscribe(() => {
  try {
    const state = store.getState()
    sessionStorage.setItem(gameStorageKey, JSON.stringify(state.game))
    sessionStorage.setItem(checkupStorageKey, JSON.stringify(state.checkup))
  } catch {
    // Хранилище недоступно — приложение продолжает работать без сохранения.
  }
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
