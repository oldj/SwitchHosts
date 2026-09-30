import {
  clearMockCalls,
  configPatches,
  expect,
  getMockCalls,
  getMockState,
  gotoApp,
  initialSystemHosts,
  selectAllModifier,
  test,
} from './support/test'

test.describe('local hosts', () => {
  test('selects a local hosts entry and saves editor changes', async ({ page }) => {
    await page.locator('[data-id="local-dev"]').click()

    await expect(page.locator('.cm-content')).toContainText('dev.local')
    await expect(page.getByText('Development').first()).toBeVisible()

    const editor = page.locator('.cm-content')
    await editor.click()
    await page.keyboard.press(`${selectAllModifier}+A`)
    await page.keyboard.type('127.0.0.1 edited.local\n')

    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return state.contents['local-dev']
      })
      .toBe('127.0.0.1 edited.local\n')

    const calls = await getMockCalls(page)
    expect(calls.some((call) => call.cmd === 'set_hosts_content')).toBe(true)
  })

  test('clears the editor cursor when switching hosts entries', async ({ page }) => {
    await page.locator('[data-id="local-dev"]').click()
    const editor = page.locator('.cm-content')
    await expect(editor).toContainText('dev.local')

    await editor.click()
    await expect(page.locator('.cm-editor.cm-focused')).toHaveCount(1)

    await page.locator('[data-id="local-api"]').click()
    await expect(editor).toContainText('api.local')
    await expect(page.locator('.cm-editor.cm-focused')).toHaveCount(0)
    await expect(editor).toHaveCSS('caret-color', 'rgba(0, 0, 0, 0)')

    const visibleCursorCount = await page.locator('.cm-cursor-primary').evaluateAll(
      (cursors) =>
        cursors.filter((cursor) => {
          const style = window.getComputedStyle(cursor)
          const rect = cursor.getBoundingClientRect()
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            rect.height > 0
          )
        }).length,
    )
    expect(visibleCursorCount).toBe(0)
  })

  test('toggles a local hosts entry and applies the generated system hosts', async ({ page }) => {
    const row = page.locator('[data-id="local-dev"]')
    await row.click()

    const toggle = row.getByRole('switch')
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await toggle.click()

    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return {
          localDevOn: state.list.find((item) => item.id === 'local-dev')?.on,
          systemHosts: state.systemHosts,
        }
      })
      .toEqual({
        localDevOn: true,
        systemHosts:
          '127.0.0.1 localhost\n255.255.255.255 broadcasthost\n\n# --- SWITCHHOSTS_CONTENT_START ---\n\n127.0.0.1 dev.local\n::1 dev.local\n\n\n10.0.0.8 api.local\n# 10.0.0.9 api-shadow.local\n\n# --- SWITCHHOSTS_CONTENT_END ---\n',
      })

    const calls = await getMockCalls(page)
    expect(calls.some((call) => call.cmd === 'get_content_of_list')).toBe(true)
    expect(calls.some((call) => call.cmd === 'apply_hosts_selection')).toBe(true)
  })

  test('rolls back the switch when applying hosts fails', async ({ page }) => {
    await clearMockCalls(page)
    await page.evaluate(() => {
      window.__SWITCHHOSTS_E2E__.failNextApply({
        code: 'cancelled',
        message: 'User cancelled',
      })
    })

    const row = page.locator('[data-id="local-dev"]')
    await row.click()

    const toggle = row.getByRole('switch')
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await toggle.click()

    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return {
          localDevOn: state.list.find((item) => item.id === 'local-dev')?.on,
          systemHosts: state.systemHosts,
        }
      })
      .toEqual({
        localDevOn: false,
        systemHosts: initialSystemHosts,
      })

    const calls = await getMockCalls(page)
    expect(calls.some((call) => call.cmd === 'get_content_of_list')).toBe(true)
    expect(calls.some((call) => call.cmd === 'apply_hosts_selection')).toBe(true)
  })

  test('rolls back the collapsed titlebar switch when applying hosts fails', async ({ page }) => {
    await clearMockCalls(page)
    await page.locator('[data-id="local-dev"]').click()
    await page.getByLabel('Toggle sidebar').click()

    await page.evaluate(() => {
      window.__SWITCHHOSTS_E2E__.failNextApply({
        code: 'no_access',
        message: 'No access',
      })
    })

    const titlebarToggle = page.getByRole('switch', { name: 'Toggle current hosts' })
    await expect(titlebarToggle).toHaveAttribute('aria-checked', 'false')
    await titlebarToggle.click()

    await expect(titlebarToggle).toHaveAttribute('aria-checked', 'false')
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return {
          localDevOn: state.list.find((item) => item.id === 'local-dev')?.on,
          systemHosts: state.systemHosts,
        }
      })
      .toEqual({
        localDevOn: false,
        systemHosts: initialSystemHosts,
      })

    const calls = await getMockCalls(page)
    expect(calls.some((call) => call.cmd === 'get_content_of_list')).toBe(true)
    expect(calls.some((call) => call.cmd === 'apply_hosts_selection')).toBe(true)
  })

  test('centers the collapsed titlebar switch with adjacent titlebar controls', async ({
    page,
  }) => {
    await page.locator('[data-id="local-dev"]').click()
    await page.getByLabel('Toggle sidebar').click()

    const titlebarToggle = page.getByRole('switch', { name: 'Toggle current hosts' })
    const rightPanelButton = page.getByLabel('Toggle right panel')

    await expect(titlebarToggle).toBeVisible()
    await expect(rightPanelButton).toBeVisible()

    const [toggleBox, buttonBox] = await Promise.all([
      titlebarToggle.boundingBox(),
      rightPanelButton.boundingBox(),
    ])
    expect(toggleBox).not.toBeNull()
    expect(buttonBox).not.toBeNull()

    const toggleCenter = toggleBox!.y + toggleBox!.height / 2
    const buttonCenter = buttonBox!.y + buttonBox!.height / 2
    expect(Math.abs(toggleCenter - buttonCenter)).toBeLessThanOrEqual(0.5)
  })

  test('prompts for write mode before first apply and then continues toggling', async ({
    page,
  }) => {
    await gotoApp(page, '/?e2eWriteMode=null')
    await clearMockCalls(page)

    const row = page.locator('[data-id="local-dev"]')
    await row.click()

    const toggle = row.getByRole('switch')
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await toggle.click()

    await expect(page.getByText('Set Write Mode')).toBeVisible()
    await page.getByLabel('Append').click()
    await page.getByRole('button', { name: 'OK' }).click()

    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return {
          writeMode: state.configs.write_mode,
          localDevOn: state.list.find((item) => item.id === 'local-dev')?.on,
          systemHosts: state.systemHosts,
        }
      })
      .toEqual({
        writeMode: 'append',
        localDevOn: true,
        systemHosts:
          '127.0.0.1 localhost\n255.255.255.255 broadcasthost\n\n# --- SWITCHHOSTS_CONTENT_START ---\n\n127.0.0.1 dev.local\n::1 dev.local\n\n\n10.0.0.8 api.local\n# 10.0.0.9 api-shadow.local\n\n# --- SWITCHHOSTS_CONTENT_END ---\n',
      })

    const calls = await getMockCalls(page)
    expect(configPatches(calls)).toEqual(
      expect.arrayContaining([expect.objectContaining({ write_mode: 'append' })]),
    )
    expect(calls.some((call) => call.cmd === 'apply_hosts_selection')).toBe(true)
  })
})

