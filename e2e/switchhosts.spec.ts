import { expect, test, type Page } from '@playwright/test'

const tauriMockPath = `${process.cwd()}/e2e/support/tauri-mock.js`

const selectAllModifier = process.platform === 'darwin' ? 'Meta' : 'Control'
const initialSystemHosts = '127.0.0.1 localhost\n255.255.255.255 broadcasthost\n'

interface MockHostEntry {
  id: string
  title?: string
  type?: string
  on?: boolean
  last_refresh?: string
}

interface MockState {
  list: MockHostEntry[]
  trashcan: Array<{ data: MockHostEntry }>
  configs: {
    theme: string
    write_mode: string
    choice_mode: number
  }
  contents: Record<string, string>
  systemHosts: string
}

interface MockCall {
  cmd: string
  args?: {
    args?: unknown[]
    [key: string]: unknown
  }
}

declare global {
  interface Window {
    __SWITCHHOSTS_E2E__: {
      getState: () => MockState
      getCalls: () => MockCall[]
      clearCalls: () => void
      failNextApply: (result?: { code?: string; message?: string }) => void
    }
  }
}

async function openApp(page: Page) {
  await page.addInitScript({ path: tauriMockPath })
  await page.goto('/')
  await expect(page.getByText('System Hosts').first()).toBeVisible()
  await expect(page.locator('.cm-content')).toBeVisible()
}

async function getMockState(page: Page): Promise<MockState> {
  return await page.evaluate<MockState>(() => window.__SWITCHHOSTS_E2E__.getState())
}

async function getMockCalls(page: Page): Promise<MockCall[]> {
  return await page.evaluate<MockCall[]>(() => window.__SWITCHHOSTS_E2E__.getCalls())
}

async function clearMockCalls(page: Page): Promise<void> {
  await page.evaluate(() => window.__SWITCHHOSTS_E2E__.clearCalls())
}

function firstInvokeArg(call: MockCall): unknown {
  return call.args?.args?.[0]
}

