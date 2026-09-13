import { createRequire } from 'node:module'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createLogger } = require('../../electron/logger.cjs')

describe('application logger', () => {
  it('writes structured logs and redacts credentials', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'calil-log-test-'))
    const filePath = join(directory, 'main.log')
    const logger = createLogger({ filePath })
    await logger.info('http.response', {
      endpoint: 'https://calil.jp/api/list/v2/',
      status: 200,
      token: 'must-not-be-written',
      headers: { cookie: 'also-secret' },
    })
    await logger.flush()
    const entry = JSON.parse(await readFile(filePath, 'utf8'))
    expect(entry).toMatchObject({ level: 'info', event: 'http.response', status: 200 })
    expect(entry.token).toBe('[REDACTED]')
    expect(entry.headers.cookie).toBe('[REDACTED]')
    expect(JSON.stringify(entry)).not.toContain('must-not-be-written')
  })
})
