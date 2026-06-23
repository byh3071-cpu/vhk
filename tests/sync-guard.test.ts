import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  syncCore,
  buildSyncPlan,
  parseRulesMd,
  deriveProjectName,
  toClaudeMd,
  toAgentsMd,
  findUnmappedSections,
  claudeMdMigration,
} from '../src/commands/sync.js'
import { listBackups } from '../src/lib/backup.js'
import { ko } from '../src/i18n/ko.js'

const RULES = `# 데모 — Rules

## 코딩 규칙
- execSync 금지

## 기록 규칙
- 세션 로그
`

let dir: string
const alwaysYes = async (): Promise<boolean> => true
const alwaysNo = async (): Promise<boolean> => false

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-syncg-'))
  fs.writeFileSync(path.join(dir, 'RULES.md'), RULES, 'utf-8')
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function read(rel: string): string {
  return fs.readFileSync(path.join(dir, rel), 'utf-8')
}
function exists(rel: string): boolean {
  return fs.existsSync(path.join(dir, rel))
}

describe('syncCore — 첫 sync', () => {
  it('타겟 생성 + .synced 마커 + firstSync=true', async () => {
    const r = await syncCore(dir, {}, alwaysYes)
    expect(r.firstSync).toBe(true)
    expect(exists('.cursorrules')).toBe(true)
    expect(exists('CLAUDE.md')).toBe(true)
    expect(exists('.vhk/.synced')).toBe(true)
    expect(r.written).toContain('.cursorrules')
  })

  it('기존 파일 있으면 첫 sync 에서 백업(+gitignore 등록)', async () => {
    fs.writeFileSync(path.join(dir, '.cursorrules'), '손으로 만든 규칙\n', 'utf-8')
    const r = await syncCore(dir, {}, alwaysYes)
    expect(r.backupId).not.toBeNull()
    expect(r.backedUp).toContain('.cursorrules')
    const gi = read('.vhk/.gitignore')
    expect(gi).toContain('backups/')
    expect(gi).toContain('.synced')
  })
})

describe('syncCore — ③ 미매칭 섹션 노출 (조용히 누락 방지, 회귀)', () => {
  it('매핑 안 되는 섹션이 있으면 result.unmapped 에 노출 — 조용히 사라지면 FAIL', async () => {
    fs.writeFileSync(
      path.join(dir, 'RULES.md'),
      '# 데모 — Rules\n\n## 프로젝트 정체성\n- 한 줄: x\n\n## 코딩 규칙\n- a\n',
      'utf-8'
    )
    const r = await syncCore(dir, {}, alwaysYes)
    expect(r.unmapped).toContain('프로젝트 정체성')
  })

  it('표준 섹션 + 서문만이면 unmapped 0 (정상 sync 경고 노이즈 0)', async () => {
    fs.writeFileSync(
      path.join(dir, 'RULES.md'),
      '# 데모 — Rules\n\n## 서문\n인트로\n\n## 코딩 규칙\n- a\n\n## 기록 규칙\n- b\n',
      'utf-8'
    )
    const r = await syncCore(dir, {}, alwaysYes)
    expect(r.unmapped).toEqual([])
  })
})

describe('syncCore — 5-tool 산출 검증 (배치1 §C)', () => {
  it('copilot-instructions · vhk-rules · windsurfrules 가 실제 생성된다', async () => {
    const r = await syncCore(dir, {}, alwaysYes)
    expect(exists('.github/copilot-instructions.md')).toBe(true)
    expect(exists('.agents/rules/vhk-rules.md')).toBe(true)
    expect(exists('.windsurfrules')).toBe(true)
    expect(r.written).toContain('.github/copilot-instructions.md')
    expect(r.written).toContain('.agents/rules/vhk-rules.md')
    expect(r.written).toContain('.windsurfrules')
  })
})

