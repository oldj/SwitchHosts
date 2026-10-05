import { ConfigsType } from '@common/default_configs'
import { actions } from './agent'

// Shared by all hook instances and the atom's initial load in this renderer.
// A delayed response must neither publish nor return a superseded snapshot.
let latestRead: Promise<ConfigsType> | null = null

export function invalidateConfigSnapshot() {
  latestRead = null
}

function startRead(): Promise<ConfigsType> {
  return (latestRead = actions.configAll())
}

export async function loadConfigSnapshot(
  publish: (snapshot: ConfigsType) => void,
): Promise<ConfigsType> {
  let request = startRead()
  for (;;) {
    let snapshot: ConfigsType
    try {
      snapshot = await request
    } catch (error) {
      if (request === latestRead) throw error
      request = latestRead ?? startRead()
      continue
    }
    if (request === latestRead) {
      // Validate and publish without another await: a write can complete
      // between resolving this promise and a caller's continuation.
      publish(snapshot)
      return snapshot
    }
    // A newer read wins, even if it finished first. A completed write
    // invalidates all earlier reads, requiring a fresh backend snapshot.
    request = latestRead ?? startRead()
  }
}
