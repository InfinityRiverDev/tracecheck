import { clues, editActions, findings } from '../../../content'

export const finding = findings[0]

export function matchesFinding(clueIds: readonly string[]) {
  return finding.requiredClueGroups.every(group => group.some(id => clueIds.includes(id)))
}

export function buildDossier(edits: readonly string[]) {
  const hidden = new Set(editActions.filter(edit => edits.includes(edit.id)).flatMap(edit => edit.hidesClueIds))
  const visible = clues.filter(clue => !hidden.has(clue.id))
  return { found: matchesFinding(visible.map(clue => clue.id)), visible }
}
