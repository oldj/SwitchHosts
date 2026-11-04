import {
  clearMockCalls,
  expect,
  getMockCalls,
  getMockState,
  moveLocalDevToTrashcan,
  saveEditorDraft,
  showRightPanel,
  test,
} from './support/test'

test.describe('trashcan', () => {
  for (const operation of ['delete', 'clear']) {
    test(`retains a trashed draft until confirmed ${operation}, then removes its journal`, async ({
      page,
    }) => {
      await moveLocalDevToTrashcan(page)
      const key = await page.evaluate(async () => {
        const directory = await (window as any).__TAURI_INTERNALS__.invoke('get_data_dir', {
          args: [],
        })
        const key = `switchhosts:editor-draft:v1:${encodeURIComponent(directory)}:local-dev`
        localStorage.setItem(
          key,
          JSON.stringify({ content: 'recoverable draft', base_content: 'saved' }),
        )
        return key
      })
      // Reload the main list without resetting the in-memory backend mock.
      await page.getByLabel('Trashcan').click()
      await page.getByLabel('Hosts').click()
      await page.getByLabel('Trashcan').click()
      await expect(page.locator('[data-id="local-dev"]')).toBeVisible()
      expect(await page.evaluate((key) => localStorage.getItem(key), key)).toContain(
        'recoverable draft',
      )
      await page.locator('[data-id="local-dev"]').click()
      if (operation === 'delete') {
        await showRightPanel(page)
        await page.getByRole('button', { name: 'Delete Hosts Entry', exact: true }).click()
      } else {
        await page.getByLabel('Empty Trashcan').click()
      }
      await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
      expect(await page.evaluate((key) => localStorage.getItem(key), key)).toContain(
        'recoverable draft',
      )
      await page
        .getByRole('button', {
          name: operation === 'delete' ? 'Delete Hosts Entry' : 'Empty Trashcan',
          exact: true,
        })
        .click()
      await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
      await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), key)).toBeNull()
      await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'false')
    })
  }

  test('moves an entry to trashcan and restores it', async ({ page }) => {
    await moveLocalDevToTrashcan(page)

    await page.getByLabel('Trashcan').click()
    await page.locator('[data-id="local-dev"]').click()
    await showRightPanel(page)
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

    const editor = page.locator('.cm-content')
    await expect(editor).toHaveAttribute('contenteditable', 'true')
    await editor.fill('127.0.0.1 restored.test')
    await expect(page.getByText('Pending application', { exact: true })).toBeVisible()
    await saveEditorDraft(page)
    await expect
      .poll(async () => (await getMockState(page)).contents['local-dev'])
      .toBe('127.0.0.1 restored.test')

    await page.getByLabel('Hosts').click()
    await expect(page.locator('[data-id="local-dev"]')).toContainText('Development')
  })

  test('permanently deletes a trashcan item from the details panel', async ({ page }) => {
    await moveLocalDevToTrashcan(page)
    await clearMockCalls(page)

    await page.getByLabel('Trashcan').click()
    await page.locator('[data-id="local-dev"]').click()
    await showRightPanel(page)
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
    const clearButton = page.getByLabel('Empty Trashcan')
    const leftResizeHandle = page.getByRole('separator').first()
    await expect(clearButton).toBeVisible()

    const [clearButtonBox, resizeHandleBox] = await Promise.all([
      clearButton.boundingBox(),
      leftResizeHandle.boundingBox(),
    ])
    expect(clearButtonBox).not.toBeNull()
    expect(resizeHandleBox).not.toBeNull()
    expect(clearButtonBox!.x + clearButtonBox!.width).toBeLessThanOrEqual(resizeHandleBox!.x - 6)

    await clearButton.click()
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
})
