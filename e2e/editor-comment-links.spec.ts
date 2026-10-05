import {
  clearMockCalls,
  expect,
  firstInvokeArg,
  getMockCalls,
  getMockState,
  selectAllModifier,
  test,
} from './support/test'
import type { Locator } from '@playwright/test'

async function colorChannels(link: Locator) {
  return link.evaluate((element) => {
    // Normalize both rgb() and color(srgb ...) returned by color-mix().
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')!
    context.fillStyle = getComputedStyle(element).color
    context.fillRect(0, 0, 1, 1)
    return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3)
  })
}

for (const theme of ['light', 'dark']) {
  test(`shows modifier-hover feedback only on the hovered link in ${theme} mode`, async ({
    page,
  }) => {
    if (theme === 'dark') {
      await page.getByLabel('Settings').click()
      await page.getByText('Preferences').click()
      await page.getByRole('dialog').getByText('Dark', { exact: true }).click()
      await page.keyboard.press('Escape')
    }
    await page.locator('[data-id="local-dev"]').click()
    const editor = page.locator('.cm-content')
    await expect(editor).toContainText('dev.local')
    await editor.click()
    await page.keyboard.press(`${selectAllModifier}+A`)
    await page.keyboard.insertText(
      '# https://example.test/\n127.0.0.1 localhost # https://inline.test/',
    )
    const links = editor.locator('.hl-comment-link')
    await expect(links).toHaveCount(2)
    const normal = [await colorChannels(links.first()), await colorChannels(links.last())]
    const modifier = (await page
      .locator('body')
      .evaluate((body) => body.classList.contains('platform-darwin')))
      ? 'Meta'
      : 'Control'

    // A stationary pointer must react even when the editor has no keyboard focus.
    await editor.evaluate((element) => (element as HTMLElement).blur())
    await links.first().hover()
    await expect(links.first()).not.toHaveCSS('cursor', 'pointer')
    await page.keyboard.down(modifier)
    await expect(links.first()).toHaveCSS('cursor', 'pointer')
    const expectEmphasis = async (index: number) => {
      await expect
        .poll(async () => {
          const channels = await colorChannels(links.nth(index))
          return channels.every((value, channel) =>
            theme === 'light' ? value < normal[index][channel] : value > normal[index][channel],
          )
        })
        .toBe(true)
    }
    await expectEmphasis(0)
    expect(await colorChannels(links.last())).toEqual(normal[1])
    await links.last().hover()
    await expect(links.last()).toHaveCSS('cursor', 'pointer')
    await expectEmphasis(1)
    expect(await colorChannels(links.first())).toEqual(normal[0])

    await page.keyboard.up(modifier)
    await expect(links.last()).not.toHaveCSS('cursor', 'pointer')
    expect(await colorChannels(links.last())).toEqual(normal[1])
    await page.keyboard.down(modifier)
    await expect(links.last()).toHaveCSS('cursor', 'pointer')
    await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    await expect(links.last()).not.toHaveCSS('cursor', 'pointer')
    expect(await colorChannels(links.last())).toEqual(normal[1])
    await page.keyboard.up(modifier)

    // Also cover holding the key before entering a link, then leaving it.
    await page.mouse.move(0, 0)
    await page.keyboard.down(modifier)
    await links.first().hover()
    await expect(links.first()).toHaveCSS('cursor', 'pointer')
    await page.mouse.move(0, 0)
    expect(await colorChannels(links.first())).toEqual(normal[0])
    await page.keyboard.up(modifier)
  })
}

test('underlines comment URLs and opens them only with the platform modifier', async ({ page }) => {
  await page.locator('[data-id="local-dev"]').click()
  const editor = page.locator('.cm-content')
  await expect(editor).toContainText('dev.local')
  await editor.click()
  await page.keyboard.press(`${selectAllModifier}+A`)
  const content =
    '# See (https://example.test/docs?q=1#intro).\n127.0.0.1 localhost # http://localhost:8080/\nhttps://outside.test/'
  await page.keyboard.insertText(content)
  const links = editor.locator('.hl-comment-link')
  await expect(links).toHaveText(['https://example.test/docs?q=1#intro', 'http://localhost:8080/'])
  await expect(links.first()).toHaveCSS('text-decoration-line', 'underline')
  await expect.poll(async () => (await getMockState(page)).contents['local-dev']).toBe(content)
  await clearMockCalls(page)

  await links.first().click()
  expect((await getMockCalls(page)).filter((call) => call.cmd === 'open_url')).toHaveLength(0)

  // Select all so the URL decoration is nested with the selection decoration.
  await page.keyboard.press(`${selectAllModifier}+A`)
  // The dev server can override the app platform independently of the test host.
  const linkModifier = (await page
    .locator('body')
    .evaluate((body) => body.classList.contains('platform-darwin')))
    ? 'Meta'
    : 'Control'
  for (const link of [links.first(), links.last()]) {
    if (linkModifier === selectAllModifier) {
      await link.click({ modifiers: [linkModifier] })
    } else {
      // macOS reserves native Ctrl-click for its context menu, even when the
      // renderer is previewing Windows/Linux. Exercise that platform's DOM events.
      const modifiers = { ctrlKey: linkModifier === 'Control', metaKey: linkModifier === 'Meta' }
      await link.dispatchEvent('mousedown', { button: 0, ...modifiers })
      await link.dispatchEvent('click', { button: 0, ...modifiers })
    }
  }
  await expect
    .poll(async () =>
      (await getMockCalls(page)).filter((call) => call.cmd === 'open_url').map(firstInvokeArg),
    )
    .toEqual(['https://example.test/docs?q=1#intro', 'http://localhost:8080/'])
  // Modifier-click must preserve selection, allowing replacement and undo.
  await page.keyboard.insertText('# replaced')
  await expect(editor).toHaveText('# replaced')
  await expect(links).toHaveCount(0)
  await page.keyboard.press(`${selectAllModifier}+Z`)
  await expect(links).toHaveCount(2)
  await expect.poll(async () => (await getMockState(page)).contents['local-dev']).toBe(content)
})
