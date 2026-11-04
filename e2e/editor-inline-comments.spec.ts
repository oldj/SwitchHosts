import { expect, selectAllModifier, test } from './support/test'

test('highlights inline hosts comments in both editor themes', async ({ page }, testInfo) => {
  await page.locator('[data-id="local-dev"]').click()
  const editor = page.locator('.cm-content')
  await expect(editor).toContainText('dev.local')
  await editor.click()
  await page.keyboard.press(`${selectAllModifier}+A`)
  await page.keyboard.insertText([
    '# full-line comment',
    '; leading semicolon',
    '0.0.0.0 localhost.localdomain #this is a comment',
    '::1 localhost alias\t; text before # IPv6 comment',
    '127.0.0.1 example.test ; trailing semicolon text',
  ].join('\n'))

  const reference = editor.locator('.cm-line.hl-comment')
  const comments = editor.locator('.cm-line span.hl-comment')
  let lightColor: string | undefined
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') {
      await page.getByLabel('Settings').click()
      await page.getByText('Preferences').click()
      await page.getByRole('dialog').getByText('Dark', { exact: true }).click()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog', { includeHidden: true })).toHaveCount(0)
    }
    await expect(page.locator('body')).toHaveClass(new RegExp(`theme-${theme}`))
    await expect(comments).toHaveText(['#this is a comment', '# IPv6 comment'])
    await expect(editor.locator('.hl-ip')).toHaveText(['0.0.0.0', '::1', '127.0.0.1'])
    await expect(reference).toHaveText(['# full-line comment'])
    const color = await reference.first().evaluate((el) => getComputedStyle(el).color)
    for (const comment of await comments.all()) {
      await expect(comment).toHaveCSS('color', color)
      await expect(comment.locator('..')).not.toHaveCSS('color', color)
    }
    if (theme === 'light') lightColor = color
    else expect(color).not.toBe(lightColor)
    await editor.screenshot({
      path: testInfo.outputPath(`inline-comments-${theme}.png`),
      animations: 'disabled',
    })
    await editor.focus()
    await page.keyboard.press(`${selectAllModifier}+A`)
    const selectedReference = reference.first().locator('.hl-selection')
    await expect(selectedReference).not.toHaveCSS('color', color)
    const selectedColor = await selectedReference.evaluate((el) => getComputedStyle(el).color)
    for (const text of ['#this is a comment', '# IPv6 comment']) {
      await expect(editor.getByText(text, { exact: true })).toHaveCSS('color', selectedColor)
    }
    await page.keyboard.press('ArrowRight')
  }
})
