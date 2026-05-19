/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { HostsType } from '@common/data'
import events from '@common/events'
import { IFindItem, IFindPosition, IFindShowSourceParam } from '@common/types'
import {
  ActionIcon,
  Box,
  Button,
  Checkbox,
  Group,
  Loader,
  ScrollArea,
  Stack,
  TextInput,
} from '@mantine/core'
import ItemIcon from '@renderer/components/ItemIcon'
import { actions, agent } from '@renderer/core/agent'
import { getErrorMessage, showErrorNotification } from '@renderer/core/notify'
import { PopupMenu } from '@renderer/core/PopupMenu'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import useResolvedTheme from '@renderer/models/useResolvedTheme'
import { applyThemeToBody } from '@renderer/utils/theme'
import { useDebounce } from 'ahooks'
import clsx from 'clsx'
import lodash from 'lodash'
import React, { useEffect, useRef, useState } from 'react'
import {
  IoArrowBackOutline,
  IoArrowForwardOutline,
  IoChevronDownOutline,
  IoSearch,
} from 'react-icons/io5'
import useConfigs from '../models/useConfigs'
import useI18n from '../models/useI18n'
import styles from './find.module.scss'

// The result list is virtualized; keep this in sync with
// .result_row height in find.module.scss.
const RESULT_ROW_HEIGHT = 29
const RESULT_LIST_PADDING_Y = 5
const RESULT_LIST_OVERSCAN = 12
const RESULT_COLUMN_MIN_WIDTH = 60
const RESULT_COLUMN_GAP = 4
const RESULT_COLUMN_GAP_COUNT = 2
const RESULT_HEADER_LEFT_PADDING = 8
const RESULT_HEADER_RIGHT_PADDING = 20
const RESULT_ROW_PADDING_LEFT = 8
const RESULT_ROW_HORIZONTAL_INSET = 8
const DEFAULT_RESULT_LINE_COLUMN_WIDTH = 60
const DEFAULT_RESULT_TITLE_COLUMN_RATIO = 0.2
const RESULT_COLUMN_MAX_WINDOW_RATIO = 0.8

type ResultFixedColumnWidths = [number, number]
type ResultColumnWidths = [number, number, number]
type ResultColumnResizeIndex = 0 | 1

interface SearchState {
  keyword: string
  isRegExp: boolean
  isIgnoreCase: boolean
}

export interface IFindPositionShow extends IFindPosition {
  item_id: string
  item_title: string
  item_type: HostsType
  index: number
  is_disabled?: boolean
  is_readonly?: boolean
  replace_to?: string
}

export function flattenFindItems(findItems: IFindItem[]): IFindPositionShow[] {
  const positionsShow: IFindPositionShow[] = []

  findItems.forEach((item) => {
    const { item_id: itemId, item_title: itemTitle, item_type: itemType, positions } = item
    positions.forEach((p, index) => {
      positionsShow.push({
        item_id: itemId,
        item_title: itemTitle,
        item_type: itemType,
        ...p,
        index,
        is_readonly: itemType !== 'local',
      })
    })
  })

  return positionsShow
}

// Search offsets are anchored to the original content. When earlier
// matches in the same hosts file have already been replaced, later
// replace-one requests need their UTF-16 range shifted by that delta.
export function getAdjustedReplaceRange(positions: IFindPositionShow[], index: number) {
  const pos = positions[index]
  if (!pos) return null

  const delta = positions.reduce((sum, item, itemIndex) => {
    if (
      itemIndex === index ||
      item.item_id !== pos.item_id ||
      !item.is_disabled ||
      item.start >= pos.start
    ) {
      return sum
    }
    return sum + (item.replace_to ?? '').length - item.match.length
  }, 0)

  return {
    start: pos.start + delta,
    end: pos.end + delta,
  }
}

export function sanitizeFindResultColumnWidths(widths?: number[] | null): ResultColumnWidths | null {
  if (!Array.isArray(widths) || widths.length !== 3) return null

  const [match, title, line] = widths.map((width) =>
    Number.isFinite(width) ? Math.max(RESULT_COLUMN_MIN_WIDTH, Math.round(width)) : RESULT_COLUMN_MIN_WIDTH,
  )

  return [match, title, line]
}

export function getDefaultFindResultFixedColumnWidths(
  availableTrackWidth: number,
): ResultFixedColumnWidths {
  const trackWidth = Math.max(RESULT_COLUMN_MIN_WIDTH * 3, Math.round(availableTrackWidth))
  const titleWidth = Math.max(
    RESULT_COLUMN_MIN_WIDTH,
    Math.round(trackWidth * DEFAULT_RESULT_TITLE_COLUMN_RATIO),
  )
  const matchWidth = Math.max(
    RESULT_COLUMN_MIN_WIDTH,
    trackWidth - titleWidth - DEFAULT_RESULT_LINE_COLUMN_WIDTH,
  )

  return [matchWidth, titleWidth]
}

