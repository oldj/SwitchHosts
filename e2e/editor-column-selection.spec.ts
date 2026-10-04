import type { Page } from '@playwright/test'
import { expect, getMockState, selectAllModifier, test } from './support/test'

const original = '127.0.0.1 alpha.local\n127.0.0.1 bravo.local\n127.0.0.1 charlie.local'

async function setContent(page: Page, content = original) {
  await page.locator('[data-id="local-dev"]').click()
  const editor = page.locator('.cm-content')
  await expect(editor).toContainText('dev.local')
  await editor.click()
  await page.keyboard.press(`${selectAllModifier}+A`)
  await page.keyboard.insertText(content)
  await expectSaved(page, content)
}

async function expectSaved(page: Page, content: string) {
  await expect(page.locator('.cm-content .cm-line')).toHaveText(content.split('\n'))
  await expect.poll(async () => (await getMockState(page)).contents['local-dev']).toBe(content)
}

// Measure text boundaries (including syntax-highlight spans), so the gesture works
// with the editor's actual font and in both Chromium and WebKit.
async function textPoint(page: Page, line: number, column: number) {
  return page
    .locator('.cm-content .cm-line')
    .nth(line)
    .evaluate((element, offset) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()
      while (node) {
        const length = node.textContent?.length ?? 0
        if (offset <= length) {
          const range = document.createRange()
          range.setStart(node, offset)
          range.collapse(true)
          const rect = range.getBoundingClientRect()
          return { x: rect.x, y: rect.y + rect.height / 2 }
        }
        offset -= length
        node = walker.nextNode()
      }
      throw new Error('Text position not found')
    }, column)
}

async function selectColumn(page: Page, fromColumn = 0, toColumn = 9, lastLine = 2) {
  // Wait for the opening sidebar transition before measuring drag coordinates.
  await page.locator('.cm-content').click({ trial: true })
  const start = await textPoint(page, 0, fromColumn)
  const end = await textPoint(page, lastLine, toColumn)
  await page.keyboard.down('Alt')
  await page.mouse.move(start.x, start.y)
  await expect(page.locator('.cm-content')).toHaveCSS('cursor', 'crosshair')
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 10 })
  await page.mouse.up()
  await page.keyboard.up('Alt')
}

for (const theme of ['light', 'dark']) {
  test(`brightens selected syntax and restores it after deselection in ${theme} mode`, async ({
    page,
  }) => {
    if (theme === 'dark') {
      await page.getByLabel('Settings').click()
      await page.getByText('Preferences').click()
      await page.getByRole('dialog').getByText('Dark', { exact: true }).click()
      await page.keyboard.press('Escape')
    }
    await setContent(page, '# comment\n127.0.0.1 localhost\n::1 localhost\ninvalid')
    const textColors = () =>
      page.locator('.cm-content').evaluate((editor) => {
        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
        const colors: string[] = []
        while (walker.nextNode()) {
          if (walker.currentNode.textContent?.trim()) {
            colors.push(getComputedStyle(walker.currentNode.parentElement!).color)
          }
        }
        return colors
      })
    const normalColors = await textColors()
    await page.keyboard.press(`${selectAllModifier}+A`)
    await expect
      .poll(async () => {
        const colors = await textColors()
        return (
          colors.length >= 6 &&
          colors.every((color) => {
            const channels = color.match(/[\d.]+/g)!.map(Number)
            // HSL lightness: selected glyphs should all be light, including plain text.
            return (Math.max(...channels) + Math.min(...channels)) / 510 >= 0.9
          })
        )
      })
      .toBe(true)
    expect(new Set(await textColors()).size).toBe(4)

    await page.keyboard.press('ArrowRight')
    await expect.poll(textColors).toEqual(normalColors)
    // A partial token selection must leave adjacent characters at their normal color.
    for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowLeft')
    await expect(page.locator('.hl-selection')).toHaveText('lid')
    await expect(page.locator('.cm-line').last()).toHaveCSS('color', normalColors.at(-1)!)
    await expect(page.locator('.hl-selection')).not.toHaveCSS('color', normalColors.at(-1)!)
  })

  test(`replaces an Alt-drag column, saves, undoes and redoes in ${theme} mode`, async ({
    page,
  }) => {
    if (theme === 'dark') {
      await page.getByLabel('Settings').click()
      await page.getByText('Preferences').click()
      await page.getByRole('dialog').getByText('Dark', { exact: true }).click()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).not.toBeVisible()
    }
    await setContent(page)
    await selectColumn(page)
    const selections = page.locator('.cm-selectionBackground')
    await expect(selections).toHaveCount(3)
    await expect(selections.first()).toBeVisible()
    await expect(selections.first()).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(page.locator('.cm-cursor-secondary')).toHaveCount(2)

    await page.keyboard.insertText('10.0.0.1')
    const edited = original.replaceAll('127.0.0.1', '10.0.0.1')
    await expectSaved(page, edited)
    await page.keyboard.press(`${selectAllModifier}+Z`)
    await expectSaved(page, original)
    await page.keyboard.press(`${selectAllModifier}+Shift+Z`)
    await expectSaved(page, edited)

    await page.locator('[data-id="local-api"]').click()
    await expect(page.locator('.cm-editor.cm-focused')).toHaveCount(0)
    await expect(page.locator('.cm-cursor:visible')).toHaveCount(0)
    await expect(page.locator('.cm-selectionBackground')).toHaveCount(0)
    await page.locator('[data-id="local-dev"]').click()
    await expectSaved(page, edited)
    await expect(page.locator('.cm-cursor-secondary')).toHaveCount(0)
  })
}

