import { clearMockCalls, expect, findEntry, getMockCalls, getMockState, test } from './support/test'

test.describe('folder choice mode', () => {
  test('enforces single-choice mode for folder children while applying hosts', async ({ page }) => {
    await clearMockCalls(page)

    const alpha = page.locator('[data-id="folder-single-alpha"]')
    const beta = page.locator('[data-id="folder-single-beta"]')
    await expect(alpha).toContainText('Single Alpha')
    await expect(beta).toContainText('Single Beta')

    const alphaToggle = alpha.getByRole('switch')
    const betaToggle = beta.getByRole('switch')
    await expect(alphaToggle).toHaveAttribute('aria-checked', 'false')
    await expect(betaToggle).toHaveAttribute('aria-checked', 'false')

    await alphaToggle.click()
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return {
          alphaOn: findEntry(state, 'folder-single-alpha')?.on,
          betaOn: findEntry(state, 'folder-single-beta')?.on,
          hasAlpha: state.systemHosts.includes('single-alpha.local'),
          hasBeta: state.systemHosts.includes('single-beta.local'),
        }
      })
      .toEqual({ alphaOn: true, betaOn: false, hasAlpha: true, hasBeta: false })

    await betaToggle.click()
    await expect(alphaToggle).toHaveAttribute('aria-checked', 'false')
    await expect(betaToggle).toHaveAttribute('aria-checked', 'true')
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return {
          alphaOn: findEntry(state, 'folder-single-alpha')?.on,
          betaOn: findEntry(state, 'folder-single-beta')?.on,
          hasAlpha: state.systemHosts.includes('single-alpha.local'),
          hasBeta: state.systemHosts.includes('single-beta.local'),
        }
      })
      .toEqual({ alphaOn: false, betaOn: true, hasAlpha: false, hasBeta: true })

    const applyCalls = (await getMockCalls(page)).filter(
      (call) => call.cmd === 'apply_hosts_selection',
    )
    expect(applyCalls).toHaveLength(2)
  })

  test('allows multiple folder children to stay enabled while applying hosts', async ({ page }) => {
    await clearMockCalls(page)

    const alpha = page.locator('[data-id="folder-multiple-alpha"]')
    const beta = page.locator('[data-id="folder-multiple-beta"]')
    await expect(alpha).toContainText('Multiple Alpha')
    await expect(beta).toContainText('Multiple Beta')

    const alphaToggle = alpha.getByRole('switch')
    const betaToggle = beta.getByRole('switch')
    await expect(alphaToggle).toHaveAttribute('aria-checked', 'false')
    await expect(betaToggle).toHaveAttribute('aria-checked', 'false')

    await alphaToggle.click()
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return {
          alphaOn: findEntry(state, 'folder-multiple-alpha')?.on,
          betaOn: findEntry(state, 'folder-multiple-beta')?.on,
          hasAlpha: state.systemHosts.includes('multiple-alpha.local'),
          hasBeta: state.systemHosts.includes('multiple-beta.local'),
        }
      })
      .toEqual({ alphaOn: true, betaOn: false, hasAlpha: true, hasBeta: false })

    await betaToggle.click()
    await expect(alphaToggle).toHaveAttribute('aria-checked', 'true')
    await expect(betaToggle).toHaveAttribute('aria-checked', 'true')
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return {
          alphaOn: findEntry(state, 'folder-multiple-alpha')?.on,
          betaOn: findEntry(state, 'folder-multiple-beta')?.on,
          hasAlpha: state.systemHosts.includes('multiple-alpha.local'),
          hasBeta: state.systemHosts.includes('multiple-beta.local'),
        }
      })
      .toEqual({ alphaOn: true, betaOn: true, hasAlpha: true, hasBeta: true })

    const applyCalls = (await getMockCalls(page)).filter(
      (call) => call.cmd === 'apply_hosts_selection',
    )
    expect(applyCalls).toHaveLength(2)
  })
})
