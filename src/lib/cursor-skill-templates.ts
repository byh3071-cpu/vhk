import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { atomicWriteFile } from './atomic-write.js'

/** VHK-owned workflow skill bodies. Exported templates below add a managed version marker. */
// VHK-GENERATED-SKILL-BODIES:BEGIN
const CURSOR_SKILL_TEMPLATE_BODIES: Readonly<Record<string, string>> = {
  "vhk-gate": "---\r\nname: vhk-gate\r\ndescription: VHK 검증 게이트 전체 — verify → receipt → review. 트리거: \"검증\", \"게이트\", \"완료\", goal done 전, 코드 변경 후.\r\n---\r\n\r\n# VHK Gate\r\n\r\n코드·완료 주장 전 **반드시** 실행. red/BLOCK/skip이면 아래 분기 스킬로.\r\n\r\n## 순서 (Windows)\r\n\r\n```powershell\r\npnpm.cmd typecheck\r\npnpm.cmd run test:run\r\npnpm.cmd lint\r\nvhk verify\r\nvhk receipt\r\nvhk review\r\n```\r\n\r\n## 판정 분기\r\n\r\n| 결과 | 다음 |\r\n|---|---|\r\n| verify red | `.vhk/reports/latest.json` → 실패 수정 → `vhk verify` 재실행 |\r\n| receipt BLOCK — dirty | 변경을 확인·커밋한 뒤 `vhk receipt` 재실행 |\r\n| receipt BLOCK — stale | `vhk verify`로 현재 HEAD를 재검증한 뒤 `vhk receipt` 재실행 |\r\n| receipt BLOCK — forbidden | 금지 경로 변경을 제거하거나 사람과 mission을 재합의 |\r\n| receipt CAUTION — 작업 기준 미기록 | 현재 범위를 확인하고 다음 작업 시작 전에 `vhk receipt --mark-start` |\r\n| review skip (goal 0) | **vhk-goal-health** |\r\n| review fail | **vhk-evolve-loop** + 앱 결함이면 수정 |\r\n\r\n## L1 vs L2\r\n\r\n- VHK CLI 버그/크래시 → **vhk-dogfood-issue**\r\n- 프로젝트 반복 실수 → **vhk-evolve-loop**\r\n\r\n## Pass criteria\r\n\r\nverify exit 0 + receipt pass/caution + review pass (또는 skip 사유 goal-health 해결 후).\r\n\r\n완료 선언 금지 until pass.\r\n",
  "vhk-evolve-loop": "---\r\nname: vhk-evolve-loop\r\ndescription: VHK L2 자기개선 — learn/win → pattern → evolve. 트리거: gate FAIL, critic/security finding, receipt BLOCK, 반복 실수.\r\n---\r\n\r\n# VHK Evolve Loop (L2 프로젝트)\r\n\r\n**SoT:** `.vhk/memory.json` → `vhk evolve` → `RULES.md` (프로젝트만). VHK CLI 버그는 **vhk-dogfood-issue** (L1).\r\n\r\n## 1. 기록\r\n\r\n```powershell\r\nvhk learn \"한 줄 교훈 — why 포함\"\r\nvhk win \"한 줄 성공 — reinforce\"\r\n```\r\n\r\n팀 공유 필요 시 `docs/context/recurring-defects.md` 또는 ADR.\r\n\r\n## 2. 패턴\r\n\r\n```powershell\r\nvhk pattern detect\r\nvhk pattern list\r\nvhk evolve suggest\r\nvhk evolve list\r\n```\r\n\r\n## 3. 반영\r\n\r\n- TTY + 사람 확인: `vhk evolve apply <id>` → `vhk sync`\r\n- Headless/agent: `vhk evolve digest` → RULES 초안 제안만 (자동 apply 금지)\r\n\r\n## 4. L3 후보\r\n\r\n동일 교훈이 **2+ VHK 프로젝트**면 현재 VHK 공개 템플릿 개선 검토.\r\n\r\n## 금지\r\n\r\n- L1 CLI 결함을 learn만으로 끝내기 — vhk 레포 이슈 병행\r\n- memory.json만 믿고 RULES 미갱신 (로컬 전용, gitignore)\r\n",
  "vhk-dogfood-issue": "---\r\nname: vhk-dogfood-issue\r\ndescription: VHK L1 — CLI/하네스 결함 재현·분류·vhk 레포 이슈 등록. 트리거: vhk exit≠0, doctor/review/receipt 버그, \"VHK 버그\", \"vhk 이슈\".\r\n---\r\n\r\n# VHK Dogfood Issue (L1 제품)\r\n\r\n**SoT:** https://github.com/byh3071-cpu/vhk/issues\r\n\r\n## 분류 (먼저)\r\n\r\n| 유형 | 등록 | 예 |\r\n|---|---|---|\r\n| **도구 결함** | vhk 레po | goal silent skip, recap headless |\r\n| **앱 버그** | **현재 프로젝트** 이슈/수정 | 현재 프로젝트의 결제 로직 |\r\n| **배선 갭** | 프로젝트 skill/RULES + (공통이면) vhk enhancement | verify만 하고 receipt 생략 |\r\n\r\n교차검증 필요 시 **dogfood-crosscheck** 선행.\r\n\r\n## 절차\r\n\r\n1. **재현** — 최소 명령·exit code·`vhk --version`\r\n2. **중복 검색**\r\n   ```powershell\r\n   gh issue list -R byh3071-cpu/vhk --search \"키워드\" --state all\r\n   ```\r\n3. **body 작성** — `.vhk/issue-<slug>.md` (재현/기대/실제/환경)\r\n4. **등록** — 사용자가 \"등록해\" / \"ㅇㅋ 이슈\" 명시 후:\r\n   ```powershell\r\n   gh issue create -R byh3071-cpu/vhk --title \"...\" --label \"bug,dogfooding\" --body-file .vhk/issue-<slug>.md\r\n   ```\r\n5. **로컬 흔적** — `vhk learn \"dogfood: ...\"` (태그 dogfood)\r\n\r\n## 금지\r\n\r\n- 사용자 승인 없이 `gh issue create`\r\n- 앱 버그를 vhk 레po에 등록\r\n",
  "vhk-goal-health": "---\r\nname: vhk-goal-health\r\ndescription: goals/*.md 스키마修復 — type:goal 누락 silent skip 해소. 트리거: vhk review skip, vhk goal list ignored files, \"정의된 goal 없음\".\r\n---\r\n\r\n# VHK Goal Health\r\n\r\n## 진단\r\n\r\n```powershell\r\nvhk goal list\r\nvhk review\r\n```\r\n\r\n`스키마 불일치로 무시` / `goal 없음` → frontmatter修復.\r\n\r\n##修復\r\n\r\n각 `goals/*.md` frontmatter:\r\n\r\n```yaml\r\n---\r\ntype: goal\r\nid: 4          # 숫자\r\ntitle: ...\r\nstatus: IN_PROGRESS   # NOT_STARTED | IN_PROGRESS | DONE (대문자 enum)\r\n---\r\n```\r\n\r\nLegacy 매핑: `active`→`IN_PROGRESS`, `done`→`DONE`, `pending`→`NOT_STARTED`\r\n\r\n- legacy `id`만 있으면 `type: goal` 추가\r\n- `goals/_meta.md` 없으면 `vhk goal init` 참고 생성\r\n\r\n## 검증\r\n\r\n```powershell\r\nvhk goal list    # 4 files recognized\r\nvhk goal peek    # IN_PROGRESS 1개\r\nvhk review       # skip 아님\r\n```\r\n\r\n## L1\r\n\r\ndoctor/goal list가 legacy status를 경고 없이 무시 → **vhk-dogfood-issue** (#465, #467 follow-up).\r\n",
  "vhk-bootstrap-cursor": "---\r\nname: vhk-bootstrap-cursor\r\ndescription: VHK Cursor 독푸딩 — 설치+배선 한 번에. 트리거: \"VHK 도입\", \"독푸딩\", \"vhk bootstrap\", Claude→Cursor 전환.\r\n---\r\n\r\n# VHK Bootstrap Cursor (설치 + 배선)\r\n\r\n**목표:** `vhk doctor` green + **goal/receipt/review/learn 루프 연결** + gate 1회 PASS.\r\n\r\n## Phase 0 — CLI\r\n\r\n```powershell\r\nvhk doctor\r\nvhk context\r\nvhk brief\r\nvhk sync\r\nvhk mcp-init\r\n```\r\n\r\n## Phase 1 — Goal (필수)\r\n\r\n```powershell\r\nvhk goal list\r\n```\r\n\r\n- silent skip 있으면 → **vhk-goal-health**\r\n- 없으면 `goals/_meta.md` + active goal 1개\r\n\r\n## Phase 2 — Cursor 산출물\r\n\r\n| 산출물 | 최소 |\r\n|---|---|\r\n| `.cursor/rules/` | context, windows-shell |\r\n| `.cursor/skills/` | vhk-gate, vhk-evolve-loop, vhk-dogfood-issue, vhk-bootstrap-cursor, recap |\r\n| `.cursor/hooks.json` | session-start, stop-recap |\r\n| `docs/state/` | next-task, blockers |\r\n| `docs/context/agent-compact.md` | 1페이지 |\r\n\r\n프로젝트 skill은 **vhk-gate 위임** (로직 중복 금지).\r\n\r\n## Phase 3 — 배선 검증\r\n\r\n```powershell\r\nvhk pattern detect\r\npnpm.cmd typecheck; pnpm.cmd run test:run; pnpm.cmd lint\r\nvhk verify\r\nvhk receipt\r\nvhk review\r\n```\r\n\r\nreview skip → goal-health 재실행.\r\n\r\n## Phase 4 — L1 갭\r\n\r\nbootstrap 중 CLI 결함 → **vhk-dogfood-issue** (inject-bootstrap 누락, doctor goal 미검 등).\r\n\r\n## 완료 기준\r\n\r\n- `vhk goal list` ≥ 1 active\r\n- vhk-gate skill 존재\r\n- verify PASS; receipt not BLOCK (또는 사유 해소)\r\n"
}
// VHK-GENERATED-SKILL-BODIES:END

