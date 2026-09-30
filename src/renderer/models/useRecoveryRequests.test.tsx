// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import events from '@common/events'

const mocks = vi.hoisted(() => ({
  requested: false,
  readyHandler: null as null | (() => Promise<void>),
  reapply: vi.fn(),
  notify: vi.fn(),
  request: vi.fn(),
  take: vi.fn(),
  handlers: new Map<string, Set<() => Promise<void>>>(),
}))
vi.mock('@renderer/core/agent', () => ({
  actions: { requestHostsRecovery: mocks.request, takeHostsRecoveryRequest: mocks.take },
  agent: {
    on: (event: string, handler: () => Promise<void>) => {
      if (!mocks.handlers.has(event)) mocks.handlers.set(event, new Set())
      mocks.handlers.get(event)!.add(handler)
      return () => mocks.handlers.get(event)!.delete(handler)
    },
  },
}))
vi.mock('./useHostsData', () => ({
  default: () => ({ applicationRecovery: { status: 'unknown' }, reapplySavedList: mocks.reapply }),
}))
vi.mock('./useI18n', () => ({
  default: () => ({
    lang: { hosts_reapply_saved: 'Recover', hosts_application_unknown: 'Unknown', fail: 'Failed' },
  }),
}))
vi.mock('@renderer/core/notify', () => ({
  showErrorNotification: mocks.notify,
  getErrorMessage: (error: Error) => error.message,
}))
import useRecoveryRequests from './useRecoveryRequests'
import ApplicationRecoveryNotice from '@renderer/components/ApplicationRecoveryNotice'

async function wake() {
  await Promise.all(
    [...(mocks.handlers.get(events.reapply_saved_hosts) || [])].map((handler) => handler()),
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.requested = false
  mocks.handlers.clear()
  mocks.take.mockImplementation(async () => {
    const requested = mocks.requested
    mocks.requested = false
    return requested
  })
  mocks.request.mockImplementation(async () => {
    mocks.requested = true
    await wake()
  })
  mocks.reapply.mockResolvedValue(true)
})
afterEach(cleanup)

it('retains a tray-only request until a recreated main page finishes loading', async () => {
  const original = renderHook(() => useRecoveryRequests(true))
  original.unmount() // lightweight mode destroys the main renderer
  const tray = render(<ApplicationRecoveryNotice />)
  await act(async () => {
    fireEvent.click(tray.getByRole('button', { name: 'Recover' }))
  })
  expect(mocks.requested).toBe(true)
  expect(mocks.reapply).not.toHaveBeenCalled()
  const main = renderHook(({ ready }) => useRecoveryRequests(ready), {
    initialProps: { ready: false },
  })
  await act(wake)
  expect(mocks.requested).toBe(true)
  main.rerender({ ready: true })
  await waitFor(() => expect(mocks.reapply).toHaveBeenCalledTimes(1))
  await act(wake)
  expect(mocks.reapply).toHaveBeenCalledTimes(1)
})

it('consumes a wake-up in an already ready main page exactly once', async () => {
  renderHook(() => useRecoveryRequests(true))
  const tray = render(<ApplicationRecoveryNotice />)
  await act(async () => {
    fireEvent.click(tray.getByRole('button', { name: 'Recover' }))
  })
  await act(wake)
  expect(mocks.reapply).toHaveBeenCalledTimes(1)
})

it('reports a failed backend recovery request instead of silently dropping it', async () => {
  mocks.request.mockRejectedValue(new Error('cannot open main window'))
  const tray = render(<ApplicationRecoveryNotice />)
  await act(async () => {
    fireEvent.click(tray.getByRole('button', { name: 'Recover' }))
  })
  expect(mocks.notify).toHaveBeenCalledWith({ title: 'Failed', message: 'cannot open main window' })
  expect(mocks.reapply).not.toHaveBeenCalled()
})
