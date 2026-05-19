// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SwitchButton from './SwitchButton'

afterEach(() => {
  cleanup()
})

describe('SwitchButton', () => {
  it('toggles without bubbling clicks to ancestors', () => {
    const onChange = vi.fn()
    const onParentClick = vi.fn()

    render(
      <div onClick={onParentClick}>
        <SwitchButton ariaLabel="Toggle hosts" on={false} onChange={onChange} />
      </div>,
    )

    fireEvent.click(screen.getByRole('switch', { name: 'Toggle hosts' }))

    expect(onChange).toHaveBeenCalledWith(true)
    expect(onParentClick).not.toHaveBeenCalled()
  })

  it('keeps disabled switch clicks from selecting parent rows', () => {
    const onChange = vi.fn()
    const onParentClick = vi.fn()

    render(
      <div onClick={onParentClick}>
        <SwitchButton ariaLabel="Toggle hosts" disabled on={false} onChange={onChange} />
      </div>,
    )

    fireEvent.click(screen.getByRole('switch', { name: 'Toggle hosts' }))

    expect(onChange).not.toHaveBeenCalled()
    expect(onParentClick).not.toHaveBeenCalled()
  })
})
