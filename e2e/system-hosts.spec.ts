import { expect, getMockCalls, getMockState, showRightPanel, test } from './support/test'

test.describe('system hosts', () => {
  test('loads system hosts details and the read-only editor', async ({ page }) => {
    await showRightPanel(page)
    await expect(page.getByText('/etc/hosts')).toBeVisible()
    await expect(page.locator('.cm-content')).toContainText('localhost')
    await expect(page.getByText('Read Only').first()).toBeVisible()
    await expect(page.getByText('Rules')).toBeVisible()
  })

  test('opens system hosts history from the details panel', async ({ page }) => {
    await showRightPanel(page)
    await page.locator('button').filter({ hasText: 'Show History' }).click()

    await expect(page.getByText('System Hosts Version History')).toBeVisible()
    await expect(page.locator('.cm-content').last()).toContainText('api.local')
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible()
  })

  test('deletes a system hosts history entry', async ({ page }) => {
    await showRightPanel(page)
    await page.locator('button').filter({ hasText: 'Show History' }).click()
    await expect(page.getByText('System Hosts Version History')).toBeVisible()
    await expect(page.locator('.cm-content').last()).toContainText('api.local')

    await page.getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText('Are you sure you want to delete this item?')).toBeVisible()
    await page.getByRole('button', { name: 'Delete' }).last().click()
    await expect(page.getByText('Success!')).toBeVisible()

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
})
