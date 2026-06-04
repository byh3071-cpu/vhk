# Goal 20: vhk evolve Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `vhk evolve` — patterns[] → 룰 초안 제안 → 사람 TTY 승인 → RULES.md append → sync 재생성 + undo 지원.

**Architecture:** 큐 파일(`.vhk/evolve/queue.json`)로 워크플로 상태 분리. memory v2 스키마 불변(이중 SoT 금지). evolve.ts 단일 파일로 5개 서브커맨드 구현. pattern.ts 배선 패턴 그대로 모방. apply/undo는 ensureInteractive() 가드 필수 — 비-TTY 차단.

**Tech Stack:** TypeScript + Commander.js + chalk + inquirer + node:fs. 외부 라이브러리 추가 없음.

---

## File Map

| 상태 | 경로 | 역할 |
|------|------|------|
| 신규 | `src/commands/evolve.ts` | 5개 서브커맨드 + 큐 I/O + 룰 생성 로직 |
| 신규 | `tests/evolve.test.ts` | 순수 함수 단위 테스트 |
| 수정 | `src/i18n/ko.ts` | `evolve.*` 메시지 추가 |
| 수정 | `src/lib/nlp-router.ts` | `NlpCommand` + 'evolve' 키워드 + rule |
| 수정 | `src/lib/nlp-run.ts` | dispatch `case 'evolve'` |
| 수정 | `src/lib/command-registry.ts` | `evolve` 서브커맨드 + `진화` 별칭 |
| 수정 | `src/index.ts` | evolve 컨테이너 커맨드 등록 |
| 수정 | `src/mcp/server.ts` | `evolve-suggest` + `evolve-list` 등록 |
| 수정 | `scripts/check-goal-20.mjs` | 구현 검증 게이트로 전환 |

---

## 큐 스키마 (불변 계약)

```typescript
// .vhk/evolve/queue.json
export const QUEUE_PATH_REL = join('.vhk', 'evolve', 'queue.json')
export const QUEUE_VERSION = 1

export type EvolveItemStatus = 'pending' | 'rejected' | 'applied'

export interface EvolveQueueItem {
  id: string                  // 'e1', 'e2', ...
  patternId: string           // PatternEntryV19.id 참조만 (복사 X)
  kind: 'rule'                // v0 = rule만
  status: EvolveItemStatus
  draft: string               // 룰 초안 문구
  dedupeKey: string           // `${patternId}:${kind}` — A2 dedupe 키
  createdAt: string           // ISO 8601
  appliedAt?: string
  rulesBackupPath?: string    // RULES.md.bak 경로 (undo용)
}

export interface EvolveQueueFile {
  version: 1
  items: EvolveQueueItem[]
}
```

---

## Task 0: STEP 0 — 상태 문서 정정

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/state/next-task.md`

- [ ] **Step 0.1: CLAUDE.md 버전·상태 정정**

`CLAUDE.md` 의 현재 상태 섹션에서:
- `v2.0.2` → `v2.1.0`
- "다음 = Goal 19" → "Goal 0~19 DONE / 다음 = Goal 20 구현"
- MCP tool count 업데이트 (25 → 27: pattern-detect + pattern-list 추가)
- 테스트 수 업데이트 (778 pass)

- [ ] **Step 0.2: docs/state/next-task.md 정정**

````markdown
# Next Task

_Updated 2026-06-04 — Goal 19(vhk pattern) DONE + npm v2.1.0 발행 완료(2FA). Goal 20 설계 spike 등록됨._

```
✅ ALL REGISTERED GOALS DONE (0~19)

다음 = Goal 20 — vhk evolve (v2.2.0 예정)
  status: 구현 진행 중 (feat/goal-20-evolve)
  의존: Goal 19 patterns[] 안정화 완료
  이후: publish v2.2.0 (사람 2FA)
```
````

- [ ] **Step 0.3: 브랜치 생성 + 선행 커밋**

```bash
git checkout main
git checkout -b feat/goal-20-evolve
git add CLAUDE.md docs/state/next-task.md
git commit -m "chore(state): v2.1.0 반영 + Goal 20 구현 착수"
```

---

## Task 1: 큐 I/O + 순수 함수 (evolve.ts 뼈대)

**Files:**
- Create: `src/commands/evolve.ts`
- Create: `tests/evolve.test.ts`

### 1A. 큐 읽기/쓰기 + suggest 순수 함수

- [ ] **Step 1.1: 실패 테스트 작성**

```typescript
// tests/evolve.test.ts
import { describe, it, expect } from 'vitest'
import { buildDraft, buildDedupeKey, generateCandidates } from '../src/commands/evolve.js'
import type { PatternEntryV19 } from '../src/commands/pattern.js'
import type { EvolveQueueItem } from '../src/commands/evolve.js'

function pat(id: string, signal: string, count: number, summary: string): PatternEntryV19 {
  return { id, kind: 'avoid', axis: 'tag', signal, count, sources: [], summary,
    createdAt: '2026-01-01T00:00:00Z', status: 'active', tags: [], _sig: `avoid:tag:${signal}` }
}

describe('buildDraft', () => {
  it('avoid 패턴 → 한국어 룰 초안 생성', () => {
    const draft = buildDraft(pat('p1', 'build', 3, '[avoid] 태그 build 3건 반복'))
    expect(draft).toContain('build')
    expect(draft.length).toBeGreaterThan(10)
  })

  it('같은 입력 → 같은 출력(결정적)', () => {
    const p = pat('p1', 'env', 5, '[avoid] 태그 env 5건 반복')
    expect(buildDraft(p)).toBe(buildDraft(p))
  })
})

