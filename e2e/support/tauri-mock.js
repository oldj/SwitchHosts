(() => {
  const clone = (value) => JSON.parse(JSON.stringify(value))
  const contentStartMarker = '# --- SWITCHHOSTS_CONTENT_START ---'

  const normalizeLineEndings = (value) => value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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
    right_panel_show: false,
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
    find_is_regexp: false,
    find_is_ignore_case: false,
    find_result_column_widths: [],
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
      {
        id: 'folder-single',
        title: 'Single Choice Folder',
        type: 'folder',
        folder_mode: 1,
        on: false,
        children: [
          {
            id: 'folder-single-alpha',
            title: 'Single Alpha',
            type: 'local',
            on: false,
          },
          {
            id: 'folder-single-beta',
            title: 'Single Beta',
            type: 'local',
            on: false,
          },
        ],
      },
      {
        id: 'folder-multiple',
        title: 'Multiple Choice Folder',
        type: 'folder',
        folder_mode: 2,
        on: false,
        children: [
          {
            id: 'folder-multiple-alpha',
            title: 'Multiple Alpha',
            type: 'local',
            on: false,
          },
          {
            id: 'folder-multiple-beta',
            title: 'Multiple Beta',
            type: 'local',
            on: false,
          },
        ],
      },
    ],
    trashcan: [],
    contents: {
      'local-dev': '127.0.0.1 dev.local\n::1 dev.local\n',
      'local-api': '10.0.0.8 api.local\n# 10.0.0.9 api-shadow.local\n',
      'remote-blocklist': '0.0.0.0 ads.example.test\n',
      'folder-single-alpha': '192.168.10.10 single-alpha.local\n',
      'folder-single-beta': '192.168.10.11 single-beta.local\n',
      'folder-multiple-alpha': '192.168.20.10 multiple-alpha.local\n',
      'folder-multiple-beta': '192.168.20.11 multiple-beta.local\n',
    },
    systemHosts: '127.0.0.1 localhost\n255.255.255.255 broadcasthost\n',
    systemPath: '/etc/hosts',
    dataDir: '/Users/e2e/.SwitchHosts',
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
    nextApplyResult: null,
    nextRefreshResult: null,
  }

  if (new URLSearchParams(window.location.search).get('e2eWriteMode') === 'null') {
    state.configs.write_mode = null
  }

  const deleteContentsForItem = (item) => {
    for (const entry of flatten([item])) {
      delete state.contents[entry.id]
    }
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
    failNextApply: (result = {}) => {
      state.nextApplyResult = {
        success: false,
        code: 'fail',
        message: 'Apply failed in e2e mock',
        ...result,
      }
    },
    failNextRefresh: (result = {}) => {
      state.nextRefreshResult = {
        success: false,
        code: 'refresh_fail',
        message: 'Refresh failed in e2e mock',
        ...result,
      }
    },
    delayNextImport: (ms = 300) => {
      state.nextImportDelayMs = ms
    },
    failNextImport: (result = 'mock_import_error') => {
      state.nextImportResult = result
    },
    delayNextImportFromUrl: (ms = 300) => {
      state.nextImportFromUrlDelayMs = ms
    },
    failNextImportFromUrl: (result = 'mock_import_url_error') => {
      state.nextImportFromUrlResult = result
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
          return null
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
        case 'delete_item_from_trashcan': {
          const idx = state.trashcan.findIndex((item) => item.data.id === params[0])
          if (idx < 0) return false
          const [item] = state.trashcan.splice(idx, 1)
          deleteContentsForItem(item.data)
          return true
        }
        case 'clear_trashcan':
          for (const item of state.trashcan) {
            deleteContentsForItem(item.data)
          }
          state.trashcan = []
          return null
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
        case 'get_data_dir':
          return state.dataDir
        case 'get_hosts_content':
          return state.contents[params[0]] || ''
        case 'set_hosts_content':
          state.contents[params[0]] = params[1] || ''
          return true
        case 'get_content_of_list':
          return aggregateContent(params[0] || state.list)
        case 'apply_hosts_selection':
          if (state.nextApplyResult) {
            const result = state.nextApplyResult
            state.nextApplyResult = null
            return clone(result)
          }
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
          if (state.nextRefreshResult) {
            const result = state.nextRefreshResult
            state.nextRefreshResult = null
            return clone(result)
          }
          return refreshRemote(params[0])
        case 'export_data':
          return '/Users/e2e/exports/swh_data.json'
        case 'import_data':
          if (state.nextImportDelayMs) {
            const ms = state.nextImportDelayMs
            state.nextImportDelayMs = 0
            await delay(ms)
          }
          if (Object.prototype.hasOwnProperty.call(state, 'nextImportResult')) {
            const result = state.nextImportResult
            delete state.nextImportResult
            return result
          }
          state.list = [
            {
              id: 'imported-local',
              title: 'Imported Backup',
              type: 'local',
              on: false,
            },
            {
              id: 'imported-folder',
              title: 'Imported Folder',
              type: 'folder',
              folder_mode: 0,
              on: false,
              children: [
                {
                  id: 'imported-folder-child',
                  title: 'Imported Folder Child',
                  type: 'local',
                  on: false,
                },
              ],
            },
            {
              id: 'imported-group',
              title: 'Imported Group',
              type: 'group',
              include: ['imported-local'],
              on: false,
            },
          ]
          state.contents['imported-local'] = '172.16.0.10 imported-backup.local\n'
          state.contents['imported-folder-child'] = '172.16.0.11 imported-child.local\n'
          state.trashcan = []
          return true
        case 'import_data_from_url':
          if (state.nextImportFromUrlDelayMs) {
            const ms = state.nextImportFromUrlDelayMs
            state.nextImportFromUrlDelayMs = 0
            await delay(ms)
          }
          if (Object.prototype.hasOwnProperty.call(state, 'nextImportFromUrlResult')) {
            const result = state.nextImportFromUrlResult
            delete state.nextImportFromUrlResult
            return result
          }
          state.list = [
            {
              id: 'imported-url',
              title: 'Imported From URL',
              type: 'remote',
              url: params[0],
              refresh_interval: 0,
              last_refresh: '2026-05-08 13:00:00',
              last_refresh_ms: 1778206800000,
              on: false,
            },
            {
              id: 'imported-url-local',
              title: 'Imported URL Local',
              type: 'local',
              on: false,
            },
          ]
          state.contents['imported-url'] = '172.16.0.20 imported-url.local\n'
          state.contents['imported-url-local'] = '172.16.0.21 imported-url-local.local\n'
          state.trashcan = []
          return true
        case 'update_tray_title':
        case 'dark_mode_toggle':
        case 'hide_main_window':
        case 'quit_app':
        case 'open_url':
        case 'show_item_in_folder':
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
