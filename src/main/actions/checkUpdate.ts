import * as updater from '@main/core/updater'

export default async (): Promise<boolean> => {
  const update = await updater.checkUpdate()
  return !!update
}
