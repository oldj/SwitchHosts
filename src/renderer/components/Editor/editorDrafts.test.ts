// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ getHostsContent: vi.fn() }))
vi.mock('@renderer/core/agent', () => ({ actions: mocks }))
import { EditorDrafts } from './editorDrafts'
const list = [{ id: 'a', type: 'local' as const }]
beforeEach(() => {
  localStorage.clear()
  mocks.getHostsContent.mockReset().mockResolvedValue('original')
})

it('recovers drafts after abrupt exit without touching source files, scoped by data directory', () => {
  new EditorDrafts(localStorage, '/data').edit('a', 'unsaved', 'original')
  expect(new EditorDrafts(localStorage, '/data').read('a')).toEqual({
    content: 'unsaved',
    base_content: 'original',
  })
  expect(new EditorDrafts(localStorage, '/other').read('a')).toBeUndefined()
})
it('retains captured drafts until explicitly acknowledged, including after restart', async () => {
  const drafts = new EditorDrafts(localStorage, '/data')
  drafts.edit('a', 'submitted', 'original')
  const snapshot = await drafts.capture(list)
  expect(new EditorDrafts(localStorage, '/data').read('a')?.content).toBe('submitted')
  drafts.acknowledge(snapshot)
  expect(new EditorDrafts(localStorage, '/data').read('a')).toBeUndefined()
})
it('rebases newer typing onto a successful source commit without discarding it', async () => {
  const drafts = new EditorDrafts(localStorage, '/data')
  drafts.edit('a', 'submitted', 'original')
  const snapshot = await drafts.capture(list)
  drafts.edit('a', 'still typing', 'original')
  drafts.acknowledge(snapshot)
  expect(new EditorDrafts(localStorage, '/data').read('a')).toEqual({
    content: 'still typing',
    base_content: 'submitted',
  })
})
it('excludes deleted, read-only and system entries from a captured application', async () => {
  const drafts = new EditorDrafts(localStorage, '/data')
  for (const id of ['a', 'deleted', 'remote', '0']) drafts.edit(id, 'draft', 'base')
  expect(
    Object.keys(
      await drafts.capture([...list, { id: 'remote', type: 'remote' }, { id: '0', is_sys: true }]),
    ),
  ).toEqual(['a'])
  expect(drafts.read('deleted')?.content).toBe('draft')
})
it('keeps the original comparison base across successive edits', () => {
  const drafts = new EditorDrafts(localStorage, '/data')
  drafts.edit('a', 'first', 'original')
  drafts.edit('a', 'next', 'accidentally newer base')
  expect(drafts.read('a')?.base_content).toBe('original')
})
it('reports local storage failure and retains the latest in-memory text', () => {
  const storage = {
    getItem: () => null,
    setItem: () => {
      throw new Error('quota')
    },
  } as unknown as Storage
  const drafts = new EditorDrafts(storage, '/data')
  expect(() => drafts.edit('a', 'latest', 'original')).toThrow('quota')
  expect(drafts.read('a')?.content).toBe('latest')
})
it('discard removes only the requested entry', () => {
  const drafts = new EditorDrafts(localStorage, '/data')
  drafts.edit('a', 'first', 'original')
  drafts.edit('b', 'second', 'original')
  drafts.discard('a')
  expect(drafts.read('a')).toBeUndefined()
  expect(drafts.read('b')?.content).toBe('second')
})

it('recovers newer typing after exit between source commit and draft acknowledgement', async () => {
  const drafts = new EditorDrafts(localStorage, '/data')
  drafts.edit('a', 'submitted', 'original')
  const snapshot = await drafts.capture(list)
  drafts.begin(snapshot)
  drafts.edit('a', 'newer typing', 'original')
  mocks.getHostsContent.mockResolvedValue('submitted')
  const reopened = new EditorDrafts(localStorage, '/data')
  expect(await reopened.capture(list)).toEqual({
    a: { content: 'newer typing', base_content: 'submitted' },
  })
  expect(new EditorDrafts(localStorage, '/data').read('a')).toEqual({
    content: 'newer typing',
    base_content: 'submitted',
  })
})

it.each(['original', 'external edit'])(
  'does not rebase an interrupted apply onto %s',
  async (source) => {
    const drafts = new EditorDrafts(localStorage, '/data')
    drafts.edit('a', 'submitted', 'original')
    drafts.begin(await drafts.capture(list))
    drafts.edit('a', 'newer typing', 'original')
    mocks.getHostsContent.mockResolvedValue(source)
    expect(await new EditorDrafts(localStorage, '/data').capture(list)).toEqual({
      a: { content: 'newer typing', base_content: 'original' },
    })
  },
)

