import { describe, expect, it } from 'vitest'
import {
  changeImportSelection,
  importedTree,
  importSelectedIds,
  importSelectionState,
} from './import'
import type { IHostsListObject } from './data'

const nested: IHostsListObject = {
  id: 'nested',
  type: 'folder',
  children: [{ id: 'a', type: 'local' }],
}
const folder: IHostsListObject = {
  id: 'folder',
  type: 'folder',
  children: [nested, { id: 'b', type: 'local' }, { id: 'empty', type: 'folder', children: [] }],
}
const group: IHostsListObject = { id: 'group', type: 'group', include: ['folder'] }
const outer: IHostsListObject = { id: 'outer', type: 'group', include: ['group'] }
const list = [folder, group, outer]

describe('import selection', () => {
  it('selects the complete folder including nested and empty folders', () => {
    const { selected } = changeImportSelection(list, new Set(), folder, true)
    expect([...selected]).toEqual(['a', 'b', 'empty'])
    expect(importSelectedIds(list, selected)).toEqual(['folder', 'nested', 'a', 'b', 'empty'])
  })
  it('keeps ancestor paths for partial selections without importing siblings', () => {
    const selected = new Set(['a'])
    expect(importSelectionState(folder, selected)).toEqual({ checked: false, indeterminate: true })
    expect(importSelectedIds(list, selected)).toEqual(['nested', 'a'])
    expect(importedTree(list, selected)[0].children).toHaveLength(1)
    expect(importedTree(list, selected)[0].children?.[0].children?.[0].id).toBe('a')
  })
  it('selects dependencies and removes dependent groups transitively on deselection', () => {
    const all = changeImportSelection(list, new Set(), outer, true).selected
    expect(importSelectionState(folder, all).checked).toBe(true)
    const result = changeImportSelection(list, all, nested, false)
    expect([...result.selected]).toEqual(['b', 'empty'])
    expect(result.removedGroups).toBe(true)
  })
})