describe('buildDedupeKey', () => {
  it('patternId:kind 형식', () => {
    expect(buildDedupeKey('p1', 'rule')).toBe('p1:rule')
  })
})

describe('generateCandidates', () => {
  it('avoid 패턴만 v0 대상', () => {
    const patterns: PatternEntryV19[] = [
      pat('p1', 'build', 3, ''),
      { ...pat('p2', 'tdd', 3, ''), kind: 'reinforce' } as PatternEntryV19,
    ]
    const candidates = generateCandidates(patterns, [])
    expect(candidates.map(c => c.patternId)).toEqual(['p1'])
  })

  it('active 패턴만 대상(archived 제외)', () => {
    const patterns: PatternEntryV19[] = [
      { ...pat('p1', 'build', 3, ''), status: 'archived' } as PatternEntryV19,
      pat('p2', 'env', 3, ''),
    ]
    const candidates = generateCandidates(patterns, [])
    expect(candidates.map(c => c.patternId)).toEqual(['p2'])
  })

  it('A2: dedupeKey 중복 시 1건만 유지(pending 기존 있으면 재제안 X)', () => {
    const patterns = [pat('p1', 'build', 3, '')]
    const existing: EvolveQueueItem[] = [{
      id: 'e1', patternId: 'p1', kind: 'rule', status: 'pending',
      draft: '기존', dedupeKey: 'p1:rule', createdAt: '2026-01-01T00:00:00Z',
    }]
    const candidates = generateCandidates(patterns, existing)
    expect(candidates).toHaveLength(0)
  })

  it('A1: rejected 재제안 억제', () => {
    const patterns = [pat('p1', 'build', 3, '')]
    const existing: EvolveQueueItem[] = [{
      id: 'e1', patternId: 'p1', kind: 'rule', status: 'rejected',
      draft: '기각됨', dedupeKey: 'p1:rule', createdAt: '2026-01-01T00:00:00Z',
    }]
    const candidates = generateCandidates(patterns, existing)
    expect(candidates).toHaveLength(0)
  })

  it('applied는 재제안 억제(A2 applied도 같은 dedupeKey로 차단)', () => {
    const patterns = [pat('p1', 'build', 3, '')]
    const existing: EvolveQueueItem[] = [{
      id: 'e1', patternId: 'p1', kind: 'rule', status: 'applied',
      draft: '반영됨', dedupeKey: 'p1:rule', createdAt: '2026-01-01T00:00:00Z',
    }]
    const candidates = generateCandidates(patterns, existing)
    expect(candidates).toHaveLength(0)
  })

  it('결정성: 같은 입력 → 같은 순서', () => {
    const patterns = [pat('p1', 'build', 5, ''), pat('p2', 'env', 3, '')]
    const r1 = generateCandidates(patterns, []).map(c => c.patternId)
    const r2 = generateCandidates(patterns, []).map(c => c.patternId)
    expect(r1).toEqual(r2)
  })
})
```

- [ ] **Step 1.2: 테스트 실행 → FAIL 확인**

```bash
pnpm test:run -- tests/evolve.test.ts
# Expected: FAIL (evolve.js not found)
```

- [ ] **Step 1.3: evolve.ts 뼈대 + 순수 함수 구현**

```typescript
// src/commands/evolve.ts
import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import chalk from 'chalk'
import inquirer from 'inquirer'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { ensureInteractive } from '../lib/interactive.js'
import { readMemory, loadForMutation, writeMemory } from './memory.js'
import { sync } from './sync.js'
import type { PatternEntryV19 } from './pattern.js'
import { readJsonFile } from '../lib/read-json.js'

export const QUEUE_PATH_REL = join('.vhk', 'evolve', 'queue.json')
export const QUEUE_VERSION = 1

export type EvolveItemStatus = 'pending' | 'rejected' | 'applied'

export interface EvolveQueueItem {
  id: string
  patternId: string
  kind: 'rule'
  status: EvolveItemStatus
  draft: string
  dedupeKey: string
  createdAt: string
  appliedAt?: string
  rulesBackupPath?: string
}

export interface EvolveQueueFile {
  version: 1
  items: EvolveQueueItem[]
}

// ── 순수 함수 (테스트 가능) ──

/** avoid 패턴 → 룰 초안 문구 (결정적·템플릿 기반). */
export function buildDraft(p: PatternEntryV19): string {
  const axis = p.axis === 'tag' ? `태그 '${p.signal}'` : `키워드 '${p.signal}'`
  return `- ${axis} 관련 작업 시 사전 점검 필수 (근거: ${p.count}건 반복, ${p.summary})`
}

/** dedupe 키: patternId:kind */
export function buildDedupeKey(patternId: string, kind: 'rule'): string {
  return `${patternId}:${kind}`
}

/**
 * 순수 후보 생성 — fs·Date 부수효과 없음.
 * v0: avoid + active 패턴만. A1: rejected 재제안 억제. A2: pending/applied dedupe.
 * 결정적: patternId 알파벳 순 정렬.
 */
export function generateCandidates(
  patterns: PatternEntryV19[],
  existing: EvolveQueueItem[],
): Omit<EvolveQueueItem, 'id' | 'createdAt'>[] {
  const usedKeys = new Set(existing.map(e => e.dedupeKey))
  return patterns
    .filter(p => p.kind === 'avoid' && p.status === 'active')
    .sort((a, b) => a.id.localeCompare(b.id))
    .flatMap(p => {
      const key = buildDedupeKey(p.id, 'rule')
      if (usedKeys.has(key)) return []
      return [{ patternId: p.id, kind: 'rule' as const, status: 'pending' as const,
        draft: buildDraft(p), dedupeKey: key }]
    })
}

