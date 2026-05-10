import {
  clearMockCalls,
  configPatches,
  expect,
  findEntry,
  getMockCalls,
  getMockState,
  openApp,
  test,
} from './support/test'
import type { Locator } from '@playwright/test'

async function expectVerticalCentersAligned(label: Locator, control: Locator) {
  await expect(label).toBeVisible()
  await expect(control).toBeVisible()

  const [labelBox, controlBox] = await Promise.all([label.boundingBox(), control.boundingBox()])
  expect(labelBox).not.toBeNull()
  expect(controlBox).not.toBeNull()

  const labelCenter = labelBox!.y + labelBox!.height / 2
  const controlCenter = controlBox!.y + controlBox!.height / 2
  expect(Math.abs(labelCenter - controlCenter)).toBeLessThanOrEqual(2)
}

async function expectFontSize(locator: Locator, expectedPx = 14) {
  await expect(locator).toBeVisible()

  const fontSize = await locator.evaluate((element) =>
    Number.parseFloat(window.getComputedStyle(element).fontSize),
  )
  expect(Math.abs(fontSize - expectedPx)).toBeLessThanOrEqual(0.2)
}

test.describe('preferences', () => {
  test('aligns segmented setting labels with their controls', async ({ page }) => {
    await page.getByLabel('Settings').click()
    await page.getByText('Preferences').click()
    const preferences = page.getByRole('dialog')
    await expect(preferences.getByText('General')).toBeVisible()

    const writeModeControl = preferences
      .getByRole('radiogroup')
      .filter({ hasText: 'Append' })
      .filter({ hasText: 'Overwrite' })
    const choiceModeControl = preferences
      .getByRole('radiogroup')
      .filter({ hasText: 'Single' })
      .filter({ hasText: 'Multiple' })

    await expectVerticalCentersAligned(
      preferences.getByText('Write Mode', { exact: true }),
      writeModeControl,
    )
    await expectVerticalCentersAligned(
      preferences.getByText('Choice Mode', { exact: true }),
      choiceModeControl,
    )
  })

  test('uses 14px for regular preference text', async ({ page }) => {
    await page.getByLabel('Settings').click()
    await page.getByText('Preferences').click()
    const preferences = page.getByRole('dialog')
    await expect(preferences.getByText('General')).toBeVisible()

    const writeModeControl = preferences
      .getByRole('radiogroup')
      .filter({ hasText: 'Append' })
      .filter({ hasText: 'Overwrite' })

    await expectFontSize(preferences.getByRole('tab', { name: 'General' }))
    await expectFontSize(preferences.getByText('Write Mode', { exact: true }))
    await expectFontSize(writeModeControl.getByText('Append', { exact: true }))
    await expectFontSize(preferences.getByText('Hide at Launch', { exact: true }))
  })

  test('places app behavior toggles at the top of advanced preferences', async ({ page }) => {
    await page.getByLabel('Settings').click()
    await page.getByText('Preferences').click()
    const preferences = page.getByRole('dialog')
    await expect(preferences.getByText('General')).toBeVisible()

    await preferences.getByRole('tab', { name: 'Advanced' }).click()
    await expect(preferences.getByText('Make SwitchHosts Better!', { exact: true })).toBeVisible()

    const orderedLabels = [
      'Show Title in Tray',
      'Remove Duplicate Records',
      'Refresh Remote Hosts at Launch',
      'Sync Child Items When Toggling Folders',
      'Tray Icon Shortcut',
      'Enable HTTP API',
    ]

    const visibleLabels: string[] = []
    for (const label of orderedLabels) {
      const text = preferences.getByText(label, { exact: true })
      if ((await text.count()) === 0) continue
      await expect(text).toBeVisible()
      visibleLabels.push(label)
    }
    expect(visibleLabels).toEqual(
      expect.arrayContaining([
        'Remove Duplicate Records',
        'Refresh Remote Hosts at Launch',
        'Sync Child Items When Toggling Folders',
        'Tray Icon Shortcut',
        'Enable HTTP API',
      ]),
    )

    const usageDataBox = await preferences
      .getByText('Make SwitchHosts Better!', { exact: true })
      .boundingBox()
    expect(usageDataBox).not.toBeNull()

    let previousY = 0
    for (const label of visibleLabels) {
      const labelBox = await preferences.getByText(label, { exact: true }).boundingBox()
      expect(labelBox).not.toBeNull()
      expect(labelBox!.y).toBeGreaterThanOrEqual(previousY)
      expect(labelBox!.y).toBeLessThan(usageDataBox!.y)
      previousY = labelBox!.y
    }
  })

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

  test('saves command and proxy preferences without closing the drawer', async ({ page }) => {
    await clearMockCalls(page)

    await page.getByLabel('Settings').click()
    await page.getByText('Preferences').click()
    const preferences = page.getByRole('dialog')
    await expect(preferences.getByText('General')).toBeVisible()

    await preferences.getByRole('tab', { name: 'Commands' }).click()
    await expect(preferences.getByRole('button', { name: 'Cancel' })).toBeHidden()
    await expect(preferences.getByRole('button', { name: 'OK' })).toBeHidden()

    await preferences.getByPlaceholder('# echo "ok!"').fill('echo saved')
    await preferences.getByRole('button', { name: 'Save' }).click()
    await expect(preferences.getByRole('button', { name: 'Saved' })).toBeVisible()
    await expect(preferences).toBeVisible()

    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return state.configs.cmd_after_hosts_apply
      })
      .toBe('echo saved')

    await preferences.getByRole('tab', { name: 'Proxy' }).click()
    await expect(
      preferences.getByText(
        'If enabled, remote Hosts downloads and app update checks/downloads will connect through the proxy.',
      ),
    ).toBeVisible()
    await preferences.getByRole('checkbox', { name: 'Use Proxy' }).check()
    await preferences.getByRole('combobox').click()
    await page.getByRole('option', { name: 'SOCKS5' }).click()
    const hostInput = preferences.getByLabel('Host', { exact: true })
    const portInput = preferences.getByLabel('Port', { exact: true })
    await hostInput.fill('a'.repeat(260))
    await expect(hostInput).toHaveValue('a'.repeat(253))
    await hostInput.fill('proxy.local')
    await portInput.fill('123456')
    await expect(portInput).toHaveValue('12345')
    await portInput.fill('99999')
    await expect(portInput).toHaveValue('65535')
    await portInput.fill('8080')
    await preferences.getByRole('button', { name: 'Save' }).click()
    await expect(preferences.getByRole('button', { name: 'Saved' })).toBeVisible()
    await expect(preferences).toBeVisible()

    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return {
          useProxy: state.configs.use_proxy,
          protocol: state.configs.proxy_protocol,
          host: state.configs.proxy_host,
          port: state.configs.proxy_port,
        }
      })
      .toEqual({ useProxy: true, protocol: 'socks5', host: 'proxy.local', port: 8080 })

    const calls = await getMockCalls(page)
    expect(configPatches(calls)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cmd_after_hosts_apply: 'echo saved' }),
        expect.objectContaining({
          use_proxy: true,
          proxy_protocol: 'socks5',
          proxy_host: 'proxy.local',
          proxy_port: 8080,
        }),
      ]),
    )
  })

  test('launch at login defaults off and saves immediately', async ({ page }) => {
    await clearMockCalls(page)

    await page.getByLabel('Settings').click()
    await page.getByText('Preferences').click()
    const preferences = page.getByRole('dialog')
    await expect(preferences.getByText('General')).toBeVisible()

    const launchAtLogin = preferences.getByLabel('Launch at Login')
    await expect(launchAtLogin).not.toBeChecked()

    await launchAtLogin.check()

    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return state.configs.launch_at_login
      })
      .toBe(true)

    const calls = await getMockCalls(page)
    expect(configPatches(calls)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ launch_at_login: true }),
      ]),
    )
  })

  test('refresh remote hosts at launch defaults off and saves immediately', async ({ page }) => {
    await clearMockCalls(page)

    await page.getByLabel('Settings').click()
    await page.getByText('Preferences').click()
    const preferences = page.getByRole('dialog')
    await expect(preferences.getByText('General')).toBeVisible()
    await preferences.getByRole('tab', { name: 'Advanced' }).click()
    await expect(
      preferences.getByText(
        'When enabled, every launch automatically refreshes all remote Hosts entries.',
      ),
    ).toBeVisible()

    const refreshAtLaunch = preferences.getByLabel('Refresh Remote Hosts at Launch')
    await expect(refreshAtLaunch).not.toBeChecked()

    await refreshAtLaunch.check()

    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return state.configs.refresh_remote_hosts_on_startup
      })
      .toBe(true)

    const calls = await getMockCalls(page)
    expect(configPatches(calls)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ refresh_remote_hosts_on_startup: true }),
      ]),
    )
  })

  test('automatic update checks default on and save immediately', async ({ page }) => {
    await clearMockCalls(page)

    await page.getByLabel('Settings').click()
    await page.getByText('Preferences').click()
    const preferences = page.getByRole('dialog')
    await expect(preferences.getByText('General')).toBeVisible()
    await expect(
      preferences.getByText(
        'When enabled, SwitchHosts will remind you when a new version is available and will not download or install updates automatically.',
      ),
    ).toBeVisible()

    const autoCheckUpdate = preferences.getByLabel('Automatically Check for Updates')
    await expect(autoCheckUpdate).toBeChecked()

    await autoCheckUpdate.uncheck()

    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return state.configs.auto_check_update
      })
      .toBe(false)

    const calls = await getMockCalls(page)
    expect(configPatches(calls)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ auto_check_update: false }),
      ]),
    )
  })

  test('manual no-update check reports latest version without downloading', async ({ page }) => {
    await clearMockCalls(page)
    await page.evaluate(() => {
      window.__SWITCHHOSTS_E2E__.delayNextCheckUpdate(300)
    })

    await page.getByLabel('Settings').click()
    await page.getByText('Check for Updates').click()

    await expect(page.getByText('Loading...')).toBeVisible()
    await expect(page.getByText('Current version is up to date.')).toBeVisible()
    const calls = await getMockCalls(page)
    expect(calls.some((call) => call.cmd === 'check_update')).toBe(true)
    expect(calls.some((call) => call.cmd === 'download_update')).toBe(false)
  })

  test('background update event only prompts until the user downloads', async ({ browser }) => {
    const page = await browser.newPage()

    try {
      await openApp(page, '/?e2eUpdateAvailable=true')
      await page.evaluate(() => {
        window.__SWITCHHOSTS_E2E__.emitNextUpdateAvailable()
      })

      const updateDialog = page.getByRole('dialog').filter({ hasText: 'New Version Found' })
      await expect(updateDialog).toBeVisible()
      await expect(updateDialog.getByText('Mock release notes')).toBeVisible()

      let calls = await getMockCalls(page)
      expect(calls.some((call) => call.cmd === 'download_update')).toBe(false)

      await updateDialog.getByRole('button', { name: /Download/ }).click()
      await expect(
        updateDialog.getByRole('button', { name: 'Restart to Complete Update' }),
      ).toBeVisible()

      calls = await getMockCalls(page)
      expect(calls.some((call) => call.cmd === 'download_update')).toBe(true)
    } finally {
      if (!page.isClosed()) {
        await page.close().catch(() => {})
      }
    }
  })

  test('startup skips update check when automatic checks are disabled', async ({ browser }) => {
    const page = await browser.newPage()

    try {
      await openApp(page, '/?e2eAutoCheckUpdate=false&e2eUpdateAvailable=true')
      await page.waitForTimeout(300)

      const calls = await getMockCalls(page)
      expect(calls.some((call) => call.cmd === 'check_update')).toBe(false)
      await expect(page.getByRole('dialog').filter({ hasText: 'New Version Found' })).toHaveCount(
        0,
      )
    } finally {
      if (!page.isClosed()) {
        await page.close().catch(() => {})
      }
    }
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
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return {
          leftPanelShow: state.configs.left_panel_show,
          rightPanelShow: state.configs.right_panel_show,
        }
      })
      .toEqual({ leftPanelShow: true, rightPanelShow: false })
    await page.locator('[data-id="local-dev"]').click()
    await expect(page.getByText('Rules')).not.toBeInViewport()

    await page.getByLabel('Toggle sidebar').click()
    await expect(page.locator('[data-id="local-dev"]')).not.toBeInViewport()

    await page.getByLabel('Toggle right panel').click()
    await expect(page.getByText('Rules')).toBeInViewport()

    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return {
          leftPanelShow: state.configs.left_panel_show,
          rightPanelShow: state.configs.right_panel_show,
        }
      })
      .toEqual({ leftPanelShow: false, rightPanelShow: true })

    expect(configPatches(await getMockCalls(page))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ left_panel_show: false }),
        expect.objectContaining({ right_panel_show: true }),
      ]),
    )
  })
})
