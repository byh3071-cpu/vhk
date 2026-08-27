import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { removeDirSync } from '../src/lib/fs-remove.js'
import { readCloudConfig } from '../src/lib/vhk-cloud.js'

const readState = vi.hoisted(() => ({
  deniedPath: null as string | null,
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    readFileSync: ((...args: unknown[]) => {
      if (readState.deniedPath !== null && String(args[0]) === readState.deniedPath) {
        throw Object.assign(new Error('cloud config denied'), { code: 'EACCES' })
      }
      return Reflect.apply(actual.readFileSync, actual, args)
    }) as typeof actual.readFileSync,
  }
})

describe('readCloudConfig filesystem failures', () => {
  let dir: string
  let configPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vhk-cloud-config-'))
    configPath = join(dir, '.vhk', 'cloud.json')
    mkdirSync(join(dir, '.vhk'), { recursive: true })
    writeFileSync(configPath, '{"gistId":"sample-gist"}\n', 'utf-8')
    readState.deniedPath = null
  })

  afterEach(() => {
    readState.deniedPath = null
    removeDirSync(dir)
  })

  it('EACCES를 연결 없음으로 바꾸지 않고 호출부로 전파한다', () => {
    readState.deniedPath = configPath
    expect(() => readCloudConfig(dir)).toThrowError(
      expect.objectContaining({ code: 'EACCES' }),
    )
  })
})
