// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  actions: {
    configAll: vi.fn(),
    configUpdate: vi.fn(),
  },
  notify: {
    showErrorNotification: vi.fn(),
    getErrorMessage: vi.fn((e: unknown, fallback: string) =>
      e instanceof Error && e.message ? e.message : fallback,
    ),
  },
  configsState: { current: null as Record<string, unknown> | null },
  setConfigs: vi.fn(),
}))

vi.mock('@renderer/core/agent', () => ({
  actions: mocks.actions,
}))

vi.mock('@renderer/core/notify', () => ({
  showErrorNotification: mocks.notify.showErrorNotification,
  getErrorMessage: mocks.notify.getErrorMessage,
}))

vi.mock('jotai', () => ({
  useAtom: () => [
    mocks.configsState.current,
    (update: unknown) => {
      const next =
        typeof update === 'function'
          ? (update as (prev: unknown) => unknown)(mocks.configsState.current)
          : update
      mocks.configsState.current = next as Record<string, unknown> | null
      mocks.setConfigs(next)
    },
  ],
}))

vi.mock('@renderer/stores/configs', () => ({
  configsAtom: { __mock_atom: 'configs' },
}))

import useConfigs from './useConfigs'

describe('useConfigs', () => {
  beforeEach(() => {
    mocks.actions.configAll.mockReset()
    mocks.actions.configUpdate.mockReset()
    mocks.notify.showErrorNotification.mockReset()
    mocks.setConfigs.mockReset()
    mocks.configsState.current = { theme: 'system', http_api_on: false }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loadConfigs replaces state with the agent payload', async () => {
    mocks.actions.configAll.mockResolvedValue({ theme: 'dark', http_api_on: true })
    const { result } = renderHook(() => useConfigs())

    await act(async () => {
      await result.current.loadConfigs()
    })

    expect(mocks.actions.configAll).toHaveBeenCalledTimes(1)
    expect(mocks.setConfigs).toHaveBeenLastCalledWith({ theme: 'dark', http_api_on: true })
  })

  it('updateConfigs optimistically merges the patch before awaiting the backend', async () => {
    // Hold the configUpdate promise so we can observe the optimistic
    // setConfigs call before the backend resolves.
    let resolveUpdate!: () => void
    mocks.actions.configUpdate.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveUpdate = resolve
      }),
    )

    const { result } = renderHook(() => useConfigs())

    let updatePromise!: Promise<void>
    act(() => {
      updatePromise = result.current.updateConfigs({ theme: 'dark' })
    })

    // The optimistic merge must already have happened.
    expect(mocks.setConfigs).toHaveBeenLastCalledWith({ theme: 'dark', http_api_on: false })

    await act(async () => {
      resolveUpdate()
      await updatePromise
    })

    expect(mocks.actions.configUpdate).toHaveBeenCalledWith({ theme: 'dark' })
    expect(mocks.notify.showErrorNotification).not.toHaveBeenCalled()
  })

  it('updateConfigs surfaces backend failures via showErrorNotification and rethrows', async () => {
    mocks.actions.configUpdate.mockRejectedValue(new Error('disk full'))
    const { result } = renderHook(() => useConfigs())

    await expect(
      act(async () => {
        await result.current.updateConfigs({ http_api_on: true })
      }),
    ).rejects.toThrow('disk full')

    expect(mocks.notify.showErrorNotification).toHaveBeenCalledTimes(1)
    const args = mocks.notify.showErrorNotification.mock.calls[0]?.[0]
    expect(args?.title).toBe('Failed to save configuration')
    expect(args?.message).toBe('disk full')
  })
})