describe('syncCore — drift 가드 (데이터 손실 0)', () => {
  it('drift + 덮어쓰기 거부 → 백업 저장되고 원본 유지', async () => {
    await syncCore(dir, {}, alwaysYes) // 초기 동기화(마커 생성)
    fs.writeFileSync(path.join(dir, '.cursorrules'), '내 손글 규칙\n', 'utf-8') // 사용자 수정 = drift
    const r = await syncCore(dir, {}, alwaysNo) // 덮어쓰기 거부
    expect(r.backupId).not.toBeNull()
    expect(r.skipped).toContain('.cursorrules')
    expect(read('.cursorrules')).toBe('내 손글 규칙\n') // 원본 보존
    // 백업에 사용자 원본이 들어있어 복구 가능
    const backups = listBackups(dir)
    expect(backups.length).toBeGreaterThan(0)
    const backed = fs.readFileSync(path.join(backups[0].dir, '.cursorrules'), 'utf-8')
    expect(backed).toBe('내 손글 규칙\n')
  })

  it('drift + 자동 승인(비대화형) → 백업 후 재생성본으로 덮어씀 (멈춤 없음)', async () => {
    await syncCore(dir, {}, alwaysYes)
    fs.writeFileSync(path.join(dir, '.cursorrules'), 'drift\n', 'utf-8')
    const r = await syncCore(dir, {}, alwaysYes) // 비대화형 = 자동 true
    expect(r.backupId).not.toBeNull()
    expect(r.written).toContain('.cursorrules')
    expect(read('.cursorrules')).not.toBe('drift\n')
    expect(read('.cursorrules')).toContain('Cursor Rules')
  })
})

describe('syncCore — --dry-run', () => {
  it('디스크 미변경 + 백업도 안 만듦', async () => {
    await syncCore(dir, {}, alwaysYes)
    fs.writeFileSync(path.join(dir, '.cursorrules'), 'drift now\n', 'utf-8')
    const r = await syncCore(dir, { dryRun: true }, alwaysNo)
    expect(r.dryRun).toBe(true)
    expect(r.written).toEqual([])
    expect(read('.cursorrules')).toBe('drift now\n') // 변경 안 됨
    expect(listBackups(dir).length).toBe(0) // 백업 생성 안 함
  })
})

describe('buildSyncPlan — drift 판정', () => {
  it('무수정=not drift, 수작업 수정=drift', async () => {
    await syncCore(dir, {}, alwaysYes)
    const sections = parseRulesMd(read('RULES.md'))
    const name = deriveProjectName(read('RULES.md'))
    let plan = buildSyncPlan(dir, sections, name)
    expect(plan.find((p) => p.path === '.cursorrules')?.drift).toBe(false)

    fs.writeFileSync(path.join(dir, '.cursorrules'), 'hand edit\n', 'utf-8')
    plan = buildSyncPlan(dir, sections, name)
    expect(plan.find((p) => p.path === '.cursorrules')?.drift).toBe(true)
  })

  it('CLAUDE.md 도 계획에 포함 (하이브리드 가드)', async () => {
    const sections = parseRulesMd(read('RULES.md'))
    const name = deriveProjectName(read('RULES.md'))
    const plan = buildSyncPlan(dir, sections, name)
    expect(plan.map((p) => p.path)).toContain('CLAUDE.md')
  })

  // 회귀: toClaudeMd 비멱등 → 매 sync 마다 CLAUDE.md drift → 백업 churn → pruneBackups 가
  // 진짜 사용자 백업을 밀어내 영구 소실. 멱등성으로 churn 차단.
  it('CLAUDE.md 멱등 — 반복 sync 가 drift 를 만들지 않음 (백업 churn 방지)', async () => {
    await syncCore(dir, {}, alwaysYes) // 1회차
    const after1 = read('CLAUDE.md')
    await syncCore(dir, {}, alwaysYes) // 2회차 (원본 무변경)
    const after2 = read('CLAUDE.md')
    expect(after2).toBe(after1) // 바이트 동일 = 멱등 (배너 누적 없음)
    const sections = parseRulesMd(read('RULES.md'))
    const plan = buildSyncPlan(dir, sections, deriveProjectName(read('RULES.md')))
    expect(plan.find((p) => p.path === 'CLAUDE.md')?.drift).toBe(false)
  })

  it('반복 sync 가 백업을 churn 하지 않음 — 사용자 원본 백업 보존', async () => {
    fs.writeFileSync(path.join(dir, '.cursorrules'), '6개월 튜닝한 손글 규칙\n', 'utf-8')
    await syncCore(dir, {}, alwaysYes) // Day1 — 원본 백업
    const day1 = listBackups(dir)[0]
    expect(
      fs.readFileSync(path.join(day1.dir, '.cursorrules'), 'utf-8')
    ).toBe('6개월 튜닝한 손글 규칙\n')
    // 원본 무변경 상태로 sync 12회 더 — CLAUDE.md 가 churn 하면 Day1 백업이 evict 됨
    for (let i = 0; i < 12; i++) await syncCore(dir, {}, alwaysYes)
    const stillThere = listBackups(dir).some((b) => b.id === day1.id)
    expect(stillThere).toBe(true) // Day1 백업이 남아있어야 (멱등이면 백업 자체가 1회만)
  })
})

