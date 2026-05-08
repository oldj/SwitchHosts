import { expect, test, type Page } from '@playwright/test'

const tauriMockPath = `${process.cwd()}/e2e/support/tauri-mock.js`

const selectAllModifier = process.platform === 'darwin' ? 'Meta' : 'Control'

interface MockHostEntry {
  id: string
  title?: string
  type?: string
  on?: boolean
}

interface MockState {
  list: MockHostEntry[]
  contents: Record<string, string>
  systemHosts: string
}

interface MockCall {
  cmd: string
}

declare global {
  interface Window {
    __SWITCHHOSTS_E2E__: {
      getState: () => MockState
      getCalls: () => MockCall[]
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
})
