import { notifications } from '@mantine/notifications'
import { IconCheck, IconX } from '@tabler/icons-react'
import { createElement } from 'react'

interface AppNotificationOptions {
  title: string
  message: string
}

export function getErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  if (typeof error === 'string' && error.trim()) {
    return error
  }

  // Tauri command Err values come through as plain objects shaped by the
  // backend's Serialize impl, e.g. for StorageError:
  //   { kind: 'side_effect', key: 'launch_at_login', reason: '...' }
  // Look for the most informative human-readable field we know about.
  if (error && typeof error === 'object') {
    const obj = error as Record<string, unknown>
    for (const key of ['reason', 'message', 'error']) {
      const v = obj[key]
      if (typeof v === 'string' && v.trim()) {
        return v
      }
    }
  }

  return fallbackMessage
}

export function showSuccessNotification({ title, message }: AppNotificationOptions) {
  notifications.show({
    title,
    message,
    color: 'green',
    icon: createElement(IconCheck, { size: 18, stroke: 1.8 }),
    autoClose: 3500,
  })
}

export function showErrorNotification({ title, message }: AppNotificationOptions) {
  notifications.show({
    title,
    message,
    color: 'red',
    icon: createElement(IconX, { size: 18, stroke: 1.8 }),
    autoClose: 6000,
  })
}

export function showLoadingNotification({ title, message }: AppNotificationOptions): string {
  return notifications.show({
    title,
    message,
    loading: true,
    autoClose: false,
    withCloseButton: false,
  })
}

export function updateSuccessNotification(id: string, { title, message }: AppNotificationOptions) {
  notifications.update({
    id,
    title,
    message,
    color: 'green',
    icon: createElement(IconCheck, { size: 18, stroke: 1.8 }),
    loading: false,
    autoClose: 3500,
    withCloseButton: true,
  })
}

export function updateErrorNotification(id: string, { title, message }: AppNotificationOptions) {
  notifications.update({
    id,
    title,
    message,
    color: 'red',
    icon: createElement(IconX, { size: 18, stroke: 1.8 }),
    loading: false,
    autoClose: 6000,
    withCloseButton: true,
  })
}

export function hideAppNotification(id: string) {
  notifications.hide(id)
}