describe('toClaudeMd — 멱등성 + 사용자 콘텐츠 보존 (라운드2 회귀)', () => {
  const sections = parseRulesMd(RULES)
  const name = deriveProjectName(RULES)
  const bannerCount = (s: string) => (s.match(/⚡ 아래 규칙 섹션은/g) || []).length

  it('정상(현재 상태 有) 멱등 + 배너 1개', () => {
    const a = toClaudeMd(sections, `# 기록 규칙 (${name})\n\n## 현재 상태\n- **Phase:** P5\n\n## 기록 규칙\n- 세션 로그\n`)
    expect(toClaudeMd(sections, a)).toBe(a)
    expect(bannerCount(a)).toBe(1)
  })

  it("'## 현재 상태' 섹션 없는 CLAUDE.md 도 멱등 (배너 header 흡수 churn 방지)", () => {
    const a = toClaudeMd(sections, `# 기록 규칙 (${name})\n\n## 기록 규칙\n- 세션 로그\n`)
    expect(toClaudeMd(sections, a)).toBe(a)
    expect(bannerCount(a)).toBe(1)
  })

  it('이미 배너 여러 개 누적된(옛 버그 오염) CLAUDE.md → 1개로 수렴', () => {
    const banner = '> ⚡ 아래 규칙 섹션은 RULES.md에서 자동 생성됨 (vhk sync). 직접 수정 금지.'
    const a = toClaudeMd(
      sections,
      `# 기록 규칙 (${name})\n\n## 현재 상태\n- **Phase:** P5\n\n${banner}\n\n${banner}\n\n## 기록 규칙\n- 세션 로그\n`
    )
    expect(bannerCount(a)).toBe(1)
  })

  it("사용자가 '현재 상태'에 직접 쓴 '> ⚡' 인용줄 보존 (이전 수정의 절단 회귀 제거)", () => {
    const c = `# 기록 규칙 (${name})\n\n## 현재 상태\n- **Phase:** P5\n> ⚡ 사용자가 직접 쓴 강조 메모\n- **다음 액션:** 출시\n\n## 기록 규칙\n- 세션 로그\n`
    const out = toClaudeMd(sections, c)
    expect(out).toContain('사용자가 직접 쓴 강조 메모')
    expect(out).toContain('다음 액션')
    expect(toClaudeMd(sections, out)).toBe(out) // 보존하면서도 멱등
  })
})

