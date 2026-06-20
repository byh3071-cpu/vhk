import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { goalNext, goalPeek } from '../src/commands/goal.js'

// Goal 78: goal next 비파괴화 + goal peek(읽기 전용).
// goalNext/goalPeek 는 cwd 인자를 받으므로 chdir 없이 tmp 를 주입해 격리 검증한다
// (chdir 은 vitest fork worker 와 충돌 — 전역 cwd 오염 회피).

let tmp: string

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-goal78-'))
  fs.mkdirSync(path.join(tmp, 'goals'), { recursive: true })
  fs.mkdirSync(path.join(tmp, 'docs', 'state'), { recursive: true })
  fs.writeFileSync(
    path.join(tmp, 'goals', '1-test.md'),
    '---\nvhk_format: 1\ntype: goal\nid: 1\ntitle: 테스트\nstatus: NOT_STARTED\npriority: P0\n---\n# Goal 1\n'
  )
})

afterEach(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true })
  } catch {
    /* Windows: 핸들 잔존 시 OS 임시폴더 정리에 위임 */
  }
})

describe('goal 78: peek/next 비파괴화', () => {
  const nextTask = () => path.join(tmp, 'docs', 'state', 'next-task.md')

  it('goal peek 는 next-task.md 를 만들거나 바꾸지 않는다 (읽기 전용)', async () => {
    await goalPeek(tmp)
    expect(fs.existsSync(nextTask())).toBe(false)
  })

  it('goal peek 는 기존 next-task.md 내용을 보존한다 (쓰기 0)', async () => {
    const manual = '# 수동 작성\n중관리자 계획\n'
    fs.writeFileSync(nextTask(), manual)
    await goalPeek(tmp)
    expect(fs.readFileSync(nextTask(), 'utf-8')).toBe(manual)
  })

  it('goal next 는 덮어쓰기 전 기존 next-task.md 를 백업한다', async () => {
    const manual = '# 수동 작성\n절대 잃으면 안 되는 내용\n'
    fs.writeFileSync(nextTask(), manual)
    await goalNext(tmp)

    const backupsRoot = path.join(tmp, '.vhk', 'backups')
    expect(fs.existsSync(backupsRoot)).toBe(true)
    const stamps = fs.readdirSync(backupsRoot)
    expect(stamps.length).toBeGreaterThan(0)
    // 백업에 원본 수동 내용이 그대로 보존됨 (복구 가능)
    const backed = fs.readFileSync(
      path.join(backupsRoot, stamps[0], 'docs', 'state', 'next-task.md'),
      'utf-8'
    )
    expect(backed).toBe(manual)
  })

  it('goal next 는 백업 후 next-task.md 를 스텁으로 갱신한다', async () => {
    const manual = '# 수동 작성\n'
    fs.writeFileSync(nextTask(), manual)
    await goalNext(tmp)
    const now = fs.readFileSync(nextTask(), 'utf-8')
    expect(now).toContain('via `vhk goal next`')
    expect(now).not.toBe(manual)
  })

  it('goal next 는 기존 파일이 없으면 백업 없이 생성한다 (크래시 0)', async () => {
    await goalNext(tmp)
    expect(fs.existsSync(nextTask())).toBe(true)
    // 백업 디렉터리는 생성되지 않음(백업할 원본이 없었으므로)
    expect(fs.existsSync(path.join(tmp, '.vhk', 'backups'))).toBe(false)
  })
})