test('deletes a column and restores all rows with one undo', async ({ page }) => {
  await setContent(page)
  await selectColumn(page)
  await page.keyboard.press('Backspace')
  await expectSaved(page, original.replaceAll('127.0.0.1', ''))
  await page.keyboard.press(`${selectAllModifier}+Z`)
  await expectSaved(page, original)
})

test('pastes one value per selected row and undoes the paste together', async ({ page }) => {
  await setContent(page)
  await selectColumn(page)
  // Exercise CodeMirror's paste handler without relying on OS clipboard permissions.
  await page.locator('.cm-content').evaluate((editor) => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/plain', '10.0.0.1\n10.0.0.2\n10.0.0.3')
    editor.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
    )
  })
  await expectSaved(page, '10.0.0.1 alpha.local\n10.0.0.2 bravo.local\n10.0.0.3 charlie.local')
  await page.keyboard.press(`${selectAllModifier}+Z`)
  await expectSaved(page, original)
})

test('inserts at a zero-width column across short lines, blank lines and tabs', async ({
  page,
}) => {
  const content = 'abcd\nx\n\n\tend\nabcd'
  await setContent(page, content)
  await selectColumn(page, 4, 4, 4)
  await page.keyboard.insertText('!')
  await expectSaved(page, 'abcd!\nx!\n!\n\t!end\nabcd!')
})

test('comments every selected row and keeps the column selection', async ({ page }) => {
  await setContent(page)
  await selectColumn(page)
  await page.evaluate(() => window.__SWITCHHOSTS_E2E__.toggleComment())
  await expectSaved(
    page,
    original
      .split('\n')
      .map((line) => `# ${line}`)
      .join('\n'),
  )
  await expect(page.locator('.cm-selectionBackground')).toHaveCount(3)
  await page.keyboard.press(`${selectAllModifier}+Z`)
  await expectSaved(page, original)
  await page.keyboard.press(`${selectAllModifier}+Shift+Z`)
  await expectSaved(
    page,
    original
      .split('\n')
      .map((line) => `# ${line}`)
      .join('\n'),
  )
  await page.evaluate(() => window.__SWITCHHOSTS_E2E__.toggleComment())
  await expectSaved(page, original)
  await page.keyboard.insertText('10.0.0.1')
  await expectSaved(page, original.replaceAll('127.0.0.1', '10.0.0.1'))
})

test('keeps all column ranges when toggling a comment from the gutter', async ({ page }) => {
  await setContent(page)
  await selectColumn(page)
  await page.locator('.cm-lineNumbers .cm-gutterElement').filter({ hasText: /^2$/ }).click()
  await expectSaved(page, original.replace('127.0.0.1 bravo.local', '# 127.0.0.1 bravo.local'))
  await expect(page.locator('.cm-selectionBackground')).toHaveCount(3)
  await page.keyboard.insertText('10.0.0.1')
  await expectSaved(page, '10.0.0.1 alpha.local\n# 10.0.0.1 bravo.local\n10.0.0.1 charlie.local')
})

test('allows column selection in system hosts without editing or showing cursors', async ({
  page,
}) => {
  const before = (await getMockState(page)).systemHosts
  await expect(page.locator('.cm-content .cm-line')).toHaveText(before.split('\n'))
  await selectColumn(page, 0, 9, 1)
  await expect(page.locator('.cm-selectionBackground')).toHaveCount(2)
  await expect(page.locator('.cm-content')).toBeFocused()
  await page.keyboard.insertText('10.0.0.1')
  await page.keyboard.press('Backspace')
  await page.evaluate(() => window.__SWITCHHOSTS_E2E__.toggleComment())
  await expect(page.locator('.cm-content .cm-line')).toHaveText(before.split('\n'))
  await expect(page.locator('.cm-cursor:visible')).toHaveCount(0)
  expect((await getMockState(page)).systemHosts).toBe(before)
})
