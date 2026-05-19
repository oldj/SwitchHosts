// @vitest-environment jsdom
/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import type { ITreeNodeData } from '@common/tree'
import { createEvent, fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import Tree from './Tree'

const NODE_HEIGHT = 20

let restoreOffsetHeight: (() => void) | null = null

beforeAll(() => {
  // jsdom has no layout — Tree.onDragOver reads offsetHeight to
  // decide before/in/after, so we stub it for every HTMLElement.
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => NODE_HEIGHT,
  })
  restoreOffsetHeight = () => {
    if (original) {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', original)
    } else {
      delete (HTMLElement.prototype as any).offsetHeight
    }
  }
})

afterAll(() => {
  restoreOffsetHeight?.()
})

const ids = (list: ITreeNodeData[] | undefined): string[] => (list ?? []).map((n) => n.id)

interface HarnessProps {
  initial_data: ITreeNodeData[]
  initial_selected?: string[]
  onChange: (tree: ITreeNodeData[]) => void
}

const Harness = ({ initial_data, initial_selected = [], onChange }: HarnessProps) => {
  const [selectedIds, setSelectedIds] = useState<string[]>(initial_selected)
  return (
    <Tree
      data={initial_data}
      selectedIds={selectedIds}
      onSelect={setSelectedIds}
      onChange={onChange}
      allowedMultipleSelection
      nodeRender={(n) => <span data-testid={`label-${n.id}`}>{n.title || n.id}</span>}
    />
  )
}

const dragOverWith = (target: HTMLElement, offsetY: number) => {
  // jsdom's MouseEvent has offsetY as a readonly getter (it returns
  // 0), so assigning event.offsetY=N is a silent no-op. Build the
  // event via RTL.createEvent (so React routes it), then forcibly
  // redefine offsetY on the instance before dispatch — Tree.onDragOver
  // reads via `e.nativeEvent.offsetY`.
  const event = createEvent.dragOver(target)
  Object.defineProperty(event, 'offsetY', { value: offsetY, configurable: true })
  fireEvent(target, event)
}

const findNode = (container: HTMLElement, id: string): HTMLElement => {
  const el = container.querySelector(`[data-id="${id}"]`)
  if (!el) throw new Error(`node #${id} not found`)
  return el as HTMLElement
}

const lastReceivedTree = (onChange: ReturnType<typeof vi.fn>): ITreeNodeData[] => {
  expect(onChange).toHaveBeenCalled()
  return onChange.mock.calls[onChange.mock.calls.length - 1][0] as ITreeNodeData[]
}

describe('Tree DnD dispatch', () => {
  const tree: ITreeNodeData[] = [
    { id: 'a', title: 'A' },
    { id: 'b', title: 'B' },
    { id: 'c', title: 'C' },
  ]

  it('dragging an unselected node moves only that node', () => {
    const onChange = vi.fn()
    const { container } = render(<Harness initial_data={tree} onChange={onChange} />)

    fireEvent.dragStart(findNode(container, 'a'))
    // bottom quarter of c → 'after'
    dragOverWith(findNode(container, 'c'), NODE_HEIGHT - 2)
    fireEvent.dragEnd(findNode(container, 'c'))

    expect(ids(lastReceivedTree(onChange))).toEqual(['b', 'c', 'a'])
  })

  it('dragging a node inside the current multi-selection moves the whole selection', () => {
    const onChange = vi.fn()
    const { container } = render(
      <Harness initial_data={tree} initial_selected={['a', 'b']} onChange={onChange} />,
    )

    fireEvent.dragStart(findNode(container, 'a'))
    dragOverWith(findNode(container, 'c'), NODE_HEIGHT - 2)
    fireEvent.dragEnd(findNode(container, 'c'))

    expect(ids(lastReceivedTree(onChange))).toEqual(['c', 'a', 'b'])
  })

  it('dragging a node outside the current multi-selection only moves that one node', () => {
    const onChange = vi.fn()
    const { container } = render(
      <Harness initial_data={tree} initial_selected={['a', 'b']} onChange={onChange} />,
    )

    fireEvent.dragStart(findNode(container, 'c'))
    // top quarter of a → 'before'
    dragOverWith(findNode(container, 'a'), 1)
    fireEvent.dragEnd(findNode(container, 'a'))

    expect(ids(lastReceivedTree(onChange))).toEqual(['c', 'a', 'b'])
  })
})

describe('Tree reorder DOM reconciliation', () => {
  // Each Node's key is `node.id`, so React's keyed reconciliation
  // physically moves the same DOM elements around on a reorder
  // rather than replacing them. Other code (drag indicators,
  // hover tracking, focus, etc.) implicitly depends on this.
  it('preserves DOM node identity for keyed children across a reorder', () => {
    const initial: ITreeNodeData[] = [
      { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' },
    ]
    const reordered: ITreeNodeData[] = [
      { id: 'a' }, { id: 'd' }, { id: 'b' }, { id: 'c' }, { id: 'e' },
    ]

    const onChange = vi.fn()
    const { container, rerender } = render(
      <Harness initial_data={initial} onChange={onChange} />,
    )

    const before = {
      a: findNode(container, 'a'),
      b: findNode(container, 'b'),
      c: findNode(container, 'c'),
      d: findNode(container, 'd'),
      e: findNode(container, 'e'),
    }

    rerender(<Harness initial_data={reordered} onChange={onChange} />)

    const after = {
      a: findNode(container, 'a'),
      b: findNode(container, 'b'),
      c: findNode(container, 'c'),
      d: findNode(container, 'd'),
      e: findNode(container, 'e'),
    }

    expect(after.a).toBe(before.a)
    expect(after.b).toBe(before.b)
    expect(after.c).toBe(before.c)
    expect(after.d).toBe(before.d)
    expect(after.e).toBe(before.e)
  })
})
