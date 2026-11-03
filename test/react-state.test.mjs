import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes, createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const asModule = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const contentSource = stripTypeScriptTypes(await readFile(new URL('../content.ts', import.meta.url), 'utf8'))
const contentUrl = asModule(contentSource)
const content = await import(contentUrl)
const requireClient = createRequire(new URL('../client/package.json', import.meta.url))
const toolkitUrl = pathToFileURL(join(dirname(requireClient.resolve('@reduxjs/toolkit/package.json')), 'dist/redux-toolkit.modern.mjs')).href

const saved = new Map()
const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, String(value)) },
})
test.after(() => {
  if (previousStorage) Object.defineProperty(globalThis, 'sessionStorage', previousStorage)
  else delete globalThis.sessionStorage
})
test.beforeEach(() => saved.clear())

const sliceUrls = new Map()
async function loadSlice(name) {
  const source = stripTypeScriptTypes(await readFile(new URL(`../client/src/state/${name}.ts`, import.meta.url), 'utf8'))
    .replaceAll("'@content'", JSON.stringify(contentUrl))
    .replaceAll('"@content"', JSON.stringify(contentUrl))
    .replaceAll("'@reduxjs/toolkit'", JSON.stringify(toolkitUrl))
    .replaceAll('"@reduxjs/toolkit"', JSON.stringify(toolkitUrl))
  const url = asModule(source)
  sliceUrls.set(name, url)
  return import(url)
}
// Modules initialize their reducers with empty storage; direct loader calls are tested separately.
const game = await loadSlice('gameSlice')
const checkup = await loadSlice('checkupSlice')
const storeSource = stripTypeScriptTypes(await readFile(new URL('../client/src/store.ts', import.meta.url), 'utf8'))
  .replaceAll("'@reduxjs/toolkit'", JSON.stringify(toolkitUrl))
  .replaceAll("'./state/gameSlice'", JSON.stringify(sliceUrls.get('gameSlice')))
  .replaceAll("'./state/checkupSlice'", JSON.stringify(sliceUrls.get('checkupSlice')))
const { store } = await import(asModule(storeSource))
const emptyGame = () => ({ selectedClues: [], activeEdits: [], foundFindings: [] })
const emptyCheckup = () => ({ answers: {}, current: 0, done: false })
const clue = content.clues[0].id
const edit = content.editActions[0].id
const finding = content.findings[0].id
const completeAnswers = Object.fromEntries(content.questions.map(question => [question.id, question.options[0].id]))
function save(key, value) { saved.set(key, JSON.stringify(value)) }

test('a dispatch persists both branches before returning so immediate reload cannot lose the latest choice', () => {
  store.dispatch(game.toggleClue(clue))
  assert.deepEqual(JSON.parse(saved.get(game.gameStorageKey)).selectedClues, [clue])
  const [questionId, optionId] = Object.entries(completeAnswers)[0]
  store.dispatch(checkup.answer({ questionId, optionId }))
  assert.equal(JSON.parse(saved.get(checkup.checkupStorageKey)).answers[questionId], optionId)
  store.dispatch(game.resetGame())
  store.dispatch(checkup.resetCheckup())
  assert.deepEqual(JSON.parse(saved.get(game.gameStorageKey)), emptyGame())
  assert.deepEqual(JSON.parse(saved.get(checkup.checkupStorageKey)), emptyCheckup())
})

test('valid game progress is restored without losing any branch field', () => {
  const expected = { selectedClues: [clue], activeEdits: [edit], foundFindings: [finding] }
  save(game.gameStorageKey, expected)
  assert.deepEqual(game.loadInitialGame(), expected)
})

test('malformed game JSON starts an empty game', () => {
  for (const raw of ['{broken', 'null', '42', '[]']) {
    saved.set(game.gameStorageKey, raw)
    assert.deepEqual(game.loadInitialGame(), emptyGame())
  }
})

test('restored game progress excludes unknown identifiers and removes duplicates', () => {
  save(game.gameStorageKey, {
    selectedClues: [clue, 'missing-clue', clue],
    activeEdits: [edit, 'missing-edit', edit],
    foundFindings: [finding, 'missing-finding', finding],
  })
  assert.deepEqual(game.loadInitialGame(), { selectedClues: [clue], activeEdits: [edit], foundFindings: [finding] })
})

test('a completed valid assessment survives restoration', () => {
  const expected = { answers: completeAnswers, current: content.questions.length - 1, done: true }
  save(checkup.checkupStorageKey, expected)
  assert.deepEqual(checkup.loadInitialCheckup(), expected)
})

test('broken assessment JSON and array answers cannot become completed assessments', () => {
  for (const raw of ['{broken', 'null', '[]', JSON.stringify({ answers: [], current: 0, done: true })]) {
    saved.set(checkup.checkupStorageKey, raw)
    assert.deepEqual(checkup.loadInitialCheckup(), emptyCheckup())
  }
})

test('unknown question IDs and invalid option IDs are dropped before completion is trusted', () => {
  const question = content.questions[0]
  save(checkup.checkupStorageKey, {
    answers: { [question.id]: 'missing-option', 'missing-question': question.options[0].id },
    current: 0, done: true,
  })
  assert.deepEqual(checkup.loadInitialCheckup(), emptyCheckup())
})

test('valid assessment answers are preserved while unrelated IDs are discarded', () => {
  save(checkup.checkupStorageKey, { answers: { ...completeAnswers, 'missing-question': 'yes' }, current: 0, done: true })
  const restored = checkup.loadInitialCheckup()
  assert.deepEqual(restored.answers, completeAnswers)
  assert.equal(restored.done, true)
})

test('done flag cannot bypass missing answers and restore position points at first missing question', () => {
  save(checkup.checkupStorageKey, { answers: {}, current: 999, done: true })
  assert.deepEqual(checkup.loadInitialCheckup(), emptyCheckup())
})

test('completed assessment position is bounded to the available questions', () => {
  save(checkup.checkupStorageKey, { answers: completeAnswers, current: 999, done: true })
  assert.equal(checkup.loadInitialCheckup().current, content.questions.length - 1)
})

test('game reducer can toggle choices and reset without retaining completed progress', () => {
  let state = game.default(undefined, { type: 'init' })
  state = game.default(state, game.toggleClue(clue))
  state = game.default(state, game.toggleEdit(edit))
  state = game.default(state, game.markFindingFound(finding))
  assert.deepEqual(state, { selectedClues: [clue], activeEdits: [edit], foundFindings: [finding] })
  assert.deepEqual(game.default(state, game.resetGame()), emptyGame())
  assert.deepEqual(state.foundFindings, [finding], 'reset must not mutate earlier snapshots')
})

test('checkup reducer records answers and resets both progress and completion', () => {
  let state = checkup.default(undefined, { type: 'init' })
  for (const [questionId, optionId] of Object.entries(completeAnswers)) {
    state = checkup.default(state, checkup.answer({ questionId, optionId }))
  }
  state = checkup.default(state, checkup.finishCheckup())
  assert.equal(state.done, true)
  assert.deepEqual(state.answers, completeAnswers)
  assert.deepEqual(checkup.default(state, checkup.resetCheckup()), emptyCheckup())
  assert.equal(state.done, true, 'reset must not mutate earlier snapshots')
})
