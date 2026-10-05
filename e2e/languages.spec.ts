import { expect, getMockState, test } from './support/test'

test('shows all languages and saves each newly supported language', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 752 })
  await page.getByLabel('Settings', { exact: true }).click()
  await page.getByText('Preferences', { exact: true }).click()
  const preferences = page.getByRole('dialog')
  const languageSelect = preferences.getByRole('combobox')
  await languageSelect.click()

  const options = page.getByRole('option')
  await expect(options).toHaveCount(16)
  for (const option of await options.all()) {
    await expect(option).toBeInViewport({ ratio: 1 })
  }

  for (const [locale, name, general] of [
    ['es', 'Español', 'General'],
    ['it', 'Italiano', 'Generali'],
    ['nl', 'Nederlands', 'Algemeen'],
    ['pt', 'Português', 'Geral'],
    ['vi', 'Tiếng Việt', 'Chung'],
    ['ru', 'Русский', 'Общие'],
    ['th', 'ไทย', 'ทั่วไป'],
  ]) {
    await page.getByRole('option', { name, exact: true }).click()
    await expect(languageSelect).toHaveValue(name)
    await expect(preferences.getByRole('tab', { name: general, exact: true })).toBeVisible()
    await expect.poll(async () => (await getMockState(page)).configs).toMatchObject({ locale })
    await languageSelect.click()
    await expect(page.getByRole('option', { name, exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  }

  await page.getByRole('option', { name: 'English', exact: true }).click()
  await expect(preferences.getByRole('tab', { name: 'General', exact: true })).toBeVisible()
})