describe('toClaudeMd — 마커 기반 사용자 섹션 보존 (배치1: 사용자 섹션 조용한 드롭 결함)', () => {
  const sections = parseRulesMd(RULES) // [코딩 규칙, 기록 규칙] → record=[기록 규칙]
  const name = deriveProjectName(RULES)

  it('마이그레이션: 마커 없는 CLAUDE.md 의 비-키 사용자 섹션(`## 프로젝트 정보`)을 드롭하지 않고 보존', () => {
    const existing = `# 기록 규칙 (${name})\n\n## 프로젝트 정보\n- repo: x\n\n## 현재 상태\n- **Phase:** P5\n\n## 기록 규칙\n- 옛 자동생성\n`
    const out = toClaudeMd(sections, existing)
    // 결함: 기존 toClaudeMd 는 header + 현재 상태 + record 만 보존하고 `## 프로젝트 정보` 를 조용히 드롭
    expect(out).toContain('## 프로젝트 정보')
    expect(out).toContain('repo: x')
    // 현재 상태도 여전히 보존
    expect(out).toContain('## 현재 상태')
    // RULES 유래 record 섹션은 재생성
    expect(out).toContain('## 기록 규칙')
    // 마이그레이션 출력엔 마커가 박혀 다음 sync 부터 마커 경로
    expect(out).toContain('<!-- vhk:rules:start -->')
    expect(out).toContain('<!-- vhk:rules:end -->')
  })

  it('마이그레이션도 멱등 — 재호출 시 바이트 동일', () => {
    const a = toClaudeMd(sections, `# 기록 규칙 (${name})\n\n## 프로젝트 정보\n- x\n\n## 현재 상태\n- P5\n`)
    expect(toClaudeMd(sections, a)).toBe(a)
  })

  it('CRLF(\\r\\n) 입력도 멱등 + 사용자 섹션 보존 (Windows CLAUDE.md 회귀)', () => {
    const crlf = `# 기록 규칙 (${name})\r\n\r\n## 프로젝트 정보\r\n- x\r\n\r\n## 현재 상태\r\n- P5\r\n`
    const a = toClaudeMd(sections, crlf)
    expect(a).toContain('## 프로젝트 정보')
    expect(toClaudeMd(sections, a)).toBe(a) // 배너/마커 trim 비교가 \r 흡수 → 누적 없음
  })

  it('마커 밖 before/after 사용자 콘텐츠 보존 + 마커 안만 교체', () => {
    const migrated = toClaudeMd(sections, `# 기록 규칙 (${name})\n\n## 프로젝트 정보\n- repo: x\n\n## 현재 상태\n- P5\n`)
    // 사용자가 마커 뒤에 새 섹션 추가
    const edited = migrated.trimEnd() + '\n\n## 사람이 마커 뒤에 추가\n- 메모\n'
    const out = toClaudeMd(sections, edited)
    expect(out).toContain('## 프로젝트 정보') // before(마커 앞) 보존
    expect(out).toContain('## 사람이 마커 뒤에 추가') // after(마커 뒤) 보존
    expect(out).toContain('## 기록 규칙') // 마커 안 record 재생성
    expect((out.match(/⚡ 아래 규칙 섹션은/g) || []).length).toBe(1) // 배너 누적 없음
  })

  it('RULES 에서 record 섹션이 사라지면 마커 안에서도 제거 (스테일 유령 방지)', () => {
    const withRecord = toClaudeMd(sections, `# 기록 규칙 (${name})\n\n## 현재 상태\n- P5\n`)
    expect(withRecord).toContain('## 기록 규칙')
    const noRecord = parseRulesMd(`# 데모 — Rules\n\n## 코딩 규칙\n- a\n`) // 기록 규칙 제거됨
    const out = toClaudeMd(noRecord, withRecord)
    expect(out).not.toContain('## 기록 규칙') // 마커 안 스테일 제거
    expect(out).toContain('## 현재 상태') // 사용자 영역 보존
  })

  it('마커 훼손(end 누락) → 마이그레이션 폴백, 사용자 섹션 드롭 안 함', () => {
    const broken = `# 기록 규칙 (${name})\n\n## 프로젝트 정보\n- repo: x\n\n<!-- vhk:rules:start -->\n> ⚡ 아래 규칙 섹션은 RULES.md에서 자동 생성됨 (vhk sync). 직접 수정 금지.\n\n## 기록 규칙\n- 옛것\n` // end 마커 없음
    const out = toClaudeMd(sections, broken)
    expect(out).toContain('## 프로젝트 정보') // 폴백서도 사용자 섹션 보존
    expect(out).toContain('<!-- vhk:rules:end -->') // 정상 마커쌍 재생성
    expect(toClaudeMd(sections, out)).toBe(out) // 복구 후 멱등
  })
})

