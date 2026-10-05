import {
  clearMockCalls,
  chooseSelectOption,
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

    await expect(page.getByText('The export is complete.')).toBeVisible()
    await expect
      .poll(async () => {
        const calls = await getMockCalls(page)
        const revealCall = calls.find((call) => call.cmd === 'show_item_in_folder')
        return revealCall ? firstInvokeArg(revealCall) : null
      })
      .toBe('/Users/e2e/exports/switchhosts_20260509_121436.789.json')
  })

  test('file preview and cancellation leave all data untouched', async ({ page }) => {
    const before = await getMockState(page)
    await clearMockCalls(page)
    await page.evaluate(() => window.__SWITCHHOSTS_E2E__.delayNextImport(600))
    const dialog = await previewFile(page)
    await expect(dialog.getByRole('radio', { name: 'Append', exact: true })).toBeChecked()
    await expect(dialog.getByRole('radio', { name: 'Append', exact: true })).toContainText(
      'Recommended',
    )
    await expect(
      dialog.getByRole('checkbox', { name: 'Select Imported Folder', exact: true }),
    ).toBeChecked()
    expect((await getMockState(page)).list).toEqual(before.list)
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    const after = await getMockState(page)
    expect(after.list).toEqual(before.list)
    expect(after.contents).toEqual(before.contents)
    expect((await getMockCalls(page)).some((call) => call.cmd === 'commit_import')).toBe(false)
    expect((await getMockCalls(page)).some((call) => call.cmd === 'discard_import')).toBe(true)
  })

  test('appends by default in a new folder and leaves existing state and system hosts unchanged', async ({
    page,
  }) => {
    const before = await getMockState(page)
    const dialog = await previewFile(page)
    await dialog.getByRole('button', { name: 'Append selected' }).click()
    await expect(page.getByText('The import is complete.')).toBeVisible()
    const after = await getMockState(page)
    expect(after.list.slice(0, before.list.length)).toEqual(before.list)
    const added = after.list.at(-1)!
    expect(added.title).toBe('switchhosts_backup')
    expect(added.children?.map((node) => node.title)).toEqual([
      'Imported Backup',
      'Imported Folder',
      'Imported Group',
    ])
    expect(added.children?.[2].include).toEqual([added.children?.[0].id])
    expect(added.children?.every((node) => node.on === false)).toBe(true)
    expect(after.trashcan).toEqual(before.trashcan)
    expect(after.systemHosts).toEqual(before.systemHosts)
    expect(after.configs).toEqual(before.configs)
  })

  test('selecting a folder preserves nested structure, order and empty folders', async ({
    page,
  }) => {
    const dialog = await previewFile(page)
    await dialog.getByRole('checkbox', { name: 'Select All', exact: true }).uncheck()
    await expect(dialog.getByRole('button', { name: 'Append selected' })).toBeDisabled()
    await dialog.getByRole('checkbox', { name: 'Select Imported Folder', exact: true }).check()
    await chooseSelectOption(page, dialog, 'Import into', 'Root of the list')
    await dialog.getByRole('button', { name: 'Append selected' }).click()
    await expect(page.getByText('The import is complete.')).toBeVisible()
    const added = (await getMockState(page)).list.at(-1)!
    expect(added.title).toBe('Imported Folder')
    expect(added.children?.map((node) => node.title)).toEqual([
      'Imported Folder Child',
      'Nested Folder',
      'Empty Folder',
    ])
    expect(added.children?.[1].children?.map((node) => node.title)).toEqual([
      'Nested A',
      'Nested B',
    ])
    expect(added.children?.[2].children).toEqual([])
  })

  test('partial selection preserves parents and groups bring their dependencies', async ({
    page,
  }) => {
    const dialog = await previewFile(page)
    await dialog.getByRole('checkbox', { name: 'Select All', exact: true }).uncheck()
    await dialog.getByRole('checkbox', { name: 'Select Imported Group', exact: true }).check()
    await expect(
      dialog.getByRole('checkbox', { name: 'Select Imported Backup', exact: true }),
    ).toBeChecked()
    await dialog.getByRole('checkbox', { name: 'Select Imported Backup', exact: true }).uncheck()
    await expect(
      dialog.getByRole('checkbox', { name: 'Select Imported Group', exact: true }),
    ).not.toBeChecked()
    await expect(dialog.getByText('Dependent groups were also deselected.')).toBeVisible()
    await dialog.getByRole('checkbox', { name: 'Select Nested A', exact: true }).check()
    await expect(
      dialog.getByRole('checkbox', { name: 'Select Imported Folder', exact: true }),
    ).toBeChecked({ indeterminate: true })
    await chooseSelectOption(page, dialog, 'Import into', 'Root of the list')
    await dialog.getByRole('button', { name: 'Append selected' }).click()
    await expect(page.getByText('The import is complete.')).toBeVisible()
    const added = (await getMockState(page)).list.at(-1)!
    expect(added.title).toBe('Imported Folder')
    expect(added.children?.length).toBe(1)
    expect(added.children?.[0].title).toBe('Nested Folder')
    expect(added.children?.[0].children?.map((node) => node.title)).toEqual(['Nested A'])
  })

  test('replace requires a second confirmation and preserves trash, preferences and system hosts', async ({
    page,
  }) => {
    const before = await getMockState(page)
    const dialog = await previewFile(page)
    await dialog.getByRole('radio', { name: 'Replace all configurations', exact: true }).check()
    await dialog.getByRole('button', { name: 'Next' }).click()
    await expect(dialog.getByText('Confirm replacement')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Back to preview' })).toBeFocused()
    expect((await getMockState(page)).list).toEqual(before.list)
    // Enter from the safe default returns to the preview, not a destructive commit.
    await page.keyboard.press('Enter')
    await expect(dialog.getByText('Import preview', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Next' }).click()
    await dialog.getByRole('button', { name: 'Replace all configurations', exact: true }).click()
    await expect(page.getByText('The import is complete.')).toBeVisible()
    const after = await getMockState(page)
    expect(after.list.map((node) => node.title)).toEqual([
      'Imported Backup',
      'Imported Folder',
      'Imported Group',
    ])
    expect(after.trashcan).toEqual(before.trashcan)
    expect(after.configs).toEqual(before.configs)
    expect(after.systemHosts).toEqual(before.systemHosts)
  })

  test('stale preview requires refresh and another replacement confirmation', async ({ page }) => {
    const dialog = await previewFile(page)
    await dialog.getByRole('radio', { name: 'Replace all configurations', exact: true }).check()
    await dialog.getByRole('button', { name: 'Next' }).click()
    await page.evaluate(() => window.__SWITCHHOSTS_E2E__.editDuringImport())
    await dialog.getByRole('button', { name: 'Replace all configurations', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText(
      'Your configurations changed after preview',
    )
    await expect(
      dialog.getByRole('button', { name: 'Replace all configurations', exact: true }),
    ).toBeDisabled()
    await page.evaluate(() => window.__SWITCHHOSTS_E2E__.failNextImportOperation('rebase_import'))
    await dialog.getByRole('button', { name: 'Refresh preview' }).click()
    await expect(dialog.getByRole('alert')).toContainText('Temporary storage failure')
    await expect(
      dialog.getByRole('button', { name: 'Replace all configurations', exact: true }),
    ).toBeDisabled()
    await dialog.getByRole('button', { name: 'Refresh preview' }).click()
    await expect(dialog.getByText('Import preview', { exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Next' })).toBeEnabled()
  })

  test('400px window keeps actions visible through preview, content and confirmation', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 600, height: 400 })
    const dialog = await previewFile(page)
    const footer = dialog.getByTestId('import-footer')
    const inWindow = async () => {
      const box = await footer.boundingBox()
      return !!box && box.y >= 0 && box.y + box.height <= 400
    }
    await expect.poll(inWindow).toBe(true)
    const append = dialog.getByRole('radio', { name: 'Append', exact: true })
    const replace = dialog.getByRole('radio', { name: 'Replace all configurations', exact: true })
    // Both the description area and arrow keys operate the entire radio card.
    await replace.getByText('Replace the current list with configurations from the file.').click()
    await expect(replace).toBeChecked()
    await replace.press('ArrowLeft')
    await expect(append).toBeChecked()
    await expect(append).toBeFocused()
    await dialog.getByRole('heading', { name: 'Import preview', exact: true }).click()
    await expect(dialog).toHaveCSS('opacity', '1')
    await page.screenshot({ path: testInfo.outputPath('import-preview-400.png') })
    const listHeader = dialog.getByTestId('import-list-header')
    const listHeaderBox = await listHeader.boundingBox()
    const scroll = dialog.getByTestId('import-scroll')
    await scroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    expect(await listHeader.boundingBox()).toEqual(listHeaderBox)
    await expect(dialog.getByRole('checkbox', { name: 'Select All', exact: true })).toBeInViewport()
    await page.screenshot({ path: testInfo.outputPath('import-list-scrolled-400.png') })
    await dialog.getByRole('button', { name: 'View Imported Backup', exact: true }).click()
    const viewer = dialog.getByTestId('import-content-viewer')
    const content = viewer.locator('.cm-content')
    await expect(content).toContainText('imported-backup.local')
    await expect(content).toHaveAttribute('contenteditable', 'false')
    await expect(viewer.locator('.hl-comment')).toHaveText('# Imported hosts')
    await expect(viewer.locator('.hl-ip').first()).toHaveText('::1')
    const textColor = await content.evaluate((element) => getComputedStyle(element).color)
    for (const selector of ['.hl-comment', '.hl-ip']) {
      await expect(viewer.locator(selector).first()).not.toHaveCSS('color', textColor)
    }
    await content.focus()
    await content.press('a')
    await expect(viewer.locator('.cm-line').first()).toHaveText('# Imported hosts')
    await page.screenshot({ path: testInfo.outputPath('import-content-highlight-400.png') })
    await expect.poll(inWindow).toBe(true)
    const detailToolbar = dialog.getByTestId('import-detail-toolbar')
    const toolbarBox = await detailToolbar.boundingBox()
    const backToList = dialog.getByRole('button', { name: 'Back to list' })
    await expect(backToList).toHaveAttribute('data-variant', 'outline')
    const contentScroll = viewer.locator('.cm-scroller')
    await contentScroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await expect
      .poll(() => contentScroll.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0)
    await expect(viewer.locator('.hl-ip').last()).toHaveText('172.16.0.10')
    expect(await detailToolbar.boundingBox()).toEqual(toolbarBox)
    await expect(backToList).toBeInViewport()
    await expect.poll(inWindow).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('import-content-scrolled-400.png') })
    await backToList.click()
    await expect(listHeader).toBeVisible()
    await dialog.getByRole('radio', { name: 'Replace all configurations', exact: true }).check()
    await dialog.getByRole('button', { name: 'Next' }).click()
    await expect.poll(inWindow).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('import-confirm-400.png') })
  })

  test('a failed import is visible after scrolling and can be retried without losing selection', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 600, height: 400 })
    const before = await getMockState(page)
    const dialog = await previewFile(page)
    await dialog.getByRole('checkbox', { name: 'Select Nested B', exact: true }).uncheck()
    const scroll = dialog.getByTestId('import-scroll')
    await scroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await page.evaluate(() => window.__SWITCHHOSTS_E2E__.failNextImportOperation('commit_import'))
    const submit = dialog.getByRole('button', { name: 'Append selected' })
    await submit.click()
    await expect(dialog.getByRole('alert')).toBeInViewport()
    await expect(submit).toBeEnabled()
    expect((await getMockState(page)).list).toEqual(before.list)
    await expect(
      dialog.getByRole('checkbox', { name: 'Select Nested B', exact: true }),
    ).not.toBeChecked()
    await submit.click()
    await expect(page.getByText('The import is complete.')).toBeVisible()
    const imported = (await getMockState(page)).list.at(-1)!
    const nested = imported.children?.[1].children?.find((node) => node.title === 'Nested Folder')
    expect(nested?.children?.map((node) => node.title)).toEqual(['Nested A'])
    const calls = (await getMockCalls(page)).filter((call) => call.cmd === 'commit_import')
    expect(calls).toHaveLength(2)
    expect(firstInvokeArg(calls[0])).toEqual(firstInvokeArg(calls[1]))
  })

  test('file picker cancellation is silent', async ({ page }) => {
    await page.evaluate(() => window.__SWITCHHOSTS_E2E__.failNextImport(null))
    await page.getByLabel('Settings').click()
    await page.getByRole('menuitem', { name: /^Import$/ }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await expect(page.getByText('Import failed!', { exact: false })).not.toBeVisible()
  })

  test('shows an error notification when file import fails', async ({ page }) => {
    await page.evaluate(() => window.__SWITCHHOSTS_E2E__.failNextImport('mock_import_error'))
    await page.getByLabel('Settings').click()
    await page.getByRole('menuitem', { name: /^Import$/ }).click()
    await expect(page.getByText('Import failed! [mock_import_error]')).toBeVisible()
  })

  test('URL import uses the same preview and does not write before confirmation', async ({
    page,
  }) => {
    const before = await getMockState(page)
    const importUrl = 'https://example.test/swh_data.json'
    await page.getByLabel('Settings').click()
    await page.getByRole('menuitem', { name: 'Import from URL' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('input').fill(importUrl)
    await dialog.getByRole('button', { name: 'OK' }).click()
    await expect(dialog.getByText('Import preview', { exact: true })).toBeVisible()
    expect((await getMockState(page)).list).toEqual(before.list)
    await dialog.getByRole('button', { name: 'Append selected' }).click()
    await expect(page.getByText('The import is complete.')).toBeVisible()
    const added = (await getMockState(page)).list.at(-1)!
    expect(added.children?.[0].url).toBe(importUrl)
    const call = (await getMockCalls(page)).find((item) => item.cmd === 'import_data_from_url')!
    expect(firstInvokeArg(call)).toBe(importUrl)
  })

  test('URL read errors keep the URL dialog open for retry', async ({ page }) => {
    await page.evaluate(() => window.__SWITCHHOSTS_E2E__.failNextImportFromUrl('mock_url_error'))
    await page.getByLabel('Settings').click()
    await page.getByRole('menuitem', { name: 'Import from URL' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('input').fill('https://example.test/swh_data.json')
    await dialog.getByRole('button', { name: 'OK' }).click()
    await expect(page.getByText('Import failed! [mock_url_error]')).toBeVisible()
    await expect(dialog.locator('input')).toHaveValue('https://example.test/swh_data.json')
    await expect(dialog.getByRole('button', { name: 'OK' })).toBeEnabled()
  })

  test('URL validation is shared by the button and Enter and accepts padded IPv6 URLs', async ({
    page,
  }) => {
    await page.getByLabel('Settings').click()
    await page.getByRole('menuitem', { name: 'Import from URL' }).click()
    const dialog = page.getByRole('dialog')
    const input = dialog.locator('input')
    const submit = dialog.getByRole('button', { name: 'OK' })
    await input.fill('https://')
    await expect(submit).toBeDisabled()
    await clearMockCalls(page)
    await input.press('Enter')
    await expect(input).toBeVisible()
    expect((await getMockCalls(page)).some((call) => call.cmd === 'import_data_from_url')).toBe(
      false,
    )
    await input.fill('ftp://example.test/backup.json')
    await expect(submit).toBeDisabled()
    await input.press('Enter')
    expect((await getMockCalls(page)).some((call) => call.cmd === 'import_data_from_url')).toBe(
      false,
    )
    const url = 'http://[::1]:8080/backup.json'
    await input.fill(`  ${url}  `)
    await expect(submit).toBeEnabled()
    await submit.click()
    await expect(dialog.getByText('Import preview', { exact: true })).toBeVisible()
    const call = (await getMockCalls(page)).find((call) => call.cmd === 'import_data_from_url')!
    expect(firstInvokeArg(call)).toBe(url)
  })
})

async function previewFile(page: import('@playwright/test').Page) {
  await page.getByLabel('Settings').click()
  await page.getByRole('menuitem', { name: /^Import$/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Import preview', { exact: true })).toBeVisible()
  await expect(page.getByRole('menu', { includeHidden: true })).not.toBeVisible()
  return dialog
}
