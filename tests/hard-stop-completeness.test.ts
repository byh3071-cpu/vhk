import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

// #455 보너스: ensureNotHardStopped 정적 완전성 테스트(래칫).
// "신규 명령이 HARD_STOP 가드를 빠뜨리는" 클래스가 4회 반복됨(#334/#335/#336 + seo-report + #455 뒷단 4명령)
// → 재발을 사람 기억이 아니라 테스트로 차단한다.
//
// 원리: src/commands/**/*.ts 중 디스크 산출물을 직접 만드는 파일(쓰기 시그널)은
//   ① 파일 안에 ensureNotHardStopped( 가드가 있거나
//   ② index.ts chokepoint(guardCli/guardCliDefer) 경유거나  → CHOKEPOINT (index.ts 대조로 자가검증)
//   ③ 문서화된 설계 예외                                    → EXEMPT (사유 필수)
// 셋 다 아니면 FAIL — 새 명령 작성자는 가드를 넣거나, 사유와 함께 예외를 등록해야 한다.
//
// 정직한 한계: lib 헬퍼 경유 쓰기(state-files 등)는 명령 파일에 시그널이 없어 못 잡는다.
// 이 테스트는 반복된 실패 클래스(명령 파일 내 직접 쓰기·emitPrompt)만 정적으로 커버한다.

const COMMANDS_DIR = 'src/commands'

// 디스크 산출물을 만들거나 바꾸는 직접 호출. mkdirSync 는 단독으론 파괴적이지 않아 제외(오탐 방지).
// removeFileSync·removeDirSync 는 rmSync 의 대체 헬퍼(TS-005) — 삭제도 디스크 변경이라 같은 시그널로 센다.
const WRITE_SIGNAL = /\b(writeFileSync|appendFileSync|rmSync|removeFileSync|removeDirSync|renameSync|copyFileSync|atomicWriteFile|emitPrompt)\s*\(/
const GUARD_SIGNAL = /\bensureNotHardStopped\s*\(/

// ② index.ts 단일 chokepoint 에서 가드되는 명령(파일 상대경로 → guardCli action).
//    아래 hygiene 테스트가 index.ts 에 guardCli('<action>' 배선이 실재하는지 대조한다.
//    (chokepoint 전체 집합의 완전성은 tests/safety-coverage.test.ts 가 별도 검증.)
const CHOKEPOINT: Record<string, string> = {
  'migrate.ts': 'migrate',
  'publish.ts': 'publish',
  'sync.ts': 'sync',
}

// ③ 설계 예외 — 사유 필수. 래칫: 여기서 *빼기만* 가능. 신규 추가는 감사(왜 HARD_STOP 이
//    이 명령을 막으면 안 되는가) + 사유 문서화가 선행돼야 한다(안이한 회피 금지).
const EXEMPT: Record<string, string> = {
  'work.ts': '자체 passHardStop() 로 차단 — 세션 시작/인수인계 의례 명령(HARD_STOP 을 보고하고 중단)',
  'init.ts': '프로젝트 생성 진입점(온보딩 스캐폴딩, 대화형·MCP 제외) — 기존 미가드 동결(감사 백로그)',
  'brief.ts': 'HARD_STOP 상태를 보고하는 읽기성 명령 — 산출물은 .vhk 내부 브리핑 캐시뿐(차단 시 상태 전달 경로 상실)',
  'loop-brief.ts': 'HARD_STOP 상태를 보고하는 읽기성 명령 — 무인루프 브리핑 캐시(차단 시 루프가 중단 사유를 못 봄)',
  'context.ts': 'HARD_STOP 상태를 보고하는 읽기성 명령 — 컨텍스트 스냅샷 캐시(차단 시 상태 전달 경로 상실)',
  'remind.ts': '규칙 리마인드 캐시(.vhk/remind.md) 재생성 — 읽기성 보고 명령, 기존 미가드 동결(감사 백로그)',
  'memory-eval.ts': 'recall 측정 라벨 기록(사람 주도 측정 루틴) — 기존 미가드 동결(감사 백로그)',
  'mcp-init.ts': '에디터 MCP 설정 원샷 셋업 — 기존 미가드 동결(감사 백로그)',
  'seo/types.ts': '명령 아님 — saveSeoLatest 공유 헬퍼(가드는 호출 명령 진입부 책임: seo report/submit 가드됨)',
}

// src/commands/**/*.ts 재귀 수집(*.test.ts 제외) — 상대경로(posix 구분자)로 반환.
function collectCommandFiles(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name)
    const rel = prefix ? `${prefix}/${name}` : name
    if (statSync(abs).isDirectory()) {
      out.push(...collectCommandFiles(abs, rel))
    } else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) {
      out.push(rel)
    }
  }
  return out
}