export function getFindResultColumnWidths(
  fixedWidths: ResultFixedColumnWidths,
  availableTrackWidth: number,
): ResultColumnWidths {
  const matchWidth = Math.max(RESULT_COLUMN_MIN_WIDTH, Math.round(fixedWidths[0]))
  const titleWidth = Math.max(RESULT_COLUMN_MIN_WIDTH, Math.round(fixedWidths[1]))
  const lineWidth = Math.max(
    RESULT_COLUMN_MIN_WIDTH,
    Math.round(availableTrackWidth - matchWidth - titleWidth),
  )

  return [matchWidth, titleWidth, lineWidth]
}

function normalizeFindResultColumnMaxWidth(maxColumnWidth?: number) {
  return Number.isFinite(maxColumnWidth)
    ? Math.max(RESULT_COLUMN_MIN_WIDTH, Math.round(maxColumnWidth!))
    : Number.POSITIVE_INFINITY
}

function normalizeFindResultColumnWidth(width: number) {
  return Math.max(RESULT_COLUMN_MIN_WIDTH, Math.round(width))
}

function getFindResultDragColumnMaxWidth(currentWidth: number, maxColumnWidth: number) {
  return Math.max(normalizeFindResultColumnWidth(currentWidth), maxColumnWidth)
}

function clampFindResultColumnWidthForDrag(
  width: number,
  currentWidth: number,
  maxColumnWidth: number,
) {
  return Math.min(
    normalizeFindResultColumnWidth(width),
    getFindResultDragColumnMaxWidth(currentWidth, maxColumnWidth),
  )
}

export function resizeFindResultFixedColumnWidths(
  startWidths: ResultFixedColumnWidths,
  resizeIndex: ResultColumnResizeIndex,
  deltaX: number,
  maxColumnWidth?: number,
): ResultFixedColumnWidths {
  const delta = Math.round(deltaX)
  const maxWidth = normalizeFindResultColumnMaxWidth(maxColumnWidth)
  const currentWidths: ResultFixedColumnWidths = [
    normalizeFindResultColumnWidth(startWidths[0]),
    normalizeFindResultColumnWidth(startWidths[1]),
  ]

  if (resizeIndex === 0) {
    const splitWidth = currentWidths[0] + currentWidths[1]
    const matchMaxWidth = getFindResultDragColumnMaxWidth(currentWidths[0], maxWidth)
    const titleMaxWidth = getFindResultDragColumnMaxWidth(currentWidths[1], maxWidth)
    const minMatchWidth = Math.max(RESULT_COLUMN_MIN_WIDTH, splitWidth - titleMaxWidth)
    const maxMatchWidth = Math.min(matchMaxWidth, splitWidth - RESULT_COLUMN_MIN_WIDTH)
    const nextMatchWidth = currentWidths[0] + delta

    if (minMatchWidth <= maxMatchWidth) {
      const matchWidth = Math.min(Math.max(nextMatchWidth, minMatchWidth), maxMatchWidth)
      return [matchWidth, splitWidth - matchWidth]
    }

    return currentWidths
  }

  return [
    currentWidths[0],
    clampFindResultColumnWidthForDrag(currentWidths[1] + delta, currentWidths[1], maxWidth),
  ]
}

const flushedInputStyles = {
  input: {
    borderTop: 0,
    borderLeft: 0,
    borderRight: 0,
    borderRadius: 0,
    borderBottom: '1px solid var(--swh-border-color-0)',
    backgroundColor: 'transparent',
    transition: 'none',
    paddingLeft: 52,
    paddingRight: 12,
    '&:focus': {
      borderBottomColor: 'var(--swh-primary-color)',
    },
  },
  section: {
    width: 52,
    color: 'var(--swh-font-color-weak)',
  },
} as const

