// @vitest-environment jsdom

import type { IFindItem } from '@common/types'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  actions: {
    findBy: vi.fn(),
    findAddHistory: vi.fn(),
    findReplaceOne: vi.fn(),
    findReplaceAll: vi.fn(),
    findGetHistory: vi.fn(),
    findGetReplaceHistory: vi.fn(),
    cmdFocusMainWindow: vi.fn(),
  },
  broadcast: vi.fn(),
  configs: {
    find_is_ignore_case: false,
    find_is_regexp: false,
    find_result_column_widths: [] as number[],
    locale: 'en',
    theme: 'light',
  },
  updateConfigs: vi.fn(),
  showErrorNotification: vi.fn(),
}))

vi.mock('@mantine/core', async () => {
  const React = await import('react')

  const setRef = (ref: any, value: any) => {
    if (!ref) return
    if (typeof ref === 'function') {
      ref(value)
      return
    }
    ref.current = value
  }

  const Box = ({ children, w: _w, ...props }: any) => <div {...props}>{children}</div>
  const Button = ({ children, size: _size, variant: _variant, ...props }: any) => (
    <button {...props}>{children}</button>
  )
  const Checkbox = ({ checked, disabled, label, onChange }: any) => (
    <label>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
      {label}
    </label>
  )
  const Group = ({ children, gap: _gap, wrap: _wrap, py: _py, px: _px, w: _w, ...props }: any) => (
    <div {...props}>{children}</div>
  )
  const Loader = () => <span data-testid="loader" />
  const Stack = ({ children, gap: _gap, h: _h, ...props }: any) => <div {...props}>{children}</div>
  const TextInput = React.forwardRef<HTMLInputElement, any>(
    (
      {
        leftSection,
        leftSectionPointerEvents: _leftSectionPointerEvents,
        styles: _styles,
        ...props
      },
      ref,
    ) => (
      <label>
        {leftSection}
        <input ref={ref} {...props} />
      </label>
    ),
  )
  TextInput.displayName = 'MockTextInput'

  const ScrollArea = React.forwardRef<HTMLDivElement, any>(
    (
      {
        children,
        classNames: _classNames,
        offsetScrollbars: _offsetScrollbars,
        scrollbarSize: _scrollbarSize,
        scrollbars: _scrollbars,
        type: _type,
        viewportProps = {},
        viewportRef,
        ...props
      },
      ref,
    ) => (
      <div ref={ref} {...props}>
        <div
          {...viewportProps}
          ref={(node) => {
            setRef(viewportRef, node)
          }}
        >
          {children}
        </div>
      </div>
    ),
  )
  ScrollArea.displayName = 'MockScrollArea'

  const ActionIconButton = ({
    children,
    variant: _variant,
    size: _size,
    color: _color,
    ...props
  }: any) => <button {...props}>{children}</button>
  const ActionIcon = Object.assign(ActionIconButton, {
    Group: ({ children }: any) => <div>{children}</div>,
  })

  return {
    ActionIcon,
    Box,
    Button,
    Checkbox,
    Group,
    Loader,
    ScrollArea,
    Stack,
    TextInput,
  }
})

vi.mock('@renderer/components/ItemIcon', () => ({
  default: () => <span data-testid="item-icon" />,
}))

vi.mock('@renderer/core/agent', () => ({
  actions: mocks.actions,
  agent: {
    broadcast: mocks.broadcast,
    platform: 'darwin',
  },
}))

vi.mock('@renderer/core/notify', () => ({
  getErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : typeof error === 'string' ? error : fallback,
  showErrorNotification: mocks.showErrorNotification,
}))

vi.mock('@renderer/core/PopupMenu', () => ({
  PopupMenu: class {
    show() {}
  },
}))

vi.mock('@renderer/core/useOnBroadcast', () => ({
  default: () => undefined,
}))

vi.mock('@renderer/models/useResolvedTheme', () => ({
  default: () => 'light',
}))

vi.mock('@renderer/utils/theme', () => ({
  applyThemeToBody: vi.fn(),
}))

vi.mock('../models/useConfigs', () => ({
  default: () => ({
    configs: mocks.configs,
    loadConfigs: vi.fn(),
    updateConfigs: mocks.updateConfigs,
  }),
}))

