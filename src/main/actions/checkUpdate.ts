import * as updater from '@main/core/updater'

export default async (): Promise<boolean | null> => {
  try {
    const update = await updater.checkUpdate()
    return !!update
  } catch (error) {
    console.error(error)
    return null
  }
}
