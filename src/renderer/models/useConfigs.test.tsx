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
    // The catch block logs a diagnostic via console.error; that is the
    // expected behavior on this path, so silence it to keep test output clean.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.actions.configUpdate.mockRejectedValue(new Error('disk full'))
    mocks.actions.configAll.mockResolvedValue({ theme: 'system', http_api_on: false })
    const { result } = renderHook(() => useConfigs())

    await expect(
      act(async () => {
        await result.current.updateConfigs({ http_api_on: true })
      }),
    ).rejects.toThrow('disk full')

    // After failure the optimistic merge must be replaced with the
    // disk snapshot so other atom subscribers don't see a phantom save.
    expect(mocks.actions.configAll).toHaveBeenCalledTimes(1)
    expect(mocks.setConfigs).toHaveBeenLastCalledWith({ theme: 'system', http_api_on: false })
    expect(mocks.notify.showErrorNotification).toHaveBeenCalledTimes(1)
    const args = mocks.notify.showErrorNotification.mock.calls[0]?.[0]
    expect(args?.title).toBe('Failed to save configuration')
    expect(args?.message).toBe('disk full')
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('publishes HTTP settings only after commit even if configs reload during the save', async () => {
    let resolveUpdate!: () => void
    mocks.actions.configUpdate.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveUpdate = resolve
      }),
    )
    mocks.actions.configAll.mockResolvedValue({ theme: 'dark', http_api_on: false })
    const { result } = renderHook(() => useConfigs())
    let update!: Promise<void>
    act(() => {
      update = result.current.updateConfigs(
        { http_api_on: true },
        { optimistic: false, notifyError: false },
      )
    })
    expect(mocks.configsState.current?.http_api_on).toBe(false)
    await act(async () => {
      await result.current.loadConfigs()
    })
    await act(async () => {
      resolveUpdate()
      await update
    })
    expect(mocks.configsState.current).toEqual({ theme: 'dark', http_api_on: true })
  })

  it('keeps rejected HTTP settings out of shared state and lets the caller show the error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.actions.configUpdate.mockRejectedValue(new Error('port occupied'))
    mocks.actions.configAll.mockResolvedValue({ theme: 'system', http_api_on: false })
    const { result } = renderHook(() => useConfigs())
    await expect(
      act(async () => {
        await result.current.updateConfigs(
          { http_api_on: true },
          { optimistic: false, notifyError: false },
        )
      }),
    ).rejects.toThrow('port occupied')
    expect(mocks.setConfigs.mock.calls.every(([value]) => value.http_api_on === false)).toBe(true)
    expect(mocks.notify.showErrorNotification).not.toHaveBeenCalled()
  })

  it('does not let a delayed read overwrite a committed HTTP port', async () => {
    let resolveRead!: (value: unknown) => void
    mocks.actions.configAll
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRead = resolve
        }),
      )
      .mockResolvedValue({ theme: 'system', http_api_port: 40761 })
    mocks.actions.configUpdate.mockResolvedValue(undefined)
    const { result } = renderHook(() => useConfigs())
    let read!: ReturnType<typeof result.current.loadConfigs>
    act(() => {
      read = result.current.loadConfigs()
    })
    await act(async () => {
      await result.current.updateConfigs({ http_api_port: 40761 }, { optimistic: false })
      resolveRead({ theme: 'system', http_api_port: 50761 })
      expect((await read).http_api_port).toBe(40761)
    })
    expect(mocks.configsState.current?.http_api_port).toBe(40761)
  })

  it('uses the newest read when requests from separate hook instances finish out of order', async () => {
    let resolveRead!: (value: unknown) => void
    mocks.actions.configAll
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRead = resolve
        }),
      )
      .mockResolvedValue({ http_api_port: 40762 })
    const first = renderHook(() => useConfigs())
    const second = renderHook(() => useConfigs())
    let read!: ReturnType<typeof first.result.current.loadConfigs>
    act(() => {
      read = first.result.current.loadConfigs()
    })
    await act(async () => {
      await second.result.current.loadConfigs()
      resolveRead({ http_api_port: 50761 })
      expect((await read).http_api_port).toBe(40762)
    })
    expect(mocks.configsState.current?.http_api_port).toBe(40762)
  })

  it('keeps a committed port when a read and write resolve in the same turn', async () => {
    let resolveRead!: (value: unknown) => void
    let resolveUpdate!: () => void
    mocks.actions.configAll
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRead = resolve
        }),
      )
      .mockResolvedValue({ http_api_port: 40761 })
    mocks.actions.configUpdate.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveUpdate = resolve
      }),
    )
    const { result } = renderHook(() => useConfigs())
    await act(async () => {
      const read = result.current.loadConfigs()
      const update = result.current.updateConfigs({ http_api_port: 40761 }, { optimistic: false })
      resolveRead({ http_api_port: 50761 })
      resolveUpdate()
      await Promise.all([read, update])
    })
    expect(mocks.configsState.current?.http_api_port).toBe(40761)
  })
})