vi.mock('../models/useI18n', () => ({
  default: () => ({
    i18n: {
      trans: (_key: string, values: string[]) => `${values[0]} found`,
    },
    lang: {
      find_and_replace: 'Find and Replace',
      ignore_case: 'Ignore case',
      item_found: 'item found',
      items_found: 'items found',
      line: 'Line',
      match: 'Match',
      read_only: 'Read only',
      regexp: 'RegExp',
      replace: 'Replace',
      replace_all: 'Replace all',
      title: 'Title',
      to_show_source: 'Show source',
    },
    setLocale: vi.fn(),
  }),
}))

import FindPage, {
  getAdjustedReplaceRange,
  getFindResultColumnWidths,
  resizeFindResultFixedColumnWidths,
  type IFindPositionShow,
} from './find'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, reject, resolve }
}

function result(title: string, match: string, itemType: IFindItem['item_type'] = 'local'): IFindItem[] {
  return [
    {
      item_id: title,
      item_title: title,
      item_type: itemType,
      positions: [
        {
          after: '',
          before: '',
          end: match.length,
          end_line: 1,
          end_line_pos: match.length,
          line: 1,
          line_pos: 0,
          match,
          start: 0,
        },
      ],
    },
  ]
}

function resultWithMatches(title: string, matches: string[]): IFindItem[] {
  return [
    {
      item_id: title,
      item_title: title,
      item_type: 'local',
      positions: matches.map((match, index) => ({
        after: '',
        before: '',
        end: index * 10 + match.length,
        end_line: index + 1,
        end_line_pos: match.length,
        line: index + 1,
        line_pos: 0,
        match,
        start: index * 10,
      })),
    },
  ]
}

let expectedConsoleError: ReturnType<typeof vi.spyOn> | undefined

function muteExpectedConsoleError() {
  expectedConsoleError?.mockRestore()
  expectedConsoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  return expectedConsoleError
}

