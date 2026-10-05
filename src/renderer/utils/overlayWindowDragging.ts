import type { HTMLAttributes } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'

// Native dragging can consume mouseup/click. Reset on every new press so a
// missing click never prevents the next ordinary backdrop click from closing.
const draggingOverlays = new WeakSet<HTMLElement>()

function isTitlebarDragPoint(overlay: HTMLElement, x: number, y: number): boolean {
  const doc = overlay.ownerDocument
  const titlebar = doc.querySelector<HTMLElement>('[data-window-titlebar]')
  if (!titlebar) return false
  const bounds = titlebar.getBoundingClientRect()
  if (x < bounds.left || x >= bounds.right || y < bounds.top || y >= bounds.bottom) return false

  for (const element of doc.elementsFromPoint(x, y)) {
    // A nested modal may cover another dialog instead of the titlebar.
    if (element.closest('[role="dialog"]')) return false
    if (titlebar.contains(element)) {
      // Match the titlebar's existing, direct-hit Tauri drag regions. Buttons
      // and their children remain blocked by the backdrop.
      const region = element.getAttribute('data-tauri-drag-region')
      return region === '' || region === 'true' || region === 'deep'
    }
  }
  return false
}

export const overlayWindowDragging: Pick<
  HTMLAttributes<HTMLDivElement>,
  'onMouseDown' | 'onClickCapture'
> = {
  onMouseDown(event) {
    const overlay = event.currentTarget
    draggingOverlays.delete(overlay)
    if (
      event.button !== 0 ||
      event.target !== overlay ||
      !isTitlebarDragPoint(overlay, event.clientX, event.clientY)
    )
      return

    event.preventDefault()
    event.stopPropagation()
    draggingOverlays.add(overlay)
    getCurrentWindow()
      .startDragging()
      .catch((error) => console.error(error))
  },
  onClickCapture(event) {
    if (!draggingOverlays.delete(event.currentTarget)) return
    // Mantine closes the dialog from the overlay's bubbling click handler.
    event.preventDefault()
    event.stopPropagation()
  },
}
