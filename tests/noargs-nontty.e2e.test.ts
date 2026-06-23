import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

// #333: 인자 없는 `vhk` 가 비-TTY(파이프/CI/headless)에서 대화형 inquirer 메뉴 ANSI 를
// 쏟던 버그의 회귀 가드. spawnSync 의 기본 stdio('pipe')는 자식에게 비-TTY stdin/stdout 을
// 주므로 — 추가 mock 없이 — 실제 비대화형 진입을 재현한다(함수 단위 mock 으론 불충분).
const bin = path.join(process.cwd(), 'dist', 'index.js')

function runNoArgs(cwd: string, extraEnv: Record<string, string> = {}) {
  return spawnSync(process.execPath, [bin], {
    encoding: 'utf-8',
    cwd,
    // stdin 'ignore' = 즉시 EOF(</dev/null 동치). stdout/stderr 'pipe' = 비-TTY.
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CI: '1', ...extraEnv },
  })
}

describe('no-args vhk — 비-TTY 폴백 (#333)', () => {
  it('비-TTY 에서 대화형 메뉴 ANSI 대신 --help 를 출력한다', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-noargs-nontty-'))
    try {
      const r = runNoArgs(tmp)
      const out = String(r.stdout ?? '') + String(r.stderr ?? '')

      // 대화형 메뉴 마커가 없어야 한다(회귀 핵심).
      expect(out).not.toMatch(/뭘 도와드릴까요/)
      expect(out).not.toMatch(/Use arrow keys/)

      // --help 폴백: 명령어 목록(usage)이 출력돼야 한다.
      expect(out).toMatch(/명령어:|Usage:|Commands:/)

      // 합리적 종료 코드(크래시 아님). help 폴백은 정상 종료(0).
      expect(r.status).toBe(0)
    } finally {
      // Windows: spawnSync 자식이 cwd 핸들을 늦게 풀어 rmdir 가 일시 EBUSY → 재시도로 흡수.
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  })

  it('대화형(VHK_FORCE_INTERACTIVE=1)이면 기존 메뉴를 유지한다 (회귀 0)', () => {
    // VHK_FORCE_INTERACTIVE=1 = isInteractive() true 탈출구 → TTY 동치.
    // 가드가 stdin.isTTY 가 아닌 isInteractive() 축에 묶였는지 확인(폴백이 메뉴를 안 잡아먹음).
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-noargs-tty-'))
    try {
      const r = runNoArgs(tmp, { VHK_FORCE_INTERACTIVE: '1' })
      const out = String(r.stdout ?? '') + String(r.stderr ?? '')
      // 대화형 메뉴 진입 마커가 그대로 떠야 한다(폴백 미적용).
      expect(out).toMatch(/뭘 도와드릴까요/)
    } finally {
      // Windows: spawnSync 자식이 cwd 핸들을 늦게 풀어 rmdir 가 일시 EBUSY → 재시도로 흡수.
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  })
})
