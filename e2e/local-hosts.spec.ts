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
  test('saves a disabled group member and updates the active group without retoggling', async ({
    page,
  }) => {
    const member = page.locator('[data-id="local-api"]')
    await member.getByRole('switch').click()
    await expect(member.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    const group = page.locator('[data-id="group-work"]')
    await group.getByRole('switch').click()
    await expect(group.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    await member.click()
    const editor = page.locator('.cm-content')
    await expect(editor).toContainText('api.local')
    await clearMockCalls(page)
    await editor.click()
    await page.keyboard.press(`${selectAllModifier}+A`)
    await page.keyboard.type('192.0.2.42 updated-group.local\n')
    // Switch to the preview before the debounced save completes. The backend
    // event must refresh it even though the edited member's switch stays off.
    await group.click()
    await expect(editor).toContainText('updated-group.local')
    await expect(editor).toContainText('ads.example.test')
    await expect
      .poll(async () => (await getMockState(page)).systemHosts)
      .toContain('192.0.2.42 updated-group.local')
    await expect(member.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    const calls = await getMockCalls(page)
    expect(calls.some((call) => call.cmd === 'set_hosts_content')).toBe(true)
    expect(calls.some((call) => call.cmd === 'apply_hosts_selection')).toBe(false)
  })

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

test('preserves system hosts when recovering an empty saved selection', async ({ page }) => {
  const before = await getMockState(page)
  await page.evaluate(() => window.__SWITCHHOSTS_E2E__.seedEmptySelectionRecovery())
  const button = page.locator('#root').getByRole('button', { name: 'Reapply saved settings' })
  await expect(button).toBeVisible()
  await clearMockCalls(page)
  await button.click()
  await expect(button).toHaveCount(0)
  const after = await getMockState(page)
  expect(after.systemHosts).toBe(before.systemHosts)
  expect(after.history).toEqual(before.history)
  const finish = (await getMockCalls(page)).find((call) => call.cmd === 'finish_hosts_application')
  expect(finish?.args?.args?.[1]).toBe(false)
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

for (const finish of ['acknowledge', 'compensate'] as const) {
  test(`mock retains saved content until pending apply can ${finish}`, async ({ page }) => {
    const result = await page.evaluate(async (finish) => {
      const invoke = (
        window as unknown as {
          __TAURI_INTERNALS__: { invoke: (cmd: string, args: { args: unknown[] }) => Promise<any> }
        }
      ).__TAURI_INTERNALS__.invoke
      const before = window.__SWITCHHOSTS_E2E__.getState()
      const applied = await invoke('apply_hosts_selection', { args: ['192.0.2.1 previous.test'] })
      await invoke('set_hosts_content', { args: ['local-api', '192.0.2.99 deferred.test'] })
      const pending = window.__SWITCHHOSTS_E2E__.getState().systemHosts
      if (finish === 'acknowledge') {
        await invoke('finish_hosts_application', {
          args: [applied.new_content, true, null, applied.generation],
        })
      } else {
        await invoke('restore_system_hosts', {
          args: [applied.old_content, applied.new_content, before.list, null, applied.generation],
        })
      }
      return { pending, after: window.__SWITCHHOSTS_E2E__.getState().systemHosts }
    }, finish)
    expect(result.pending).not.toContain('deferred.test')
    expect(result.after).toContain('192.0.2.99 deferred.test')
  })
}

test('rejects stale finish and compensation for identical newer applied content', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const invoke = (
      window as unknown as {
        __TAURI_INTERNALS__: { invoke: (cmd: string, args: { args: unknown[] }) => Promise<any> }
      }
    ).__TAURI_INTERNALS__.invoke
    const before = window.__SWITCHHOSTS_E2E__.getState()
    const content = '192.0.2.1 identical.test'
    const first = await invoke('apply_hosts_selection', { args: [content] })
    await invoke('apply_hosts_selection', { args: [content] })
    const finished = await invoke('finish_hosts_application', {
      args: [first.new_content, true, null, first.generation],
    })
    const restored = await invoke('restore_system_hosts', {
      args: [first.old_content, first.new_content, before.list, null, first.generation],
    })
    return { finished, restored, content: window.__SWITCHHOSTS_E2E__.getState().systemHosts }
  })
  expect(result.finished.superseded).toBe(true)
  expect(result.restored.superseded).toBe(true)
  expect(result.content).toContain('identical.test')
})

test('keeps the newer enabled switch after a superseded finish reloads identical saved data', async ({
  page,
}) => {
  await page.evaluate(() => {
    const bridge = (
      window as unknown as {
        __TAURI_INTERNALS__: { invoke: (cmd: string, args: { args: unknown[] }) => Promise<any> }
      }
    ).__TAURI_INTERNALS__
    const invoke = bridge.invoke.bind(bridge)
    let replaced = false
    bridge.invoke = async (cmd, args) => {
      if (cmd === 'finish_hosts_application' && !replaced) {
        replaced = true
        // Another window reapplies the same saved selection before this
        // window's acknowledgement reaches the backend.
        const list = await invoke('get_list', { args: [] })
        const content = await invoke('get_content_of_list', { args: [list] })
        const newer = await invoke('apply_hosts_selection', { args: [content] })
        await invoke('set_list', { args: [list, list, newer.generation] })
        await invoke('finish_hosts_application', {
          args: [newer.new_content, true, null, newer.generation],
        })
      }
      return invoke(cmd, args)
    }
  })
  const item = page.locator('[data-id="local-dev"]')
  await item.getByRole('switch').click()
  await expect
    .poll(async () => {
      const calls = await getMockCalls(page)
      return calls.filter((call) => call.cmd === 'finish_hosts_application').length
    })
    .toBe(2)
  await expect
    .poll(async () => {
      const calls = await getMockCalls(page)
      const updates = calls
        .filter(
          (call) => call.cmd === 'plugin:event|emit' && call.args?.event === 'set_hosts_on_status',
        )
        .map((call) => (call.args?.payload as { _args: unknown[] })._args)
        .filter((args) => args[0] === 'local-dev')
      return updates.at(-1)?.[1]
    })
    .toBe(true)
  await expect(item.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  expect((await getMockState(page)).list.find((item) => item.id === 'local-dev')?.on).toBe(true)
  const calls = await getMockCalls(page)
  expect(calls.some((call) => call.cmd === 'restore_system_hosts')).toBe(false)
})
