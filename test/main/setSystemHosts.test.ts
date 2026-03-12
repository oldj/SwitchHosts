import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearData } from '../_base'
import configSet from '../../src/main/actions/config/set'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const systemHostsPath = path.join(dirname, '..', 'tmp', 'system-hosts')

vi.mock('../../src/main/actions/hosts/getPathOfSystemHostsPath', () => ({
  default: async () => systemHostsPath,
}))

describe('setSystemHosts', () => {
  beforeEach(async () => {
    await clearData()
    ;(global as typeof global & { tracer?: { add: (message: string) => void } }).tracer = {
      add() {},
    }
    await configSet('write_mode', 'overwrite')
    await configSet('cmd_after_hosts_apply', '')
    await fs.mkdir(path.dirname(systemHostsPath), { recursive: true })
    await fs.writeFile(systemHostsPath, '127.0.0.1 localhost\n', 'utf-8')
  })

  it('writes CRLF when the platform line ending is Windows', async () => {
    vi.doMock('../../src/common/newlines', async () => {
      const actual = await vi.importActual<typeof import('../../src/common/newlines')>(
        '../../src/common/newlines',
      )

      return {
        ...actual,
        getLineEndingForPlatform: () => '\r\n' as const,
      }
    })

    const { default: setSystemHosts } = await import('../../src/main/actions/hosts/setSystemHosts')

    const result = await setSystemHosts('1.1.1.1 example.test\n# note\n')
    expect(result.success).toBe(true)
    expect(await fs.readFile(systemHostsPath, 'utf-8')).toBe('1.1.1.1 example.test\r\n# note\r\n')
  })
})
