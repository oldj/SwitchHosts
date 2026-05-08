import {
  clearMockCalls,
  expect,
  getMockCalls,
  getMockState,
  setListPayloads,
  showRightPanel,
  test,
} from './support/test'

test.describe('hosts entry management', () => {
  test('adds a local hosts entry from the top bar', async ({ page }) => {
    await page.getByLabel('Add').click()
    const drawer = page.getByRole('dialog')
    await expect(drawer.getByText('Add Hosts Entry')).toBeVisible()

    await drawer.getByLabel('Hosts Title', { exact: true }).fill('QA Sandbox')
    await drawer.getByRole('button', { name: 'OK' }).click()

    await expect(page.getByText('QA Sandbox').first()).toBeVisible()
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return state.list.some((item) => item.title === 'QA Sandbox')
      })
      .toBe(true)
  })

  test('edits a hosts entry title and refreshes list, header, and details', async ({ page }) => {
    await page.locator('[data-id="local-dev"]').click()
    await showRightPanel(page)
    await page.getByRole('button', { name: 'Edit' }).click()

    const drawer = page.getByRole('dialog')
    await expect(drawer.getByText('Edit Hosts')).toBeVisible()
    await drawer.getByLabel('Hosts Title', { exact: true }).fill('Development Edited')
    await drawer.getByRole('button', { name: 'OK' }).click()

    await expect(page.locator('[data-id="local-dev"]')).toContainText('Development Edited')
    await expect
      .poll(async () => await page.getByText('Development Edited').count())
      .toBeGreaterThanOrEqual(3)
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        return state.list.find((item) => item.id === 'local-dev')?.title
      })
      .toBe('Development Edited')
  })

  test('creates a group hosts entry and shows included items', async ({ page }) => {
    await clearMockCalls(page)

    await page.getByLabel('Add').click()
    const drawer = page.getByRole('dialog')
    await expect(drawer.getByText('Add Hosts Entry')).toBeVisible()

    await drawer.getByText('Group', { exact: true }).click()
    await drawer.getByLabel('Hosts Title', { exact: true }).fill('QA Group')
    await drawer.getByText('API Override').click()
    await drawer.getByRole('button', { name: 'Move to right' }).click()
    await drawer.getByRole('button', { name: 'OK' }).click()

    await expect(page.locator('[data-id]').filter({ hasText: 'QA Group' })).toBeVisible()
    await showRightPanel(page)
    await expect(page.getByText('Content (1)')).toBeVisible()
    await expect(page.getByText('API Override').last()).toBeVisible()
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        const group = state.list.find((item) => item.title === 'QA Group')
        return { type: group?.type, include: group?.include }
      })
      .toEqual({ type: 'group', include: ['local-api'] })

    const latestSetList = setListPayloads(await getMockCalls(page)).at(-1)
    expect(latestSetList?.some((item) => item.title === 'QA Group' && item.type === 'group')).toBe(
      true,
    )
  })

  test('creates a folder hosts entry with single choice mode', async ({ page }) => {
    await clearMockCalls(page)

    await page.getByLabel('Add').click()
    const drawer = page.getByRole('dialog')
    await expect(drawer.getByText('Add Hosts Entry')).toBeVisible()

    await drawer.getByText('Folder', { exact: true }).click()
    await drawer.getByLabel('Hosts Title', { exact: true }).fill('QA Folder')
    await drawer.getByText('Single', { exact: true }).click()
    await drawer.getByRole('button', { name: 'OK' }).click()

    await expect(page.locator('[data-id]').filter({ hasText: 'QA Folder' })).toBeVisible()
    await expect
      .poll(async () => {
        const state = await getMockState(page)
        const folder = state.list.find((item) => item.title === 'QA Folder')
        return {
          type: folder?.type,
          folderMode: folder?.folder_mode,
        }
      })
      .toMatchObject({ type: 'folder', folderMode: 1 })
    await showRightPanel(page)
    await expect(page.locator('#root').getByText('Choice Mode')).toBeVisible()
    await expect(page.locator('#root').getByText('Single').last()).toBeVisible()

    const latestSetList = setListPayloads(await getMockCalls(page)).at(-1)
    expect(
      latestSetList?.some(
        (item) => item.title === 'QA Folder' && item.type === 'folder' && item.folder_mode === 1,
      ),
    ).toBe(true)
  })
})
