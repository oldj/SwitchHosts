/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import * as path from 'path'
import { homedir } from 'os'

export default (): string => {
  // todo data folder should be current working dir for portable version

  return global.db_dir || path.join(homedir(), '.SwitchHosts')
}
