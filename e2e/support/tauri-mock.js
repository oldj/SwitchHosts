(() => {
  const clone = (value) => JSON.parse(JSON.stringify(value))
  const contentStartMarker = '# --- SWITCHHOSTS_CONTENT_START ---'

  const normalizeLineEndings = (value) => value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  const flatten = (items) =>
    items.flatMap((item) => [item, ...flatten(Array.isArray(item.children) ? item.children : [])])

  const removeByIds = (items, ids, parentId = null, removed = []) => {
    const next = []

    for (const item of items) {
      if (ids.includes(item.id)) {
        removed.push({ data: clone(item), add_time_ms: Date.now(), parent_id: parentId })
        continue
      }

      const copy = clone(item)
      if (Array.isArray(copy.children)) {
        copy.children = removeByIds(copy.children, ids, copy.id, removed)
      }
      next.push(copy)
    }

    return next
  }

  const configs = {
    left_panel_show: true,
    left_panel_width: 270,
    right_panel_show: true,
    right_panel_width: 240,
    use_system_window_frame: false,
    write_mode: 'append',
    history_limit: 50,
    locale: 'en',
    theme: 'light',
    choice_mode: 2,
    show_title_on_tray: false,
    hide_at_launch: false,
    send_usage_data: false,
    cmd_after_hosts_apply: '',
    remove_duplicate_records: false,
    hide_dock_icon: false,
    use_proxy: false,
    proxy_protocol: 'http',
    proxy_host: '',
    proxy_port: 0,
    http_api_on: false,
    http_api_only_local: true,
    tray_mini_window: true,
    multi_chose_folder_switch_all: false,
    auto_download_update: true,
    env: 'DEV',
  }

  const state = {
    configs,
    list: [
      {
        id: 'local-dev',
        title: 'Development',
        type: 'local',
        on: false,
      },
      {
        id: 'local-api',
        title: 'API Override',
        type: 'local',
        on: true,
      },
      {
        id: 'remote-blocklist',
        title: 'Remote Blocklist',
        type: 'remote',
        url: 'https://example.test/hosts',
        refresh_interval: 3600,
        last_refresh: '2026-05-08 10:00:00',
        last_refresh_ms: 1778196000000,
        on: false,
      },
      {
        id: 'group-work',
        title: 'Work Stack',
        type: 'group',
        include: ['local-api', 'remote-blocklist'],
        on: false,
      },
    ],
    trashcan: [],
    contents: {
      'local-dev': '127.0.0.1 dev.local\n::1 dev.local\n',
      'local-api': '10.0.0.8 api.local\n# 10.0.0.9 api-shadow.local\n',
      'remote-blocklist': '0.0.0.0 ads.example.test\n',
    },
    systemHosts: '127.0.0.1 localhost\n255.255.255.255 broadcasthost\n',
    systemPath: '/etc/hosts',
    history: [
      {
        id: 'history-1',
        content: '127.0.0.1 localhost\n',
        add_time_ms: 1778191200000,
      },
      {
        id: 'history-2',
        content: '127.0.0.1 localhost\n10.0.0.8 api.local\n',
        add_time_ms: 1778194800000,
      },
    ],
    calls: [],
  }

  const callbacks = new Map()
  const listeners = new Map()
  let nextCallbackId = 1
  let nextEventId = 1

  const getListeners = (event) => {
    if (!listeners.has(event)) {
      listeners.set(event, new Map())
    }
    return listeners.get(event)
  }

  const dispatchEvent = (event, payload) => {
    for (const [eventId, callbackId] of getListeners(event)) {
      const callback = callbacks.get(callbackId)
      if (callback) callback({ event, id: eventId, payload })
    }
  }

  const aggregateContent = (items) =>
    flatten(items)
      .filter((item) => item.on && item.type !== 'group' && item.type !== 'folder')
      .map((item) => state.contents[item.id] || '')
      .filter(Boolean)
      .join('\n\n')

  const makeAppendContent = (previousContent, nextContent) => {
    const previousLf = normalizeLineEndings(previousContent)
    const nextLf = normalizeLineEndings(nextContent)
    const markerIndex = previousLf.indexOf(contentStartMarker)
    const head =
      markerIndex >= 0 ? previousLf.slice(0, markerIndex).trimEnd() : previousLf

    if (!nextLf) return `${head}\n`

    return `${head}\n\n${contentStartMarker}\n\n${nextLf}`
  }

  const refreshRemote = (id) => {
    const item = flatten(state.list).find((item) => item.id === id)
    if (!item || item.type !== 'remote') {
      return { success: false, message: 'Remote hosts entry not found' }
    }

    item.last_refresh = '2026-05-08 12:00:00'
    item.last_refresh_ms = 1778203200000
    dispatchEvent('hosts_refreshed', { _args: [clone(item)] })

    return {
      success: true,
      data: {
        last_refresh: item.last_refresh,
        last_refresh_ms: item.last_refresh_ms,
      },
    }
  }

  window.__SWITCHHOSTS_E2E__ = {
    state,
    getState: () => clone(state),
    getCalls: () => clone(state.calls),
    clearCalls: () => {
      state.calls.length = 0
    },
  }

  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener(event, eventId) {
      getListeners(event).delete(eventId)
    },
  }

  window.__TAURI_INTERNALS__ = {
    metadata: {
      currentWindow: { label: 'main' },
      currentWebview: { label: 'main' },
    },
    transformCallback(callback, once = false) {
      const callbackId = nextCallbackId++
      callbacks.set(callbackId, (...args) => {
        if (once) callbacks.delete(callbackId)
        return callback(...args)
      })
      return callbackId
    },
    unregisterCallback(callbackId) {
      callbacks.delete(callbackId)
    },
    convertFileSrc(filePath) {
      return `asset://${filePath}`
    },
    async invoke(cmd, args = {}) {
      state.calls.push({ cmd, args: clone(args) })

      if (cmd === 'plugin:event|listen') {
        const eventId = `event-${nextEventId++}`
        getListeners(args.event).set(eventId, args.handler)
        return eventId
      }

      if (cmd === 'plugin:event|unlisten') {
        getListeners(args.event).delete(args.eventId)
        return null
      }

      if (cmd === 'plugin:event|emit') {
        dispatchEvent(args.event, args.payload)
        return null
      }

      if (cmd.startsWith('plugin:window|')) {
        return true
      }

      const params = Array.isArray(args.args) ? args.args : []

      switch (cmd) {
        case 'config_all':
          return clone(state.configs)
        case 'config_update':
          Object.assign(state.configs, params[0] || {})
          return clone(state.configs)
        case 'get_basic_data':
          return {
            list: clone(state.list),
            trashcan: clone(state.trashcan),
            version: '5.0.0-beta.22',
          }
        case 'get_list':
          return clone(state.list)
        case 'set_list':
          state.list = clone(params[0] || [])
          for (const item of flatten(state.list)) {
            if (!state.contents[item.id]) state.contents[item.id] = ''
          }
          return true
        case 'move_many_to_trashcan': {
          const removed = []
          state.list = removeByIds(state.list, params[0] || [], null, removed)
          state.trashcan.push(...removed)
          return true
        }
        case 'delete_item_from_trashcan':
          state.trashcan = state.trashcan.filter((item) => item.data.id !== params[0])
          return true
        case 'restore_item_from_trashcan': {
          const idx = state.trashcan.findIndex((item) => item.data.id === params[0])
          if (idx < 0) return false
          const [item] = state.trashcan.splice(idx, 1)
          state.list.push(item.data)
          return true
        }
        case 'get_system_hosts':
          return state.systemHosts
        case 'get_path_of_system_hosts':
          return state.systemPath
        case 'get_hosts_content':
          return state.contents[params[0]] || ''
        case 'set_hosts_content':
          state.contents[params[0]] = params[1] || ''
          return true
        case 'get_content_of_list':
          return aggregateContent(params[0] || state.list)
        case 'apply_hosts_selection':
          state.systemHosts =
            state.configs.write_mode === 'append'
              ? makeAppendContent(state.systemHosts, params[0] || '')
              : normalizeLineEndings(params[0] || '')
          state.history.push({
            id: `history-${state.history.length + 1}`,
            content: state.systemHosts,
            add_time_ms: Date.now(),
          })
          return { success: true }
        case 'get_apply_history':
          return clone(state.history)
        case 'delete_apply_history_item':
          state.history = state.history.filter((item) => item.id !== params[0])
          return true
        case 'refresh_remote_hosts':
          return refreshRemote(params[0])
        case 'update_tray_title':
        case 'dark_mode_toggle':
        case 'hide_main_window':
        case 'quit_app':
        case 'open_url':
        case 'popup_menu':
          return true
        case 'check_update':
          return false
        default:
          throw new Error(`Unhandled Tauri mock command: ${cmd}`)
      }
    },
  }
})()
