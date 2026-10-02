import {
  chooseSelectOption,
  clearMockCalls,
  expect,
  getMockCalls,
  getMockState,
  gotoApp,
  selectAllModifier,
  setListPayloads,
  showRightPanel,
  test,
} from './support/test'
import type { Page } from '@playwright/test'

async function startDomainEntry(page: Page, title: string) {
  await page.getByLabel('Add').click()
  const drawer = page.getByRole('dialog')
  await drawer.getByText('Remote', { exact: true }).click()
  await drawer.getByLabel('Hosts Title', { exact: true }).fill(title)
  await drawer.getByText('Domain', { exact: true }).click()
  return drawer
}

async function editEntry(page: Page, title: string) {
  await page.locator('[data-id]').filter({ hasText: title }).click()
  await showRightPanel(page)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  return page.getByRole('dialog')
}

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

  test('pastes a domain list, normalizes URLs, and resolves each unique domain', async ({
    page,
  }) => {
    await clearMockCalls(page)
    const drawer = await startDomainEntry(page, 'Batch Domains')
    const input = drawer.getByRole('textbox', { name: 'Domain list', exact: true })
    await input.fill(
      'https://GitHub.com/features\napi.github.com\n\nGITHUB.COM\nhttps://example.org/docs',
    )
    await input.press(`${selectAllModifier}+Enter`)

    await expect(drawer).not.toBeVisible()
    await expect
      .poll(async () => {
        const entry = (await getMockState(page)).list.find((item) => item.title === 'Batch Domains')
        return {
          source: entry?.source,
          domains: entry?.domains,
          status: entry?.domain_refresh_status,
          results: entry?.domain_results?.map((result) => result.domain),
        }
      })
      .toEqual({
        source: 'domain',
        domains: ['github.com', 'api.github.com', 'example.org'],
        status: 'complete',
        results: ['github.com', 'api.github.com', 'example.org'],
      })
    const state = await getMockState(page)
    const entry = state.list.find((item) => item.title === 'Batch Domains')!
    expect(state.contents[entry.id]).toContain('203.0.113.10 github.com')
    expect(state.contents[entry.id]).toContain('# 203.0.113.110 github.com')
    expect(
      (await getMockCalls(page)).filter((call) => call.cmd === 'refresh_remote_hosts'),
    ).toHaveLength(1)

    // Creation selects the entry itself. Its automatic refresh can finish
    // before that selection, so details must catch up without a second click.
    await showRightPanel(page)
    const rightPanel = page.getByTestId('right-panel')
    await expect(
      rightPanel.getByText('3 updated · 0 using previous IPs · 0 unresolved'),
    ).toBeVisible()
    await expect(rightPanel.getByText('2026-05-08 12:00:00', { exact: true }).first()).toBeVisible()
  })

  test('keeps Enter as a newline and blocks saving an invalid domain line', async ({ page }) => {
    const drawer = await startDomainEntry(page, 'Invalid Domains')
    const input = drawer.getByRole('textbox', { name: 'Domain list', exact: true })
    await clearMockCalls(page)
    await input.fill('github.com')
    await input.press('End')
    await input.press('Enter')
    await input.pressSequentially('not a domain')
    await expect(input).toHaveValue('github.com\nnot a domain')
    await expect(drawer).toBeVisible()
    expect(setListPayloads(await getMockCalls(page))).toHaveLength(0)

    await drawer.getByRole('button', { name: 'OK', exact: true }).click()
    await expect(drawer).toBeVisible()
    await expect(input).toHaveAttribute('aria-invalid', 'true')
    await expect(input).toHaveValue('github.com\nnot a domain')
    expect((await getMockState(page)).list.some((item) => item.title === 'Invalid Domains')).toBe(
      false,
    )
    expect((await getMockCalls(page)).some((call) => call.cmd === 'refresh_remote_hosts')).toBe(
      false,
    )
  })

  test('disables refresh while domain edits are unsaved', async ({ page }) => {
    let drawer = await startDomainEntry(page, 'Editable Domains')
    await drawer
      .getByRole('textbox', { name: 'Domain list', exact: true })
      .fill('github.com\napi.github.com')
    await drawer.getByRole('button', { name: 'OK', exact: true }).click()
    await expect(drawer).not.toBeVisible()

    drawer = await editEntry(page, 'Editable Domains')
    await expect(drawer.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled()
    await clearMockCalls(page)
    await drawer
      .getByRole('textbox', { name: 'Domain list', exact: true })
      .fill('github.com\ndocs.example.org')
    await expect(
      drawer.getByRole('button', { name: 'Save to resolve', exact: true }),
    ).toBeDisabled()
    await drawer.getByRole('button', { name: 'Cancel', exact: true }).click()
    expect(
      (await getMockState(page)).list.find((item) => item.title === 'Editable Domains')?.domains,
    ).toEqual(['github.com', 'api.github.com'])
    expect((await getMockCalls(page)).some((call) => call.cmd === 'refresh_remote_hosts')).toBe(
      false,
    )
  })

  test('shows partial results, keeps cached IPs, and removes deleted domains', async ({ page }) => {
    let drawer = await startDomainEntry(page, 'Partial Domains')
    await drawer
      .getByRole('textbox', { name: 'Domain list', exact: true })
      .fill('github.com\napi.github.com')
    await drawer.getByRole('button', { name: 'OK', exact: true }).click()
    await expect(drawer).not.toBeVisible()

    drawer = await editEntry(page, 'Partial Domains')
    await drawer
      .getByRole('textbox', { name: 'Domain list', exact: true })
      .fill('github.com\nunavailable.example.org\ndocs.example.org')
    await page.evaluate(() =>
      window.__SWITCHHOSTS_E2E__.setNextDomainRefreshFailures({
        'github.com': 'DNS request timed out',
        'unavailable.example.org': 'No A records found',
      }),
    )
    await drawer.getByRole('button', { name: 'OK', exact: true }).click()
    await expect(drawer).not.toBeVisible()
    await expect
      .poll(async () => {
        const entry = (await getMockState(page)).list.find(
          (item) => item.title === 'Partial Domains',
        )
        return entry?.domain_results?.map((result) => [result.domain, result.status])
      })
      .toEqual([
        ['github.com', 'stale'],
        ['unavailable.example.org', 'failed'],
        ['docs.example.org', 'resolved'],
      ])

    const state = await getMockState(page)
    const entry = state.list.find((item) => item.title === 'Partial Domains')!
    expect(entry.domain_refresh_status).toBe('partial')
    expect(state.contents[entry.id]).toContain('203.0.113.10 github.com')
    expect(state.contents[entry.id]).not.toContain('api.github.com')
    expect(state.contents[entry.id]).not.toContain('unavailable.example.org')

    drawer = await editEntry(page, 'Partial Domains')
    const details = drawer.locator('details')
    await expect(details).not.toHaveAttribute('open')
    await expect(drawer.getByText('1 updated · 1 using previous IPs · 1 unresolved')).toBeVisible()
    await details.locator('summary').click()
    await expect(details.getByText('github.com', { exact: true })).toBeVisible()
    await expect(details.getByText('DNS request timed out', { exact: true })).toBeVisible()
    await expect(details.getByText('No A records found', { exact: true })).toBeVisible()
  })

  test('loads and migrates a legacy single-domain entry', async ({ page }) => {
    await gotoApp(page, '/?e2eLegacyDomain=true')
    const drawer = await editEntry(page, 'Legacy Domain')
    const input = drawer.getByRole('textbox', { name: 'Domain list', exact: true })
    await expect(input).toHaveValue('github.com')
    await input.fill('github.com\napi.github.com')
    await drawer.getByRole('button', { name: 'OK', exact: true }).click()
    await expect
      .poll(async () => {
        const entry = (await getMockState(page)).list.find((item) => item.id === 'legacy-domain')
        return { domains: entry?.domains, status: entry?.domain_refresh_status }
      })
      .toEqual({ domains: ['github.com', 'api.github.com'], status: 'complete' })
  })

  test('repairs an imported domain list and regenerates its content on save', async ({ page }) => {
    await gotoApp(page, '/?e2eMalformedDomain=true')
    const drawer = await editEntry(page, 'Imported Domains')
    const input = drawer.getByRole('textbox', { name: 'Domain list', exact: true })
    await expect(input).toHaveValue('github.com\nbad domain')
    await clearMockCalls(page)
    await input.fill('github.com')
    await expect(drawer.getByRole('button', { name: 'Save to resolve', exact: true })).toBeDisabled()
    await drawer.getByRole('button', { name: 'OK', exact: true }).click()

    await expect(drawer).not.toBeVisible()
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        const entry = state.list.find((item) => item.id === 'malformed-domain')
        return {
          domains: entry?.domains,
          status: entry?.domain_refresh_status,
          content: state.contents['malformed-domain'],
        }
      })
      .toEqual({
        domains: ['github.com'],
        status: 'complete',
        content: '203.0.113.10 github.com\n# 203.0.113.110 github.com\n',
      })
    expect(
      (await getMockCalls(page)).filter((call) => call.cmd === 'refresh_remote_hosts'),
    ).toHaveLength(1)
    await expect(
      page.getByTestId('right-panel').getByText('1 updated · 0 using previous IPs · 0 unresolved'),
    ).toBeVisible()
  })
})