// #325: 마커쌍이 2개면 splitVhkBlock 이 첫 쌍만 잡고 둘째 vhk 블록을 사용자영역(after)으로
// verbatim 보존 → 관리 블록 통째 중복. 추가 sync 해도 2개로 고착(자기치유 실패).
describe('toClaudeMd — 마커쌍 중복 정규화 (#325 자기치유)', () => {
  const sections = parseRulesMd(RULES)
  const name = deriveProjectName(RULES)
  const startCount = (s: string) => (s.match(/<!-- vhk:rules:start -->/g) || []).length
  const endCount = (s: string) => (s.match(/<!-- vhk:rules:end -->/g) || []).length
  const bannerCount = (s: string) => (s.match(/⚡ 아래 규칙 섹션은/g) || []).length

  it('마커쌍 2개(병합/복붙 사고) → sync 시 1쌍으로 수렴 (중복 블록 0)', () => {
    // 정상 마커 블록을 먼저 생성한 뒤, 그 앞에 가짜 마커쌍을 덧대 2쌍 상태를 만든다.
    const single = toClaudeMd(sections, `# 기록 규칙 (${name})\n\n## 현재 상태\n- **Phase:** P5\n`)
    const doubled = `<!-- vhk:rules:start -->\n가짜내용\n<!-- vhk:rules:end -->\n\n${single}`
    expect(startCount(doubled)).toBe(2) // 사전조건: 정말 2쌍
    const out = toClaudeMd(sections, doubled)
    expect(startCount(out)).toBe(1)
    expect(endCount(out)).toBe(1)
    expect(bannerCount(out)).toBe(1) // 관리 블록 중복 없음
  })

  it('마커쌍 2개 정규화 후 멱등 (재 sync 시 바이트 동일 + 2쌍 재발 없음)', () => {
    const single = toClaudeMd(sections, `# 기록 규칙 (${name})\n\n## 현재 상태\n- P5\n`)
    const doubled = `<!-- vhk:rules:start -->\n가짜\n<!-- vhk:rules:end -->\n\n${single}`
    const a = toClaudeMd(sections, doubled)
    expect(startCount(a)).toBe(1)
    expect(toClaudeMd(sections, a)).toBe(a)
  })

  it('마커쌍 2개여도 마커 밖 진짜 사용자 섹션은 보존', () => {
    const single = toClaudeMd(sections, `# 기록 규칙 (${name})\n\n## 프로젝트 정보\n- repo: x\n\n## 현재 상태\n- P5\n`)
    const doubled = `<!-- vhk:rules:start -->\n중복관리블록\n<!-- vhk:rules:end -->\n\n${single}`
    const out = toClaudeMd(sections, doubled)
    expect(startCount(out)).toBe(1)
    expect(out).toContain('## 프로젝트 정보') // 진짜 사용자 섹션 보존
    expect(out).toContain('repo: x')
    expect(out).toContain('## 기록 규칙') // RULES 유래 record 재생성
  })

  it('마커쌍 3개도 1쌍으로 수렴', () => {
    const single = toClaudeMd(sections, `# 기록 규칙 (${name})\n\n## 현재 상태\n- P5\n`)
    const tripled = `<!-- vhk:rules:start -->\nA\n<!-- vhk:rules:end -->\n\n<!-- vhk:rules:start -->\nB\n<!-- vhk:rules:end -->\n\n${single}`
    expect(startCount(tripled)).toBe(3)
    const out = toClaudeMd(sections, tripled)
    expect(startCount(out)).toBe(1)
    expect(endCount(out)).toBe(1)
  })
})

