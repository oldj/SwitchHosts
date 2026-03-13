import * as updater from '@main/core/updater'

export default async (): Promise<boolean> => {
  await updater.installUpdate()
  return true
}
