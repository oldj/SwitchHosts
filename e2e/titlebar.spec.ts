import { expect, test } from './support/test'

test.describe('title bar', () => {
  test('keeps the left resize handle above the editor', async ({ page }) => {
    const handle = page.getByRole('separator').first()
    await expect(handle).toBeVisible()

    // Read and hit-test in one frame: the opening sidebar transition can move
    // this narrow handle between separate boundingBox/evaluate calls.
    await expect
      .poll(() =>
        handle.evaluate((element) => {
          const box = element.getBoundingClientRect()
          return (
            document
              .elementFromPoint(box.x + box.width - 1, box.y + box.height / 2)
              ?.closest('[role="separator"]') === element
          )
        }),
      )
      .toBe(true)
  })

  test('shows the app brand on Windows/Linux and aligns its logo to the sidebar', async ({
    page,
  }) => {
    const platformClass = await page
      .locator('body')
      .evaluate((body) =>
        [...body.classList].find((className) => className.startsWith('platform-')),
      )
    const brand = page.getByTestId('titlebar-brand')

    if (platformClass === 'platform-darwin') {
      await expect(brand).toHaveCount(0)
      return
    }

    await expect(brand).toBeVisible()
    await expect(brand).toContainText('SwitchHosts')

    const logo = page.getByTestId('titlebar-logo')
    const hostsButton = page.getByLabel('Hosts')
    await expect(logo).toBeVisible()
    await expect(hostsButton).toBeVisible()

    const [logoBox, hostsButtonBox] = await Promise.all([
      logo.boundingBox(),
      hostsButton.boundingBox(),
    ])
    expect(logoBox).not.toBeNull()
    expect(hostsButtonBox).not.toBeNull()

    const logoCenter = logoBox!.x + logoBox!.width / 2
    const hostsButtonCenter = hostsButtonBox!.x + hostsButtonBox!.width / 2
    expect(Math.abs(logoCenter - hostsButtonCenter)).toBeLessThanOrEqual(1)
  })
})
