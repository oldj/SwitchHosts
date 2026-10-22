import { IHostsListObject } from '@common/data'
import { flatten } from '@common/hostsFn'
import { actions } from '@renderer/core/agent'

export type Draft = { content: string; base_content?: string; pending_content?: string }
export type DraftSnapshot = Record<string, { content: string; base_content: string }>
export const draftsChanged = 'switchhosts:editor-drafts-changed'

// An in-window blur is deferred until click handlers can claim the draft as
// part of a selection apply. Window blur/unmount cancels it, never flushes it.
let scheduled: ReturnType<typeof setTimeout> | undefined
let applicationEpoch = 0
export function cancelDraftApplication() {
  applicationEpoch += 1
  clearTimeout(scheduled)
  scheduled = undefined
}
export function scheduleDraftApplication(apply: (isCurrent: () => boolean) => void) {
  cancelDraftApplication()
  const epoch = applicationEpoch
  const isCurrent = () =>
    epoch === applicationEpoch && document.hasFocus() && document.visibilityState === 'visible'
  scheduled = setTimeout(() => {
    scheduled = undefined
    if (isCurrent()) apply(isCurrent)
  }, 0)
}

/** Durable uncommitted text, shared across editor remounts. System applications
 * use useHostsData's single queue and generation-guarded source/list transaction.
 * No source file, backend sync queue or system hosts is changed by editing.
 */
export class EditorDrafts {
  private drafts = new Map<string, Draft>()
  // A discard ends this draft's lifetime. New typing after discard must not
  // revive an older application snapshot, even when the text/base is identical.
  private discardVersions = new Map<string, number>()
  private snapshots = new WeakMap<DraftSnapshot, Map<string, number>>()
  constructor(
    private storage: Storage,
    private scope: string,
  ) {}

  private key(id: string) {
    return `switchhosts:editor-draft:v1:${encodeURIComponent(this.scope)}:${encodeURIComponent(id)}`
  }
  private notify() {
    window.dispatchEvent(new Event(draftsChanged))
  }
  read(id: string): Draft | undefined {
    const memory = this.drafts.get(id)
    if (memory) return memory
    const saved = this.storage.getItem(this.key(id))
    if (saved === null) return undefined
    const draft = JSON.parse(saved) as Draft
    if (
      !draft ||
      typeof draft.content !== 'string' ||
      (draft.base_content !== undefined && typeof draft.base_content !== 'string') ||
      (draft.pending_content !== undefined && typeof draft.pending_content !== 'string')
    ) {
      throw new Error('Invalid editor draft')
    }
    this.drafts.set(id, draft)
    return draft
  }
  edit(id: string, content: string, base: string) {
    const previous = this.read(id)
    const draft = { ...previous, content, base_content: previous?.base_content ?? base }
    this.write(id, draft)
  }
  private write(id: string, draft: Draft) {
    this.drafts.set(id, draft)
    try {
      this.storage.setItem(this.key(id), JSON.stringify(draft))
    } finally {
      this.notify()
    }
  }
  async capture(list: IHostsListObject[]): Promise<DraftSnapshot> {
    const snapshot: DraftSnapshot = {}
    const versions = new Map<string, number>()
    this.snapshots.set(snapshot, versions)
    for (const item of flatten(list)) {
      if (item.is_sys || item.id === '0' || (item.type && item.type !== 'local')) continue
      let draft = this.read(item.id)
      if (!draft) continue
      versions.set(item.id, this.discardVersions.get(item.id) ?? 0)
      if (draft.pending_content !== undefined) {
        const source = (await actions.getHostsContent(item.id)).replace(/\r\n?/g, '\n')
        // The process may have exited after committing the source but before
        // acknowledging it here. Only our recorded submission can rebase newer
        // typing; unrelated external changes still fail the backend CAS.
        draft = this.read(item.id)
        if (!draft) continue
        if (source === draft.pending_content) {
          draft = { content: draft.content, base_content: source }
          this.write(item.id, draft)
        }
      }
      // Migrate journals produced by the earlier development implementation.
      const baseContent = draft.base_content ?? (await actions.getHostsContent(item.id))
      snapshot[item.id] = { content: draft.content, base_content: baseContent }
    }
    return snapshot
  }
  begin(snapshot: DraftSnapshot) {
    for (const id of Object.keys(snapshot)) {
      if (
        !this.read(id) ||
        this.snapshots.get(snapshot)?.get(id) !== (this.discardVersions.get(id) ?? 0)
      ) {
        throw Object.assign(
          new Error('The draft was discarded. Retry with the current contents.'),
          { kind: 'conflict' },
        )
      }
    }
    // Persist before applying, and retain across subsequent keystrokes. A
    // journal write failure must stop the application before system mutation.
    for (const [id, saved] of Object.entries(snapshot)) {
      const current = this.read(id)
      if (current) this.write(id, { ...current, pending_content: saved.content })
    }
  }
  acknowledge(snapshot: DraftSnapshot) {
    for (const [id, saved] of Object.entries(snapshot)) {
      if (this.snapshots.get(snapshot)?.get(id) !== (this.discardVersions.get(id) ?? 0)) continue
      const current = this.read(id)
      if (!current) continue
      if (current.content === saved.content) {
        this.discard(id)
      } else if (current.base_content === saved.base_content) {
        // New typing started during apply: its next CAS starts from the source
        // just committed, not from the document that preceded this application.
        this.write(id, { content: current.content, base_content: saved.content })
      }
    }
    this.notify()
  }
  discard(id: string) {
    this.storage.removeItem(this.key(id))
    this.drafts.delete(id)
    this.discardVersions.set(id, (this.discardVersions.get(id) ?? 0) + 1)
    this.notify()
  }
}

const directories = new Map<string, EditorDrafts>()
export async function getEditorDrafts(): Promise<EditorDrafts> {
  const directory = await actions.getDataDir()
  if (typeof directory !== 'string' || !directory) throw new Error('Missing data directory')
  let drafts = directories.get(directory)
  if (!drafts) {
    drafts = new EditorDrafts(window.localStorage, directory)
    directories.set(directory, drafts)
  }
  return drafts
}
