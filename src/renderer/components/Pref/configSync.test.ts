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

    expect(mergeConfigUpdateIntoDraft(draft, snapshot, { hide_dock_icon: true })).toMatchObject({
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

  it('uses the current backend value when an older HTTP settings event arrives late', () => {
    const draft = { ...defaultConfigs, http_api_port: 40761, cmd_after_hosts_apply: 'unsaved' }
    const snapshot = { ...defaultConfigs, http_api_port: 40762, http_api_on: true }
    expect(
      mergeConfigUpdateIntoDraft(draft, snapshot, {
        http_api_port: 50761,
        http_api_on: false,
      }),
    ).toMatchObject({
      http_api_port: 40762,
      http_api_on: true,
      cmd_after_hosts_apply: 'unsaved',
    })
  })
})