describe('claudeMdMigration — 마이그레이션 보존/제거 집계 (경고용)', () => {
  const name = deriveProjectName(RULES)

  it('마커 없으면 migrated=true + preserved(사용자)/removed(키 섹션) 집계', () => {
    const r = claudeMdMigration(`# 기록 규칙 (${name})\n\n## 프로젝트 정보\n- x\n\n## 현재 상태\n- P5\n\n## 작업 로그\n- 옛것\n`)
    expect(r.migrated).toBe(true)
    expect(r.preserved).toEqual(expect.arrayContaining(['프로젝트 정보', '현재 상태']))
    expect(r.removed).toContain('작업 로그') // '로그' 키 매칭 → 옛 자동생성 간주 제거
  })

  it('마커 이미 있으면 migrated=false (재작업·경고 없음)', () => {
    const sections = parseRulesMd(RULES)
    const withMarker = toClaudeMd(sections, `# 기록 규칙 (${name})\n\n## 현재 상태\n- P5\n`)
    expect(claudeMdMigration(withMarker).migrated).toBe(false)
  })
})

describe('syncCore — CLAUDE.md 마이그레이션 경고 노출 (배치1, 조용한 드롭 방지)', () => {
  it('마커 없는 기존 CLAUDE.md → result.claudeMigration.migrated=true + 보존 섹션 노출', async () => {
    fs.writeFileSync(
      path.join(dir, 'CLAUDE.md'),
      `# 기록 규칙 (데모)\n\n## 프로젝트 정보\n- repo: x\n\n## 현재 상태\n- P5\n`,
      'utf-8'
    )
    const r = await syncCore(dir, { dryRun: true }, alwaysYes)
    expect(r.claudeMigration?.migrated).toBe(true)
    expect(r.claudeMigration?.preserved).toContain('프로젝트 정보')
  })

  it('이미 마커 있는(=마이그레이션 완료) CLAUDE.md → migrated=false', async () => {
    const sections = parseRulesMd(read('RULES.md'))
    const migrated = toClaudeMd(sections, `# 기록 규칙 (데모)\n\n## 현재 상태\n- P5\n`)
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), migrated, 'utf-8')
    const r = await syncCore(dir, { dryRun: true }, alwaysYes)
    expect(r.claudeMigration?.migrated).toBe(false)
  })

  it('CLAUDE.md 자체가 없으면 claudeMigration 없음(마이그레이션 비대상)', async () => {
    const r = await syncCore(dir, { dryRun: true }, alwaysYes)
    expect(r.claudeMigration?.migrated).toBeFalsy()
  })

  // BACKLOG 배치1 게이트 — 실제 vhk CLAUDE.md 유사 구조(frontmatter + 다수 비-키 섹션) 보존 e2e
  it('실 CLAUDE.md 구조(frontmatter + 다수 사용자 섹션) → 모든 비-키 섹션 + frontmatter 보존', async () => {
    const real = `---
id: claude-md-vhk
tags: [process, documentation]
---

# 기록 규칙 (vhk)

> 이 파일은 기록/운영 전용. 코딩/디자인 → .cursorrules 참조.

## 프로젝트 정보
- repo: x

## 현재 상태
- Phase: P5

## 코딩 컨벤션
- execSync 금지

## MCP 모드 규칙
- handler 내부 process.exit() 금지

## Safety — HARD_STOP
- .vhk/HARD_STOP 확인

## Stability Gates
- build && test 통과 필수
`
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), real, 'utf-8')
    const r = await syncCore(dir, { dryRun: true }, alwaysYes)
    const claudeNew = r.plan.find((p) => p.path === 'CLAUDE.md')!.newContent
    for (const sec of ['프로젝트 정보', '현재 상태', '코딩 컨벤션', 'MCP 모드 규칙', 'Safety — HARD_STOP', 'Stability Gates']) {
      expect(claudeNew).toContain(`## ${sec}`)
    }
    expect(claudeNew).toContain('id: claude-md-vhk') // frontmatter 보존
    expect(claudeNew).toContain('handler 내부 process.exit() 금지') // 본문 보존
    expect(r.claudeMigration?.migrated).toBe(true)
    expect(r.claudeMigration?.preserved).toEqual(
      expect.arrayContaining(['프로젝트 정보', '코딩 컨벤션', 'MCP 모드 규칙', 'Safety — HARD_STOP', 'Stability Gates'])
    )
  })
})

