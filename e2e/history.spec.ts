import { expect, getMockState, test } from './support/test'
import type { Page } from '@playwright/test'

async function openHistory(page: Page, count = 50) {
  await page.evaluate((n) => window.__SWITCHHOSTS_E2E__.seedHistory(n), count)
  await page.getByRole('button', { name: 'Show History', exact: true }).first().click()
  await expect(page.getByText(`${count} saved records`, { exact: true })).toBeVisible()
}

async function setLimit(page: Page, limit: string) {
  await page.getByRole('combobox', { name: 'Maximum Number of Records:' }).click()
  await page.getByRole('option', { name: limit, exact: true }).click()
}

test('cancel leaves the saved limit and all records unchanged; confirm immediately trims', async ({
  page,
}, testInfo) => {
  await openHistory(page)
  await page.screenshot({ path: testInfo.outputPath('history-panel.png'), animations: 'disabled' })
  await setLimit(page, '10')
  const modal = page.getByRole('dialog', { name: 'Reduce history retention?' })
  await expect(modal).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('history-confirmation.png'),
    animations: 'disabled',
  })
  await expect(modal).toContainText('Keep the latest 10 records and delete the oldest 40.')
  expect((await getMockState(page)).configs.history_limit).toBe(50)
  expect((await getMockState(page)).history).toHaveLength(50)
  await modal.getByRole('button', { name: 'Cancel' }).click()
  await expect(modal).not.toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Maximum Number of Records:' })).toHaveValue('50')
  expect((await getMockState(page)).history).toHaveLength(50)
  await setLimit(page, '10')
  await modal.getByRole('button', { name: 'Save and delete 40 records' }).click()
  await expect(modal).not.toBeVisible()
  await expect(page.getByText('10 saved records', { exact: true })).toBeVisible()
  const state = await getMockState(page)
  expect(state.configs.history_limit).toBe(10)
  expect(state.history.map((item) => item.id)).toEqual(
    Array.from({ length: 10 }, (_, i) => `seed-${i + 40}`),
  )
  await expect(page.locator('.cm-content').last()).toContainText('host-49.local')
})

test('lowering without excess records saves without confirmation', async ({ page }) => {
  await openHistory(page, 2)
  await setLimit(page, '10')
  await expect.poll(async () => (await getMockState(page)).configs.history_limit).toBe(10)
  await expect(page.getByText('Reduce history retention?')).not.toBeVisible()
  expect((await getMockState(page)).history).toHaveLength(2)
})

test('recording toggle preserves old records and clear requires confirmation', async ({ page }) => {
  await openHistory(page, 2)
  await page.getByRole('switch', { name: 'Record history' }).uncheck()
  await expect(
    page.getByText('Recording is off. Existing history can still be viewed and deleted.'),
  ).toBeVisible()
  await expect.poll(async () => (await getMockState(page)).configs.history_enabled).toBe(false)
  expect((await getMockState(page)).history).toHaveLength(2)
  const panel = page.getByRole('dialog', { name: 'System Hosts Version History' })
  await panel.getByRole('button', { name: 'Clear History' }).click()
  const modal = page.getByRole('dialog', { name: 'Clear History' })
  await expect(modal).toContainText('This cannot be undone.')
  await modal.getByRole('button', { name: 'Cancel' }).click()
  expect((await getMockState(page)).history).toHaveLength(2)
  await panel.getByRole('button', { name: 'Clear History' }).click()
  await modal.getByRole('button', { name: 'Clear History' }).click()
  await expect(page.getByText('0 saved records', { exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Delete selected' })).toBeDisabled()
  await expect(panel.getByRole('button', { name: 'Clear History' })).toBeDisabled()
  await expect(panel.locator('.cm-content')).toHaveCount(0)
  await panel.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Show History', exact: true }).first().click()
  await expect(page.getByText('0 saved records', { exact: true })).toBeVisible()
})

test('changed record count requires confirmation of the fresh count', async ({ page }) => {
  await openHistory(page)
  await setLimit(page, '10')
  const modal = page.getByRole('dialog', { name: 'Reduce history retention?' })
  await page.evaluate(() => window.__SWITCHHOSTS_E2E__.seedHistory(49))
  await modal.getByRole('button', { name: 'Save and delete 40 records' }).click()
  await expect(modal.getByRole('button', { name: 'Save and delete 39 records' })).toBeVisible()
  expect((await getMockState(page)).configs.history_limit).toBe(50)
  expect((await getMockState(page)).history).toHaveLength(49)
  await modal.getByRole('button', { name: 'Save and delete 39 records' }).click()
  await expect(page.getByText('10 saved records', { exact: true })).toBeVisible()
})

test('failed save keeps confirmation open and can be retried', async ({ page }) => {
  await openHistory(page)
  await setLimit(page, '10')
  const modal = page.getByRole('dialog', { name: 'Reduce history retention?' })
  await page.evaluate(() =>
    window.__SWITCHHOSTS_E2E__.failNextHistoryOperation('update_apply_history_limit'),
  )
  await modal.getByRole('button', { name: 'Save and delete 40 records' }).click()
  await expect(page.getByText('History disk error').first()).toBeVisible()
  await expect(modal).toBeVisible()
  expect((await getMockState(page)).configs.history_limit).toBe(50)
  expect((await getMockState(page)).history).toHaveLength(50)
  await modal.getByRole('button', { name: 'Save and delete 40 records' }).click()
  await expect(page.getByText('10 saved records', { exact: true })).toBeVisible()
})

test('history load failure exits loading state and supports retry', async ({ page }) => {
  await page.evaluate(() =>
    window.__SWITCHHOSTS_E2E__.failNextHistoryOperation('get_apply_history'),
  )
  await page.getByRole('button', { name: 'Show History', exact: true }).first().click()
  const panel = page.getByRole('dialog', { name: 'System Hosts Version History' })
  await expect(panel.getByRole('button', { name: 'Retry' })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Clear History' })).toBeDisabled()
  await panel.getByRole('button', { name: 'Retry' }).click()
  await expect(panel.getByText('2 saved records', { exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Delete selected' })).toBeEnabled()
})
