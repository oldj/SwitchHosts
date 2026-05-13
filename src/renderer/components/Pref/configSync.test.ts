import { describe, expect, it } from 'vitest'

import defaultConfigs from '@common/default_configs'
import { mergeConfigUpdateIntoDraft } from './configSync'

describe('mergeConfigUpdateIntoDraft', () => {
  it('merges backend config patches into the open preferences draft', () => {
    const draft = {
      ...defaultConfigs,
      cmd_after_hosts_apply: 'unsaved command',
      hide_dock_icon: false,
    }
    const snapshot = {
      ...defaultConfigs,
      cmd_after_hosts_apply: '',
      hide_dock_icon: true,
    }

    expect(
      mergeConfigUpdateIntoDraft(draft, snapshot, { hide_dock_icon: true }),
    ).toMatchObject({
      cmd_after_hosts_apply: 'unsaved command',
      hide_dock_icon: true,
    })
  })

  it('falls back to the fresh snapshot when the event has no patch payload', () => {
    const draft = {
      ...defaultConfigs,
      cmd_after_hosts_apply: 'unsaved command',
      hide_dock_icon: false,
    }
    const snapshot = {
      ...defaultConfigs,
      cmd_after_hosts_apply: '',
      hide_dock_icon: true,
    }

    expect(mergeConfigUpdateIntoDraft(draft, snapshot, undefined)).toBe(snapshot)
  })
})