describe('HARD_STOP 가드 정적 완전성 (#455 — 4회 반복 클래스 래칫)', () => {
  const files = collectCommandFiles(COMMANDS_DIR)
  const sources = new Map(files.map((f) => [f, readFileSync(join(COMMANDS_DIR, f), 'utf-8')]))

  it('쓰기 시그널 있는 명령 파일은 전부 가드(직접/chokepoint/문서화 예외) 경유', () => {
    const missing: string[] = []
    for (const [file, src] of sources) {
      if (!WRITE_SIGNAL.test(src)) continue
      if (GUARD_SIGNAL.test(src)) continue
      if (file in CHOKEPOINT || file in EXEMPT) continue
      missing.push(file)
    }
    expect(
      missing,
      `HARD_STOP 가드 누락: ${missing.join(', ')} — ensureNotHardStopped() 를 명령 진입부에 넣거나, ` +
        `index.ts guardCli 경유면 CHOKEPOINT 에, 설계 예외면 사유와 함께 EXEMPT 에 등록하세요(tests/hard-stop-completeness.test.ts)`,
    ).toEqual([])
  })

  it('#455 뒷단 4명령(content/launch/ops/sell)은 파일 내 직접 가드 보유(회귀 고정)', () => {
    for (const f of ['content.ts', 'launch.ts', 'ops.ts', 'sell.ts']) {
      expect(GUARD_SIGNAL.test(sources.get(f) ?? ''), `${f} 에 ensureNotHardStopped 없음`).toBe(true)
    }
  })

  it('CHOKEPOINT 항목은 index.ts 에 guardCli 배선이 실재(자가검증 — 죽은 예외 금지)', () => {
    const idx = readFileSync('src/index.ts', 'utf-8')
    for (const [file, action] of Object.entries(CHOKEPOINT)) {
      expect(existsSync(join(COMMANDS_DIR, file)), `CHOKEPOINT 에 없는 파일: ${file}`).toBe(true)
      expect(
        new RegExp(`guardCli(Defer)?\\('${action}'`).test(idx),
        `index.ts 에 guardCli('${action}' 배선 없음 — ${file} 은 chokepoint 미경유`,
      ).toBe(true)
    }
  })

  it('예외 목록은 래칫 — 존재하는 파일만, 가드가 생기거나 쓰기 시그널이 사라지면 항목 제거', () => {
    for (const file of [...Object.keys(CHOKEPOINT), ...Object.keys(EXEMPT)]) {
      const src = sources.get(file)
      expect(src !== undefined, `예외 목록에 없는 파일: ${file} — 항목을 제거하세요`).toBe(true)
      if (src === undefined) continue
      expect(GUARD_SIGNAL.test(src), `${file} 에 이제 직접 가드 있음 — 예외 목록에서 제거하세요(래칫)`).toBe(false)
      expect(WRITE_SIGNAL.test(src), `${file} 에 이제 쓰기 시그널 없음 — 예외 목록에서 제거하세요(래칫)`).toBe(true)
    }
  })
})