describe('#133 — CLAUDE.md 도 코딩 규칙/커밋/아키텍처 섹션 전파 (다른 타깃과 통일)', () => {
  const sections = parseRulesMd(RULES) // [코딩 규칙(execSync 금지), 기록 규칙(세션 로그)]
  const name = deriveProjectName(RULES)

  it('자동생성 블록에 코딩 규칙 본문도 포함 (기록 규칙은 유지)', () => {
    const out = toClaudeMd(sections, `# 기록 규칙 (${name})\n\n## 현재 상태\n- P5\n`)
    expect(out).toContain('execSync 금지') // 코딩 규칙 본문 (#133 누락분)
    expect(out).toContain('## 기록 규칙') // 기록 섹션 회귀 방지
    expect(out).toContain('## 현재 상태') // 사용자 영역 보존
  })

  it('코딩 규칙이 마커 안(자동생성 영역)에 들어가 멱등 (재호출 바이트 동일)', () => {
    const a = toClaudeMd(sections, `# 기록 규칙 (${name})\n\n## 현재 상태\n- P5\n`)
    expect(toClaudeMd(sections, a)).toBe(a)
    expect((a.match(/⚡ 아래 규칙 섹션은/g) || []).length).toBe(1)
  })

  it('마이그레이션 시 코딩 규칙 중복 안 됨 (옛 ## 코딩 규칙 → 재생성 1개만)', () => {
    const existing = `# 기록 규칙 (${name})\n\n## 코딩 규칙\n- 옛 자동생성 코딩\n\n## 현재 상태\n- P5\n`
    const out = toClaudeMd(sections, existing)
    expect((out.match(/## 코딩 규칙/g) || []).length).toBe(1) // 중복 0
    expect(out).toContain('execSync 금지') // RULES 유래 재생성본
    expect(out).not.toContain('옛 자동생성 코딩') // 옛것 제거
  })
})

describe('#149 — VHK 운영 섹션을 CLAUDE.md/AGENTS.md 로 매핑 (silent drop 제거)', () => {
  const opsRules = '# P — Rules\n\n## VHK 운영\n- github 이슈 정책 xyz123\n\n## 코딩 규칙\n- a\n'

  it('VHK 운영은 더 이상 unmapped 가 아님 (경고 사라짐)', () => {
    expect(findUnmappedSections(parseRulesMd(opsRules))).not.toContain('VHK 운영')
  })

  it('VHK 운영 본문이 CLAUDE.md 에 전파', () => {
    const out = toClaudeMd(parseRulesMd(opsRules), '# 기록 규칙 (P)\n\n## 현재 상태\n- P5\n')
    expect(out).toContain('github 이슈 정책 xyz123')
  })

  it('VHK 운영 본문이 AGENTS.md 에 전파', () => {
    expect(toAgentsMd(parseRulesMd(opsRules), 'P')).toContain('github 이슈 정책 xyz123')
  })

  it('프로젝트 정체성은 여전히 unmapped (기존 계약 유지 — 회귀 방지)', () => {
    const s = parseRulesMd('# P\n\n## 프로젝트 정체성\n- x\n\n## 코딩 규칙\n- a\n')
    expect(findUnmappedSections(s)).toContain('프로젝트 정체성')
  })
})

describe('ko.sync.claudeMigrated — 마이그레이션 경고 문구', () => {
  it('보존/제거 섹션을 문구에 반영', () => {
    const msg = ko.sync.claudeMigrated(['프로젝트 정보', '현재 상태'], ['작업 로그'])
    expect(msg).toContain('보존')
    expect(msg).toContain('프로젝트 정보')
    expect(msg).toContain('작업 로그')
  })

  it('제거 0이면 교체 줄 생략(노이즈 0)', () => {
    const msg = ko.sync.claudeMigrated(['프로젝트 정보'], [])
    expect(msg).not.toContain('교체')
  })
})