describe('FindPage search state', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mocks.configs.find_is_ignore_case = false
    mocks.configs.find_is_regexp = false
    mocks.configs.find_result_column_widths = []
    mocks.configs.locale = 'en'
    mocks.configs.theme = 'light'
    mocks.actions.findAddHistory.mockResolvedValue([])
    mocks.actions.findGetHistory.mockResolvedValue([])
    mocks.actions.findGetReplaceHistory.mockResolvedValue([])
    mocks.updateConfigs.mockResolvedValue(undefined)
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => 120,
    })
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    })
  })

  afterEach(() => {
    expectedConsoleError?.mockRestore()
    expectedConsoleError = undefined
    cleanup()
    vi.useRealTimers()
  })

  it('stops loading and shows an error when findBy rejects', async () => {
    const consoleError = muteExpectedConsoleError()
    mocks.actions.findBy.mockRejectedValueOnce(new Error('boom'))
    render(<FindPage />)

    fireEvent.change(screen.getByPlaceholderText('keywords'), {
      target: { value: 'abc' },
    })
    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    expect(screen.getByText('boom')).toBeTruthy()
    expect(screen.queryByTestId('loader')).toBeNull()
    expect(consoleError).toHaveBeenCalledWith('findBy failed', expect.any(Error))
  })

  it('does not show the loader while a new search is only waiting for debounce', async () => {
    const search = deferred<IFindItem[]>()
    mocks.actions.findBy.mockReturnValueOnce(search.promise)
    render(<FindPage />)

    fireEvent.change(screen.getByPlaceholderText('keywords'), {
      target: { value: 'abc' },
    })

    expect(screen.queryByTestId('loader')).toBeNull()
    expect(mocks.actions.findBy).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    expect(screen.getByTestId('loader')).toBeTruthy()
  })

  it('does not let an older search overwrite a newer result', async () => {
    const first = deferred<IFindItem[]>()
    const second = deferred<IFindItem[]>()
    mocks.actions.findBy.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    render(<FindPage />)

    fireEvent.change(screen.getByPlaceholderText('keywords'), {
      target: { value: 'old' },
    })
    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    fireEvent.change(screen.getByPlaceholderText('keywords'), {
      target: { value: 'new' },
    })
    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    await act(async () => {
      second.resolve(result('new-title', 'new'))
      await second.promise
    })
    expect(screen.getByText('new')).toBeTruthy()

    await act(async () => {
      first.resolve(result('old-title', 'old'))
      await first.promise
    })

    expect(screen.queryByText('old')).toBeNull()
    expect(screen.getByText('new')).toBeTruthy()
  })

  it('does not show an old result while the latest keyword is still debouncing', async () => {
    const first = deferred<IFindItem[]>()
    const second = deferred<IFindItem[]>()
    mocks.actions.findBy.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    render(<FindPage />)

    fireEvent.change(screen.getByPlaceholderText('keywords'), {
      target: { value: 'old' },
    })
    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    fireEvent.change(screen.getByPlaceholderText('keywords'), {
      target: { value: 'new' },
    })

    await act(async () => {
      first.resolve(result('old-title', 'old'))
      await first.promise
    })

    expect(screen.queryByText('old')).toBeNull()
    expect(screen.getByTestId('loader')).toBeTruthy()

    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })
    await act(async () => {
      second.resolve(result('new-title', 'new'))
      await second.promise
    })

    expect(screen.getByText('new')).toBeTruthy()
  })

  it('disables replacement actions when options no longer match the displayed results', async () => {
    const first = deferred<IFindItem[]>()
    const second = deferred<IFindItem[]>()
    mocks.actions.findBy.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    render(<FindPage />)

    fireEvent.change(screen.getByPlaceholderText('keywords'), {
      target: { value: 'abc' },
    })
    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    await act(async () => {
      first.resolve(result('first-title', 'abc'))
      await first.promise
    })

    const replaceAll = screen.getByText('Replace all') as HTMLButtonElement
    expect(replaceAll.disabled).toBe(false)

    fireEvent.click(screen.getByLabelText('RegExp'))
    expect(replaceAll.disabled).toBe(true)

    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      second.resolve(result('second-title', 'abc'))
      await second.promise
    })

    expect(replaceAll.disabled).toBe(false)
  })

  it('disables replace all after all writable displayed results were replaced', async () => {
    mocks.actions.findBy.mockResolvedValueOnce(result('first-title', 'abc'))
    mocks.actions.findReplaceAll.mockResolvedValueOnce({
      item_ids: ['first-title'],
      replaced_count: 1,
    })
    render(<FindPage />)

    fireEvent.change(screen.getByPlaceholderText('keywords'), {
      target: { value: 'abc' },
    })
    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    const replaceAll = screen.getByText('Replace all') as HTMLButtonElement
    expect(replaceAll.disabled).toBe(false)

    await act(async () => {
      fireEvent.click(replaceAll)
      await Promise.resolve()
    })

    expect(replaceAll.disabled).toBe(true)
    expect(mocks.broadcast).toHaveBeenCalledWith('hosts_refreshed_by_id', 'first-title')
    expect(mocks.broadcast).toHaveBeenCalledWith('hosts_content_changed', 'first-title')
  })

  it('disables replacement actions for read-only remote results', async () => {
    mocks.actions.findBy.mockResolvedValueOnce(result('remote-title', 'abc', 'remote'))
    render(<FindPage />)

    fireEvent.change(screen.getByPlaceholderText('keywords'), {
      target: { value: 'abc' },
    })
    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    expect((screen.getByText('Replace all') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByText('Replace') as HTMLButtonElement).disabled).toBe(true)
  })

  it('notifies content changes when replacing one result', async () => {
    mocks.actions.findBy.mockResolvedValueOnce(result('first-title', 'abc'))
    mocks.actions.findReplaceOne.mockResolvedValueOnce(true)
    render(<FindPage />)

    fireEvent.change(screen.getByPlaceholderText('keywords'), {
      target: { value: 'abc' },
    })
    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    await act(async () => {
      fireEvent.click(screen.getByText('Replace'))
      await Promise.resolve()
    })

    expect(mocks.broadcast).toHaveBeenCalledWith('hosts_refreshed_by_id', 'first-title')
    expect(mocks.broadcast).toHaveBeenCalledWith('hosts_content_changed', 'first-title')
  })

  it('disables search inputs and options while replacing', async () => {
    const replace = deferred<boolean>()
    mocks.actions.findBy.mockResolvedValueOnce(result('first-title', 'abc'))
    mocks.actions.findReplaceOne.mockReturnValueOnce(replace.promise)
    render(<FindPage />)

    fireEvent.change(screen.getByPlaceholderText('keywords'), {
      target: { value: 'abc' },
    })
    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    await act(async () => {
      fireEvent.click(screen.getByText('Replace'))
      await Promise.resolve()
    })

    expect((screen.getByPlaceholderText('keywords') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByPlaceholderText('replace to') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText('RegExp') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText('Ignore case') as HTMLInputElement).disabled).toBe(true)
    expect(document.querySelectorAll('[aria-disabled="true"]')).toHaveLength(2)

    await act(async () => {
      replace.resolve(true)
      await replace.promise
    })
  })

  it('refreshes displayed results when replace one reports an outdated match', async () => {
    mocks.actions.findBy.mockResolvedValueOnce(result('first-title', 'abc')).mockResolvedValueOnce([])
    mocks.actions.findReplaceOne.mockResolvedValueOnce(false)
    render(<FindPage />)

    fireEvent.change(screen.getByPlaceholderText('keywords'), {
      target: { value: 'abc' },
    })
    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    await act(async () => {
      fireEvent.click(screen.getByText('Replace'))
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.showErrorNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'The search result is out of date. Search results were refreshed.',
      }),
    )
    expect(mocks.actions.findBy).toHaveBeenCalledTimes(2)
  })

  it('does not apply a stale replace one outcome to newer displayed results', async () => {
    const replace = deferred<boolean>()
    mocks.actions.findBy
      .mockResolvedValueOnce(result('same-title', 'old'))
      .mockResolvedValueOnce(result('same-title', 'new'))
    mocks.actions.findReplaceOne.mockReturnValueOnce(replace.promise)
    render(<FindPage />)

    fireEvent.change(screen.getByPlaceholderText('keywords'), {
      target: { value: 'old' },
    })
    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    await act(async () => {
      fireEvent.click(screen.getByText('Replace'))
      await Promise.resolve()
    })
    fireEvent.change(screen.getByPlaceholderText('keywords'), {
      target: { value: 'new' },
    })
    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    await act(async () => {
      replace.resolve(true)
      await replace.promise
    })

    expect(screen.getByText('new')).toBeTruthy()
    expect((screen.getByText('Replace') as HTMLButtonElement).disabled).toBe(false)
    expect(mocks.broadcast).toHaveBeenCalledWith('hosts_content_changed', 'same-title')
  })

  it('refreshes displayed results when replace all fails', async () => {
    const consoleError = muteExpectedConsoleError()
    mocks.actions.findBy.mockResolvedValueOnce(result('first-title', 'abc')).mockResolvedValueOnce([])
    mocks.actions.findReplaceAll.mockRejectedValueOnce(new Error('write failed'))
    render(<FindPage />)

    fireEvent.change(screen.getByPlaceholderText('keywords'), {
      target: { value: 'abc' },
    })
    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    await act(async () => {
      fireEvent.click(screen.getByText('Replace all'))
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.showErrorNotification).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'write failed' }),
    )
    expect(mocks.actions.findBy).toHaveBeenCalledTimes(2)
    expect(consoleError).toHaveBeenCalledWith('findReplaceAll failed', expect.any(Error))
  })

  it('refreshes displayed results when replace all finds nothing in current content', async () => {
    mocks.actions.findBy.mockResolvedValueOnce(result('first-title', 'abc')).mockResolvedValueOnce([])
    mocks.actions.findReplaceAll.mockResolvedValueOnce({
      item_ids: [],
      replaced_count: 0,
    })
    render(<FindPage />)

    fireEvent.change(screen.getByPlaceholderText('keywords'), {
      target: { value: 'abc' },
    })
    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    await act(async () => {
      fireEvent.click(screen.getByText('Replace all'))
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.showErrorNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'The search result is out of date. Search results were refreshed.',
      }),
    )
    expect(mocks.actions.findBy).toHaveBeenCalledTimes(2)
  })

  it('does not apply a stale replace all outcome to newer displayed results', async () => {
    const replace = deferred<{ item_ids: string[]; replaced_count: number }>()
    mocks.actions.findBy
      .mockResolvedValueOnce(result('same-title', 'old'))
      .mockResolvedValueOnce(result('same-title', 'new'))
    mocks.actions.findReplaceAll.mockReturnValueOnce(replace.promise)
    render(<FindPage />)

    fireEvent.change(screen.getByPlaceholderText('keywords'), {
      target: { value: 'old' },
    })
    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    await act(async () => {
      fireEvent.click(screen.getByText('Replace all'))
      await Promise.resolve()
    })
    fireEvent.change(screen.getByPlaceholderText('keywords'), {
      target: { value: 'new' },
    })
    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    await act(async () => {
      replace.resolve({ item_ids: ['same-title'], replaced_count: 1 })
      await replace.promise
    })

    expect(screen.getByText('new')).toBeTruthy()
    expect((screen.getByText('Replace all') as HTMLButtonElement).disabled).toBe(false)
    expect(mocks.broadcast).toHaveBeenCalledWith('hosts_content_changed', 'same-title')
  })

  it('can scroll rendered search results without reading from a released event', async () => {
    mocks.actions.findBy.mockResolvedValueOnce(result('scroll-title', 'scroll-match'))
    render(<FindPage />)

    fireEvent.change(screen.getByPlaceholderText('keywords'), {
      target: { value: 'scroll' },
    })
    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    const list = screen.getByTestId('find-result-list')
    Object.defineProperty(list, 'scrollTop', {
      configurable: true,
      value: 29,
    })

    expect(() => {
      fireEvent.scroll(list)
    }).not.toThrow()
  })

  it('only mounts visible result rows and updates them on scroll', async () => {
    mocks.actions.findBy.mockResolvedValueOnce(
      resultWithMatches(
        'bulk-title',
        Array.from({ length: 100 }, (_value, index) => `match-${index}`),
      ),
    )
    render(<FindPage />)

    fireEvent.change(screen.getByPlaceholderText('keywords'), {
      target: { value: 'bulk' },
    })
    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    expect(screen.getByText('match-0')).toBeTruthy()
    expect(screen.queryByText('match-99')).toBeNull()

    const list = screen.getByTestId('find-result-list')
    Object.defineProperty(list, 'scrollTop', {
      configurable: true,
      value: 29 * 80,
    })
    await act(async () => {
      fireEvent.scroll(list)
      await Promise.resolve()
    })

    expect(screen.queryByText('match-0')).toBeNull()
    expect(screen.getByText('match-80')).toBeTruthy()
  })

  it('persists result column widths after dragging a header handle', async () => {
    mocks.configs.find_result_column_widths = [240, 180, 90]
    render(<FindPage />)

    await act(async () => {
      fireEvent.pointerDown(screen.getByLabelText('Resize match and title columns'), {
        clientX: 300,
      })
      fireEvent.pointerMove(window, { clientX: 50 })
      fireEvent.pointerUp(window, { clientX: 50 })
      await Promise.resolve()
    })

    expect(mocks.updateConfigs).toHaveBeenCalledWith({
      find_result_column_widths: [60, 360, 60],
    })
  })
})