test.describe('SwitchHosts renderer e2e', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page)
  })

  test('loads system hosts details and the read-only editor', async ({ page }) => {
    await expect(page.getByText('/etc/hosts')).toBeVisible()
    await expect(page.locator('.cm-content')).toContainText('localhost')
    await expect(page.getByText('Read Only').first()).toBeVisible()
    await expect(page.getByText('Rules')).toBeVisible()
  })

  test('selects a local hosts entry and saves editor changes', async ({ page }) => {
    await page.locator('[data-id="local-dev"]').click()

    await expect(page.locator('.cm-content')).toContainText('dev.local')
    await expect(page.getByText('Development').first()).toBeVisible()

    const editor = page.locator('.cm-content')
    await editor.click()
    await page.keyboard.press(`${selectAllModifier}+A`)
    await page.keyboard.type('127.0.0.1 edited.local\n')

    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return state.contents['local-dev']
      })
      .toBe('127.0.0.1 edited.local\n')

    const calls = await getMockCalls(page)
    expect(calls.some((call) => call.cmd === 'set_hosts_content')).toBe(true)
  })

  test('toggles a local hosts entry and applies the generated system hosts', async ({ page }) => {
    const row = page.locator('[data-id="local-dev"]')
    await row.click()

    const toggle = row.getByRole('switch')
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await toggle.click()

    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return {
          localDevOn: state.list.find((item) => item.id === 'local-dev')?.on,
          systemHosts: state.systemHosts,
        }
      })
      .toEqual({
        localDevOn: true,
        systemHosts:
          '127.0.0.1 localhost\n255.255.255.255 broadcasthost\n\n\n# --- SWITCHHOSTS_CONTENT_START ---\n\n127.0.0.1 dev.local\n::1 dev.local\n\n\n10.0.0.8 api.local\n# 10.0.0.9 api-shadow.local\n',
      })

    const calls = await getMockCalls(page)
    expect(calls.some((call) => call.cmd === 'get_content_of_list')).toBe(true)
    expect(calls.some((call) => call.cmd === 'apply_hosts_selection')).toBe(true)
  })

  test('adds a local hosts entry from the top bar', async ({ page }) => {
    await page.getByLabel('Add').click()
    await expect(page.getByText('Add Hosts Entry')).toBeVisible()

    await page.locator('input:not([type="radio"])').first().fill('QA Sandbox')
    await page.getByRole('button', { name: 'OK' }).click()

    await expect(page.getByText('QA Sandbox').first()).toBeVisible()
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return state.list.some((item) => item.title === 'QA Sandbox')
      })
      .toBe(true)
  })

  test('opens system hosts history from the details panel', async ({ page }) => {
    await page.locator('button').filter({ hasText: 'Show History' }).click()

    await expect(page.getByText('System Hosts Version History')).toBeVisible()
    await expect(page.locator('.cm-content').last()).toContainText('api.local')
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible()
  })

  test('edits a hosts entry title and refreshes list, header, and details', async ({ page }) => {
    await page.locator('[data-id="local-dev"]').click()
    await page.getByRole('button', { name: 'Edit' }).click()

    await expect(page.getByText('Edit Hosts')).toBeVisible()
    await page.locator('input:not([type="radio"])').first().fill('Development Edited')
    await page.getByRole('button', { name: 'OK' }).click()

    await expect(page.locator('[data-id="local-dev"]')).toContainText('Development Edited')
    await expect
      .poll(async () => await page.getByText('Development Edited').count())
      .toBeGreaterThanOrEqual(3)
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return state.list.find((item) => item.id === 'local-dev')?.title
      })
      .toBe('Development Edited')
  })

  test('moves an entry to trashcan and restores it', async ({ page }) => {
    await page.locator('[data-id="local-dev"]').click()
    await page.getByRole('button', { name: 'Edit' }).click()
    await page.getByRole('button', { name: 'Move to Trashcan' }).click()

    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return {
          inList: state.list.some((item) => item.id === 'local-dev'),
          inTrashcan: state.trashcan.some((item) => item.data.id === 'local-dev'),
        }
      })
      .toEqual({ inList: false, inTrashcan: true })

    await page.getByLabel('Trashcan').click()
    await page.locator('[data-id="local-dev"]').click()
    await page.getByRole('button', { name: 'Restore' }).click()

    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return {
          inList: state.list.some((item) => item.id === 'local-dev'),
          inTrashcan: state.trashcan.some((item) => item.data.id === 'local-dev'),
        }
      })
      .toEqual({ inList: true, inTrashcan: false })

    await page.getByLabel('Hosts').click()
    await expect(page.locator('[data-id="local-dev"]')).toContainText('Development')
  })

  test('refreshes a remote hosts entry and updates its details', async ({ page }) => {
    await page.locator('[data-id="remote-blocklist"]').click()
    await expect(page.getByText('2026-05-08 10:00:00')).toBeVisible()

    await page.getByRole('button', { name: 'Refresh' }).click()

    await expect(page.getByText('2026-05-08 12:00:00')).toBeVisible()
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return state.list.find((item) => item.id === 'remote-blocklist')?.last_refresh
      })
      .toBe('2026-05-08 12:00:00')

    const calls = await getMockCalls(page)
    expect(calls.some((call) => call.cmd === 'refresh_remote_hosts')).toBe(true)
  })

  test('rolls back the switch when applying hosts fails', async ({ page }) => {
    await clearMockCalls(page)
    await page.evaluate(() => {
      window.__SWITCHHOSTS_E2E__.failNextApply({
        code: 'cancelled',
        message: 'User cancelled',
      })
    })

    const row = page.locator('[data-id="local-dev"]')
    await row.click()

    const toggle = row.getByRole('switch')
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await toggle.click()

    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return {
          localDevOn: state.list.find((item) => item.id === 'local-dev')?.on,
          systemHosts: state.systemHosts,
        }
      })
      .toEqual({
        localDevOn: false,
        systemHosts: initialSystemHosts,
      })

    const calls = await getMockCalls(page)
    expect(calls.some((call) => call.cmd === 'get_content_of_list')).toBe(true)
    expect(calls.some((call) => call.cmd === 'apply_hosts_selection')).toBe(true)
  })

  test('saves basic preferences immediately', async ({ page }) => {
    await clearMockCalls(page)

    await page.getByLabel('Settings').click()
    await page.getByText('Preferences').click()
    await expect(page.getByText('General')).toBeVisible()

    await page.getByText('Dark').click()
    await page.getByText('Overwrite').click()
    await page.getByText('Single').click()

    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return state.configs
      })
      .toMatchObject({
        theme: 'dark',
        write_mode: 'overwrite',
        choice_mode: 1,
      })

    const calls = await getMockCalls(page)
    const configPatches = calls.filter((call) => call.cmd === 'config_update').map(firstInvokeArg)
    expect(configPatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ theme: 'dark' }),
        expect.objectContaining({ write_mode: 'overwrite' }),
        expect.objectContaining({ choice_mode: 1 }),
      ]),
    )
  })
})
