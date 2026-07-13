// #457 — 외부 발행물(초안 파일) secure 스캔 report-mode.
// 발행 행위는 코드 밖(자문형 헌법)이라 기계 차단 불가 — 구현면은
// ①경로 지정 스캔(vhk secure scan <파일...>, 초안 .md 포함 모든 확장자)
// ②뒷단 프롬프트의 "게시 전 스캔" 치명 규칙 ③스캔 이벤트 원장(차단 전환 판정용 계측).
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { scanFilesForSecrets } from '../src/lib/scan-secrets.js'
import { appendSecureScanLog, SECURE_SCAN_LOG_REL } from '../src/lib/secure-scan-log.js'
import { resolveSubcommandAlias } from '../src/lib/command-registry.js'
import { buildContentPrompt } from '../src/commands/content.js'
import { buildLaunchPrompt } from '../src/commands/launch.js'
import { buildSellPrompt } from '../src/commands/sell.js'

// 실존 패턴(github-token: ghp_ + 36자)으로 검출을 실측 — 패턴 사전이 바뀌면 이 테스트가 알려준다.
const FAKE_GHP = 'ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'

describe('scanFilesForSecrets (경로 지정 초안 스캔)', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-draft-scan-'))
  })
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('.md 초안 속 토큰을 검출한다 — 전체 스캔의 확장자 필터(md 제외)와 달리 명시 경로는 전부 스캔', () => {
    const draft = path.join(dir, 'launch-draft.md')
    fs.writeFileSync(draft, `# 런칭 글\n\n토큰: ${FAKE_GHP}\n`)
    const result = scanFilesForSecrets([draft], dir)
    expect(result.scannedFiles).toBe(1)
    expect(result.findings.length).toBeGreaterThan(0)
    expect(result.findings[0].patternId).toBe('github-token')
  })

  it('깨끗한 초안은 발견 0', () => {
    const draft = path.join(dir, 'clean.md')
    fs.writeFileSync(draft, '# 제목\n\n평범한 문장.\n')
    const result = scanFilesForSecrets([draft], dir)
    expect(result.scannedFiles).toBe(1)
    expect(result.findings).toHaveLength(0)
    expect(result.errors).toHaveLength(0)
  })

  it('없는 파일·디렉터리는 errors 로 정직 보고(조용한 통과 금지)', () => {
    const missing = path.join(dir, 'nope.md')
    const sub = path.join(dir, 'subdir')
    fs.mkdirSync(sub)
    const result = scanFilesForSecrets([missing, sub], dir)
    expect(result.scannedFiles).toBe(0)
    expect(result.errors).toHaveLength(2)
  })

  it('상대경로 입력도 cwd 기준으로 해석한다', () => {
    fs.writeFileSync(path.join(dir, 'rel.md'), `key=${FAKE_GHP}\n`)
    const result = scanFilesForSecrets(['rel.md'], dir)
    expect(result.scannedFiles).toBe(1)
    expect(result.findings.length).toBeGreaterThan(0)
  })

  it('4000자 초과 줄은 조용히 통과 금지 — errors 로 표면화(critic 치명-1)', () => {
    const draft = path.join(dir, 'longline.md')
    fs.writeFileSync(draft, 'x'.repeat(4100) + ` ${FAKE_GHP}\n짧은 줄\n`)
    const result = scanFilesForSecrets([draft], dir)
    expect(result.findings).toHaveLength(0) // 긴 줄 속 토큰은 못 봄 — 그래서
    expect(result.errors.some((e) => e.includes('미검사'))).toBe(true) // 반드시 불완전 신호
  })

  it('같은 파일 중복 지정은 dedup — findings·계측 2중 방지(critic 경미-3)', () => {
    const draft = path.join(dir, 'dup.md')
    fs.writeFileSync(draft, `token: ${FAKE_GHP}\n`)
    const result = scanFilesForSecrets([draft, draft], dir)
    expect(result.scannedFiles).toBe(1)
    expect(result.findings).toHaveLength(1)
  })
})

describe('한글 별칭 라우팅 (critic 중대-1 — 보안 스캔 <파일> 인자 유실)', () => {
  it('resolveSubcommandAlias: 스캔 → scan (secure 한정), 무별칭은 그대로', () => {
    expect(resolveSubcommandAlias('secure', '스캔')).toBe('scan')
    expect(resolveSubcommandAlias('secure', 'scan')).toBe('scan')
    expect(resolveSubcommandAlias('goal', '스캔')).toBe('스캔')
  })
})

describe('appendSecureScanLog (계측 원장)', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-scan-log-'))
  })
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('.vhk/events/secure-scan-log.jsonl 에 1줄 append — no-op/에러 스캔을 clean 과 구별(critic 중대-2)', () => {
    appendSecureScanLog(dir, {
      mode: 'paths',
      paths: ['draft.md'],
      scannedFiles: 1,
      errorCount: 0,
      critical: 1,
      high: 0,
      medium: 0,
      info: 0,
    })
    const logPath = path.join(dir, SECURE_SCAN_LOG_REL)
    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n')
    expect(lines).toHaveLength(1)
    const entry = JSON.parse(lines[0])
    expect(entry.mode).toBe('paths')
    expect(entry.critical).toBe(1)
    expect(entry.scannedFiles).toBe(1)
    expect(entry.errorCount).toBe(0)
    expect(typeof entry.ts).toBe('string')
  })

  it('append-only — 두 번 쓰면 두 줄', () => {
    const e = {
      mode: 'paths' as const,
      paths: ['a.md'],
      scannedFiles: 1,
      errorCount: 0,
      critical: 0,
      high: 0,
      medium: 0,
      info: 0,
    }
    appendSecureScanLog(dir, e)
    appendSecureScanLog(dir, e)
    const lines = fs
      .readFileSync(path.join(dir, SECURE_SCAN_LOG_REL), 'utf-8')
      .trim()
      .split('\n')
    expect(lines).toHaveLength(2)
  })
})

describe('뒷단 프롬프트 — 게시 전 스캔 치명 규칙 (#457 ②)', () => {
  it.each([
    ['content', () => buildContentPrompt({ what: 'x' })],
    ['launch', () => buildLaunchPrompt({ what: 'x' })],
    ['sell', () => buildSellPrompt({ what: 'x' })],
  ])('%s 프롬프트에 게시 전 vhk secure scan 규칙이 있다', (_name, build) => {
    const prompt = build()
    expect(prompt).toContain('vhk secure scan')
    expect(prompt).toContain('게시')
  })
})
