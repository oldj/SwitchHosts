import { expect, test, type Locator, type Page } from '@playwright/test'

const tauriMockPath = `${process.cwd()}/e2e/support/tauri-mock.js`

const selectAllModifier = process.platform === 'darwin' ? 'Meta' : 'Control'
const initialSystemHosts = '127.0.0.1 localhost\n255.255.255.255 broadcasthost\n'

interface MockHostEntry {
  id: string
  title?: string
  type?: string
  on?: boolean
  url?: string
  refresh_interval?: number
  last_refresh?: string
  last_refresh_ms?: number
  include?: string[]
  folder_mode?: number
  children?: MockHostEntry[]
}

interface MockState {
  list: MockHostEntry[]
  trashcan: Array<{ data: MockHostEntry }>
  configs: {
    theme: string
    write_mode: string | null
    choice_mode: number
    left_panel_show: boolean
    right_panel_show: boolean
  }
  contents: Record<string, string>
  systemHosts: string
  history: Array<{ id: string; content: string }>
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
      failNextRefresh: (result?: { code?: string; message?: string }) => void
    }
  }
}

async function openApp(page: Page) {
  await page.addInitScript({ path: tauriMockPath })
  await gotoApp(page)
}

async function gotoApp(page: Page, path = '/') {
  await page.goto(path)
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

function configPatches(calls: MockCall[]): unknown[] {
  return calls.filter((call) => call.cmd === 'config_update').map(firstInvokeArg)
}

function setListPayloads(calls: MockCall[]): MockHostEntry[][] {
  return calls
    .filter((call) => call.cmd === 'set_list')
    .map((call) => firstInvokeArg(call))
    .filter((list): list is MockHostEntry[] => Array.isArray(list))
}

function flattenEntries(items: MockHostEntry[]): MockHostEntry[] {
  return items.flatMap((item) => [item, ...flattenEntries(item.children ?? [])])
}

function findEntry(state: MockState, id: string): MockHostEntry | undefined {
  return flattenEntries(state.list).find((item) => item.id === id)
}

async function chooseSelectOption(
  page: Page,
  container: Locator,
  selectLabel: string,
  optionName: string,
) {
  await container.getByLabel(selectLabel, { exact: true }).click()
  await page.getByRole('option', { name: optionName, exact: true }).click()
}

async function moveLocalDevToTrashcan(page: Page) {
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
    const drawer = page.getByRole('dialog')
    await expect(drawer.getByText('Add Hosts Entry')).toBeVisible()

    await drawer.getByLabel('Hosts Title', { exact: true }).fill('QA Sandbox')
    await drawer.getByRole('button', { name: 'OK' }).click()

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

    const drawer = page.getByRole('dialog')
    await expect(drawer.getByText('Edit Hosts')).toBeVisible()
    await drawer.getByLabel('Hosts Title', { exact: true }).fill('Development Edited')
    await drawer.getByRole('button', { name: 'OK' }).click()

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
    await moveLocalDevToTrashcan(page)

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

  test('permanently deletes a trashcan item from the details panel', async ({ page }) => {
    await moveLocalDevToTrashcan(page)
    await clearMockCalls(page)

    await page.getByLabel('Trashcan').click()
    await page.locator('[data-id="local-dev"]').click()
    await page.getByRole('button', { name: 'Delete' }).click()

    const confirm = page.getByRole('dialog')
    await expect(confirm.getByText('Do you want to delete this item completely?')).toBeVisible()
    await confirm.getByRole('button', { name: 'Delete' }).click()

    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return {
          inList: state.list.some((item) => item.id === 'local-dev'),
          inTrashcan: state.trashcan.some((item) => item.data.id === 'local-dev'),
        }
      })
      .toEqual({ inList: false, inTrashcan: false })
    await expect(page.getByText('Trashcan is empty')).toBeVisible()

    const calls = await getMockCalls(page)
    expect(calls.some((call) => call.cmd === 'delete_item_from_trashcan')).toBe(true)
  })

  test('cancels and then confirms emptying the trashcan', async ({ page }) => {
    await moveLocalDevToTrashcan(page)
    await clearMockCalls(page)

    await page.getByLabel('Trashcan').click()
    await page.getByLabel('Empty Trashcan').click()
    await page
      .getByRole('dialog', { name: 'Empty Trashcan' })
      .getByRole('button', { name: 'Cancel' })
      .click()
    await expect(page.getByRole('dialog', { name: 'Empty Trashcan' })).toBeHidden()

    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return state.trashcan.map((item) => item.data.id)
      })
      .toEqual(['local-dev'])

    await page.getByRole('button', { name: 'Empty Trashcan' }).click()
    await page
      .getByRole('dialog', { name: 'Empty Trashcan' })
      .getByRole('button', { name: 'Delete' })
      .click()

    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return state.trashcan
      })
      .toEqual([])
    await expect(page.getByText('Trashcan is empty')).toBeVisible()

    const calls = await getMockCalls(page)
    expect(calls.some((call) => call.cmd === 'clear_trashcan')).toBe(true)
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

  test('creates and edits a remote hosts entry', async ({ page }) => {
    await clearMockCalls(page)

    await page.getByLabel('Add').click()
    let drawer = page.getByRole('dialog')
    await expect(drawer.getByText('Add Hosts Entry')).toBeVisible()

    await drawer.getByText('Remote', { exact: true }).click()
    await drawer.getByLabel('Hosts Title', { exact: true }).fill('QA Remote')
    await drawer.getByLabel('URL', { exact: true }).fill('https://example.test/qa.hosts')
    await chooseSelectOption(page, drawer, 'Auto Refresh', '1 hour')
    await drawer.getByRole('button', { name: 'OK' }).click()

    const row = page.locator('[data-id]').filter({ hasText: 'QA Remote' })
    await expect(row).toBeVisible()
    await row.click()
    await expect(page.getByText('https://example.test/qa.hosts')).toBeVisible()
    await expect(page.locator('#root').getByText('1 hour', { exact: true })).toBeVisible()
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        const remote = state.list.find((item) => item.title === 'QA Remote')
        return {
          type: remote?.type,
          url: remote?.url,
          refreshInterval: remote?.refresh_interval,
        }
      })
      .toEqual({
        type: 'remote',
        url: 'https://example.test/qa.hosts',
        refreshInterval: 3600,
      })

    await page.getByRole('button', { name: 'Edit' }).click()
    drawer = page.getByRole('dialog')
    await expect(drawer.getByText('Edit Hosts')).toBeVisible()
    await drawer.getByLabel('Hosts Title', { exact: true }).fill('QA Remote Edited')
    await drawer.getByLabel('URL', { exact: true }).fill('https://example.test/qa-edited.hosts')
    await chooseSelectOption(page, drawer, 'Auto Refresh', '1 day')
    await drawer.getByRole('button', { name: 'OK' }).click()

    await expect(row).toContainText('QA Remote Edited')
    await expect(page.getByText('https://example.test/qa-edited.hosts')).toBeVisible()
    await expect(page.locator('#root').getByText('1 day', { exact: true })).toBeVisible()
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        const remote = state.list.find((item) => item.title === 'QA Remote Edited')
        return {
          type: remote?.type,
          url: remote?.url,
          refreshInterval: remote?.refresh_interval,
        }
      })
      .toEqual({
        type: 'remote',
        url: 'https://example.test/qa-edited.hosts',
        refreshInterval: 86400,
      })

    const latestSetList = setListPayloads(await getMockCalls(page)).at(-1)
    expect(
      latestSetList?.some(
        (item) =>
          item.title === 'QA Remote Edited' &&
          item.type === 'remote' &&
          item.url === 'https://example.test/qa-edited.hosts' &&
          item.refresh_interval === 86400,
      ),
    ).toBe(true)
  })

  test('keeps remote refresh metadata unchanged when refresh fails', async ({ page }) => {
    await clearMockCalls(page)
    await page.evaluate(() => {
      window.__SWITCHHOSTS_E2E__.failNextRefresh({
        code: 'network',
        message: 'Network unavailable',
      })
    })

    await page.locator('[data-id="remote-blocklist"]').click()
    await expect(page.getByText('2026-05-08 10:00:00')).toBeVisible()
    await page.getByRole('button', { name: 'Refresh' }).click()

    await expect(page.getByText('2026-05-08 10:00:00')).toBeVisible()
    await expect(page.getByText('2026-05-08 12:00:00')).toHaveCount(0)
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        const remote = state.list.find((item) => item.id === 'remote-blocklist')
        return {
          lastRefresh: remote?.last_refresh,
          lastRefreshMs: remote?.last_refresh_ms,
        }
      })
      .toEqual({
        lastRefresh: '2026-05-08 10:00:00',
        lastRefreshMs: 1778196000000,
      })

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
    const preferences = page.getByRole('dialog')
    await expect(preferences.getByText('General')).toBeVisible()

    await preferences.getByText('Dark', { exact: true }).click()
    await preferences.getByText('Overwrite', { exact: true }).click()
    await preferences.getByText('Single', { exact: true }).click()

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
    expect(configPatches(calls)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ theme: 'dark' }),
        expect.objectContaining({ write_mode: 'overwrite' }),
        expect.objectContaining({ choice_mode: 1 }),
      ]),
    )
  })

  test('applies global single-choice mode to top-level hosts', async ({ page }) => {
    await page.getByLabel('Settings').click()
    await page.getByText('Preferences').click()
    const preferences = page.getByRole('dialog')
    await expect(preferences.getByText('General')).toBeVisible()
    await preferences.getByText('Single', { exact: true }).click()
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return state.configs.choice_mode
      })
      .toBe(1)
    await page.keyboard.press('Escape')
    await expect(preferences).toBeHidden()
    await clearMockCalls(page)

    const localDev = page.locator('[data-id="local-dev"]')
    const localApi = page.locator('[data-id="local-api"]')
    await expect(localApi.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    await localDev.getByRole('switch').click()

    await expect(localDev.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    await expect(localApi.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return {
          localDevOn: findEntry(state, 'local-dev')?.on,
          localApiOn: findEntry(state, 'local-api')?.on,
          hasDev: state.systemHosts.includes('dev.local'),
          hasApi: state.systemHosts.includes('api.local'),
        }
      })
      .toEqual({ localDevOn: true, localApiOn: false, hasDev: true, hasApi: false })

    const calls = await getMockCalls(page)
    expect(calls.some((call) => call.cmd === 'apply_hosts_selection')).toBe(true)
  })

  test('deletes a system hosts history entry', async ({ page }) => {
    await page.locator('button').filter({ hasText: 'Show History' }).click()
    await expect(page.getByText('System Hosts Version History')).toBeVisible()
    await expect(page.locator('.cm-content').last()).toContainText('api.local')

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Delete' }).click()

    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return state.history.map((item) => item.id)
      })
      .toEqual(['history-1'])
    await expect(page.locator('.cm-content').last()).not.toContainText('api.local')

    const calls = await getMockCalls(page)
    expect(calls.some((call) => call.cmd === 'delete_apply_history_item')).toBe(true)
  })

  test('creates a group hosts entry and shows included items', async ({ page }) => {
    await clearMockCalls(page)

    await page.getByLabel('Add').click()
    const drawer = page.getByRole('dialog')
    await expect(drawer.getByText('Add Hosts Entry')).toBeVisible()

    await drawer.getByText('Group', { exact: true }).click()
    await drawer.getByLabel('Hosts Title', { exact: true }).fill('QA Group')
    await drawer.getByText('API Override').click()
    await drawer.getByRole('button', { name: 'Move to right' }).click()
    await drawer.getByRole('button', { name: 'OK' }).click()

    await expect(page.locator('[data-id]').filter({ hasText: 'QA Group' })).toBeVisible()
    await expect(page.getByText('Content (1)')).toBeVisible()
    await expect(page.getByText('API Override').last()).toBeVisible()
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        const group = state.list.find((item) => item.title === 'QA Group')
        return { type: group?.type, include: group?.include }
      })
      .toEqual({ type: 'group', include: ['local-api'] })

    const latestSetList = setListPayloads(await getMockCalls(page)).at(-1)
    expect(latestSetList?.some((item) => item.title === 'QA Group' && item.type === 'group')).toBe(
      true,
    )
  })

  test('creates a folder hosts entry with single choice mode', async ({ page }) => {
    await clearMockCalls(page)

    await page.getByLabel('Add').click()
    const drawer = page.getByRole('dialog')
    await expect(drawer.getByText('Add Hosts Entry')).toBeVisible()

    await drawer.getByText('Folder', { exact: true }).click()
    await drawer.getByLabel('Hosts Title', { exact: true }).fill('QA Folder')
    await drawer.getByText('Single', { exact: true }).click()
    await drawer.getByRole('button', { name: 'OK' }).click()

    await expect(page.locator('[data-id]').filter({ hasText: 'QA Folder' })).toBeVisible()
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        const folder = state.list.find((item) => item.title === 'QA Folder')
        return {
          type: folder?.type,
          folderMode: folder?.folder_mode,
        }
      })
      .toMatchObject({ type: 'folder', folderMode: 1 })
    await expect(page.locator('#root').getByText('Choice Mode')).toBeVisible()
    await expect(page.locator('#root').getByText('Single').last()).toBeVisible()

    const latestSetList = setListPayloads(await getMockCalls(page)).at(-1)
    expect(
      latestSetList?.some(
        (item) => item.title === 'QA Folder' && item.type === 'folder' && item.folder_mode === 1,
      ),
    ).toBe(true)
  })

  test('toggles side panels and persists layout preferences', async ({ page }) => {
    await clearMockCalls(page)
    await page.locator('[data-id="local-dev"]').click()

    await page.getByLabel('Toggle sidebar').click()
    await expect(page.locator('[data-id="local-dev"]')).not.toBeInViewport()

    await page.getByLabel('Toggle right panel').click()
    await expect(page.getByText('Rules')).not.toBeInViewport()

    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return {
          leftPanelShow: state.configs.left_panel_show,
          rightPanelShow: state.configs.right_panel_show,
        }
      })
      .toEqual({ leftPanelShow: false, rightPanelShow: false })

    expect(configPatches(await getMockCalls(page))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ left_panel_show: false }),
        expect.objectContaining({ right_panel_show: false }),
      ]),
    )
  })

  test('prompts for write mode before first apply and then continues toggling', async ({ page }) => {
    await gotoApp(page, '/?e2eWriteMode=null')
    await clearMockCalls(page)

    const row = page.locator('[data-id="local-dev"]')
    await row.click()

    const toggle = row.getByRole('switch')
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await toggle.click()

    await expect(page.getByText('Set Write Mode')).toBeVisible()
    await page.getByLabel('Append').click()
    await page.getByRole('button', { name: 'OK' }).click()

    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return {
          writeMode: state.configs.write_mode,
          localDevOn: state.list.find((item) => item.id === 'local-dev')?.on,
          systemHosts: state.systemHosts,
        }
      })
      .toEqual({
        writeMode: 'append',
        localDevOn: true,
        systemHosts:
          '127.0.0.1 localhost\n255.255.255.255 broadcasthost\n\n\n# --- SWITCHHOSTS_CONTENT_START ---\n\n127.0.0.1 dev.local\n::1 dev.local\n\n\n10.0.0.8 api.local\n# 10.0.0.9 api-shadow.local\n',
      })

    const calls = await getMockCalls(page)
    expect(configPatches(calls)).toEqual(
      expect.arrayContaining([expect.objectContaining({ write_mode: 'append' })]),
    )
    expect(calls.some((call) => call.cmd === 'apply_hosts_selection')).toBe(true)
  })

  test('exports backup data through the settings menu', async ({ page }) => {
    await clearMockCalls(page)

    await page.getByLabel('Settings').click()
    await page.getByRole('menuitem', { name: 'Export' }).click()

    await expect
      .poll(async () => (await getMockCalls(page)).some((call) => call.cmd === 'export_data'))
      .toBe(true)
  })

  test('imports backup data from a file', async ({ page }) => {
    await clearMockCalls(page)

    await page.getByLabel('Settings').click()
    await page.getByRole('menuitem', { name: /^Import$/ }).click()

    await expect(page.locator('[data-id="imported-local"]')).toContainText('Imported Backup')
    await expect(page.locator('[data-id="imported-folder"]')).toContainText('Imported Folder')
    await expect(page.locator('[data-id="imported-group"]')).toContainText('Imported Group')
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return state.list.map((item) => ({
          id: item.id,
          type: item.type,
          children: item.children?.map((child) => child.id),
        }))
      })
      .toEqual([
        { id: 'imported-local', type: 'local', children: undefined },
        { id: 'imported-folder', type: 'folder', children: ['imported-folder-child'] },
        { id: 'imported-group', type: 'group', children: undefined },
      ])

    const calls = await getMockCalls(page)
    expect(calls.some((call) => call.cmd === 'import_data')).toBe(true)
  })

  test('imports backup data from a URL', async ({ page }) => {
    await clearMockCalls(page)

    const importUrl = 'https://example.test/swh_data.json'
    await page.getByLabel('Settings').click()
    await page.getByRole('menuitem', { name: 'Import from URL' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Import from URL')).toBeVisible()
    await dialog.locator('input').fill(importUrl)
    await dialog.getByRole('button', { name: 'OK' }).click()

    await expect(page.locator('[data-id="imported-url"]')).toContainText('Imported From URL')
    await page.locator('[data-id="imported-url"]').click()
    await expect(page.getByText(importUrl)).toBeVisible()
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return state.list.map((item) => ({ id: item.id, type: item.type, url: item.url }))
      })
      .toEqual([
        { id: 'imported-url', type: 'remote', url: importUrl },
        { id: 'imported-url-local', type: 'local', url: undefined },
      ])

    const calls = await getMockCalls(page)
    const importCall = calls.find((call) => call.cmd === 'import_data_from_url')
    expect(importCall).toBeDefined()
    expect(firstInvokeArg(importCall!)).toBe(importUrl)
  })

  test('enforces single-choice mode for folder children while applying hosts', async ({ page }) => {
    await clearMockCalls(page)

    const alpha = page.locator('[data-id="folder-single-alpha"]')
    const beta = page.locator('[data-id="folder-single-beta"]')
    await expect(alpha).toContainText('Single Alpha')
    await expect(beta).toContainText('Single Beta')

    const alphaToggle = alpha.getByRole('switch')
    const betaToggle = beta.getByRole('switch')
    await expect(alphaToggle).toHaveAttribute('aria-checked', 'false')
    await expect(betaToggle).toHaveAttribute('aria-checked', 'false')

    await alphaToggle.click()
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return {
          alphaOn: findEntry(state, 'folder-single-alpha')?.on,
          betaOn: findEntry(state, 'folder-single-beta')?.on,
          hasAlpha: state.systemHosts.includes('single-alpha.local'),
          hasBeta: state.systemHosts.includes('single-beta.local'),
        }
      })
      .toEqual({ alphaOn: true, betaOn: false, hasAlpha: true, hasBeta: false })

    await betaToggle.click()
    await expect(alphaToggle).toHaveAttribute('aria-checked', 'false')
    await expect(betaToggle).toHaveAttribute('aria-checked', 'true')
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return {
          alphaOn: findEntry(state, 'folder-single-alpha')?.on,
          betaOn: findEntry(state, 'folder-single-beta')?.on,
          hasAlpha: state.systemHosts.includes('single-alpha.local'),
          hasBeta: state.systemHosts.includes('single-beta.local'),
        }
      })
      .toEqual({ alphaOn: false, betaOn: true, hasAlpha: false, hasBeta: true })

    const applyCalls = (await getMockCalls(page)).filter(
      (call) => call.cmd === 'apply_hosts_selection',
    )
    expect(applyCalls).toHaveLength(2)
  })

  test('allows multiple folder children to stay enabled while applying hosts', async ({ page }) => {
    await clearMockCalls(page)

    const alpha = page.locator('[data-id="folder-multiple-alpha"]')
    const beta = page.locator('[data-id="folder-multiple-beta"]')
    await expect(alpha).toContainText('Multiple Alpha')
    await expect(beta).toContainText('Multiple Beta')

    const alphaToggle = alpha.getByRole('switch')
    const betaToggle = beta.getByRole('switch')
    await expect(alphaToggle).toHaveAttribute('aria-checked', 'false')
    await expect(betaToggle).toHaveAttribute('aria-checked', 'false')

    await alphaToggle.click()
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return {
          alphaOn: findEntry(state, 'folder-multiple-alpha')?.on,
          betaOn: findEntry(state, 'folder-multiple-beta')?.on,
          hasAlpha: state.systemHosts.includes('multiple-alpha.local'),
          hasBeta: state.systemHosts.includes('multiple-beta.local'),
        }
      })
      .toEqual({ alphaOn: true, betaOn: false, hasAlpha: true, hasBeta: false })

    await betaToggle.click()
    await expect(alphaToggle).toHaveAttribute('aria-checked', 'true')
    await expect(betaToggle).toHaveAttribute('aria-checked', 'true')
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return {
          alphaOn: findEntry(state, 'folder-multiple-alpha')?.on,
          betaOn: findEntry(state, 'folder-multiple-beta')?.on,
          hasAlpha: state.systemHosts.includes('multiple-alpha.local'),
          hasBeta: state.systemHosts.includes('multiple-beta.local'),
        }
      })
      .toEqual({ alphaOn: true, betaOn: true, hasAlpha: true, hasBeta: true })

    const applyCalls = (await getMockCalls(page)).filter(
      (call) => call.cmd === 'apply_hosts_selection',
    )
    expect(applyCalls).toHaveLength(2)
  })
})
