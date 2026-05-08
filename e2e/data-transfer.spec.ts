import {
  clearMockCalls,
  expect,
  firstInvokeArg,
  getMockCalls,
  getMockState,
  test,
} from './support/test'

test.describe('data transfer', () => {
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
})
