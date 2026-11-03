import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

async function loadTypeScript(path) {
  const source = stripTypeScriptTypes(await readFile(path, 'utf8'))
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

const { evaluateHabits, hasCompleteAnswers } = await loadTypeScript(
  process.env.TRACECHECK_ASSESSMENT_SOURCE ?? new URL('../client/src/engine/assessment.ts', import.meta.url),
)
const content = await loadTypeScript(new URL('../content.ts', import.meta.url))

test('a completed report requires valid answers to every question, regardless of a saved done flag', () => {
  assert.equal(hasCompleteAnswers({}, content.questions), false)
  assert.equal(hasCompleteAnswers({ 'ticket-details': 'invalid' }, content.questions), false)
  assert.equal(hasCompleteAnswers({ 'ticket-details': 'hidden' }, content.questions), true)
  const twoQuestions = [...content.questions, { id: 'second', options: [{ id: 'yes' }] }]
  assert.equal(hasCompleteAnswers({ 'ticket-details': 'hidden' }, twoQuestions), false)
  assert.equal(hasCompleteAnswers({ 'ticket-details': 'hidden', second: 'yes' }, twoQuestions), true)
  assert.equal(hasCompleteAnswers({}, []), false)
})
const question = id => ({
  id, topic: id, label: `Question ${id}`,
  options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }],
})
const recommendation = id => ({ id, title: id, action: `Do ${id}`, topic: 'test' })
const rule = (id, priority, recommendationId, conditions = [{ questionId: 'q1', optionId: 'yes' }]) => ({
  id, priority, recommendationIds: [recommendationId], conditions, explanation: `Reason ${id}`,
})

test('visible ticket details produce explained urgent advice from real content', () => {
  const result = evaluateHabits({ 'ticket-details': 'visible' }, content)
  assert.deepEqual(result.risksFired, ['visible-ticket-details'])
  assert.equal(result.topAdvice.length, 1)
  assert.equal(result.topAdvice[0].recommendation.id, 'hide-ticket-details')
  assert.equal(result.topAdvice[0].status, 'В первую очередь')
  assert.equal(result.topAdvice[0].causes[0].answerLabel, 'Да, видны')
  assert.deepEqual(result.keptHabits, [])
  assert.deepEqual(result.unknowns, [])
})

test('hidden ticket details keep a positive habit without generating risk advice', () => {
  const result = evaluateHabits({ 'ticket-details': 'hidden' }, content)
  assert.deepEqual(result.risksFired, [])
  assert.deepEqual(result.topAdvice, [])
  assert.equal(result.keptHabits.length, 1)
  assert.equal(result.keptHabits[0].topic, 'Билеты и документы')
  assert.deepEqual(result.unknowns, [])
})

test('unknown ticket details remain unknown and produce clarification advice', () => {
  const result = evaluateHabits({ 'ticket-details': 'unknown' }, content)
  assert.deepEqual(result.risksFired, ['unknown-ticket-details'])
  assert.equal(result.topAdvice[0].recommendation.id, 'check-ticket-details')
  assert.equal(result.unknowns.length, 1)
  assert.equal(result.unknowns[0].answerLabel, 'Не уверен')
  assert.deepEqual(result.keptHabits, [])
})

test('unknown question and option IDs are excluded from assessment', () => {
  const result = evaluateHabits({ 'ticket-details': 'not-an-option', 'not-a-question': 'visible' }, content)
  assert.deepEqual(result, {
    risksFired: [], topAdvice: [], otherAdvice: [], keptHabits: [], unknowns: [],
  })
})

test('multi-question rules require every condition rather than any condition', () => {
  const custom = {
    questions: [question('q1'), question('q2')],
    recommendations: [recommendation('combined')],
    riskRules: [rule('both', 1, 'combined', [
      { questionId: 'q1', optionId: 'yes' }, { questionId: 'q2', optionId: 'yes' },
    ])],
  }
  for (const answers of [{ q1: 'yes' }, { q1: 'yes', q2: 'no' }, { q1: 'no', q2: 'yes' }]) {
    assert.deepEqual(evaluateHabits(answers, custom).risksFired, [])
  }
  assert.deepEqual(evaluateHabits({ q1: 'yes', q2: 'yes' }, custom).risksFired, ['both'])
})

for (const order of ['low-first', 'urgent-first']) {
  test(`deduplication preserves causes and highest urgency (${order})`, () => {
    const urgent = rule('urgent', 1, 'shared')
    const low = rule('low', 3, 'shared', [{ questionId: 'q2', optionId: 'yes' }])
    const custom = {
      questions: [question('q1'), question('q2')],
      recommendations: [recommendation('shared')],
      riskRules: order === 'low-first' ? [low, urgent] : [urgent, low],
    }
    const result = evaluateHabits({ q1: 'yes', q2: 'yes' }, custom)
    assert.equal(result.topAdvice.length, 1)
    assert.equal(result.topAdvice[0].priority, 1)
    assert.equal(result.topAdvice[0].status, 'В первую очередь')
    assert.deepEqual(new Set(result.topAdvice[0].causes.map(cause => cause.ruleExplanation)),
      new Set(['Reason urgent', 'Reason low']))
    assert.equal(result.topAdvice[0].causes.length, 2)
  })
}

test('report selects the top three urgent actions and retains ordered remaining advice', () => {
  const priorities = [4, 1, 3, 2, 5]
  const custom = {
    questions: [question('q1')],
    recommendations: priorities.map((_, index) => recommendation(`advice-${index}`)),
    riskRules: priorities.map((priority, index) => rule(`rule-${index}`, priority, `advice-${index}`)),
  }
  const result = evaluateHabits({ q1: 'yes' }, custom)
  assert.deepEqual(result.topAdvice.map(advice => advice.recommendation.id), ['advice-1', 'advice-3', 'advice-2'])
  assert.deepEqual(result.otherAdvice.map(advice => advice.recommendation.id), ['advice-0', 'advice-4'])
  assert.deepEqual([...result.topAdvice, ...result.otherAdvice].map(advice => advice.priority), [1, 2, 3, 4, 5])
})