test('keeps the applied snapshot until saved settings are explicitly reapplied', async ({
  page,
}) => {
  await page.evaluate(() => window.__SWITCHHOSTS_E2E__.failNextSaveAndRestore())
  const toggle = page.locator('[data-id="local-dev"]').getByRole('switch')
  await toggle.click()
  const notice = page
    .locator('#root')
    .getByRole('alert')
    .filter({ hasText: 'The list shows the applied snapshot' })
  await expect(notice).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await expect(toggle).toHaveAttribute('aria-disabled', 'true')
  expect((await getMockState(page)).list.find((item) => item.id === 'local-dev')?.on).toBe(false)
  await notice.getByRole('button', { name: 'Reapply saved settings' }).click()
  await expect(notice).toHaveCount(0)
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await expect(toggle).not.toHaveAttribute('aria-disabled', 'true')
})

test('shows unknown state rather than claiming an old selection is active after external modification', async ({
  page,
}) => {
  await page.evaluate(() => window.__SWITCHHOSTS_E2E__.failNextSaveAndRestore('content_changed'))
  const row = page.locator('[data-id="local-dev"]')
  await row.getByRole('switch').click()
  const notice = page
    .locator('#root')
    .getByRole('alert')
    .filter({ hasText: 'The active hosts selection cannot be confirmed' })
  await expect(notice).toBeVisible()
  await expect(row.getByRole('switch')).toHaveCount(0)
  await expect(row.getByRole('status')).toHaveText('?')
  await expect(row).toHaveAttribute('draggable', 'false')
  expect((await getMockState(page)).systemHosts).toBe('10.9.9.9 external.test\n')
  await notice.getByRole('button', { name: 'Reapply saved settings' }).click()
  await expect(notice).toHaveCount(0)
  await expect(row.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  await expect(row).toHaveAttribute('draggable', 'true')
})

for (const failure of ['cancelled', 'transport'] as const) {
  test(`recovers from ${failure} while the main list is unmounted in trashcan view`, async ({
    page,
  }) => {
    await page.evaluate((mode) => window.__SWITCHHOSTS_E2E__.failNextSaveAndRestore(mode), failure)
    await page.locator('[data-id="local-dev"]').getByRole('switch').click()
    await expect(
      page.locator('#root').getByRole('button', { name: 'Reapply saved settings' }),
    ).toBeVisible()
    // Wait for the reload broadcast by the failed compensation, not just its toast.
    await expect
      .poll(async () => {
        const calls = await getMockCalls(page)
        const restore = calls.findLastIndex((call) => call.cmd === 'restore_system_hosts')
        return (
          restore >= 0 && calls.slice(restore + 1).some((call) => call.cmd === 'get_basic_data')
        )
      })
      .toBe(true)
    if (failure === 'transport') {
      await expect(page.locator('[data-id="local-dev"]').getByRole('switch')).toHaveCount(0)
      await expect(page.locator('[data-id="local-dev"]').getByRole('status')).toHaveText('?')
    }
    await page.getByLabel('Trashcan', { exact: true }).click()
    await expect(page.getByText('Trashcan is empty')).toBeVisible()
    await page.getByLabel('Trashcan', { exact: true }).click()
    await clearMockCalls(page)
    const recoveryButton = page
      .locator('#root')
      .getByRole('button', { name: 'Reapply saved settings' })
    await expect(recoveryButton).toBeVisible()
    await recoveryButton.click()
    await expect(recoveryButton).toHaveCount(0)
    const calls = await getMockCalls(page)
    expect(calls.filter((call) => call.cmd === 'apply_hosts_selection')).toHaveLength(1)
    expect(calls.filter((call) => call.cmd === 'finish_hosts_application')).toHaveLength(1)
    await page.getByLabel('Hosts', { exact: true }).click()
    await expect(page.locator('[data-id="local-dev"]').getByRole('switch')).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })
}
