// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listeners: [] as Array<(...args: unknown[]) => unknown>,
  off: vi.fn(),
}))
vi.mock('./agent', () => ({
  agent: {
    on: (_event: string, handler: (...args: unknown[]) => unknown) => {
      mocks.listeners.push(handler)
      // Leave native callbacks reachable, simulating delayed IPC unlisten.
      return mocks.off
    },
  },
}))
import useOnBroadcast from './useOnBroadcast'

beforeEach(() => {
  mocks.listeners.length = 0
  mocks.off.mockClear()
})
afterEach(cleanup)

it('handles a toggle only once while the replaced native subscription is still alive', () => {
  const apply = vi.fn()
  const { rerender } = renderHook(
    ({ revision }) => {
      useOnBroadcast('toggle_item', (id, on) => apply(id, on, revision), [revision])
    },
    { initialProps: { revision: 1 } },
  )
  rerender({ revision: 2 })
  expect(mocks.off).toHaveBeenCalledTimes(1)
  act(() => mocks.listeners.forEach((listener) => listener('group', true)))
  expect(apply).toHaveBeenCalledExactlyOnceWith('group', true, 2)
})

it('ignores late native events after the window component unmounts', () => {
  const apply = vi.fn()
  const { unmount } = renderHook(() => useOnBroadcast('toggle_item', apply))
  unmount()
  act(() => mocks.listeners.forEach((listener) => listener('local', true)))
  expect(apply).not.toHaveBeenCalled()
})
