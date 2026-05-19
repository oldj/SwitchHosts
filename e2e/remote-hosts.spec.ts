import {
  chooseSelectOption,
  clearMockCalls,
  expect,
  getMockCalls,
  getMockState,
  setListPayloads,
  showRightPanel,
  test,
} from './support/test'

test.describe('remote hosts', () => {
  test('refreshes a remote hosts entry and updates its details', async ({ page }) => {
    await page.locator('[data-id="remote-blocklist"]').click()
    await showRightPanel(page)
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
    await showRightPanel(page)
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
    await showRightPanel(page)
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
})