describe('find replace helpers', () => {
  it('adjusts a later replacement range after earlier replacements changed length', () => {
    const positions: IFindPositionShow[] = [
      {
        after: '',
        before: '',
        end: 5,
        end_line: 1,
        end_line_pos: 5,
        index: 0,
        is_disabled: true,
        item_id: 'item',
        item_title: 'Item',
        item_type: 'local',
        line: 1,
        line_pos: 0,
        match: 'hello',
        replace_to: 'hi',
        start: 0,
      },
      {
        after: '',
        before: '',
        end: 11,
        end_line: 1,
        end_line_pos: 11,
        index: 1,
        item_id: 'item',
        item_title: 'Item',
        item_type: 'local',
        line: 1,
        line_pos: 6,
        match: 'world',
        start: 6,
      },
    ]

    expect(getAdjustedReplaceRange(positions, 1)).toEqual({ start: 3, end: 8 })
  })

  it('keeps resized result columns above the minimum width', () => {
    expect(resizeFindResultFixedColumnWidths([240, 180], 0, 300)).toEqual([360, 60])
    expect(resizeFindResultFixedColumnWidths([240, 180], 0, -300)).toEqual([60, 360])
    expect(resizeFindResultFixedColumnWidths([240, 180], 1, -300)).toEqual([240, 60])
  })

  it('keeps resized result columns below the drag-start maximum width', () => {
    expect(resizeFindResultFixedColumnWidths([240, 180], 0, 900, 300)).toEqual([300, 120])
    expect(resizeFindResultFixedColumnWidths([240, 180], 0, -900, 300)).toEqual([120, 300])
    expect(resizeFindResultFixedColumnWidths([240, 180], 1, 900, 300)).toEqual([240, 300])
  })

  it('does not shrink columns that already exceed the drag-start maximum until dragged smaller', () => {
    expect(resizeFindResultFixedColumnWidths([500, 100], 0, 0, 300)).toEqual([500, 100])
    expect(resizeFindResultFixedColumnWidths([500, 100], 0, 100, 300)).toEqual([500, 100])
    expect(resizeFindResultFixedColumnWidths([500, 100], 0, -100, 300)).toEqual([400, 200])
    expect(resizeFindResultFixedColumnWidths([100, 500], 1, 100, 300)).toEqual([100, 500])
    expect(resizeFindResultFixedColumnWidths([100, 500], 1, -100, 300)).toEqual([100, 400])
  })

  it('lets the line column absorb available result width down to its minimum', () => {
    expect(getFindResultColumnWidths([240, 180], 800)).toEqual([240, 180, 380])
    expect(getFindResultColumnWidths([240, 180], 450)).toEqual([240, 180, 60])
  })
})
