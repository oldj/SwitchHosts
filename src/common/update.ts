export interface AppUpdateInfo {
  version: string
  releaseName?: string | null
  releaseNotes?: string | null
}

export type AppCheckUpdateResult =
  | ({ has_update: true } & AppUpdateInfo)
  | { has_update: false }

export interface AppUpdateProgress {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

export interface AppDownloadedUpdateInfo extends AppUpdateInfo {
  downloadedFile?: string | null
}
