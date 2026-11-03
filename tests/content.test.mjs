import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

const source = stripTypeScriptTypes(await readFile(new URL('../content.ts', import.meta.url), 'utf8'))
const content = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const { posts, clues, findings, editActions, questions, riskRules, recommendations } = content
const byId = items => new Map(items.map(item => [item.id, item]))
const postById = byId(posts)
const clueById = byId(clues)
const questionById = byId(questions)
const recommendationById = byId(recommendations)

function uniqueIds(items, label) {
  assert.ok(items.length > 0, `${label}: content is empty`)
  for (const item of items) assert.ok(typeof item.id === 'string' && item.id.length > 0, `${label}: missing ID`)
  assert.equal(new Set(items.map(item => item.id)).size, items.length, `${label}: duplicate IDs`)
}

test('each content collection has nonempty unique identifiers', () => {
  for (const name of ['posts', 'clues', 'findings', 'editActions', 'questions', 'riskRules', 'recommendations']) {
    uniqueIds(content[name], name)
  }
  for (const question of questions) uniqueIds(question.options, `options of ${question.id}`)
})

test('posts refer only to their own existing clues', () => {
  for (const post of posts) {
    assert.ok(post.clueIds.length > 0, `${post.id}: no clues`)
    assert.equal(new Set(post.clueIds).size, post.clueIds.length, `${post.id}: repeated clue`)
    for (const id of post.clueIds) {
      assert.ok(clueById.has(id), `${post.id}: missing clue ${id}`)
      assert.equal(clueById.get(id).postId, post.id, `${post.id}: foreign clue ${id}`)
    }
  }
})

test('every clue has an existing source post that lists it', () => {
  for (const clue of clues) {
    const post = postById.get(clue.postId)
    assert.ok(post, `${clue.id}: missing post ${clue.postId}`)
    assert.ok(post.clueIds.includes(clue.id), `${clue.id}: not listed by its source post`)
  }
})

test('findings require nonempty groups of existing clues', () => {
  for (const finding of findings) {
    assert.ok(finding.requiredClueGroups.length > 0, `${finding.id}: no conditions`)
    for (const group of finding.requiredClueGroups) {
      assert.ok(group.length > 0, `${finding.id}: empty condition group`)
      for (const id of group) assert.ok(clueById.has(id), `${finding.id}: missing clue ${id}`)
    }
  }
})

test('edits hide existing clues belonging to the edited post', () => {
  for (const edit of editActions) {
    assert.ok(postById.has(edit.postId), `${edit.id}: missing post ${edit.postId}`)
    assert.ok(edit.hidesClueIds.length > 0, `${edit.id}: hides no clues`)
    for (const id of edit.hidesClueIds) {
      assert.ok(clueById.has(id), `${edit.id}: missing clue ${id}`)
      assert.equal(clueById.get(id).postId, edit.postId, `${edit.id}: hides a different post's clue ${id}`)
    }
  }
})

test('risk rules reference valid question options and existing recommendations', () => {
  for (const rule of riskRules) {
    assert.ok(rule.conditions.length > 0, `${rule.id}: no conditions`)
    assert.ok(rule.recommendationIds.length > 0, `${rule.id}: no advice`)
    for (const condition of rule.conditions) {
      const question = questionById.get(condition.questionId)
      assert.ok(question, `${rule.id}: missing question ${condition.questionId}`)
      assert.ok(question.options.some(option => option.id === condition.optionId), `${rule.id}: missing option ${condition.optionId}`)
    }
    for (const id of rule.recommendationIds) {
      assert.ok(recommendationById.has(id), `${rule.id}: missing recommendation ${id}`)
    }
  }
})

test('each post has the image used by the feed', async () => {
  await Promise.all(posts.map(post => access(new URL(`../web/${post.id}.svg`, import.meta.url))))
})