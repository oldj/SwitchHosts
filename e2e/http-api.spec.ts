import {
  clearMockCalls,
  configPatches,
  expect,
  getMockCalls,
  getMockState,
  openApp,
  test,
} from './support/test'
import type { Page } from '@playwright/test'

async function openAdvanced(page: Page) {
  await page.getByLabel('Settings').click()
  await page.getByText('Preferences').click()
  const preferences = page.getByRole('dialog')
  await preferences.getByRole('tab', { name: 'Advanced' }).click()
  return preferences
}

test('HTTP API saves a port while off, then uses it when enabled', async ({ page }) => {
  const panel = await openAdvanced(page)
  const input = panel.getByLabel('Listening port', { exact: true })
  await expect(input).toHaveValue('50761')
  await expect(panel.getByText('HTTP API is off', { exact: true })).toBeVisible()
  await clearMockCalls(page)
  await panel.locator('[data-direction="up"]').click()
  await expect(input).toHaveValue('50762')
  await panel.locator('[data-direction="down"]').click()
  await expect(input).toHaveValue('50761')
  await input.fill('40761')
  expect(configPatches(await getMockCalls(page))).toEqual([])
  await panel.getByRole('button', { name: 'Save port', exact: true }).click()
  await expect.poll(async () => (await getMockState(page)).configs.http_api_port).toBe(40761)
  await panel.getByLabel('Enable HTTP API', { exact: true }).check()
  await expect(panel.getByText('http://127.0.0.1:40761', { exact: true })).toBeVisible()
  await panel.getByLabel('Listen Only on 127.0.0.1', { exact: true }).uncheck()
  await expect(panel.getByText('http://0.0.0.0:40761', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: 'Restore default', exact: true }).click()
  await expect(input).toHaveValue('50761')
  expect((await getMockState(page)).configs.http_api_port).toBe(40761)
  await input.press('Enter')
  await expect(panel.getByText('http://0.0.0.0:50761', { exact: true })).toBeVisible()
})

test('HTTP API rejects invalid drafts without saving them', async ({ page }) => {
  const panel = await openAdvanced(page)
  const input = panel.getByLabel('Listening port', { exact: true })
  await clearMockCalls(page)
  for (const value of ['', '0', '65536']) {
    await input.fill(value)
    await expect(panel.getByRole('button', { name: 'Save port', exact: true })).toBeDisabled()
    await expect(panel.getByRole('alert')).toHaveText('Enter an integer between 1 and 65535.')
    await input.press('Enter')
  }
  expect(configPatches(await getMockCalls(page))).toEqual([])
  for (const value of ['1', '65535']) {
    await input.fill(value)
    await expect(panel.getByRole('button', { name: 'Save port', exact: true })).toBeEnabled()
  }
  await expect(panel.locator('[data-direction="up"]')).toBeDisabled()
  await panel.locator('[data-direction="down"]').click()
  await expect(input).toHaveValue('65534')
  await input.fill('1')
  await expect(panel.locator('[data-direction="down"]')).toBeDisabled()
  await panel.locator('[data-direction="up"]').click()
  await expect(input).toHaveValue('2')
})

test('HTTP API toggles preserve control appearance and status layout while saving', async ({
  page,
}) => {
  const panel = await openAdvanced(page)
  const enabled = panel.getByLabel('Enable HTTP API', { exact: true })
  const local = panel.getByLabel('Listen Only on 127.0.0.1', { exact: true })
  const input = panel.getByLabel('Listening port', { exact: true })
  const save = panel.getByRole('button', { name: 'Save port', exact: true })
  const reset = panel.getByRole('button', { name: 'Restore default', exact: true })
  const help = panel.getByText(
    'After changing the port, update the port setting in Alfred and other tools.',
    { exact: true },
  )
  await input.fill('40761')
  await help.scrollIntoViewIfNeeded()
  const before = await help.boundingBox()
  await clearMockCalls(page)
  await page.evaluate(() => window.__SWITCHHOSTS_E2E__.holdNextHttpApiSave())
  await enabled.check()
  await expect(enabled).toBeChecked()
  await expect(enabled).toHaveAttribute('aria-disabled', 'true')
  // A pending request blocks duplicate writes without greying out the group
  // or putting the unrelated port-save button into its loading state.
  for (const control of [enabled, local, input, save, reset]) {
    await expect(control).not.toHaveAttribute('disabled')
  }
  await expect(save).not.toHaveAttribute('data-loading')
  await expect(panel.locator('[data-direction="up"]')).toBeVisible()
  await expect(panel.locator('[data-direction="down"]')).toBeVisible()
  await expect(input).toHaveValue('40761')
  await enabled.dispatchEvent('click')
  expect(configPatches(await getMockCalls(page))).toEqual([{ http_api_on: true }])
  await page.evaluate(() => window.__SWITCHHOSTS_E2E__.releaseHttpApiSave())
  await expect(enabled).toHaveAttribute('aria-disabled', 'false')
  await expect(panel.getByText('http://127.0.0.1:50761', { exact: true })).toBeVisible()
  expect(Math.abs((await help.boundingBox())!.y - before!.y)).toBeLessThan(1)
  await enabled.uncheck()
  await expect(panel.getByText('HTTP API is off', { exact: true })).toBeVisible()
  expect(Math.abs((await help.boundingBox())!.y - before!.y)).toBeLessThan(1)
  await expect(input).toHaveValue('40761')
})