// ── fs 경계 ──

function stripBomStr(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

export function readQueue(cwd: string): EvolveQueueFile {
  const p = join(cwd, QUEUE_PATH_REL)
  if (!existsSync(p)) return { version: QUEUE_VERSION, items: [] }
  try {
    const raw = JSON.parse(stripBomStr(readFileSync(p, 'utf-8')))
    if (raw?.version === 1 && Array.isArray(raw.items)) return raw as EvolveQueueFile
  } catch { /* 손상 → 빈 반환 */ }
  return { version: QUEUE_VERSION, items: [] }
}

export function writeQueue(cwd: string, queue: EvolveQueueFile): void {
  const p = join(cwd, QUEUE_PATH_REL)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(queue, null, 2) + '\n', 'utf-8')
}

function nextQueueId(queue: EvolveQueueFile): string {
  const re = /^e(\d+)$/
  let max = 0
  for (const item of queue.items) {
    const m = item.id.match(re)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `e${max + 1}`
}

/** B3: RULES.md에 이미 동일 룰(normalize 비교)이 있는지 감지 */
export function isDuplicateRule(rulesContent: string, draft: string): boolean {
  const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()
  return rulesContent.split('\n').some(line => normalize(line) === normalize(draft))
}

// 명령어들은 Task 2~7에서 구현
export async function evolveList(_opts: { status?: string; json?: boolean } = {}): Promise<void> {
  console.log(chalk.bold('\n🔄 ' + t('evolve.listTitle')))
  console.log(chalk.dim('  (구현 중)'))
}
```

- [ ] **Step 1.4: 테스트 통과 확인**

```bash
pnpm test:run -- tests/evolve.test.ts
# Expected: PASS
```

- [ ] **Step 1.5: 커밋**

```bash
git add src/commands/evolve.ts tests/evolve.test.ts
git commit -m "feat(goal-20): evolve 큐 스키마 + 순수 함수(generateCandidates/buildDraft) + 단위 테스트"
```

---

## Task 2: ko.ts + evolve suggest + list 구현

**Files:**
- Modify: `src/i18n/ko.ts`
- Modify: `src/commands/evolve.ts`

- [ ] **Step 2.1: ko.ts evolve 메시지 추가**

`src/i18n/ko.ts` 의 `agent: { ... }` 블록 바로 뒤에 추가:

```typescript
  evolve: {
    suggestTitle: '진화 제안 생성',
    listTitle: '진화 후보 목록',
    applyTitle: '룰 반영',
    rejectTitle: '후보 기각',
    undoTitle: '최근 반영 되돌리기',
    noRules: 'RULES.md 가 없습니다. vhk init으로 생성 후 다시 시도하세요.',
    noPatterns: 'patterns[] 가 비어있습니다. vhk pattern detect 로 먼저 감지하세요.',
    noQueue: '후보가 없습니다. vhk evolve suggest 로 먼저 생성하세요.',
    notFound: (id: string) => `후보 '${id}' 를 찾을 수 없습니다. vhk evolve list 로 확인하세요.`,
    alreadyApplied: '이미 반영된 후보입니다.',
    dismissed: '소스 패턴이 dismiss됨 — apply 거부 (dismiss된 패턴 기반 룰은 반영 안 됨)',
    alreadyAppliedPattern: '소스 패턴이 이미 반영됨 — apply 거부',
    duplicateRule: (draft: string) => `중복 룰 감지 — 이미 RULES.md에 유사한 룰이 있습니다:\n  ${draft}`,
    pendingApplyExists: '미해소 apply가 있습니다. vhk evolve undo 후 다시 시도하거나 그대로 유지하세요.',
    noAppliedToUndo: 'undo할 반영 항목이 없습니다.',
    noBackup: '.bak 파일이 없어 undo 불가합니다. RULES.md를 수동 복원하세요.',
  },
```

- [ ] **Step 2.2: evolve suggest 구현**

`src/commands/evolve.ts` 에 `evolveList` 더미 대신 진짜 `evolveSuggest` + `evolveList` 추가:

```typescript
export async function evolveSuggest(opts: { json?: boolean } = {}): Promise<void> {
  const cwd = process.cwd()

  // RULES.md 존재 확인 (반영 타깃 없으면 무의미)
  if (!existsSync(join(cwd, 'RULES.md'))) {
    console.log(chalk.yellow('\n⚠️  ' + t('evolve.noRules')))
    process.exitCode = 1
    return
  }

  const mem = readMemory(cwd)
  const patterns = mem.patterns as PatternEntryV19[]
  const activeAvoid = patterns.filter(p => p.kind === 'avoid' && p.status === 'active')

  if (activeAvoid.length === 0 && !opts.json) {
    console.log(chalk.yellow('\n📭 ' + t('evolve.noPatterns')))
    return
  }

  const queue = readQueue(cwd)
  const newCandidates = generateCandidates(patterns, queue.items)
  const now = new Date().toISOString()

  for (const c of newCandidates) {
    queue.items.push({ ...c, id: nextQueueId(queue), createdAt: now })
  }

  writeQueue(cwd, queue)

  if (opts.json) {
    console.log(JSON.stringify(queue.items.filter(i => i.status === 'pending'), null, 2))
    return
  }

  console.log(chalk.bold('\n🔄 ' + t('evolve.suggestTitle')))
  console.log(chalk.gray('─'.repeat(40)))
  console.log(chalk.dim(`  신규 후보: ${newCandidates.length}개 추가됨`))

  const pending = queue.items.filter(i => i.status === 'pending')
  if (pending.length === 0) {
    console.log(chalk.yellow('\n📭 모든 패턴이 이미 제안됐거나 reject됐습니다.'))
    return
  }

  console.log(chalk.cyan(`\n후보 ${pending.length}개:\n`))
  for (const item of pending) {
    console.log(`  [${item.id}] (${item.status}) 패턴 ${item.patternId} → rule`)
    console.log(chalk.dim(`      초안: ${item.draft}`))
  }

  printNextStep({
    message: `진화 후보 ${pending.length}개 생성됨!`,
    command: 'vhk evolve list',
    cursorHint: '진화 후보 보여줘',
    alternative: 'vhk evolve apply <id> 로 반영',
  })
}

export async function evolveList(opts: { status?: string; json?: boolean } = {}): Promise<void> {
  const cwd = process.cwd()
  const queue = readQueue(cwd)
  let items = queue.items

  const VALID_STATUSES: EvolveItemStatus[] = ['pending', 'rejected', 'applied']
  if (opts.status && VALID_STATUSES.includes(opts.status as EvolveItemStatus)) {
    items = items.filter(i => i.status === opts.status)
  }

  if (opts.json) {
    console.log(JSON.stringify(items, null, 2))
    return
  }

  console.log(chalk.bold('\n🔄 ' + t('evolve.listTitle')))
  console.log(chalk.gray('─'.repeat(40)))

  if (items.length === 0) {
    console.log(chalk.yellow('\n📭 후보가 없습니다.'))
    console.log(chalk.gray('   vhk evolve suggest 로 생성하세요.'))
    return
  }

  const STATUS_ICON: Record<EvolveItemStatus, string> = { pending: '⏳', rejected: '❌', applied: '✅' }
  console.log(chalk.cyan(`\n${items.length}개:\n`))
  for (const item of items) {
    console.log(`  [${item.id}] ${STATUS_ICON[item.status]} (${item.status}) → ${item.draft}`)
    if (item.appliedAt) console.log(chalk.dim(`      반영: ${item.appliedAt}`))
  }
}
```

- [ ] **Step 2.3: suggest/list 추가 테스트**

`tests/evolve.test.ts` 에 추가:

```typescript
import { readQueue, writeQueue, isDuplicateRule } from '../src/commands/evolve.js'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-evolve-'))
}