const FindPage = () => {
  const { lang, i18n, setLocale } = useI18n()
  const { configs, loadConfigs, updateConfigs } = useConfigs()
  const [keyword, setKeyword] = useState('')
  const [replaceTo, setReplaceTo] = useState('')
  const [isRegExp, setIsRegExp] = useState(false)
  const [isIgnoreCase, setIsIgnoreCase] = useState(false)
  const [findOptionsHydrated, setFindOptionsHydrated] = useState(false)
  const findOptionsHydratedRef = useRef(false)
  const [findPositions, setFindPositions] = useState<IFindPositionShow[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isReplacing, setIsReplacing] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [resultSearchState, setResultSearchState] = useState<SearchState>(() => ({
    keyword: '',
    isRegExp: false,
    isIgnoreCase: false,
  }))
  const [currentResultIdx, setCurrentResultIdx] = useState(0)
  const [resultListMetrics, setResultListMetrics] = useState({
    height: 0,
    scrollLeft: 0,
    scrollTop: 0,
  })
  const [resultAvailableTrackWidth, setResultAvailableTrackWidth] = useState(0)
  const initialResultColumnWidths = sanitizeFindResultColumnWidths(configs?.find_result_column_widths)
  const [resultFixedColumnWidths, setResultFixedColumnWidths] = useState<ResultFixedColumnWidths>(
    () =>
      initialResultColumnWidths
        ? [initialResultColumnWidths[0], initialResultColumnWidths[1]]
        : getDefaultFindResultFixedColumnWidths(0),
  )
  const [resizingColumnIdx, setResizingColumnIdx] = useState<ResultColumnResizeIndex | null>(null)
  const debouncedKeyword = useDebounce(keyword, { wait: 500 })
  const iptKw = useRef<HTMLInputElement>(null)
  const resultHeaderRef = useRef<HTMLDivElement>(null)
  const resultListRef = useRef<HTMLDivElement>(null)
  const searchSeqRef = useRef(0)
  // Mirrors input/config changes before the debounce fires, so late async
  // responses can tell whether they still belong to the visible query.
  const latestSearchStateRef = useRef({ keyword: '', isRegExp: false, isIgnoreCase: false })
  const lastAutoScrollResultIdxRef = useRef(-1)
  const findWindowReadySentRef = useRef(false)
  const resultColumnsHydratedRef = useRef(false)
  const resultFixedColumnWidthsRef = useRef(resultFixedColumnWidths)
  const resultResizeCleanupRef = useRef<(() => void) | null>(null)
  const resolvedTheme = useResolvedTheme(configs?.theme)

  const isCurrentSearchState = (
    searchKeyword: string,
    searchOptions: { is_regexp: boolean; is_ignore_case: boolean },
  ) => {
    const latest = latestSearchStateRef.current
    return (
      latest.keyword === searchKeyword &&
      latest.isRegExp === searchOptions.is_regexp &&
      latest.isIgnoreCase === searchOptions.is_ignore_case
    )
  }

  const searchStateFromOptions = (
    searchKeyword: string,
    searchOptions: { is_regexp: boolean; is_ignore_case: boolean },
  ): SearchState => ({
    keyword: searchKeyword,
    isRegExp: searchOptions.is_regexp,
    isIgnoreCase: searchOptions.is_ignore_case,
  })

  const areResultsCurrent = () =>
    resultSearchState.keyword === keyword &&
    resultSearchState.isRegExp === isRegExp &&
    resultSearchState.isIgnoreCase === isIgnoreCase

  const getResultAvailableTrackWidth = (el: HTMLDivElement) =>
    Math.max(
      0,
      el.clientWidth -
        RESULT_HEADER_LEFT_PADDING -
        RESULT_HEADER_RIGHT_PADDING -
        RESULT_ROW_PADDING_LEFT -
        RESULT_COLUMN_GAP * RESULT_COLUMN_GAP_COUNT,
    )

  const persistResultColumnWidths = (fixedWidths: ResultFixedColumnWidths) => {
    updateConfigs({
      // Persist a snapshot of all columns, but only match/title are restored as fixed widths.
      find_result_column_widths: getFindResultColumnWidths(fixedWidths, resultAvailableTrackWidth),
    }).catch((e) => console.error(e))
  }

  const getCurrentResultColumnMaxWidth = () => {
    const windowWidth =
      window.innerWidth || document.documentElement.clientWidth || resultHeaderRef.current?.clientWidth || 0

    return Math.max(RESULT_COLUMN_MIN_WIDTH, Math.round(windowWidth * RESULT_COLUMN_MAX_WINDOW_RATIO))
  }

  const startResultColumnResize = (
    resizeIndex: ResultColumnResizeIndex,
    e: React.PointerEvent<HTMLDivElement>,
  ) => {
    e.preventDefault()
    e.stopPropagation()

    resultResizeCleanupRef.current?.()

    const resizeHandle = e.currentTarget
    if (typeof resizeHandle.setPointerCapture === 'function') {
      resizeHandle.setPointerCapture(e.pointerId)
    }
    const startX = e.clientX
    const maxColumnWidth = getCurrentResultColumnMaxWidth()
    const startWidths: ResultFixedColumnWidths = [
      normalizeFindResultColumnWidth(resultFixedColumnWidthsRef.current[0]),
      normalizeFindResultColumnWidth(resultFixedColumnWidthsRef.current[1]),
    ]
    const originalCursor = document.body.style.cursor
    const originalUserSelect = document.body.style.userSelect

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    setResultFixedColumnWidths(startWidths)
    resultFixedColumnWidthsRef.current = startWidths
    setResizingColumnIdx(resizeIndex)

    let currentWidths = startWidths
    let previousClientX = startX
    const getNextWidths = (clientX: number) => {
      const nextWidths = resizeFindResultFixedColumnWidths(
        currentWidths,
        resizeIndex,
        clientX - previousClientX,
        maxColumnWidth,
      )
      currentWidths = nextWidths
      previousClientX = clientX
      return nextWidths
    }

    let cleanup = () => {}

    const onPointerMove = (event: PointerEvent) => {
      setResultFixedColumnWidths(getNextWidths(event.clientX))
    }

    const onPointerUp = (event: PointerEvent) => {
      const nextWidths = getNextWidths(event.clientX)
      cleanup()
      setResultFixedColumnWidths(nextWidths)
      resultFixedColumnWidthsRef.current = nextWidths
      setResizingColumnIdx(null)
      persistResultColumnWidths(nextWidths)
    }

    const onPointerCancel = () => {
      cleanup()
      setResizingColumnIdx(null)
    }

    cleanup = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      resizeHandle.removeEventListener('lostpointercapture', onLostPointerCapture)
      document.body.style.cursor = originalCursor
      document.body.style.userSelect = originalUserSelect
      resultResizeCleanupRef.current = null
    }

    const onLostPointerCapture = () => {
      cleanup()
      setResizingColumnIdx(null)
    }

    resultResizeCleanupRef.current = cleanup
    resizeHandle.addEventListener('lostpointercapture', onLostPointerCapture)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
  }

  const init = async () => {
    if (!configs) return

    setLocale(configs.locale)
  }

  const setKeywordValue = (v: string) => {
    latestSearchStateRef.current = {
      ...latestSearchStateRef.current,
      keyword: v,
    }
    setKeyword(v)
  }

  const doFind = async (v: string) => {
    const seq = searchSeqRef.current + 1
    searchSeqRef.current = seq
    const searchOptions = {
      is_regexp: isRegExp,
      is_ignore_case: isIgnoreCase,
    }

    if (!v) {
      setIsSearching(false)
      setSearchError('')
      setFindPositions([])
      setResultSearchState(searchStateFromOptions(v, searchOptions))
      setCurrentResultIdx(0)
      lastAutoScrollResultIdxRef.current = -1
      return
    }

    setIsSearching(true)
    setSearchError('')

    try {
      const result: IFindItem[] = await actions.findBy(v, searchOptions)
      // A newer keyword/options change can happen while the backend is still
      // searching. Ignore that old response instead of briefly flashing it.
      if (searchSeqRef.current !== seq || !isCurrentSearchState(v, searchOptions)) {
        return
      }

      setCurrentResultIdx(0)
      lastAutoScrollResultIdxRef.current = -1
      setFindPositions(flattenFindItems(result))
      setResultSearchState(searchStateFromOptions(v, searchOptions))

      actions
        .findAddHistory({
          value: v,
          is_regexp: searchOptions.is_regexp,
          is_ignore_case: searchOptions.is_ignore_case,
        })
        .catch((e) => console.error(e))
    } catch (e) {
      if (searchSeqRef.current !== seq || !isCurrentSearchState(v, searchOptions)) return
      const message = getErrorMessage(e, 'Search failed')
      console.error('findBy failed', e)
      setSearchError(message)
      setFindPositions([])
      setResultSearchState(searchStateFromOptions(v, searchOptions))
      showErrorNotification({
        title: 'Search failed',
        message,
      })
    } finally {
      if (searchSeqRef.current === seq && isCurrentSearchState(v, searchOptions)) {
        setIsSearching(false)
      }
    }
  }

  useEffect(() => {
    if (!configs) return
    init().catch((e) => console.error(e))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configs])

  useEffect(() => {
    if (!configs || findOptionsHydratedRef.current) return
    findOptionsHydratedRef.current = true
    const nextIsRegExp = !!configs.find_is_regexp
    const nextIsIgnoreCase = !!configs.find_is_ignore_case
    latestSearchStateRef.current = {
      ...latestSearchStateRef.current,
      isRegExp: nextIsRegExp,
      isIgnoreCase: nextIsIgnoreCase,
    }
    setIsRegExp(nextIsRegExp)
    setIsIgnoreCase(nextIsIgnoreCase)
    // Search only after persisted find options have been applied; otherwise
    // the first render can issue one request with defaults and another with config.
    setFindOptionsHydrated(true)
  }, [configs])

  useEffect(() => {
    resultFixedColumnWidthsRef.current = resultFixedColumnWidths
  }, [resultFixedColumnWidths])

  useEffect(() => {
    const el = resultHeaderRef.current
    if (!el) return

    const update = () => {
      setResultAvailableTrackWidth(getResultAvailableTrackWidth(el))
    }

    update()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }

    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const storedWidths = sanitizeFindResultColumnWidths(configs?.find_result_column_widths)

    if (!resultColumnsHydratedRef.current) {
      if (storedWidths) {
        const fixedWidths: ResultFixedColumnWidths = [storedWidths[0], storedWidths[1]]
        resultColumnsHydratedRef.current = true
        // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror persisted widths into local drag state after config hydration
        setResultFixedColumnWidths(fixedWidths)
        resultFixedColumnWidthsRef.current = fixedWidths
        return
      }

      if (resultAvailableTrackWidth > 0) {
        const fixedWidths = getDefaultFindResultFixedColumnWidths(resultAvailableTrackWidth)
        resultColumnsHydratedRef.current = true
        setResultFixedColumnWidths(fixedWidths)
        resultFixedColumnWidthsRef.current = fixedWidths
      }
      return
    }

    if (storedWidths) {
      const fixedWidths: ResultFixedColumnWidths = [storedWidths[0], storedWidths[1]]
      setResultFixedColumnWidths((prev) =>
        prev[0] === fixedWidths[0] && prev[1] === fixedWidths[1] ? prev : fixedWidths,
      )
      resultFixedColumnWidthsRef.current = fixedWidths
    }
  }, [configs?.find_result_column_widths, resultAvailableTrackWidth])

  useEffect(
    () => () => {
      resultResizeCleanupRef.current?.()
    },
    [],
  )

  useEffect(() => {
    if (!configs) return

    applyThemeToBody(resolvedTheme, [`platform-${agent.platform}`])
    const titleSync = Promise.resolve(actions.findSetWindowTitle(lang.find)).catch((e) =>
      console.error(e),
    )

    if (!findWindowReadySentRef.current) {
      findWindowReadySentRef.current = true
      titleSync.finally(() => {
        window.setTimeout(() => {
          Promise.resolve(agent.broadcast(events.find_window_ready)).catch((e) => console.error(e))
        }, 0)
      })
    }
  }, [configs, lang.find, resolvedTheme])

  useEffect(() => {
    document.title = lang.find_and_replace
  }, [lang])

  useEffect(() => {
    if (!findOptionsHydrated) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void doFind(debouncedKeyword)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedKeyword, isRegExp, isIgnoreCase, findOptionsHydrated])

  useEffect(() => {
    const onFocus = () => {
      if (iptKw.current) {
        iptKw.current.focus()
      }
    }

    window.addEventListener('focus', onFocus, false)
    return () => window.removeEventListener('focus', onFocus, false)
  }, [])

  useEffect(() => {
    const el = resultListRef.current
    if (!el) return

    // Mantine ScrollArea owns the viewport element; cache its dimensions for
    // the fixed-row virtualizer instead of reading layout during render.
    const update = () => {
      setResultListMetrics({
        height: el.clientHeight,
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
      })
    }

    update()
    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const el = resultListRef.current
    if (!el || currentResultIdx < 0 || currentResultIdx >= findPositions.length) return
    if (lastAutoScrollResultIdxRef.current === currentResultIdx) return

    lastAutoScrollResultIdxRef.current = currentResultIdx
    // Rows outside the viewport may not be mounted, so selected-result
    // navigation scrolls by calculated row coordinates.
    const rowTop = RESULT_LIST_PADDING_Y + currentResultIdx * RESULT_ROW_HEIGHT
    const rowBottom = rowTop + RESULT_ROW_HEIGHT
    const viewportTop = el.scrollTop
    const viewportBottom = viewportTop + el.clientHeight

    if (rowTop < viewportTop) {
      el.scrollTo({ top: rowTop, behavior: 'smooth' })
    } else if (rowBottom > viewportBottom) {
      el.scrollTo({ top: rowBottom - el.clientHeight, behavior: 'smooth' })
    }
  }, [currentResultIdx, findPositions.length])

  useOnBroadcast(events.config_updated, loadConfigs)

  const updateIsRegExp = (v: boolean) => {
    latestSearchStateRef.current = {
      ...latestSearchStateRef.current,
      isRegExp: v,
    }
    setIsRegExp(v)
    updateConfigs({ find_is_regexp: v }).catch((e) => console.error(e))
  }

  const updateIsIgnoreCase = (v: boolean) => {
    latestSearchStateRef.current = {
      ...latestSearchStateRef.current,
      isIgnoreCase: v,
    }
    setIsIgnoreCase(v)
    updateConfigs({ find_is_ignore_case: v }).catch((e) => console.error(e))
  }

  const toShowSource = async (resultItem: IFindPositionShow) => {
    await actions.cmdFocusMainWindow()
    agent.broadcast(
      events.show_source,
      lodash.pick<IFindShowSourceParam>(resultItem, [
        'item_id',
        'start',
        'end',
        'match',
        'line',
        'line_pos',
        'end_line',
        'end_line_pos',
      ]),
    )
  }

  const broadcastHostsContentUpdate = (itemId: string) => {
    for (const eventName of [events.hosts_refreshed_by_id, events.hosts_content_changed]) {
      Promise.resolve(agent.broadcast(eventName, itemId)).catch((e) => console.error(e))
    }
  }

  const replaceOne = async () => {
    if (!areResultsCurrent()) return
    const replaceIndex = currentResultIdx
    const pos: IFindPositionShow = findPositions[replaceIndex]
    if (!pos) return
    if (pos.is_disabled || pos.is_readonly) return
    const range = getAdjustedReplaceRange(findPositions, replaceIndex)
    if (!range) return
    // The user can still receive async state changes while a replacement is
    // in flight. Capture the initiating query and only patch the visible list
    // if it is still the active query when the request completes.
    const replaceKeyword = keyword
    const replaceOptions = {
      is_regexp: isRegExp,
      is_ignore_case: isIgnoreCase,
    }

    setIsReplacing(true)
    try {
      const replaced = await actions.findReplaceOne({
        item_id: pos.item_id,
        start: range.start,
        end: range.end,
        expected: pos.match,
        replace_to: replaceTo,
      })
      if (!replaced) {
        if (!isCurrentSearchState(replaceKeyword, replaceOptions)) return
        showErrorNotification({
          title: 'Replace failed',
          message: 'The search result is out of date. Search results were refreshed.',
        })
        void doFind(debouncedKeyword)
        return
      }

      broadcastHostsContentUpdate(pos.item_id)

      if (replaceTo) {
        actions.findAddReplaceHistory(replaceTo).catch((e) => console.error(e))
      }

      // The content mutation has already happened and was broadcast above.
      // If the user has moved to another query, leave that newer list alone.
      if (!isCurrentSearchState(replaceKeyword, replaceOptions)) return

      setFindPositions((prev) => {
        const current = prev[replaceIndex]
        if (!current) return prev
        return [
          ...prev.slice(0, replaceIndex),
          {
            ...current,
            is_disabled: true,
            replace_to: replaceTo,
          },
          ...prev.slice(replaceIndex + 1),
        ]
      })

      if (replaceIndex < findPositions.length - 1) {
        setCurrentResultIdx(replaceIndex + 1)
      }
    } catch (e) {
      if (!isCurrentSearchState(replaceKeyword, replaceOptions)) return
      const message = getErrorMessage(e, 'Replace failed')
      console.error('findReplaceOne failed', e)
      showErrorNotification({
        title: 'Replace failed',
        message,
      })
      void doFind(debouncedKeyword)
    } finally {
      setIsReplacing(false)
    }
  }

  const replaceAll = async () => {
    if (!debouncedKeyword || !areResultsCurrent() || !canReplaceAll) return
    // Same stale-response guard as replace-one: replace-all mutates content
    // based on the query that was current at the time the action started.
    const replaceKeyword = debouncedKeyword
    const replaceOptions = {
      is_regexp: isRegExp,
      is_ignore_case: isIgnoreCase,
    }

    setIsReplacing(true)
    try {
      const outcome: { item_ids?: string[]; replaced_count?: number } =
        await actions.findReplaceAll(replaceKeyword, replaceOptions, replaceTo)

      if (!outcome.replaced_count) {
        if (!isCurrentSearchState(replaceKeyword, replaceOptions)) return
        showErrorNotification({
          title: 'Replace failed',
          message: 'The search result is out of date. Search results were refreshed.',
        })
        void doFind(debouncedKeyword)
        return
      }

      for (const itemId of outcome.item_ids ?? []) {
        broadcastHostsContentUpdate(itemId)
      }

      if (replaceTo) {
        actions.findAddReplaceHistory(replaceTo).catch((e) => console.error(e))
      }

      // Keep the mutation and broadcasts, but do not mark rows in a newer query
      // as replaced when this older request finally resolves.
      if (!isCurrentSearchState(replaceKeyword, replaceOptions)) return

      const changedIds = new Set(outcome.item_ids ?? [])
      setFindPositions((prev) =>
        prev.map((pos) => ({
          ...pos,
          is_disabled: pos.is_readonly
            ? pos.is_disabled
            : pos.is_disabled || changedIds.has(pos.item_id),
          replace_to: pos.is_readonly || !changedIds.has(pos.item_id) ? pos.replace_to : replaceTo,
        })),
      )
    } catch (e) {
      if (!isCurrentSearchState(replaceKeyword, replaceOptions)) return
      const message = getErrorMessage(e, 'Replace failed')
      console.error('findReplaceAll failed', e)
      showErrorNotification({
        title: 'Replace failed',
        message,
      })
      void doFind(debouncedKeyword)
    } finally {
      setIsReplacing(false)
    }
  }

  const ResultRow = ({ data, index }: { data: IFindPositionShow; index: number }) => {
    const isSelected = currentResultIdx === index

    return (
      <Box
        className={clsx(
          styles.result_row,
          isSelected && styles.selected,
          data.is_disabled && styles.disabled,
          data.is_readonly && styles.readonly,
        )}
        onClick={() => {
          setCurrentResultIdx(index)
        }}
        onDoubleClick={() => toShowSource(data)}
        style={resultColumnGridStyle}
        title={lang.to_show_source}
      >
        <div className={styles.result_content}>
          {data.is_readonly ? <span className={styles.read_only}>{lang.read_only}</span> : null}
          <span>{data.before}</span>
          <span className={styles.highlight}>{data.match}</span>
          <span>{data.after}</span>
        </div>
        <div className={styles.result_title}>
          <ItemIcon type={data.item_type} />
          <span>{data.item_title}</span>
        </div>
        <div className={styles.result_line}>{data.line}</div>
      </Box>
    )
  }

  const showKeywordHistory = async () => {
    // Disabled inputs still render their left section; keep history menus
    // locked as part of the same replacing state.
    if (isReplacing) return
    const history = await actions.findGetHistory()
    if (history.length === 0) return

    const menu = new PopupMenu(
      history
        .reverse()
        .map((i: { value: string; is_regexp: boolean; is_ignore_case: boolean }) => ({
          label: i.value,
          click() {
            setKeywordValue(i.value)
            updateIsRegExp(i.is_regexp)
            updateIsIgnoreCase(i.is_ignore_case)
          },
        })),
    )

    menu.show()
  }

  const showReplaceHistory = async () => {
    if (isReplacing) return
    const history = await actions.findGetReplaceHistory()
    if (history.length === 0) return

    const menu = new PopupMenu(
      history.reverse().map((v: string) => ({
        label: v,
        click() {
          setReplaceTo(v)
        },
      })),
    )

    menu.show()
  }

  let canReplace = true
  const canReplaceAll = findPositions.some((pos) => !pos.is_readonly && !pos.is_disabled)
  if (currentResultIdx > -1) {
    const pos = findPositions[currentResultIdx]
    if (!pos || pos.is_disabled || pos.is_readonly) {
      canReplace = false
    }
  }

  const leftSection = (onClick: () => void, disabled = false) => (
    <Group
      aria-disabled={disabled}
      gap={0}
      wrap="nowrap"
      onClick={disabled ? undefined : onClick}
      style={{ cursor: disabled ? 'default' : 'pointer' }}
    >
      <IoSearch />
      <IoChevronDownOutline style={{ fontSize: 10 }} />
    </Group>
  )

  const hasPendingSearch = keyword !== debouncedKeyword
  const resultsMatchCurrentSearch = areResultsCurrent()
  const isBusy = isSearching || isReplacing
  const isActionDisabled = isBusy || hasPendingSearch || !resultsMatchCurrentSearch
  // Keep navigation and counts over the full result set, but only mount the
  // rows near the ScrollArea viewport.
  const visibleStart = Math.max(
    0,
    Math.floor(
      Math.max(0, resultListMetrics.scrollTop - RESULT_LIST_PADDING_Y) / RESULT_ROW_HEIGHT,
    ) - RESULT_LIST_OVERSCAN,
  )
  const visibleCount =
    Math.ceil(Math.max(1, resultListMetrics.height) / RESULT_ROW_HEIGHT) + RESULT_LIST_OVERSCAN * 2
  const visibleEnd = Math.min(findPositions.length, visibleStart + visibleCount)
  const visiblePositions = findPositions.slice(visibleStart, visibleEnd)
  const virtualListHeight = findPositions.length * RESULT_ROW_HEIGHT + RESULT_LIST_PADDING_Y * 2
  const virtualListOffset = visibleStart * RESULT_ROW_HEIGHT
  const resultColumnWidths = getFindResultColumnWidths(
    resultFixedColumnWidths,
    resultAvailableTrackWidth,
  )
  const resultGridContentWidth =
    resultColumnWidths.reduce((sum, width) => sum + width, 0) +
    RESULT_COLUMN_GAP * RESULT_COLUMN_GAP_COUNT
  const resultRowOuterWidth = RESULT_ROW_PADDING_LEFT + resultGridContentWidth
  const resultListInnerWidth = RESULT_ROW_HORIZONTAL_INSET * 2 + resultRowOuterWidth
  const resultColumnGridStyle = {
    '--find-result-line-column-width': `${resultColumnWidths[2]}px`,
    '--find-result-match-column-width': `${resultColumnWidths[0]}px`,
    '--find-result-title-column-width': `${resultColumnWidths[1]}px`,
    width: resultRowOuterWidth,
  } as React.CSSProperties
  const resultHeaderRowStyle = {
    ...resultColumnGridStyle,
    transform: `translateX(-${resultListMetrics.scrollLeft}px)`,
  } as React.CSSProperties

  return (
    <div className={styles.root}>
      <Stack gap={0} h="100%" className={styles.layout}>
        <Stack gap={0} className={styles.content}>
          <TextInput
            autoFocus={true}
            placeholder="keywords"
            value={keyword}
            disabled={isReplacing}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setKeywordValue(e.target.value)
            }}
            ref={iptKw}
            leftSection={leftSection(showKeywordHistory, isReplacing)}
            leftSectionPointerEvents="all"
            styles={flushedInputStyles}
          />

          <TextInput
            placeholder="replace to"
            value={replaceTo}
            disabled={isReplacing}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setReplaceTo(e.target.value)
            }}
            leftSection={leftSection(showReplaceHistory, isReplacing)}
            leftSectionPointerEvents="all"
            styles={flushedInputStyles}
          />

          <Group w="100%" py="8px" px="16px" gap="16px">
            <Checkbox
              checked={isRegExp}
              disabled={isReplacing}
              onChange={(e) => updateIsRegExp(e.target.checked)}
              label={lang.regexp}
            />
            <Checkbox
              checked={isIgnoreCase}
              disabled={isReplacing}
              onChange={(e) => updateIsIgnoreCase(e.target.checked)}
              label={lang.ignore_case}
            />
          </Group>

          <div className={styles.result_header} ref={resultHeaderRef}>
            <div
              className={clsx(
                styles.result_row,
                styles.result_header_row,
                resizingColumnIdx !== null && styles.resizing,
              )}
              style={resultHeaderRowStyle}
            >
              <div className={styles.result_header_match}>{lang.match}</div>
              <div className={styles.result_header_title}>{lang.title}</div>
              <div className={styles.result_header_line}>{lang.line}</div>
              <div
                aria-label="Resize match and title columns"
                className={clsx(
                  styles.result_column_resize_handle,
                  styles.result_resize_handle_match_title,
                  resizingColumnIdx === 0 && styles.resizing,
                )}
                onPointerDown={(e) => startResultColumnResize(0, e)}
                role="separator"
              />
              <div
                aria-label="Resize title and line columns"
                className={clsx(
                  styles.result_column_resize_handle,
                  styles.result_resize_handle_title_line,
                  resizingColumnIdx === 1 && styles.resizing,
                )}
                onPointerDown={(e) => startResultColumnResize(1, e)}
                role="separator"
              />
            </div>
          </div>

          <ScrollArea
            className={styles.result_list}
            scrollbars="xy"
            type="hover"
            scrollbarSize={12}
            offsetScrollbars={true}
            viewportRef={resultListRef}
            viewportProps={{
              'data-testid': 'find-result-list',
              onScroll: (e) => {
                const { clientHeight, scrollLeft, scrollTop } = e.currentTarget
                setResultListMetrics((prev) => ({
                  ...prev,
                  scrollLeft,
                  scrollTop,
                  height: clientHeight,
                }))
              },
            } as React.ComponentProps<'div'> & { 'data-testid': string }}
            classNames={{
              scrollbar: styles.result_scrollbar,
              thumb: styles.result_scroll_thumb,
            }}
          >
            <div
              className={styles.result_list_inner}
              style={{ height: virtualListHeight, width: resultListInnerWidth }}
            >
              <div
                className={styles.virtual_result_rows}
                style={{
                  transform: `translateY(${virtualListOffset}px)`,
                  width: resultRowOuterWidth,
                }}
              >
                {visiblePositions.map((item, idx) => {
                  const resultIndex = visibleStart + idx
                  return (
                    <ResultRow
                      key={`${item.item_id}-${item.index}-${resultIndex}`}
                      data={item}
                      index={resultIndex}
                    />
                  )
                })}
              </div>
            </div>
          </ScrollArea>
        </Stack>

        <Group className={styles.status_bar} w="100%" py="8px" px="16px" gap="16px">
          {isBusy ? (
            <Loader size="sm" />
          ) : searchError ? (
            <span className={styles.error_text}>{searchError}</span>
          ) : (
            <span>
              {i18n.trans(findPositions.length > 1 ? 'items_found' : 'item_found', [
                findPositions.length.toLocaleString(),
              ])}
            </span>
          )}
          <Box style={{ flex: 1 }} />
          <Button
            size="sm"
            variant="outline"
            disabled={isActionDisabled || !canReplaceAll}
            onClick={replaceAll}
          >
            {lang.replace_all}
          </Button>
          <Button
            size="sm"
            variant="filled"
            disabled={isActionDisabled || findPositions.length === 0 || !canReplace}
            onClick={replaceOne}
          >
            {lang.replace}
          </Button>

          <ActionIcon.Group>
            <ActionIcon
              aria-label="previous"
              variant="outline"
              size="lg"
              onClick={() => {
                let idx = currentResultIdx - 1
                if (idx < 0) idx = 0
                setCurrentResultIdx(idx)
              }}
              disabled={currentResultIdx <= 0}
            >
              <IoArrowBackOutline />
            </ActionIcon>
            <ActionIcon
              aria-label="next"
              variant="outline"
              size="lg"
              onClick={() => {
                let idx = currentResultIdx + 1
                if (idx > findPositions.length - 1) idx = findPositions.length - 1
                setCurrentResultIdx(idx)
              }}
              disabled={currentResultIdx >= findPositions.length - 1}
            >
              <IoArrowForwardOutline />
            </ActionIcon>
          </ActionIcon.Group>
        </Group>
      </Stack>
    </div>
  )
}

export default FindPage