const CURSOR_SKILL_TEMPLATE_VERSION = 3

function managedTemplate(name: string, body: string): string {
  // 생성 입력의 운영체제 줄바꿈과 무관하게 변환·해시·설치 결과를 동일하게 유지한다.
  let next = body.replace(/\r?\n/g, '\r\n')
  if (name === 'vhk-gate') {
    // verify가 package manager와 test/test:run fallback을 이미 판별한다. 생성 스킬이 다시 추측하지 않는다.
    next = next.replace('pnpm.cmd typecheck\r\npnpm.cmd run test:run\r\npnpm.cmd lint\r\n', '')
    next = next.replace(
      '| review skip (goal 0) | **vhk-goal-health** |',
      '| review exit 1 — Goal 스키마 오류·무시 파일 | `vhk goal list`로 확인 → **vhk-goal-health** |\r\n' +
        '| review exit 1 — 모든 Goal이 정상 DONE | branch/handoff closeout에서는 review `N/A`; goal-health 호출 금지 |',
    )
    next = next.replace(
      'verify exit 0 + receipt pass/caution + review pass (또는 skip 사유 goal-health 해결 후).',
      'verify exit 0 + receipt pass/caution + active Goal의 review pass 또는 모든 Goal 정상 DONE closeout의 review `N/A`.',
    )
  }
  if (name === 'vhk-bootstrap-cursor') {
    next = next.replace('pnpm.cmd typecheck; pnpm.cmd run test:run; pnpm.cmd lint\r\n', '')
    next = next.replace(
      'review skip → goal-health 재실행.',
      'review exit 1이면 `vhk goal list`로 분기한다: 스키마 오류·무시 파일만 goal-health, 모든 Goal 정상 DONE closeout은 review `N/A`이며 goal-health를 호출하지 않는다.',
    )
  }
  return `${next}<!-- vhk-template: ${name}@${CURSOR_SKILL_TEMPLATE_VERSION} -->\r\n`
}

