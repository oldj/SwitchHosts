/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import * as path from 'path'
import { homedir } from 'os'

export default (): string => {
  // todo data folder should be current portable version

  return path.join(homedir(), '.SwitchHosts')
}