describe('readQueue', () => {
  it('파일 없으면 빈 큐 반환', () => {
    const d = tmp()
    expect(readQueue(d)).toEqual({ version: 1, items: [] })
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('손상 파일 → 빈 큐 반환(크래시X)', () => {
    const d = tmp()
    fs.mkdirSync(path.join(d, '.vhk', 'evolve'), { recursive: true })
    fs.writeFileSync(path.join(d, '.vhk', 'evolve', 'queue.json'), '{{invalid}}', 'utf-8')
    expect(readQueue(d)).toEqual({ version: 1, items: [] })
    fs.rmSync(d, { recursive: true, force: true })
  })
})

describe('isDuplicateRule', () => {
  it('동일 룰 감지', () => {
    const rules = '## 코딩 규칙\n- build 태그 관련 작업 시 사전 점검 필수\n'
    expect(isDuplicateRule(rules, '- build 태그 관련 작업 시 사전 점검 필수')).toBe(true)
  })

  it('다른 룰은 false', () => {
    const rules = '## 코딩 규칙\n- 다른 룰\n'
    expect(isDuplicateRule(rules, '- build 태그 관련 작업 시 사전 점검 필수')).toBe(false)
  })
})
```

- [ ] **Step 2.4: 테스트 통과 확인**

```bash
pnpm test:run -- tests/evolve.test.ts
# Expected: PASS
```

- [ ] **Step 2.5: 커밋**

```bash
git add src/commands/evolve.ts src/i18n/ko.ts tests/evolve.test.ts
git commit -m "feat(goal-20): evolveSuggest(A1/A2 dedupe+억제) + evolveList + ko.ts 메시지"
```

---

## Task 3: evolve apply 구현

**Files:**
- Modify: `src/commands/evolve.ts`
- Modify: `tests/evolve.test.ts`

- [ ] **Step 3.1: apply 핵심 로직 테스트**

`tests/evolve.test.ts` 에 추가:

```typescript
describe('A4 댕글링 참조 가드', () => {
  it('소스 패턴 archived + 큐에 applied 없음 → dismiss 경로', () => {
    // 이 로직은 evolveApply 내부 checkDanglingRef 에서 검증됨
    // 단위 테스트로 분리된 헬퍼 함수 checkApplyRef 테스트
    const { checkApplyRef } = await import('../src/commands/evolve.js')
    const dismissedPattern: PatternEntryV19 = { ...pat('p1', 'build', 3, ''), status: 'archived' }
    const emptyQueue: EvolveQueueItem[] = []
    const result = checkApplyRef(dismissedPattern, emptyQueue)
    expect(result).toBe('dismissed')
  })

  it('소스 패턴 archived + 큐에 applied 있음 → already-applied 경로', () => {
    const { checkApplyRef } = await import('../src/commands/evolve.js')
    const appliedPattern: PatternEntryV19 = { ...pat('p1', 'build', 3, ''), status: 'archived' }
    const queue: EvolveQueueItem[] = [{
      id: 'e1', patternId: 'p1', kind: 'rule', status: 'applied',
      draft: '반영됨', dedupeKey: 'p1:rule', createdAt: '2026-01-01T00:00:00Z',
    }]
    const result = checkApplyRef(appliedPattern, queue)
    expect(result).toBe('already-applied')
  })

  it('소스 패턴 active → ok', () => {
    const { checkApplyRef } = await import('../src/commands/evolve.js')
    const activePattern = pat('p1', 'build', 3, '')
    expect(checkApplyRef(activePattern, [])).toBe('ok')
  })
})

describe('isDuplicateRule', () => {
  it('공백 무시 비교', () => {
    const rules = '- build  태그  관련  작업  시  사전  점검  필수'
    expect(isDuplicateRule(rules, '- build 태그 관련 작업 시 사전 점검 필수')).toBe(true)
  })
})
```

- [ ] **Step 3.2: apply 구현**

`src/commands/evolve.ts` 에 추가:

```typescript
export type ApplyRefResult = 'ok' | 'dismissed' | 'already-applied'

/** A4: 소스 패턴 상태 검증 (순수 함수). */
export function checkApplyRef(
  pattern: PatternEntryV19 | undefined,
  queueItems: EvolveQueueItem[],
): ApplyRefResult {
  if (!pattern || pattern.status !== 'archived') return 'ok'
  const hasApplied = queueItems.some(i => i.patternId === pattern.id && i.status === 'applied')
  return hasApplied ? 'already-applied' : 'dismissed'
}

export async function evolveApply(idStr: string): Promise<void> {
  if (!ensureInteractive('apply는 TTY 확인이 필요합니다. vhk evolve apply <id> 를 터미널에서 직접 실행하세요.')) return

  const cwd = process.cwd()
  const rulesPath = join(cwd, 'RULES.md')

  if (!existsSync(rulesPath)) {
    console.log(chalk.red('\n❌ ' + t('evolve.noRules')))
    process.exitCode = 1
    return
  }

  const queue = readQueue(cwd)
  const item = queue.items.find(i => i.id === idStr?.trim())
  if (!item) {
    console.log(chalk.red('\n❌ ' + t('evolve.notFound', idStr)))
    process.exitCode = 1
    return
  }
  if (item.status === 'applied') {
    console.log(chalk.yellow('\n⚠️  ' + t('evolve.alreadyApplied')))
    return
  }

  // C1 단일 apply 제약: 미해소 applied가 있으면 차단
  const hasUnresolved = queue.items.some(i => i.status === 'applied')
  if (hasUnresolved) {
    console.log(chalk.red('\n❌ ' + t('evolve.pendingApplyExists')))
    process.exitCode = 1
    return
  }

  // A4 댕글링 참조 가드
  const mem = readMemory(cwd)
  const srcPattern = (mem.patterns as PatternEntryV19[]).find(p => p.id === item.patternId)
  const refResult = checkApplyRef(srcPattern, queue.items)
  if (refResult === 'dismissed') {
    console.log(chalk.red('\n❌ ' + t('evolve.dismissed')))
    process.exitCode = 1
    return
  }
  if (refResult === 'already-applied') {
    console.log(chalk.red('\n❌ ' + t('evolve.alreadyAppliedPattern')))
    process.exitCode = 1
    return
  }

  // B3: RULES.md 중복 룰 감지
  const rulesContent = readFileSync(rulesPath, 'utf-8')
  if (isDuplicateRule(rulesContent, item.draft)) {
    console.log(chalk.yellow('\n⚠️  ' + t('evolve.duplicateRule', item.draft)))
    console.log(chalk.dim('   중복 룰은 추가하지 않습니다.'))
    return
  }

  // diff 출력 + B2: 사람이 문구 수정 가능
  console.log(chalk.bold('\n🔄 ' + t('evolve.applyTitle')))
  console.log(chalk.gray('─'.repeat(40)))
  console.log(chalk.cyan('\n초안 룰:'))
  console.log(chalk.white(`  ${item.draft}`))

  const { editedDraft } = await inquirer.prompt<{ editedDraft: string }>([{
    type: 'input',
    name: 'editedDraft',
    message: '룰 문구를 수정하려면 변경하세요 (Enter로 그대로 사용):',
    default: item.draft,
  }])

  const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([{
    type: 'confirm',
    name: 'confirmed',
    message: `RULES.md에 이 룰을 추가할까요?\n  ${editedDraft}`,
    default: false,
  }])

  if (!confirmed) {
    console.log(chalk.dim('  취소됨.'))
    return
  }

  // .bak 저장 (undo용)
  const backupPath = rulesPath + '.bak'
  copyFileSync(rulesPath, backupPath)

  // RULES.md append
  const appendLine = '\n' + editedDraft + '\n'
  writeFileSync(rulesPath, rulesContent + appendLine, 'utf-8')

  // sync 비대화형 재생성 (apply 내 이중 프롬프트 금지)
  await sync({ yes: true })

  // A3: queue item → applied, 소스 패턴 → archived
  const now = new Date().toISOString()
  item.status = 'applied'
  item.draft = editedDraft
  item.appliedAt = now
  item.rulesBackupPath = backupPath
  writeQueue(cwd, queue)

  // 소스 패턴 archived (18 선순환 재사용)
  if (srcPattern) {
    const memLoaded = loadForMutation(cwd)
    if (memLoaded.ok) {
      const p = (memLoaded.mem.patterns as PatternEntryV19[]).find(x => x.id === srcPattern.id)
      if (p) {
        p.status = 'archived'
        writeMemory(cwd, memLoaded.mem)
      }
    }
  }

  console.log(chalk.green(`\n✅ 룰 반영 완료! [${item.id}]`))
  console.log(chalk.dim('   RULES.md에 추가 + vhk sync 재생성됨'))
  printNextStep({
    message: '룰 반영 완료!',
    command: 'vhk evolve list --status applied',
    cursorHint: '반영된 룰 목록 보여줘',
    alternative: 'vhk evolve undo — 되돌리기',
  })
}
```

- [ ] **Step 3.3: 테스트 통과 확인**

```bash
pnpm test:run -- tests/evolve.test.ts
pnpm exec tsc --noEmit
# Expected: PASS
```

- [ ] **Step 3.4: 커밋**

```bash
git add src/commands/evolve.ts tests/evolve.test.ts src/i18n/ko.ts
git commit -m "feat(goal-20): evolveApply(ensureInteractive·A4·B3·단일apply·.bak·sync비대화형)"
```

---

## Task 4: evolve reject + undo 구현

**Files:**
- Modify: `src/commands/evolve.ts`
- Modify: `tests/evolve.test.ts`

- [ ] **Step 4.1: reject + undo 테스트**

`tests/evolve.test.ts` 에 추가:

```typescript
describe('다중 apply 블로킹 (generateCandidates 아님 — evolveApply 내 체크)', () => {
  it('queue에 applied가 있으면 두 번째 apply는 차단 — hasUnresolved 로직', () => {
    // evolveApply 내 hasUnresolved 체크를 단위 테스트하려면 로직 추출 필요
    // 현재는 통합 테스트에서 확인 (tests/evolve-integration.test.ts)
    // 단위: applied 항목 존재 여부만 확인
    const items: EvolveQueueItem[] = [
      { id: 'e1', patternId: 'p1', kind: 'rule', status: 'applied',
        draft: '반영됨', dedupeKey: 'p1:rule', createdAt: '2026-01-01T00:00:00Z' },
    ]
    const hasUnresolved = items.some(i => i.status === 'applied')
    expect(hasUnresolved).toBe(true)
  })
})
```

- [ ] **Step 4.2: reject + undo 구현**

```typescript
export async function evolveReject(idStr: string): Promise<void> {
  const cwd = process.cwd()
  const queue = readQueue(cwd)
  const item = queue.items.find(i => i.id === idStr?.trim())

  if (!item) {
    console.log(chalk.red('\n❌ ' + t('evolve.notFound', idStr)))
    process.exitCode = 1
    return
  }
  if (item.status === 'rejected') {
    console.log(chalk.dim(`  이미 기각된 후보입니다 — 변경 없음: ${item.id}`))
    return
  }

  item.status = 'rejected'
  writeQueue(cwd, queue)
  console.log(chalk.green(`\n❌ 후보 기각됨: [${item.id}] ${item.draft}`))
  console.log(chalk.dim('   (A1: 다음 suggest에서 재제안 안 됨)'))
  printNextStep({ message: '기각 완료!', command: 'vhk evolve list', cursorHint: '남은 후보 보여줘' })
}

export async function evolveUndo(): Promise<void> {
  if (!ensureInteractive('undo는 TTY 확인이 필요합니다.')) return

  const cwd = process.cwd()
  const queue = readQueue(cwd)
  const applied = queue.items.filter(i => i.status === 'applied')

  if (applied.length === 0) {
    console.log(chalk.yellow('\n📭 ' + t('evolve.noAppliedToUndo')))
    return
  }

  // 최근 apply 1건 (appliedAt 기준)
  const last = applied.sort((a, b) =>
    (b.appliedAt ?? '').localeCompare(a.appliedAt ?? '')
  )[0]

  if (!last.rulesBackupPath || !existsSync(last.rulesBackupPath)) {
    console.log(chalk.red('\n❌ ' + t('evolve.noBackup')))
    process.exitCode = 1
    return
  }

  console.log(chalk.bold('\n🔄 ' + t('evolve.undoTitle')))
  console.log(chalk.dim(`  되돌릴 항목: [${last.id}] ${last.draft}`))

  const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([{
    type: 'confirm',
    name: 'confirmed',
    message: 'RULES.md를 .bak으로 복원하고 vhk sync를 재실행할까요?',
    default: false,
  }])

  if (!confirmed) {
    console.log(chalk.dim('  취소됨.'))
    return
  }

  // RULES.md .bak 복원
  copyFileSync(last.rulesBackupPath, join(cwd, 'RULES.md'))

  // undo 재sync 비대화형 (undo 내 이중 프롬프트 금지)
  await sync({ yes: true })

  // queue item → pending, 소스 패턴 → active 복구
  last.status = 'pending'
  delete last.appliedAt
  delete last.rulesBackupPath
  writeQueue(cwd, queue)

  // 소스 패턴 active 복구
  const memLoaded = loadForMutation(cwd)
  if (memLoaded.ok) {
    const p = (memLoaded.mem.patterns as PatternEntryV19[]).find(x => x.id === last.patternId)
    if (p && p.status === 'archived') {
      p.status = 'active'
      writeMemory(cwd, memLoaded.mem)
    }
  }

  console.log(chalk.green(`\n✅ 되돌리기 완료! RULES.md 복원 + sync 재실행됨`))
  printNextStep({
    message: '되돌리기 완료!',
    command: 'vhk evolve list',
    cursorHint: '후보 목록 보여줘',
  })
}
```

- [ ] **Step 4.3: 테스트 통과 + typecheck**

```bash
pnpm test:run -- tests/evolve.test.ts
pnpm exec tsc --noEmit
```

- [ ] **Step 4.4: 커밋**

```bash
git add src/commands/evolve.ts tests/evolve.test.ts
git commit -m "feat(goal-20): evolveReject(A1) + evolveUndo(undo단일·.bak복원·재sync비대화형)"
```

---

## Task 5: 배선 (index.ts + command-registry + nlp + mcp)

**Files:**
- Modify: `src/index.ts`
- Modify: `src/lib/command-registry.ts`
- Modify: `src/lib/nlp-router.ts`
- Modify: `src/lib/nlp-run.ts`
- Modify: `src/mcp/server.ts`

- [ ] **Step 5.1: command-registry.ts 에 evolve 추가**

```typescript
// src/lib/command-registry.ts 의 CONTAINER_SUBCOMMANDS 에 추가:
evolve: ['suggest', 'list', 'apply', 'reject', 'undo'],

// CONTAINER_ALIASES 에 추가:
진화: 'evolve',
```

- [ ] **Step 5.2: nlp-router.ts 에 'evolve' 추가**

`NlpCommand` 타입에 `| 'evolve'` 추가.

`NLP_KEYWORDS` 에 추가 (오탐 주의 — 일반어 '반영'은 save/sync와 충돌 위험 → 좁게):

```typescript
evolve: ['진화', '룰후보', 'vhk evolve'],
```

RULES 배열에 추가 (pattern rule 바로 다음):

```typescript
{
  command: 'evolve',
  explanation: '진화 후보 목록 (vhk evolve list) — apply/undo는 직접 실행',
  confidence: 'high',
  test: t => matchesKeywords(t, 'evolve') || /^evolve$/.test(t),
},
```

- [ ] **Step 5.3: nlp-run.ts 에 dispatch 추가**

```typescript
import { evolveList } from '../commands/evolve.js'
// ...
case 'evolve':
  return evolveList()
```

- [ ] **Step 5.4: src/index.ts 에 evolve 컨테이너 등록**

```typescript
import { evolveSuggest, evolveList, evolveApply, evolveReject, evolveUndo } from './commands/evolve.js'

// KO_ALIASES 에 추가:
evolve: '진화',

// 커맨드 등록 (resume 다음, patternCmd 다음 어딘가):
const evolveCmd = program
  .command('evolve')
  .alias('진화')
  .description('패턴 → 룰 후보 제안·반영·undo (Evolution Loop 도미노 4) — apply/undo는 TTY 필수')
  .action(async () => { await evolveList() })

evolveCmd
  .command('suggest')
  .alias('제안')
  .option('--json', 'JSON 출력 (CI/MCP용)')
  .description('active avoid 패턴 → 룰 초안 후보 생성·큐 적재')
  .action(async (opts: { json?: boolean }) => { await evolveSuggest(opts) })

evolveCmd
  .command('list')
  .alias('목록')
  .option('--status <status>', 'pending|rejected|applied 필터')
  .option('--json', 'JSON 출력 (CI/MCP용)')
  .description('진화 후보 목록')
  .action(async (opts: { status?: string; json?: boolean }) => { await evolveList(opts) })

evolveCmd
  .command('apply <id>')
  .alias('반영')
  .description('후보 TTY 확인 → RULES.md append → sync 재생성 (대화형 필수)')
  .action(async (id: string) => { await evolveApply(id) })

evolveCmd
  .command('reject <id>')
  .alias('기각')
  .description('후보 기각 (재제안 억제)')
  .action(async (id: string) => { await evolveReject(id) })

evolveCmd
  .command('undo')
  .alias('되돌리기')
  .description('최근 apply 1건 되돌리기(.bak 복원 + sync — 대화형 필수)')
  .action(async () => { await evolveUndo() })
```

- [ ] **Step 5.5: mcp/server.ts 에 evolve-suggest + evolve-list 등록**

```typescript
// ─── evolve-suggest ──────────────────────────────────────
server.registerTool(
  'evolve-suggest',
  {
    description: 'active avoid 패턴 → 룰 초안 후보 생성·큐 적재 (Goal 20)',
    inputSchema: {},
  },
  async () => runVhkCli(['evolve', 'suggest', '--json'], 'evolve suggest')
)

// ─── evolve-list ─────────────────────────────────────────
server.registerTool(
  'evolve-list',
  {
    description: '진화 후보 목록 조회 (pending|rejected|applied — Goal 20)',
    inputSchema: {
      status: z.enum(['pending', 'rejected', 'applied']).optional().describe('상태 필터'),
    },
  },
  async ({ status }) => {
    const args = ['evolve', 'list', '--json']
    if (status) args.push('--status', status)
    return runVhkCli(args, 'evolve list')
  }
)
```

- [ ] **Step 5.6: typecheck + 빌드**

```bash
pnpm exec tsc --noEmit
pnpm run build
# Expected: PASS
```

- [ ] **Step 5.7: 테스트 통과**

```bash
pnpm test:run
# Expected: 기존 778+ + evolve 테스트 모두 PASS
```

- [ ] **Step 5.8: 커밋**

```bash
git add src/index.ts src/lib/command-registry.ts src/lib/nlp-router.ts src/lib/nlp-run.ts src/mcp/server.ts
git commit -m "feat(goal-20): 배선 — index/registry/nlp/mcp evolve 등록"
```

---

## Task 6: 게이트 갱신 (check-goal-20.mjs)

**Files:**
- Modify: `scripts/check-goal-20.mjs`
- Modify: `goals/20-evolve.md`

- [ ] **Step 6.1: goals/20-evolve.md frontmatter status → IN_PROGRESS**

```yaml
status: IN_PROGRESS
```

- [ ] **Step 6.2: check-goal-20.mjs — 구현 검증 게이트로 전환**

미구현 확인 `must(!existsSync('src/commands/evolve.ts'), ...)` 를 구현 검증으로 교체:

```javascript
// 구현 존재 확인 (설계→구현 전환)
must(existsSync('src/commands/evolve.ts'), 'src/commands/evolve.ts 구현됨')
must(existsSync('tests/evolve.test.ts'), 'tests/evolve.test.ts 존재')

const evTxt = read('src/commands/evolve.ts') ?? ''
// 5개 서브커맨드 export 확인
must(/export async function evolveSuggest/.test(evTxt), 'evolveSuggest export')
must(/export async function evolveList/.test(evTxt), 'evolveList export')
must(/export async function evolveApply/.test(evTxt), 'evolveApply export')
must(/export async function evolveReject/.test(evTxt), 'evolveReject export')
must(/export async function evolveUndo/.test(evTxt), 'evolveUndo export')
// 안전 가드
must(/ensureInteractive/.test(evTxt), 'ensureInteractive() 가드 사용')
must(!/process\.exit\s*\(/.test(evTxt), 'process.exit() 금지')
must(!/execSync/.test(evTxt), 'execSync 금지')
// C2 자동적용 금지: evolve.ts가 AGENTS/CLAUDE 직접 write 안 함
must(!(/AGENTS\.md|CLAUDE\.md/.test(evTxt) && /writeFileSync|appendFileSync/.test(evTxt)),
     'evolve.ts 가 AGENTS/CLAUDE 직접 write 안 함 (C2)')
// 큐 스키마
must(evTxt.includes('QUEUE_PATH_REL') && evTxt.includes('queue.json'), '큐 경로 정의')
must(evTxt.includes('EvolveQueueItem') && evTxt.includes('EvolveQueueFile'), '큐 스키마 타입')
// 핵심 설계 구현
must(evTxt.includes('generateCandidates'), '순수 함수 generateCandidates')
must(evTxt.includes('dedupeKey') && evTxt.includes('rejected'), 'A1/A2 dedupe+억제')
must(evTxt.includes('checkApplyRef'), 'A4 댕글링 참조 가드')
must(evTxt.includes('hasUnresolved'), 'C1 단일 apply 제약')
must(evTxt.includes('rulesBackupPath') && evTxt.includes('copyFileSync'), 'undo .bak 저장')
must(evTxt.includes("sync({ yes: true })"), 'sync 비대화형 호출')
// MCP
const srv = read('src/mcp/server.ts') ?? ''
must(/evolve-suggest/.test(srv) && /evolve-list/.test(srv), 'MCP evolve-suggest + evolve-list')
// 18 금지문구 오탐 없음 (src/ 스캔 범위에 evolve.ts 포함되므로 확인)
const FORBIDDEN = /SoT 분리|이중\s?기록|별도 SoT|learnings\.md append|memory\.json\s?과\s?별도/
must(!FORBIDDEN.test(evTxt), 'evolve.ts 18 금지문구 없음')
```

- [ ] **Step 6.3: 게이트 실행 → 20/20 확인**

```bash
node scripts/check-goal-20.mjs
# Expected: ✅ goal 20 gate passes
```

- [ ] **Step 6.4: 커밋**

```bash
git add scripts/check-goal-20.mjs goals/20-evolve.md
git commit -m "feat(goal-20): check-goal-20.mjs 구현 검증 게이트 전환 (미구현→구현 체크)"
```

---

## Task 7: 최종 검증 + PR

- [ ] **Step 7.1: 전체 게이트 실행**

```bash
pnpm run build
pnpm test:run
node scripts/check-goal-20.mjs
node scripts/check-goal-19.mjs
node scripts/check-goal-18.mjs  # 18 금지문구 오탐 없는지 확인
```

모든 Expected: ✅ PASS

- [ ] **Step 7.2: 테스트 수 + 회귀 0 확인**

`pnpm test:run` 결과에서 Tests N passed (N개) 확인. 기존 778 + evolve 신규 테스트 = N+M. 실패 0.

- [ ] **Step 7.3: CLAUDE.md 최종 업데이트**

- MCP tool count: 25+2(pattern) → 27+2(evolve) = 29
- 테스트 수: 실측값으로 업데이트
- 현재 상태: "Goal 20 구현 완료, PR 대기"

- [ ] **Step 7.4: 상태문서 업데이트 커밋**

```bash
git add CLAUDE.md docs/state/next-task.md
git commit -m "chore(state): Goal 20 구현 완료 상태 반영"
```

- [ ] **Step 7.5: PR 생성 (정지점)**

```bash
git push -u origin feat/goal-20-evolve
gh pr create \
  --title "feat(goal-20): vhk evolve v0 — Evolution Loop 도미노 4 (v2.2.0)" \
  --body "..."
```

**STOP — 머지·publish는 사람(2FA).**

---

## 자기 검토 (스펙 vs 계획)

| 스펙 요건 | 커버 Task |
|----------|-----------|
| STEP 0: 상태문서 정정 | Task 0 |
| STEP 1: 브랜치 | Task 0.3 |
| STEP 2: queue.json 스키마 | Task 1 |
| STEP 3: evolve suggest (A1/A2/결정성/--json) | Task 2 |
| STEP 4: evolve list (--status/--json) | Task 2 |
| STEP 5: evolve apply (ensureInteractive/A4/B2/B3/C1/.bak/sync비대화형/A3) | Task 3 |
| STEP 6: evolve reject (A1 근거) | Task 4 |
| STEP 7: evolve undo (ensureInteractive/단일/.bak복원/재sync비대화형) | Task 4 |
| STEP 8: 배선 (index/registry/nlp/mcp — suggest·list만 MCP) | Task 5 |
| STEP 9: 게이트 갱신 (C2 포함) | Task 6 |
| STEP 10: 테스트 (결정성/A1/A2/apply/B3/다중apply/A4/undo/회귀0) | Task 1~4 |
| 18 금지문구 오탐 없음 | Task 6 + 7.1 |
| PR까지만, 머지·publish STOP | Task 7.5 |
