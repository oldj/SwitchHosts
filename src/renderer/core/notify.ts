import { notifications } from '@mantine/notifications'

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

  return fallbackMessage
}

export function showSuccessNotification({ title, message }: AppNotificationOptions) {
  notifications.show({
    title,
    message,
    color: 'green',
    autoClose: 3500,
  })
}

export function showErrorNotification({ title, message }: AppNotificationOptions) {
  notifications.show({
    title,
    message,
    color: 'red',
    autoClose: 6000,
  })
}
