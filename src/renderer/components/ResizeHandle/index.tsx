import clsx from 'clsx'
import { useCallback, useEffect, useRef, useState } from 'react'
import styles from './index.module.scss'

interface Props {
  side: 'left' | 'right'
  current: number
  min?: number
  onResize: (width: number) => void
  onResizeEnd: (width: number) => void
  onDragStart?: () => void
  onDragEnd?: () => void
}

const DEFAULT_MIN = 100
const BODY_DRAG_CLASS = 'swh-resizing'

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

const ResizeHandle = ({
  side,
  current,
  min = DEFAULT_MIN,
  onResize,
  onResizeEnd,
  onDragStart,
  onDragEnd,
}: Props) => {
  const [active, setActive] = useState(false)
  const stateRef = useRef({ startX: 0, startWidth: 0, lastWidth: current, pointerId: -1 })

  useEffect(() => {
    return () => {
      document.body.classList.remove(BODY_DRAG_CLASS)
    }
  }, [])

  const compute = useCallback(
    (clientX: number) => {
      const dx = clientX - stateRef.current.startX
      const raw =
        side === 'left'
          ? stateRef.current.startWidth + dx
          : stateRef.current.startWidth - dx
      return Math.round(clamp(raw, min, window.innerWidth * 0.5))
    },
    [side, min],
  )

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    stateRef.current = {
      startX: e.clientX,
      startWidth: current,
      lastWidth: current,
      pointerId: e.pointerId,
    }
    setActive(true)
    document.body.classList.add(BODY_DRAG_CLASS)
    onDragStart?.()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== stateRef.current.pointerId) return
    const next = compute(e.clientX)
    stateRef.current.lastWidth = next
    onResize(next)
  }

  const finish = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== stateRef.current.pointerId) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    stateRef.current.pointerId = -1
    setActive(false)
    document.body.classList.remove(BODY_DRAG_CLASS)
    onResizeEnd(stateRef.current.lastWidth)
    onDragEnd?.()
  }

  return (
    <div
      className={clsx(styles.handle, styles[side], { [styles.active]: active })}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      role="separator"
      aria-orientation="vertical"
    />
  )
}

export default ResizeHandle
