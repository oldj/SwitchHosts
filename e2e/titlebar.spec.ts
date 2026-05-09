import { expect, test } from './support/test'

test.describe('title bar', () => {
  test('shows the app brand on Windows/Linux and aligns its logo to the sidebar', async ({
    page,
  }) => {
    const platformClass = await page.locator('body').evaluate((body) =>
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
