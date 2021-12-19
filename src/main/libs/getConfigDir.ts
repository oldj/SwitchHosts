/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import * as path from 'path'
import { homedir } from 'os'

export default (): string => {
  // todo data folder should be current working dir for portable version

  return path.join(homedir(), '.SwitchHosts')
}