/** VHK-owned workflow skill bundle — bootstrap cursor installs and safely migrates managed copies. */
export const CURSOR_SKILL_TEMPLATES: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    Object.entries(CURSOR_SKILL_TEMPLATE_BODIES).map(([name, body]) => [name, managedTemplate(name, body)])
  )
)

// 2.14.1이 생성한 수정되지 않은 템플릿만 자동 교체한다. 줄바꿈은 운영체제 차이를 없애고 비교한다.
const LEGACY_TEMPLATE_HASHES: Readonly<Partial<Record<string, readonly string[]>>> = {
  'vhk-gate': [
    '735d315cac62e667a35d51da6ec981f3efda3ec443c8369380b8996bf9371226',
    '32d469b9ce4837bd929e125cf10c299457c4c70d6bed99bc067b1b77e77945fc',
  ],
  'vhk-bootstrap-cursor': [
    '6e45fb0f113c4e69cffdd4ead00d1bdd3a28e05e78f8636b842dca4cdb277281',
    '36c9aeeaf3786e8f45c88c266ef6115b8d68ac687a43fa2f61ae7e85f871b70a',
  ],
}

function normalizeTemplate(content: string): string {
  return content.replace(/\r\n/g, '\n')
}

function templateHash(content: string): string {
  return createHash('sha256').update(normalizeTemplate(content), 'utf-8').digest('hex')
}

