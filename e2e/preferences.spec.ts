import {
  clearMockCalls,
  configPatches,
  expect,
  findEntry,
  getMockCalls,
  getMockState,
  test,
} from './support/test'

test.describe('preferences', () => {
  test('saves basic preferences immediately', async ({ page }) => {
    await clearMockCalls(page)

    await page.getByLabel('Settings').click()
    await page.getByText('Preferences').click()
    const preferences = page.getByRole('dialog')
    await expect(preferences.getByText('General')).toBeVisible()

    await preferences.getByText('Dark', { exact: true }).click()
    await preferences.getByText('Overwrite', { exact: true }).click()
    await preferences.getByText('Single', { exact: true }).click()

    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return state.configs
      })
      .toMatchObject({
        theme: 'dark',
        write_mode: 'overwrite',
        choice_mode: 1,
      })

    const calls = await getMockCalls(page)
    expect(configPatches(calls)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ theme: 'dark' }),
        expect.objectContaining({ write_mode: 'overwrite' }),
        expect.objectContaining({ choice_mode: 1 }),
      ]),
    )
  })

  test('applies global single-choice mode to top-level hosts', async ({ page }) => {
    await page.getByLabel('Settings').click()
    await page.getByText('Preferences').click()
    const preferences = page.getByRole('dialog')
    await expect(preferences.getByText('General')).toBeVisible()
    await preferences.getByText('Single', { exact: true }).click()
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return state.configs.choice_mode
      })
      .toBe(1)
    await page.keyboard.press('Escape')
    await expect(preferences).toBeHidden()
    await clearMockCalls(page)

    const localDev = page.locator('[data-id="local-dev"]')
    const localApi = page.locator('[data-id="local-api"]')
    await expect(localApi.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    await localDev.getByRole('switch').click()

    await expect(localDev.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    await expect(localApi.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return {
          localDevOn: findEntry(state, 'local-dev')?.on,
          localApiOn: findEntry(state, 'local-api')?.on,
          hasDev: state.systemHosts.includes('dev.local'),
          hasApi: state.systemHosts.includes('api.local'),
        }
      })
      .toEqual({ localDevOn: true, localApiOn: false, hasDev: true, hasApi: false })

    const calls = await getMockCalls(page)
    expect(calls.some((call) => call.cmd === 'apply_hosts_selection')).toBe(true)
  })

  test('toggles side panels and persists layout preferences', async ({ page }) => {
    await clearMockCalls(page)
    await page.locator('[data-id="local-dev"]').click()

    await page.getByLabel('Toggle sidebar').click()
    await expect(page.locator('[data-id="local-dev"]')).not.toBeInViewport()

    await page.getByLabel('Toggle right panel').click()
    await expect(page.getByText('Rules')).not.toBeInViewport()

    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return {
          leftPanelShow: state.configs.left_panel_show,
          rightPanelShow: state.configs.right_panel_show,
        }
      })
      .toEqual({ leftPanelShow: false, rightPanelShow: false })

    expect(configPatches(await getMockCalls(page))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ left_panel_show: false }),
        expect.objectContaining({ right_panel_show: false }),
      ]),
    )
  })
})