test('HTTP API scope toggle responds immediately and rolls back on save failure', async ({
  page,
}) => {
  const panel = await openAdvanced(page)
  const enabled = panel.getByLabel('Enable HTTP API', { exact: true })
  const local = panel.getByLabel('Listen Only on 127.0.0.1', { exact: true })
  await enabled.check()
  await expect(enabled).toHaveAttribute('aria-disabled', 'false')
  await page.evaluate(() => {
    window.__SWITCHHOSTS_E2E__.holdNextHttpApiSave()
    window.__SWITCHHOSTS_E2E__.failNextHttpApiSave('permission_denied')
  })
  await local.uncheck()
  await expect(local).not.toBeChecked()
  await expect(local).not.toHaveAttribute('disabled')
  await expect(panel.getByRole('button', { name: 'Save port', exact: true })).not.toHaveAttribute(
    'data-loading',
  )
  await page.evaluate(() => window.__SWITCHHOSTS_E2E__.releaseHttpApiSave())
  await expect(local).toHaveAttribute('aria-disabled', 'false')
  await expect(local).toBeChecked()
  await expect(panel.getByRole('alert')).toContainText('Access to port 50761 was denied')
  await expect(panel.getByText('http://127.0.0.1:50761', { exact: true })).toBeVisible()
})

test('HTTP API keeps rejected draft and old listener, then allows retry', async ({ page }) => {
  const panel = await openAdvanced(page)
  await panel.getByLabel('Enable HTTP API', { exact: true }).check()
  await expect(panel.getByText('http://127.0.0.1:50761', { exact: true })).toBeVisible()
  const input = panel.getByLabel('Listening port', { exact: true })
  await input.fill('40761')
  await page.evaluate(() => window.__SWITCHHOSTS_E2E__.failNextHttpApiSave('address_in_use'))
  await panel.getByRole('button', { name: 'Save port', exact: true }).click()
  await expect(panel.getByRole('alert')).toHaveText(
    'Port 40761 is already in use. Try another port.',
  )
  await expect(input).toHaveValue('40761')
  await expect(panel.getByText('http://127.0.0.1:50761', { exact: true })).toBeVisible()
  expect((await getMockState(page)).configs.http_api_port).toBe(50761)
  await panel.getByRole('button', { name: 'Save port', exact: true }).click()
  await expect(panel.getByText('http://127.0.0.1:40761', { exact: true })).toBeVisible()
  await expect(panel.getByRole('alert')).toHaveCount(0)
})

test('HTTP API displays a startup binding failure and recovers by changing port', async ({
  browser,
}) => {
  const page = await browser.newPage()
  try {
    await openApp(page, '/?e2eHttpApiStartupFailure=true')
    const panel = await openAdvanced(page)
    await expect(panel.getByText('HTTP API is not running', { exact: true })).toBeVisible()
    await expect(panel.getByText(/Access to port 50761 was denied/)).toBeVisible()
    await panel.getByLabel('Listening port', { exact: true }).fill('40761')
    await panel.getByRole('button', { name: 'Save port', exact: true }).click()
    await expect(panel.getByText('http://127.0.0.1:40761', { exact: true })).toBeVisible()
  } finally {
    await page.close()
  }
})
