import {
  clearMockCalls,
  expect,
  getMockCalls,
  getMockState,
  moveLocalDevToTrashcan,
  showRightPanel,
  test,
} from './support/test'

test.describe('trashcan', () => {
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
})
