import { notifications } from '@mantine/notifications'
import type { LanguageDict } from '@common/types'
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

export function getFriendlyUpdateErrorMessage(
  error: unknown,
  lang: LanguageDict,
  fallbackMessage = lang.check_update_failed,
): string {
  const message = getErrorMessage(error, fallbackMessage)
  const lower = message.toLowerCase()

  if (lower.includes('invalid proxy') || lower.includes('proxy')) {
    return lang.update_error_proxy
  }

  if (
    lower.includes('signature') ||
    lower.includes('minisign') ||
    lower.includes('public key')
  ) {
    return lang.update_error_signature
  }

  if (
    (lower.includes('platform') && lower.includes('not found')) ||
    lower.includes('fallback platforms') ||
    lower.includes('platforms object') ||
    lower.includes('target') ||
    lower.includes('unsupported') ||
    lower.includes('not found in release data') ||
    lower.includes('invalid updater format') ||
    lower.includes('binary not found')
  ) {
    return lang.update_error_platform
  }

  if (
    lower.includes('404') ||
    lower.includes('release not found') ||
    lower.includes('no update available') ||
    lower.includes('could not fetch update') ||
    lower.includes('failed to deserialize') ||
    lower.includes('json') ||
    lower.includes('the `url` field was not set')
  ) {
    return lang.update_error_unavailable
  }

  if (
    lower.includes('network') ||
    lower.includes('request') ||
    lower.includes('connect') ||
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('dns') ||
    lower.includes('tls')
  ) {
    return lang.update_error_network
  }

  if (
    lower.includes('install') ||
    lower.includes('permission') ||
    lower.includes('denied') ||
    lower.includes('dpkg') ||
    lower.includes('rpm')
  ) {
    return lang.update_error_install
  }

  return message
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
