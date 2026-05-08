import { expect, test as base, type Locator, type Page } from '@playwright/test'

const tauriMockPath = `${process.cwd()}/e2e/support/tauri-mock.js`

export const selectAllModifier = process.platform === 'darwin' ? 'Meta' : 'Control'
export const initialSystemHosts = '127.0.0.1 localhost\n255.255.255.255 broadcasthost\n'

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

export const test = base.extend({
  page: async ({ page }, run) => {
    await openApp(page)
    await run(page)
  },
})

export { expect }

export async function openApp(page: Page) {
  await page.addInitScript({ path: tauriMockPath })
  await gotoApp(page)
}

export async function gotoApp(page: Page, path = '/') {
  await page.goto(path)
  await expect(page.getByText('System Hosts').first()).toBeVisible()
  await expect(page.locator('.cm-content')).toBeVisible()
}

export async function getMockState(page: Page): Promise<MockState> {
  return await page.evaluate<MockState>(() => window.__SWITCHHOSTS_E2E__.getState())
}

export async function getMockCalls(page: Page): Promise<MockCall[]> {
  return await page.evaluate<MockCall[]>(() => window.__SWITCHHOSTS_E2E__.getCalls())
}

export async function clearMockCalls(page: Page): Promise<void> {
  await page.evaluate(() => window.__SWITCHHOSTS_E2E__.clearCalls())
}

export function firstInvokeArg(call: MockCall): unknown {
  return call.args?.args?.[0]
}

export function configPatches(calls: MockCall[]): unknown[] {
  return calls.filter((call) => call.cmd === 'config_update').map(firstInvokeArg)
}

export function setListPayloads(calls: MockCall[]): MockHostEntry[][] {
  return calls
    .filter((call) => call.cmd === 'set_list')
    .map((call) => firstInvokeArg(call))
    .filter((list): list is MockHostEntry[] => Array.isArray(list))
}

function flattenEntries(items: MockHostEntry[]): MockHostEntry[] {
  return items.flatMap((item) => [item, ...flattenEntries(item.children ?? [])])
}

export function findEntry(state: MockState, id: string): MockHostEntry | undefined {
  return flattenEntries(state.list).find((item) => item.id === id)
}

export async function chooseSelectOption(
  page: Page,
  container: Locator,
  selectLabel: string,
  optionName: string,
) {
  await container.getByLabel(selectLabel, { exact: true }).click()
  await page.getByRole('option', { name: optionName, exact: true }).click()
}

export async function moveLocalDevToTrashcan(page: Page) {
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
