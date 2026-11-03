const key = 'tracecheck-v1'

export function readSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key))
    return {
      selected: Array.isArray(saved?.selected) ? saved.selected : [],
      edits: Array.isArray(saved?.edits) ? saved.edits : [],
      answer: typeof saved?.answer === 'string' ? saved.answer : null,
    }
  } catch {
    return { selected: [], edits: [], answer: null }
  }
}

export function saveSession(session) {
  try {
    sessionStorage.setItem(key, JSON.stringify(session))
  } catch {
    // Текущий сеанс остаётся рабочим, если браузер запретил хранилище.
  }
}
