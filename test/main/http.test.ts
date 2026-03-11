import { ipcMain } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { http_api_port } from '../../src/common/constants'
import events from '../../src/common/events'
import { setList } from '../../src/main/actions'
import { clearData } from '../_base'

const { closeMock, serveMock } = vi.hoisted(() => {
  const close = vi.fn()
  const serve = vi.fn((options: object, callback?: () => void) => {
    callback?.()
    return {
      close,
      options,
    }
  })

  return {
    closeMock: close,
    serveMock: serve,
  }
})

vi.mock('@hono/node-server', () => ({
  serve: serveMock,
}))

import { app, start, stop } from '../../src/main/http'

describe('http api test', () => {
  beforeEach(async () => {
    await clearData()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    serveMock.mockClear()
    closeMock.mockClear()
  })

  it('should log request metadata for incoming requests', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const response = await app.request('/api/list', {
      headers: {
        'user-agent': 'vitest',
      },
    })

    expect(response.status).toBe(200)
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^> ".+"$/),
      'GET',
      '/api/list',
      '"vitest"',
    )
  })

  it('should respond on root endpoint', async () => {
    const response = await app.request('/')

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('Hello SwitchHosts!')
  })

  it('should respond on remote test endpoint', async () => {
    const response = await app.request('/remote-test')

    expect(response.status).toBe(200)
    expect(await response.text()).toMatch(/^# remote-test\n# .+/)
  })

  it('should flatten list data for api list endpoint', async () => {
    await setList([
      { id: 'top-1', title: 'Top 1' },
      {
        id: 'folder-1',
        type: 'folder',
        children: [
          { id: 'child-1', title: 'Child 1' },
          { id: 'child-2', title: 'Child 2' },
        ],
      },
    ])

    const response = await app.request('/api/list')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.map((item: { id: string }) => item.id)).toEqual([
      'top-1',
      'folder-1',
      'child-1',
      'child-2',
    ])
  })

  it('should reject toggle requests without id', async () => {
    const response = await app.request('/api/toggle')

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('bad id.')
  })

  it('should return not found for unknown toggle id', async () => {
    const response = await app.request('/api/toggle?id=missing')

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('not found.')
  })

  it('should broadcast toggle event for existing item', async () => {
    const emitSpy = vi.spyOn(ipcMain, 'emit')

    await setList([
      { id: 'item-1', on: false, title: 'Item 1' },
    ])

    const response = await app.request('/api/toggle?id=item-1')

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('ok')
    expect(emitSpy).toHaveBeenCalledWith('x_broadcast', null, {
      event: events.toggle_item,
      args: [ 'item-1', true ],
    })
  })

  it('should listen on localhost when local-only mode is enabled', () => {
    expect(start(true)).toBe(true)
    expect(serveMock.mock.calls[0]?.[0]).toEqual({
      fetch: app.fetch,
      port: http_api_port,
      hostname: '127.0.0.1',
    })
    expect(typeof serveMock.mock.calls[0]?.[1]).toBe('function')

    stop()
    expect(closeMock).toHaveBeenCalledOnce()
  })

  it('should listen on all interfaces when local-only mode is disabled', () => {
    expect(start(false)).toBe(true)
    expect(serveMock.mock.calls[0]?.[0]).toEqual({
      fetch: app.fetch,
      port: http_api_port,
      hostname: '0.0.0.0',
    })
    expect(typeof serveMock.mock.calls[0]?.[1]).toBe('function')

    stop()
    expect(closeMock).toHaveBeenCalledOnce()
  })

  it('should return false when serve throws', () => {
    const error = new Error('listen failed')
    serveMock.mockImplementationOnce(() => {
      throw error
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(start(true)).toBe(false)
    expect(errorSpy).toHaveBeenCalledWith(error)
  })

  it('should swallow close errors when stopping server', () => {
    const error = new Error('close failed')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failingClose = vi.fn(() => {
      throw error
    })

    serveMock.mockImplementationOnce((options: object, callback?: () => void) => {
      callback?.()
      return {
        close: failingClose,
        options,
      }
    })

    expect(start(true)).toBe(true)

    stop()

    expect(errorSpy).toHaveBeenCalledWith(error)
  })
})
