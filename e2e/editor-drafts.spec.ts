import {
  clearMockCalls,
  expect,
  getMockCalls,
  getMockState,
  openApp,
  selectAllModifier,
  test,
} from './support/test'

for (const [platform, ua, saveKey] of [
  ['Windows', 'Windows NT 10.0; Win64; x64', 'Control+s'],
  ['macOS', 'Macintosh; Intel Mac OS X 10_15_7', 'Meta+s'],
  ['Linux', 'X11; Linux x86_64', 'Control+s'],
]) {
  test.describe(platform, () => {
    test.use({ userAgent: `Mozilla/5.0 (${ua}) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36` })
    test('applies the latest edit on Ctrl+S, without saving typing pauses or reapplying on blur', async ({
      page,
    }) => {
      await page.locator('[data-id="local-api"]').click()
      const editor = page.locator('.cm-content')
      await expect(editor).toContainText('api.local')
      const before = (await getMockState(page)).systemHosts
      await clearMockCalls(page)
      await editor.click()
      await page.keyboard.press(`${selectAllModifier}+A`)
      await page.keyboard.type('192.0.2.10 partial.local\n')
      // Longer than the previous 1s debounce: this was the source of repeated UAC.
      await page.waitForTimeout(1200)
      await page.keyboard.press(`${selectAllModifier}+A`)
      await page.keyboard.type('192.0.2.11 complete.local\n')
      await page.waitForTimeout(1200)
      expect(
        (await getMockCalls(page)).filter((c) => c.cmd === 'apply_hosts_selection'),
      ).toHaveLength(0)
      expect((await getMockState(page)).systemHosts).toBe(before)
      await page.keyboard.press(saveKey)
      await expect
        .poll(async () => (await getMockState(page)).systemHosts)
        .toContain('complete.local')
      await page.locator('[data-id="local-dev"]').click()
      await expect(editor).toContainText('dev.local')
      expect(
        (await getMockCalls(page)).filter((c) => c.cmd === 'apply_hosts_selection'),
      ).toHaveLength(1)
    })

    test('saves a disabled group member on blur and refreshes the active group preview', async ({
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
      await page.keyboard.type('192.0.2.42 windows-group.local\n')
      await group.click()
      await expect(editor).toContainText('windows-group.local')
      await expect
        .poll(async () => (await getMockState(page)).systemHosts)
        .toContain('windows-group.local')
      expect(
        (await getMockCalls(page)).filter((c) => c.cmd === 'apply_hosts_selection'),
      ).toHaveLength(1)
    })

    test('recovers a draft after reload without applying it automatically', async ({ page }) => {
      await page.locator('[data-id="local-api"]').click()
      const editor = page.locator('.cm-content')
      await expect(editor).toContainText('api.local')
      await editor.click()
      await page.keyboard.press(`${selectAllModifier}+A`)
      await page.keyboard.type('192.0.2.123 recovered-draft.local\n')
      // A real page reload discards module state; it does not run React unmount cleanup.
      await page.reload()
      await page.locator('[data-id="local-api"]').click()
      await expect(editor).toContainText('recovered-draft.local')
      expect((await getMockState(page)).systemHosts).not.toContain('recovered-draft.local')
      expect(
        (await getMockCalls(page)).filter((c) => c.cmd === 'apply_hosts_selection'),
      ).toHaveLength(0)
      await editor.click()
      await page.keyboard.press(saveKey)
      await expect
        .poll(async () => (await getMockState(page)).systemHosts)
        .toContain('recovered-draft.local')
    })

    test('recovers an unacknowledged save after the window closes', async ({ page, context }) => {
      await page.locator('[data-id="local-api"]').click()
      const editor = page.locator('.cm-content')
      await expect(editor).toContainText('api.local')
      // Hold the backend acknowledgement, as when authorization is still pending.
      await page.evaluate(() => {
        const internals = (
          window as unknown as {
            __TAURI_INTERNALS__: { invoke: (...args: any[]) => Promise<unknown> }
          }
        ).__TAURI_INTERNALS__
        const original = internals.invoke
        internals.invoke = (command, ...args) =>
          command === 'apply_hosts_selection' ? new Promise(() => {}) : original(command, ...args)
      })
      await editor.click()
      await page.keyboard.press(`${selectAllModifier}+A`)
      await page.keyboard.type('192.0.2.124 unacknowledged.local\n')
      await page.keyboard.press(saveKey)
      await page.close()
      const reopened = await context.newPage()
      await openApp(reopened)
      await reopened.locator('[data-id="local-api"]').click()
      await expect(reopened.locator('.cm-content')).toContainText('unacknowledged.local')
      expect(
        (await getMockCalls(reopened)).filter((c) => c.cmd === 'apply_hosts_selection'),
      ).toHaveLength(0)
      await reopened.close()
    })

    test('combines a pending draft and a switch into exactly one application', async ({ page }) => {
      const row = page.locator('[data-id="local-dev"]')
      await row.click()
      const editor = page.locator('.cm-content')
      await expect(editor).toContainText('dev.local')
      await editor.click()
      await page.keyboard.press(`${selectAllModifier}+A`)
      await page.keyboard.type('192.0.2.55 combined.local\n')
      await expect(page.getByText('Pending application', { exact: true })).toBeVisible()
      await clearMockCalls(page)
      await row.getByRole('switch').click()
      await expect
        .poll(async () => (await getMockState(page)).systemHosts)
        .toContain('combined.local')
      await expect(page.getByText('Pending application', { exact: true })).toHaveCount(0)
      expect(
        (await getMockCalls(page)).filter((c) => c.cmd === 'apply_hosts_selection'),
      ).toHaveLength(1)
      expect((await getMockState(page)).contents['local-dev']).toContain('combined.local')
    })
    test('combines a disabled member draft with enabling its group', async ({ page }) => {
      const member = page.locator('[data-id="local-api"]')
      await member.getByRole('switch').click()
      await member.click()
      const editor = page.locator('.cm-content')
      await expect(editor).toContainText('api.local')
      await editor.click()
      await page.keyboard.press(`${selectAllModifier}+A`)
      await page.keyboard.type('192.0.2.56 combined-group.local\n')
      await clearMockCalls(page)
      await page.locator('[data-id="group-work"]').getByRole('switch').click()
      await expect
        .poll(async () => (await getMockState(page)).systemHosts)
        .toContain('combined-group.local')
      expect(
        (await getMockCalls(page)).filter((c) => c.cmd === 'apply_hosts_selection'),
      ).toHaveLength(1)
    })
    for (const lateRead of ['success', 'failure']) {
      test(`a group switch supersedes a blur save whose source read returns ${lateRead}`, async ({
        page,
      }) => {
        await page.locator('[data-id="local-api"]').click()
        const editor = page.locator('.cm-content')
        await expect(editor).toContainText('api.local')
        await editor.click()
        await page.keyboard.press(`${selectAllModifier}+A`)
        await page.keyboard.type('192.0.2.58 delayed-blur.local\n')
        await page.evaluate((lateRead) => {
          const target = window as any
          const original = target.__TAURI_INTERNALS__.invoke
          let held = false
          target.__TAURI_INTERNALS__.invoke = async (command: string, ...args: any[]) => {
            if (command === 'get_content_of_list' && !held) {
              held = true
              await new Promise<void>((resolve, reject) => {
                target.releaseDraftRead = () =>
                  lateRead === 'failure'
                    ? reject(new Error('obsolete source read failed'))
                    : resolve()
              })
            }
            return original(command, ...args)
          }
        }, lateRead)
        await clearMockCalls(page)
        await page.locator('[data-id="local-dev"]').click()
        await expect
          .poll(() => page.evaluate(() => typeof (window as any).releaseDraftRead))
          .toBe('function')
        await page.locator('[data-id="group-work"]').getByRole('switch').click()
        await page.evaluate(() => (window as any).releaseDraftRead())
        await expect
          .poll(async () => (await getMockState(page)).systemHosts)
          .toContain('delayed-blur.local')
        await expect(page.locator('[data-id="group-work"]').getByRole('switch')).toHaveAttribute(
          'aria-checked',
          'true',
        )
        expect(
          (await getMockCalls(page)).filter((c) => c.cmd === 'apply_hosts_selection'),
        ).toHaveLength(1)
      })
    }
    test('background remote refresh cannot publish an editing draft', async ({ page }) => {
      await page.locator('[data-id="local-api"]').click()
      const editor = page.locator('.cm-content')
      await expect(editor).toContainText('api.local')
      await editor.click()
      await page.keyboard.press(`${selectAllModifier}+A`)
      await page.keyboard.type('192.0.2.57 private-draft.local\n')
      await page.evaluate(async () => {
        const internals = (window as any).__TAURI_INTERNALS__
        await internals.invoke('refresh_remote_hosts', { args: ['remote-blocklist'] })
      })
      expect((await getMockState(page)).systemHosts).not.toContain('private-draft.local')
      expect((await getMockState(page)).contents['local-api']).not.toContain('private-draft.local')
      await expect(editor).toContainText('private-draft.local')
    })
    test('commits an unselected source without changing the system file', async ({ page }) => {
      await page.locator('[data-id="local-dev"]').click()
      const editor = page.locator('.cm-content')
      await expect(editor).toContainText('dev.local')
      const before = (await getMockState(page)).systemHosts
      await editor.click()
      await page.keyboard.press(`${selectAllModifier}+A`)
      await page.keyboard.type('192.0.2.59 inactive.local\n')
      await page.keyboard.press(saveKey)
      await expect(page.getByText('Pending application', { exact: true })).toHaveCount(0)
      expect((await getMockState(page)).contents['local-dev']).toContain('inactive.local')
      expect((await getMockState(page)).systemHosts).toBe(before)
    })
    test('a rejected application keeps the draft pending for explicit retry', async ({ page }) => {
      await page.locator('[data-id="local-api"]').click()
      const editor = page.locator('.cm-content')
      await expect(editor).toContainText('api.local')
      const before = await getMockState(page)
      await editor.click()
      await page.keyboard.press(`${selectAllModifier}+A`)
      await page.keyboard.type('192.0.2.60 retry.local\n')
      await page.evaluate(() =>
        window.__SWITCHHOSTS_E2E__.failNextApply({ success: false, code: 'cancelled' } as any),
      )
      await page.keyboard.press(saveKey)
      await expect(page.getByRole('button', { name: 'Discard draft', exact: true })).toBeEnabled()
      await expect(page.getByText('Pending application', { exact: true })).toBeVisible()
      expect((await getMockState(page)).contents['local-api']).toBe(before.contents['local-api'])
      expect((await getMockState(page)).systemHosts).toBe(before.systemHosts)
      await page.keyboard.press(saveKey)
      await expect.poll(async () => (await getMockState(page)).systemHosts).toContain('retry.local')
    })
    test('discard removes the draft without applying or replacing committed source content', async ({
      page,
    }) => {
      await page.locator('[data-id="local-api"]').click()
      const editor = page.locator('.cm-content')
      await expect(editor).toContainText('api.local')
      const before = await getMockState(page)
      await editor.click()
      await page.keyboard.press(`${selectAllModifier}+A`)
      await page.keyboard.type('192.0.2.58 discard.local\n')
      await clearMockCalls(page)
      await page.getByRole('button', { name: 'Discard draft', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(editor).toContainText('discard.local')
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(dialog).toHaveCount(0)
      await expect(editor).toContainText('discard.local')
      await page.getByRole('button', { name: 'Discard draft', exact: true }).click()
      await expect(dialog).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
      await expect(editor).toContainText('discard.local')
      await page.getByRole('button', { name: 'Discard draft', exact: true }).click()
      await dialog.getByRole('button', { name: 'Discard draft', exact: true }).click()
      await expect(editor).toContainText('api.local')
      expect(
        (await getMockCalls(page)).filter((c) => c.cmd === 'apply_hosts_selection'),
      ).toHaveLength(0)
      expect((await getMockState(page)).systemHosts).toBe(before.systemHosts)
    })
    test('new typing can be saved before an obsolete discard read finishes', async ({ page }) => {
      await page.locator('[data-id="local-api"]').click()
      const editor = page.locator('.cm-content')
      await expect(editor).toContainText('api.local')
      await editor.fill('192.0.2.61 original-draft.local\n')
      await page.evaluate(() => {
        const target = window as any
        const original = target.__TAURI_INTERNALS__.invoke
        let held = false
        target.__TAURI_INTERNALS__.invoke = async (command: string, ...args: any[]) => {
          const response = await original(command, ...args)
          if (command === 'get_hosts_content' && !held) {
            held = true
            await new Promise<void>((resolve) => {
              target.releaseDiscardRead = resolve
            })
          }
          return response
        }
      })
      await clearMockCalls(page)
      await page.getByRole('button', { name: 'Discard draft', exact: true }).click()
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Discard draft', exact: true })
        .click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect
        .poll(() => page.evaluate(() => typeof (window as any).releaseDiscardRead))
        .toBe('function')
      await expect(editor).toContainText('original-draft.local')
      await editor.fill('192.0.2.62 newer-draft.local\n')
      await expect(page.getByRole('button', { name: 'Discard draft', exact: true })).toBeEnabled()
      await page.keyboard.press(saveKey)
      await expect
        .poll(async () => (await getMockState(page)).contents['local-api'])
        .toContain('newer-draft.local')
      await page.evaluate(() => (window as any).releaseDiscardRead())
      await expect(editor).toContainText('newer-draft.local')
      await expect(page.getByText('Pending application', { exact: true })).toHaveCount(0)
      expect(
        (await getMockCalls(page)).filter((c) => c.cmd === 'apply_hosts_selection'),
      ).toHaveLength(1)
    })
    test('recovers a damaged draft with confirmation and can apply through the button', async ({
      page,
    }) => {
      await page.locator('[data-id="local-api"]').click()
      const editor = page.locator('.cm-content')
      await expect(editor).toContainText('api.local')
      await editor.fill('192.0.2.70 damaged-draft.local\n')
      await page.evaluate(() => {
        const key = Object.keys(localStorage).find(
          (key) => key.startsWith('switchhosts:editor-draft:v1:') && key.endsWith(':local-api'),
        )!
        localStorage.setItem(key, '{broken')
      })
      await page.reload()
      await page.locator('[data-id="local-api"]').click()
      await expect(page.getByRole('alert')).toBeVisible()
      await page.getByRole('alert').getByRole('button', { name: 'Discard draft' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(page.getByRole('alert')).toBeVisible()
      await page.getByRole('alert').getByRole('button', { name: 'Discard draft' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Discard draft' }).click()
      await expect(page.getByRole('alert')).toHaveCount(0)
      await expect(editor).toContainText('api.local')
      await clearMockCalls(page)
      await editor.fill('192.0.2.71 recovered-button.local\n')
      await page.getByRole('button', { name: 'Apply', exact: true }).click()
      await expect
        .poll(async () => (await getMockState(page)).systemHosts)
        .toContain('recovered-button.local')
      expect(
        (await getMockCalls(page)).filter((call) => call.cmd === 'apply_hosts_selection'),
      ).toHaveLength(1)
    })

    test('clicking the pending label applies on blur without claiming a button action', async ({
      page,
    }) => {
      await page.locator('[data-id="local-api"]').click()
      const editor = page.locator('.cm-content')
      await expect(editor).toContainText('api.local')
      await editor.fill('192.0.2.72 status-blur.local\n')
      await clearMockCalls(page)
      await page.getByText('Pending application', { exact: true }).click()
      await expect
        .poll(async () => (await getMockState(page)).systemHosts)
        .toContain('status-blur.local')
      expect(
        (await getMockCalls(page)).filter((call) => call.cmd === 'apply_hosts_selection'),
      ).toHaveLength(1)
    })
  })
}
