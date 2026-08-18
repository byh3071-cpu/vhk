import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { removeDirSync } from '../src/lib/fs-remove.js'

/*
 * TS-005 가드의 가드.
 *
 * check-rule-no-rm-sync.mjs 는 만들어졌지만 어떤 게이트에도 연결돼 있지 않아 한 번도 돌지 않았다.
 * 아무도 실행하지 않는 검사는 없는 검사와 같다 — 그래서 스크립트 동작과 실제 레포 상태를 여기서 확인한다.
 */

const SCRIPT = path.join(process.cwd(), 'scripts', 'check-rule-no-rm-sync.mjs')

function runGate(cwd: string): { status: number; stderr: string } {
  const r = spawnSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf-8' })
  return { status: r.status ?? 1, stderr: r.stderr ?? '' }
}

describe('check-rule-no-rm-sync', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-no-rm-sync-'))
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
    fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
    fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true })
  })

  afterEach(() => {
    removeDirSync(dir)
  })

  function writeBaseline(entries: Record<string, number>): void {
    fs.writeFileSync(
      path.join(dir, 'scripts', 'rmsync-baseline.json'),
      JSON.stringify(entries, null, 2),
      'utf-8',
    )
  }

  it('src 의 rmSync 호출을 차단한다', () => {
    fs.writeFileSync(
      path.join(dir, 'src', 'bad.ts'),
      "import { rmSync } from 'node:fs'\nrmSync('/tmp/x', { recursive: true })\n",
      'utf-8',
    )
    expect(runGate(dir).status).toBe(1)
  })

  it('삭제 헬퍼 사용은 통과한다', () => {
    fs.writeFileSync(
      path.join(dir, 'src', 'good.ts'),
      "import { removeDirSync } from './fs-remove.js'\nremoveDirSync('/tmp/x')\n",
      'utf-8',
    )
    expect(runGate(dir).status).toBe(0)
  })

  it('baseline 에 없는 새 테스트 파일의 rmSync 를 차단한다', () => {
    fs.writeFileSync(
      path.join(dir, 'tests', 'new.test.ts'),
      "import fs from 'node:fs'\nfs.rmSync('/tmp/x', { recursive: true })\n",
      'utf-8',
    )
    const r = runGate(dir)
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('새 파일')
  })

  it('baseline 이내의 기존 테스트 잔존은 통과한다', () => {
    fs.writeFileSync(
      path.join(dir, 'tests', 'legacy.test.ts'),
      "import fs from 'node:fs'\nfs.rmSync('/tmp/x')\nfs.rmSync('/tmp/y')\n",
      'utf-8',
    )
    writeBaseline({ 'tests/legacy.test.ts': 2 })
    expect(runGate(dir).status).toBe(0)
  })

  it('기존 파일이라도 건수가 늘면 차단한다', () => {
    fs.writeFileSync(
      path.join(dir, 'tests', 'legacy.test.ts'),
      "import fs from 'node:fs'\nfs.rmSync('/tmp/x')\nfs.rmSync('/tmp/y')\nfs.rmSync('/tmp/z')\n",
      'utf-8',
    )
    writeBaseline({ 'tests/legacy.test.ts': 2 })
    const r = runGate(dir)
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('늘었습니다')
  })

  it('주석·문자열 안의 언급은 위반이 아니다', () => {
    fs.writeFileSync(
      path.join(dir, 'src', 'mention.ts'),
      "// rmSync( 는 금지다\nconst hint = 'rmSync('\nexport { hint }\n",
      'utf-8',
    )
    expect(runGate(dir).status).toBe(0)
  })

  // 템플릿 리터럴 전체를 지우면 그 안의 치환식(${...})에 숨긴 호출이 사라진다 — 우회 통로가 된다.
  it('템플릿 치환식 안의 호출도 센다', () => {
    fs.writeFileSync(
      path.join(dir, 'src', 'tpl.ts'),
      ['import fs from "node:fs"', 'export const s = `x${fs.rmSync("/tmp/x")}y`', ''].join('\n'),
      'utf-8',
    )
    expect(runGate(dir).status).toBe(1)
  })

  // 별칭 import 는 호출부 이름이 달라져 호출 수가 실제보다 적게 잡힌다 — baseline 이 어긋난다.
  it('별칭 import 의 호출 수를 정확히 센다', () => {
    fs.writeFileSync(
      path.join(dir, 'tests', 'alias.test.ts'),
      ['import { rmSync as remove } from "node:fs"', 'remove("/tmp/x")', 'remove("/tmp/y")', ''].join('\n'),
      'utf-8',
    )
    writeBaseline({ 'tests/alias.test.ts': 2 })
    expect(runGate(dir).status).toBe(0)

    writeBaseline({ 'tests/alias.test.ts': 1 })
    expect(runGate(dir).status).toBe(1)
  })

  // baseline 갱신은 tests 만 다룬다. src 위반까지 통과로 보고하면 갱신 명령이 위반을 덮는다.
  it('--update-baseline 은 src 위반이 있으면 실패한다', () => {
    fs.writeFileSync(
      path.join(dir, 'src', 'bad.ts'),
      ['import { rmSync } from "node:fs"', 'rmSync("/tmp/x")', ''].join('\n'),
      'utf-8',
    )
    const r = spawnSync(process.execPath, [SCRIPT, '--update-baseline'], { cwd: dir, encoding: 'utf-8' })
    expect(r.status).toBe(1)
    expect(fs.existsSync(path.join(dir, 'scripts', 'rmsync-baseline.json'))).toBe(false)
  })

  // 실제 레포 — 게이트가 지금 초록인지 여기서 확인한다.
  it('이 레포는 현재 규칙을 만족한다', () => {
    expect(runGate(process.cwd()).status).toBe(0)
  })
})
