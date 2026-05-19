/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import type { ITreeNodeData } from '@common/tree'
import { describe, expect, it } from 'vitest'
import { treeMoveNode } from './fn'

const makeTree = (): ITreeNodeData[] => [
  { id: 'a' },
  { id: 'b' },
  {
    id: 'f1',
    type: 'folder',
    children: [
      { id: 'c' },
      { id: 'd' },
    ],
  },
  { id: 'e' },
]

const ids = (list: ITreeNodeData[] | undefined): string[] => (list ?? []).map((n) => n.id)

describe('treeMoveNode', () => {
  it('moves a single node "before" a target at the same level', () => {
    const tree = makeTree()
    const moved = treeMoveNode(tree, ['e'], 'a', 'before')!
    expect(moved).not.toBeNull()
    expect(ids(moved)).toEqual(['e', 'a', 'b', 'f1'])
  })

  it('moves a single node "after" a target at the same level', () => {
    const tree = makeTree()
    const moved = treeMoveNode(tree, ['a'], 'b', 'after')!
    expect(ids(moved)).toEqual(['b', 'a', 'f1', 'e'])
  })

  it('moves a single node "in" a folder, appending to its children', () => {
    const tree = makeTree()
    const moved = treeMoveNode(tree, ['e'], 'f1', 'in')!
    const folder = moved.find((n) => n.id === 'f1')!
    expect(ids(moved)).toEqual(['a', 'b', 'f1'])
    expect(ids(folder.children)).toEqual(['c', 'd', 'e'])
  })

  it('moves a node out of a folder back to the root', () => {
    const tree = makeTree()
    const moved = treeMoveNode(tree, ['c'], 'a', 'before')!
    const folder = moved.find((n) => n.id === 'f1')!
    expect(ids(moved)).toEqual(['c', 'a', 'b', 'f1', 'e'])
    expect(ids(folder.children)).toEqual(['d'])
  })

  it('moves multiple selected nodes together preserving their order', () => {
    const tree = makeTree()
    // multi-select drag of [a, b] dropped after e
    const moved = treeMoveNode(tree, ['a', 'b'], 'e', 'after')!
    expect(ids(moved)).toEqual(['f1', 'e', 'a', 'b'])
  })

  it('moves multiple selected nodes from inside a folder out to root', () => {
    const tree = makeTree()
    const moved = treeMoveNode(tree, ['c', 'd'], 'e', 'before')!
    const folder = moved.find((n) => n.id === 'f1')!
    expect(ids(moved)).toEqual(['a', 'b', 'f1', 'c', 'd', 'e'])
    expect(ids(folder.children)).toEqual([])
  })

  it('refuses to drop a node onto itself', () => {
    const tree = makeTree()
    const moved = treeMoveNode(tree, ['a'], 'a', 'before')
    expect(moved).toBeNull()
  })

  it('does not mutate the original tree', () => {
    const tree = makeTree()
    const snapshot = JSON.stringify(tree)
    treeMoveNode(tree, ['a'], 'b', 'after')
    expect(JSON.stringify(tree)).toEqual(snapshot)
  })

  it('drops "in" an empty/leaf node initialises children and inserts there', () => {
    const tree = makeTree()
    const moved = treeMoveNode(tree, ['e'], 'a', 'in')!
    const a = moved.find((n) => n.id === 'a')!
    expect(ids(moved)).toEqual(['a', 'b', 'f1'])
    expect(ids(a.children)).toEqual(['e'])
  })
})
