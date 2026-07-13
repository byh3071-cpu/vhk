// RFC 0062 — 문서-실측 드리프트 자동감지 (warn 모드).
// 검사 3계열: A 수치(버전·MCP 수) / B RFC 헤더 상호참조 모순 / C 상태문서 정합(블로커 모순).
// 성공 기준(§5): 2026-07-13 수동 정리분을 fixture 로 재현 — 정리 "전" 상태를 주면 검출돼야 한다.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { runDocDriftChecks } from '../src/lib/drift-pairs.js'
import { appendDriftLog, DRIFT_LOG_REL } from '../src/lib/drift-log.js'

function mkTemp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-drift-'))
}

function write(dir: string, rel: string, content: string): void {
  const p = path.join(dir, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}

describe('A 수치 — 버전·MCP 수 ↔ package.json 실측', () => {
  let dir: string
  beforeEach(() => {
    dir = mkTemp()
    write(dir, 'package.json', JSON.stringify({ name: 'x', version: '1.2.3', description: 'MCP 35 tools' }))
  })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('README 굵은 버전이 package.json 과 다르면 검출', () => {
    write(dir, 'README.md', '# X\n\n**v9.9.9**\n')
    const f = runDocDriftChecks(dir)
    expect(f.some((x) => x.series === 'numeric' && x.file === 'README.md')).toBe(true)
  })

  it('버전 일치하면 발견 0', () => {
    write(dir, 'README.md', '# X\n\n**v1.2.3**\n')
    expect(runDocDriftChecks(dir).filter((x) => x.series === 'numeric')).toHaveLength(0)
  })

  it('CLAUDE.md LIVE 버전 줄 불일치 검출', () => {
    write(dir, 'CLAUDE.md', '# 헌법\n- **버전:** v0.0.1 — 어쩌고\n')
    const f = runDocDriftChecks(dir)
    expect(f.some((x) => x.series === 'numeric' && x.file === 'CLAUDE.md')).toBe(true)
  })

  it('MCP N tools 수치 검사는 vhk 자기 레포 한정 — 남의 레포엔 미적용(critic 중대-1)', () => {
    write(dir, 'README.md', '# X\n\nMCP 29 tools 지원\n')
    // package.json name='x'(비-vhk) → 남의 서버 설명에 vhk 카운트를 들이대지 않는다
    expect(
      runDocDriftChecks(dir, { mcpToolCount: 35 }).filter((x) => x.message.includes('MCP'))
    ).toHaveLength(0)
  })

  it('vhk 자기 레포에선 MCP 수 불일치 검출', () => {
    write(
      dir,
      'package.json',
      JSON.stringify({ name: '@byh3071/vhk', version: '1.2.3', description: 'MCP 35 tools' })
    )
    write(dir, 'README.md', '# X\n\nMCP 29 tools 지원\n')
    const f = runDocDriftChecks(dir, { mcpToolCount: 35 })
    expect(f.some((x) => x.series === 'numeric' && x.message.includes('MCP'))).toBe(true)
  })

  it('릴리즈 이력 속 과거 굵은 버전이 먼저 나와도 현재 버전이 하나라도 있으면 통과(critic 중대-2)', () => {
    write(dir, 'README.md', '## 변경\n- **v1.0.0** 시절 이야기\n\n최신 **v1.2.3**\n')
    expect(runDocDriftChecks(dir).filter((x) => x.series === 'numeric')).toHaveLength(0)
  })

  it('굵은 버전 표기가 전부 구버전일 때만 stale 판정', () => {
    write(dir, 'README.md', '## 변경\n- **v1.0.0**\n- **v1.1.0**\n')
    const f = runDocDriftChecks(dir)
    expect(f.some((x) => x.series === 'numeric' && x.file === 'README.md')).toBe(true)
  })

  it('대상 파일이 없으면 검사 자체를 건너뜀(사용자 레포 호환) — 발견 0', () => {
    expect(runDocDriftChecks(dir)).toHaveLength(0)
  })
})

describe('B 상호참조 — RFC 헤더 모순 (2026-07-13 실사고 fixture)', () => {
  let dir: string
  beforeEach(() => {
    dir = mkTemp()
    write(dir, 'package.json', JSON.stringify({ name: 'x', version: '1.0.0' }))
  })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('0057 이 "0055 archived" 로 지칭하는데 0055 헤더가 Draft 면 검출', () => {
    write(dir, 'docs/rfc/0055-proof.md', '# RFC 0055\n\n> 상태: Draft · 작성: 2026-06-22\n')
    write(dir, 'docs/rfc/0057-agnostic.md', '# RFC 0057\n\n> 상태: Draft\n> 연동: RFC 0055(Proof Protocol, archived) · RFC 0056\n')
    const f = runDocDriftChecks(dir)
    expect(f.some((x) => x.series === 'crossref' && x.message.includes('0055'))).toBe(true)
  })

  it('0055 헤더가 Superseded 로 정리된 뒤에는 발견 0', () => {
    write(dir, 'docs/rfc/0055-proof.md', '# RFC 0055\n\n> 상태: Superseded — RFC 0056 이 계승\n')
    write(dir, 'docs/rfc/0057-agnostic.md', '# RFC 0057\n\n> 상태: Draft\n> 연동: RFC 0055(Proof Protocol, archived)\n')
    expect(runDocDriftChecks(dir).filter((x) => x.series === 'crossref')).toHaveLength(0)
  })

  it('자기 자신 언급(파일 내 자기 번호)은 모순 아님', () => {
    write(dir, 'docs/rfc/0055-proof.md', '# RFC 0055\n\n> 상태: Draft\n본 0055 는 archived 가 아니다 라는 서술.\n')
    expect(runDocDriftChecks(dir).filter((x) => x.series === 'crossref')).toHaveLength(0)
  })
})

describe('C 상태 정합 — 블로커 모순 (2026-07-13 실사고 fixture)', () => {
  let dir: string
  beforeEach(() => {
    dir = mkTemp()
    write(dir, 'package.json', JSON.stringify({ name: 'x', version: '1.0.0' }))
    write(
      dir,
      'docs/state/blockers.md',
      '# Blockers\n\n- [2026-06-10 goal-50] 실데이터 대기 — 미해결.\n- ~~[2026-05-01 goal-1] 해결됨~~\n'
    )
  })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('next-task 가 "블로커 없음" 인데 blockers.md 에 비취소선 항목 있으면 검출', () => {
    write(dir, 'docs/state/next-task.md', '# 다음\n\n## 블로커\n- 없음\n')
    const f = runDocDriftChecks(dir)
    expect(f.some((x) => x.series === 'state')).toBe(true)
  })

  it('next-task 가 블로커를 인정하면 발견 0', () => {
    write(dir, 'docs/state/next-task.md', '# 다음\n\n## 블로커\n- blockers.md 활성 2건 — 사람 대기.\n')
    expect(runDocDriftChecks(dir).filter((x) => x.series === 'state')).toHaveLength(0)
  })

  it('CLAUDE LIVE 형 `**블로커:** 없음` 선언도 검출', () => {
    write(dir, 'CLAUDE.md', '# 헌법\n- **블로커:** 없음\n')
    const f = runDocDriftChecks(dir)
    expect(f.some((x) => x.series === 'state' && x.file === 'CLAUDE.md')).toBe(true)
  })

  it('산문 "블로커 판단 근거 없음" 은 선언이 아님 — 오탐 금지(critic 경미-3)', () => {
    write(dir, 'docs/state/next-task.md', '# 다음\n\n이번 건은 블로커 판단 근거 없음 상태라 보류.\n')
    expect(runDocDriftChecks(dir).filter((x) => x.series === 'state')).toHaveLength(0)
  })

  it('blockers 가 전부 취소선이면 "없음" 표기여도 발견 0', () => {
    write(
      dir,
      'docs/state/blockers.md',
      '# Blockers\n\n- ~~[2026-05-01 goal-1] 해결됨~~\n'
    )
    write(dir, 'docs/state/next-task.md', '# 다음\n\n## 블로커\n- 없음\n')
    expect(runDocDriftChecks(dir).filter((x) => x.series === 'state')).toHaveLength(0)
  })
})

describe('drift-log 원장', () => {
  let dir: string
  beforeEach(() => (dir = mkTemp()))
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('발견 요약을 .vhk/events/drift-log.jsonl 에 append', () => {
    appendDriftLog(dir, { numeric: 1, crossref: 0, state: 2 })
    const lines = fs.readFileSync(path.join(dir, DRIFT_LOG_REL), 'utf-8').trim().split('\n')
    expect(lines).toHaveLength(1)
    const e = JSON.parse(lines[0])
    expect(e.numeric).toBe(1)
    expect(e.state).toBe(2)
    expect(typeof e.ts).toBe('string')
  })
})
