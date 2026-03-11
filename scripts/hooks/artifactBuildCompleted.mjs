import { notarize } from '@electron/notarize'
import path from 'node:path'
import { getNotarizeOptions } from './notarize-options.mjs'

export default async function artifactBuildCompleted(context) {
  const { file, packager } = context

  if (!file || path.extname(file) !== '.dmg') {
    return
  }

  if (packager?.platform?.name !== 'mac') {
    return
  }

  if (process.env.MAKE_FOR === 'dev' || process.env.SKIP_NOTARIZATION) {
    console.log(`skip notarization for ${path.basename(file)}.`)
    return
  }

  const options = await getNotarizeOptions(file)
  if (!options) {
    console.log(`Not notarized for ${path.basename(file)}.`)
    return
  }

  console.log('in artifactBuildCompleted, notarize dmg...')
  console.log(`dmgPath: ${file}`)
  await notarize(options)
  console.log(`Notarize done for ${path.basename(file)}.`)
}