it('recovers the commit base even when persisting its acknowledgement failed', async () => {
  const drafts = new EditorDrafts(localStorage, '/data')
  drafts.edit('a', 'submitted', 'original')
  const snapshot = await drafts.capture(list)
  drafts.begin(snapshot)
  drafts.edit('a', 'newer typing', 'original')
  const failure = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota')
  })
  expect(() => drafts.acknowledge(snapshot)).toThrow('quota')
  failure.mockRestore()
  mocks.getHostsContent.mockResolvedValue('submitted')
  expect(await new EditorDrafts(localStorage, '/data').capture(list)).toEqual({
    a: { content: 'newer typing', base_content: 'submitted' },
  })
})

it('keeps typing that arrives while checking an interrupted source commit', async () => {
  const drafts = new EditorDrafts(localStorage, '/data')
  drafts.edit('a', 'submitted', 'original')
  drafts.begin(await drafts.capture(list))
  let finish!: (value: string) => void
  mocks.getHostsContent.mockReturnValue(
    new Promise<string>((resolve) => {
      finish = resolve
    }),
  )
  const capture = drafts.capture(list)
  drafts.edit('a', 'latest typing', 'original')
  finish('submitted')
  expect(await capture).toEqual({ a: { content: 'latest typing', base_content: 'submitted' } })
})

it('does not acknowledge a new draft with the same text as an older discarded application', async () => {
  const drafts = new EditorDrafts(localStorage, '/data')
  drafts.edit('a', 'same text', 'original')
  const snapshot = await drafts.capture(list)
  drafts.begin(snapshot)
  drafts.discard('a')
  drafts.edit('a', 'same text', 'original')
  drafts.acknowledge(snapshot)
  expect(drafts.read('a')?.content).toBe('same text')
})

it('keeps an application valid if the attempted discard could not remove the journal', async () => {
  const drafts = new EditorDrafts(localStorage, '/data')
  drafts.edit('a', 'draft', 'original')
  const snapshot = await drafts.capture(list)
  const failure = vi.spyOn(Storage.prototype, 'removeItem').mockImplementationOnce(() => {
    throw new Error('storage unavailable')
  })
  expect(() => drafts.discard('a')).toThrow('storage unavailable')
  failure.mockRestore()
  expect(() => drafts.begin(snapshot)).not.toThrow()
  drafts.acknowledge(snapshot)
  expect(drafts.read('a')).toBeUndefined()
})

it('does not let an interrupted commit read revive a discarded draft lifetime', async () => {
  const drafts = new EditorDrafts(localStorage, '/data')
  drafts.edit('a', 'submitted', 'original')
  drafts.begin(await drafts.capture(list))
  let finish!: (value: string) => void
  mocks.getHostsContent.mockReturnValueOnce(
    new Promise<string>((resolve) => {
      finish = resolve
    }),
  )
  const capturing = drafts.capture(list)
  drafts.discard('a')
  // Identical text must not make the old lifetime valid again.
  drafts.edit('a', 'submitted', 'original')
  const replacement = drafts.read('a')
  finish('submitted')
  const stale = await capturing
  expect(() => drafts.begin(stale)).toThrow('discarded')
  drafts.acknowledge(stale)
  expect(drafts.read('a')).toBe(replacement)
  const current = await drafts.capture(list)
  expect(() => drafts.begin(current)).not.toThrow()
  drafts.acknowledge(current)
  expect(drafts.read('a')).toBeUndefined()
})

it('validates every draft lifetime before recording any batch submission', async () => {
  const drafts = new EditorDrafts(localStorage, '/data')
  drafts.edit('a', 'first draft', 'original')
  drafts.edit('b', 'second draft', 'original')
  const snapshot = await drafts.capture([...list, { id: 'b', type: 'local' }])
  drafts.discard('b')
  drafts.edit('b', 'second draft', 'original')
  expect(() => drafts.begin(snapshot)).toThrow('discarded')
  expect(drafts.read('a')?.pending_content).toBeUndefined()
  expect(drafts.read('b')?.pending_content).toBeUndefined()
  const reopened = new EditorDrafts(localStorage, '/data')
  expect(reopened.read('a')?.pending_content).toBeUndefined()
  expect(reopened.read('b')?.pending_content).toBeUndefined()
})