function isKnownLegacyTemplate(name: string, content: string): boolean {
  const hashes = LEGACY_TEMPLATE_HASHES[name] ?? []
  if (hashes.includes(templateHash(content))) return true
  const currentTemplate = CURSOR_SKILL_TEMPLATES[name]
  if (currentTemplate !== undefined) {
    // 본문이 바뀌지 않은 스킬은 관리 표식만 이전 버전인 정확한 정본도 안전하게 승격한다.
    const previousVersionTemplate = currentTemplate.replace(
      `<!-- vhk-template: ${name}@${CURSOR_SKILL_TEMPLATE_VERSION} -->`,
      `<!-- vhk-template: ${name}@${CURSOR_SKILL_TEMPLATE_VERSION - 1} -->`,
    )
    if (normalizeTemplate(content) === normalizeTemplate(previousVersionTemplate)) return true
  }
  // 미발행 개발판을 로컬에서 먼저 설치한 경우도 정확히 같은 본문일 때만 안전하게 승격한다.
  const developmentBody = CURSOR_SKILL_TEMPLATE_BODIES[name]
  return developmentBody !== undefined && normalizeTemplate(content) === normalizeTemplate(developmentBody)
}

function hasCurrentTemplateMarker(name: string, content: string): boolean {
  return content.includes(`<!-- vhk-template: ${name}@${CURSOR_SKILL_TEMPLATE_VERSION} -->`)
}

export interface InstallCursorSkillsResult {
  created: string[]
  updated: string[]
  skipped: string[]
  /** 사용자 수정 가능성이 있어 자동 교체하지 않은 구형 템플릿. */
  outdated: string[]
}

export function installCursorSkills(cwd: string = process.cwd()): InstallCursorSkillsResult {
  const skillsRoot = join(cwd, '.cursor', 'skills')
  const created: string[] = []
  const updated: string[] = []
  const skipped: string[] = []
  const outdated: string[] = []
  for (const [name, content] of Object.entries(CURSOR_SKILL_TEMPLATES)) {
    const skillDir = join(skillsRoot, name)
    const skillFile = join(skillDir, 'SKILL.md')
    if (existsSync(skillFile)) {
      try {
        const existing = readFileSync(skillFile, 'utf-8')
        if (hasCurrentTemplateMarker(name, existing)) {
          skipped.push(name)
          continue
        }
        if (isKnownLegacyTemplate(name, existing)) {
          atomicWriteFile(skillFile, content)
          updated.push(name)
          continue
        }
        // 현재 버전 표식도, VHK가 그대로 생성한 과거 해시도 아니다. 내용 추측 없이 사용자본으로 보존·경고한다.
        outdated.push(name)
      } catch {
        // 읽을 수 없는 기존 파일은 소유권을 추측해 덮어쓰지 않는다. 호출부가 수동 확인 대상으로 안내한다.
        outdated.push(name)
      }
      skipped.push(name)
      continue
    }
    mkdirSync(skillDir, { recursive: true })
    atomicWriteFile(skillFile, content)
    created.push(name)
  }
  return { created, updated, skipped, outdated }
}
