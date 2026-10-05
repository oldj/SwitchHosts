import { clearMockCalls, expect, getMockCalls, getMockState, test } from './support/test'
import type { Page } from '@playwright/test'

const dragCalls = async (page: Page) =>
  (await getMockCalls(page)).filter((call) => call.cmd === 'plugin:window|start_dragging')

async function openDialog(page: Page, menu: string) {
  await page.getByLabel('Settings').click()
  await page.getByRole('menuitem', { name: menu, exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

async function titlebarPoint(page: Page) {
  const box = await page.locator('[data-window-titlebar]').boundingBox()
  // Between the left controls and centered title, exposed beside the drawer.
  return { x: box!.x + 320, y: box!.y + box!.height / 2 }
}

for (const menu of ['Preferences', 'About']) {
  test(`drags the window through the ${menu} backdrop without closing the dialog`, async ({
    page,
  }) => {
    const point = await titlebarPoint(page)
    await openDialog(page, menu)
    await clearMockCalls(page)
    await page.mouse.move(point.x, point.y)
    await page.mouse.down()
    await expect.poll(() => dragCalls(page)).toHaveLength(1)
    await page.mouse.move(point.x + 30, point.y + 80, { steps: 5 })
    await page.mouse.up()
    await expect(page.getByRole('dialog')).toBeVisible()

    // A regular backdrop click below the titlebar still closes the dialog.
    await page.mouse.click(20, 150)
    await expect(page.getByRole('dialog')).not.toBeVisible()
    expect(await dragCalls(page)).toHaveLength(1)
  })

  test(`keeps covered titlebar buttons blocked by the ${menu} backdrop`, async ({ page }) => {
    const button = await page.getByLabel('Toggle sidebar', { exact: true }).boundingBox()
    const before = (await getMockState(page)).configs.left_panel_show
    await openDialog(page, menu)
    await clearMockCalls(page)
    await page.mouse.click(button!.x + button!.width / 2, button!.y + button!.height / 2)
    expect(await dragCalls(page)).toHaveLength(0)
    expect((await getMockState(page)).configs.left_panel_show).toBe(before)
  })
}

test('handles a native drag that consumes the release, and leaves dialog content interactive', async ({
  page,
}) => {
  const point = await titlebarPoint(page)
  await openDialog(page, 'Preferences')
  await clearMockCalls(page)
  const overlay = page.locator('.mantine-Drawer-overlay')
  await overlay.dispatchEvent('mousedown', { button: 0, clientX: point.x, clientY: point.y })
  await expect.poll(() => dragCalls(page)).toHaveLength(1)
  // Deliberately omit mouseup/click, as a native window drag can consume them.
  await page.getByRole('dialog').getByText('Dark', { exact: true }).click()
  await expect(page.locator('body')).toHaveClass(/theme-dark/)
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await dragCalls(page)).toHaveLength(1)
  await page.mouse.click(20, 150)
  await expect(page.getByRole('dialog')).not.toBeVisible()
})
