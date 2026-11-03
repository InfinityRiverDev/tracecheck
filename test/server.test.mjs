import test from 'node:test'
import assert from 'node:assert/strict'
import { isValidSessionId, normalizeState } from '../server.mjs'

test('session ids are opaque and bounded', () => {
  assert.equal(isValidSessionId('abc_DEF-123456789012345'), true)
  assert.equal(isValidSessionId('short'), false)
  assert.equal(isValidSessionId('../not-a-session-id-value'), false)
})

test('state normalization keeps only supported anonymous progress', () => {
  const state = normalizeState({
    selected: ['address-sign', 'address-sign', '<script>'],
    edits: ['hide-sign'],
    answer: 'visible',
    answers: { audience: 'public', '<bad>': 'x', routine: 42 },
    email: 'must-not-be-stored@example.test',
    updatedAt: 42,
  })
  assert.deepEqual(state, {
    version: 1,
    selected: ['address-sign'],
    edits: ['hide-sign'],
    answer: 'visible',
    answers: { audience: 'public' },
    updatedAt: 42,
  })
  assert.equal('email' in state, false)
})
