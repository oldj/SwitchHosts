export interface AppUpdateInfo {
  version: string
  releaseName?: string | null
  releaseNotes?: string | null
}

export interface AppUpdateProgress {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

export interface AppDownloadedUpdateInfo extends AppUpdateInfo {
  downloadedFile?: string | null
}
