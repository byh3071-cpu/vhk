import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { atomicWriteFile } from './atomic-write.js'

export type AgentSkillPlatform =
  | 'google-antigravity'
  | 'claude-code'
  | 'openai-codex'
  | 'cursor'

export type AgentSkillDistribution = 'project' | 'repository'

export interface AgentSkillDefinition {
  name: string
  distribution: AgentSkillDistribution
  platforms: AgentSkillPlatform[]
  files: Record<string, string>
}

interface AgentSkillBundleData {
  schemaVersion: number
  bundleVersion: number
  skills: AgentSkillDefinition[]
}

// VHK-GENERATED-AGENT-SKILLS:BEGIN
const GENERATED_AGENT_SKILL_BUNDLE: AgentSkillBundleData = {
  "schemaVersion": 1,
  "bundleVersion": 2,
  "skills": [
    {
      "name": "vhk-auto",
      "distribution": "repository",
      "platforms": [
        "google-antigravity",
        "claude-code",
        "openai-codex",
        "cursor"
      ],
      "files": {
        "SKILL.md": "---\nname: vhk-auto\ndescription: Use when one active VHK goal should run autonomously through implementation and verification without external publication or merge.\n---\n\n# VHK Autopilot (1단계 MVP)\n\nVHK로 개발 중인 프로젝트에서 **active goal 카드 1개**를 사람 개입 없이 한 바퀴 돌리고,\n끝나면 **멈춰서 핵심만 보고**한다. 위험한 건 하지 않는다 — 외부 발송·이슈 등록·코드 집행은\n2단계 `vhk auto` 명령 영역이다.\n\n## 🔒 불변조건 (절대 어기지 마라)\n- **INV-1** 진행 허가 = `vhk verify` green(결정론)에만. 적대리뷰(LLM)는 \"중단 트리거\"로만 —\n  \"진행해도 된다\"는 긍정 판정 금지.\n- **INV-2** 외부 발송 0. `gh issue create` 호출 금지. 문제는 채팅 보고 + 이슈 초안 텍스트까지만.\n- **INV-3** 집행 코드 0. dedupe·rate-limit·이슈 jsonl 영속 금지. (dev log append 는 허용·필수 — INV-5)\n- **INV-4** 자동 합·불 입력 = `vhk verify` 의 `.vhk/reports/latest.json` + 각 명령 exit code 만.\n  `vhk review`·`vhk mission check` 는 exit code 만 신뢰하고 stdout 텍스트는 파싱하지 말 것\n  (텍스트는 적대 판단의 신호로만 읽는다).\n- **INV-5** commit 전 `docs/devlog/<오늘날짜>-autopilot.md` 에 1줄 append 필수.\n  안 하면 check-records 훅(exit 2)이 막는다. src 실코드 커밋에 `[skip-record]` 우회 금지.\n  이 경로는 **비추적**이라 `git add` 하지 않는다(공개 경계 — ADR-008·ADR-010).\n- **INV-6** critical 결함 발견 또는 `vhk verify` 연속 2회 red 시 `.vhk/HARD_STOP` 파일 생성하고 종료.\n  매 시작(0번)에 `.vhk/HARD_STOP` 존재를 먼저 확인한다.\n- **INV-7** commit 만 자동. push·PR·머지·publish 는 절대 자동 금지.\n- **INV-8** 적대리뷰는 현재 호스트에 맞는 독립 리뷰 어댑터를 정확히 1개 사용한다.\n  [리뷰 어댑터](references/review-adapters.md)를 읽고, 지원되는 어댑터가 없거나 실행·인증·판정에\n  실패하면 합격으로 간주하지 말고 중단 사유를 보고한다.\n- **INV-9** 루프 시작 시 `vhk autonomy-log --event start`로 runId를 발급받아 루프 내내\n  유지하고, 종결 분기에서 결과에 맞는 이벤트로 반드시 종결 기록한다(이슈 #373 자율성완주율\n  계측 — 시작만 있고 종결이 없으면 완주율 분모/분자가 둘 다 부정확해진다).\n- **INV-10** 합격 종결 전에 `vhk receipt` 를 반드시 실행한다. 완주 판정은 **같은 커밋 SHA 의\n  receipt** 를 요구하는데(`isVerifiedComplete`), `vhk verify` 는 그 원장을 쓰지 않는다.\n  빠지면 런이 기록돼도 `verified=false` 로 떨어져 관찰 게이트의 유효 실행에 들어가지 않고,\n  자기 보고 격차로 잡혀 권한 승급까지 영구 차단된다. 커밋 직후에 불러야 SHA 가 일치한다.\n\n## 루프 (1회 호출 = active goal 카드 1개)\n0. **안전 확인**: `.vhk/HARD_STOP` 존재? → 있으면 즉시 중단, 사유 보고하고 종료. (INV-6)\n1. **앵커 재주입**: `vhk loop-brief` 와 `vhk remind` 실행 → 산출 파일\n   (`.vhk/loop-brief.md`·`.vhk/remind.md`) 를 Read 해서 의도·치명규칙을 컨텍스트에 넣는다.\n2. **상태 파악**: `vhk work`(또는 `vhk goal next`) 실행 → 지금의 active goal 카드 1개를 식별한다.\n   **런 시작 기록**(INV-9): `vhk autonomy-log --event start [--goal <n>]` 실행 → 발급된\n   runId 를 루프 끝까지 들고 있는다(6번 종결 분기에서 그대로 쓴다).\n3. **개발**: 그 카드의 미션을 구현한다. test-first(실패 테스트 먼저 → 통과 구현) + 기존 코딩 규칙 준수.\n4. **결정론 게이트**: `vhk verify` 실행 → `.vhk/reports/latest.json` 을 읽는다.\n   green(typecheck/test/build/secure 통과) = 진행 허가 / red = 게이트 실패 카운트 +1. (INV-1·INV-4)\n   첫 red이면 적대 검증이나 commit으로 진행하지 않는다. 같은 호출에서 실패 원인을 수정하고 `vhk verify`를 한 번 다시 실행한다.\n   두 번째 red이면 hardstop 분기로 이동한다. 안전하게 수정할 수 없거나 재검증 전에 호출을 끝내야 하면 blocked 종결 분기로 이동한다.\n5. **적대 검증**: [리뷰 어댑터](references/review-adapters.md)에서 현재 호스트용 독립 리뷰를\n   1패스 실행한다. 추가로 `vhk review`·`vhk mission check` 실행 —\n   exit code 는 결정론 중단신호, stdout 텍스트는 적대판단 신호로만(파싱 X, INV-4).\n   판단 규칙: \"치명(critical) 결함이 1개라도 있나? 불확실하면 치명으로 간주\" → 있으면 중단. (보수적)\n   review 실행·인증 실패 또는 결과 불명확이면 성공으로 간주하지 않고 6번의 blocked 종결 분기로 이동한다.\n6. **종결 분기**:\n   - **합격**(verify green AND 적대 치명 0):\n     1) `docs/devlog/<오늘날짜>-autopilot.md` 에 \"무엇을 했고 검증 결과\" 1줄 append. (INV-5)\n     2) `vhk save --no-push -m \"<검증된 변경 요약>\"`으로 작은 commit 1개. `--no-push`는\n        로컬 commit만 명시 승인하는 경로다. 평범한 `vhk save`나 push를 포함하는 `--yes`는 쓰지\n        않으며, 저장 실패는 성공으로 우회하지 말고 blocked 분기로 닫는다. (INV-7)\n     3) `vhk receipt` 실행 — **커밋 직후, 종결 기록 직전**. (INV-10)\n     4) `vhk autonomy-log --event complete --run-id <runId> [--goal <n>] [--ticks <n>] [--interventions <n>]`. (INV-9)\n     5) goal 완주 → 정지 + 핵심 보고 → 종료.\n   - **critical 발견 또는 verify 연속 2회 red**:\n     1) `.vhk/HARD_STOP` 파일을 사유와 함께 생성. (INV-6)\n     2) `vhk autonomy-log --event hardstop --run-id <runId> [...] [--review-rejected]`\n        (적대리뷰 critical 이 원인이면 `--review-rejected` 포함). (INV-9)\n     3) 핵심 보고 → 종료(사람이 `vhk resume --confirm` 하기 전엔 재진입 금지).\n   - **재검증 전 중단·review 실패·그 밖의 start 이후 오류**:\n     1) `vhk autonomy-log --event blocked --run-id <runId> [...]`. (INV-9)\n     2) 첫 verify red를 안전하게 수정할 수 없는 경우, review 실행·인증·결과 실패, devlog append·commit 등 열거되지 않은 명령 실패도 모두 이 분기로 닫는다.\n     3) 중단 원인과 재실행 조건을 핵심 보고하고 종료. 이 분기에서는 HARD_STOP을 만들지 않는다.\n     4) terminal 이벤트 기록 자체가 실패하면 `.vhk/HARD_STOP`을 만들고 기록 무결성 실패를 보고한다.\n   - **3사이클 진전 없음**:\n     1) `vhk blocker \"<증상>\"` (독푸딩 중이면 `[dogfood]` 태그로 HARD_STOP 임계 우회 가능).\n     2) `vhk autonomy-log --event blocked --run-id <runId> [...]`. (INV-9)\n     3) 종료.\n7. **보고**(두괄식, 핵심 먼저):\n   `[결과 1줄] → [한 일] → [문제 있으면 핵심 + 이슈 초안 텍스트]`.\n   이슈는 **초안 텍스트만** 제시한다 — 등록은 사람이 2단계 `vhk auto` 로 결정한다. (INV-2)\n\n## 판정 모델\n- **진행 허가**(commit 해도 되나?) = `vhk verify latest.json` 이 green 인가 (결정론, LLM 무관).\n- **중단**(멈춰야 하나?) = verify red OR 적대 치명 OR `.vhk/HARD_STOP`.\n- 적대리뷰는 \"멈출 이유\"만 찾는다. 불확실하면 치명으로 본다.\n\n## 보고 규약\n- 문제·정리는 **핵심 먼저(두괄식)**. 설계·이론·플랜 설명은 자세히 해도 됨.\n- 비개발자 대상 — 전문용어는 쉬운 말로 풀이.\n",
        "references/review-adapters.md": "# 독립 리뷰 어댑터\n\n현재 호스트에서 실제로 제공되는 어댑터 하나만 고른다. 사용할 수 있는지 확인하지 못했거나 실행·인증이\n실패하면 리뷰를 통과한 것으로 간주하지 않고 `blocked`로 끝낸다. 어떤 어댑터도 공통 Skill의 중단 조건을\n완화할 수 없다.\n\n| 호스트 | 독립 리뷰 1패스 |\n|---|---|\n| OpenAI Codex · Windows | `codex.cmd review --uncommitted` |\n| OpenAI Codex · POSIX | `codex review --uncommitted` |\n| Claude Code | 설치되어 있고 현재 세션에서 확인되는 `/code-review` Skill |\n| Cursor · Google Antigravity | 현재 호스트가 제공하는 독립 리뷰 기능. 기능을 확인할 수 없으면 `blocked` |\n\n리뷰의 자유 텍스트는 결함 신호로만 읽는다. 자동 합격 입력은 `vhk verify` 결과와 각 명령의 종료 코드뿐이다.\n"
      }
    },
    {
      "name": "overnight-vhk-auto",
      "distribution": "repository",
      "platforms": [
        "google-antigravity",
        "claude-code",
        "openai-codex",
        "cursor"
      ],
      "files": {
        "SKILL.md": "---\nname: overnight-vhk-auto\ndescription: Use when one VHK goal should run unattended overnight and stop after opening a pull request without merging.\n---\n\n# Overnight vhk-auto conductor\n\nOne goal per invocation. **Different track from overnight-autoloop** (do not mix).\n\n## Repository wrapper\n\nUse the tracked `scripts/auto_pr_goal.ps1` wrapper after the implementation commit. Its interface is fixed:\n\n```powershell\npowershell -NoProfile -ExecutionPolicy Bypass -File scripts/auto_pr_goal.ps1 `\n  -RepositoryRoot <repo-root> -BaseBranch main -Title <title> -BodyFile <body-file>\n```\n\nPrepare a temporary PR body file that follows `AGENTS.md` and includes the morning review questions. Do not commit that file.\n\n## Invariants\n- **INV-A** Follow `.agents/skills/vhk-auto/SKILL.md` INV-1..INV-10 for the implement loop. Commit only inside that loop (INV-7).\n- **INV-B** After green verify + commit, call `scripts/auto_pr_goal.ps1`. The wrapper supports a clean worktree with an unpushed commit; do not require dirty porcelain. **Merge = 0.** Never push `main`, force-push, publish, or change branch protection.\n- **INV-B2** The `autonomous` label is attached idempotently by that script on both create and reuse paths (Goal 111 cohort secondary signal). Never add or remove it by hand — the primary signal is the terminal-SHA join, and signal mismatch is quarantined as `unknown`.\n- **INV-C** If autonomy-log start or terminal event is missing → write `.vhk/HARD_STOP` and stop.\n  Same when a successful terminal event has no receipt for the same SHA — that run is recorded\n  but never counts as verified completion, so it never enters the observation gate sample (vhk-auto INV-10).\n- **INV-D** Use the release order in `docs/roadmap/2.x-roadmap.md` and acceptance criteria in `docs/PRD-2.x.md`. Do not invent a queue from old Goal numbers.\n- **INV-E** Stop on HARD_STOP, verify 2× red, or open PR reported.\n\n## Loop\n0. If `.vhk/HARD_STOP` exists → report and exit.\n1. Run `vhk goal next` and select only the Goal it reports. If none is available or dependencies block it, report and stop. Preserve its local state as `IN_PROGRESS`; do not invent an order from old Goal numbers.\n2. Run **vhk-auto** loop for that card (including INV-9 autonomy-log).\n3. On success, require a clean worktree and a current branch other than `main`.\n4. Call `scripts/auto_pr_goal.ps1` with the repository root, base branch `main`, PR title, and temporary PR body file.\n5. Optionally generate the morning report with `node scripts/gen-autonomy-morning-report.mjs --date YYYY-MM-DD`.\n6. Report the PR URL (or HARD_STOP reason). **Do not merge.**\n\n## Cross-links\n- RFC: `docs/rfc/0063-overnight-vhk-auto.md`\n- Skill SoT for inner loop: `.agents/skills/vhk-auto/SKILL.md`\n- Work order: `docs/roadmap/2.x-roadmap.md`\n- Acceptance criteria: `docs/PRD-2.x.md`\n"
      }
    },
    {
      "name": "vhk-gate",
      "distribution": "project",
      "platforms": [
        "google-antigravity",
        "claude-code",
        "openai-codex",
        "cursor"
      ],
      "files": {
        "SKILL.md": "---\nname: vhk-gate\ndescription: VHK 변경의 verify, receipt, review를 연결해 완료 전에 검증할 때 사용한다.\n---\n\n# VHK Gate\n\n코드 변경이나 Goal 완료를 주장하기 전에 다음 순서로 실행한다.\n\n```text\nvhk verify\nvhk receipt\nvhk review\n```\n\n## 판정\n\n| 결과 | 다음 행동 |\n|---|---|\n| verify red | `.vhk/reports/latest.json`에서 실패 원인을 확인하고 수정한 뒤 다시 검증 |\n| receipt BLOCK — dirty | 변경을 확인·커밋한 뒤 receipt 재실행 |\n| receipt BLOCK — stale | 현재 HEAD를 `vhk verify`로 다시 검증한 뒤 receipt 재실행 |\n| receipt BLOCK — forbidden | 금지 경로 변경을 제거하거나 사람과 작업 범위를 재합의 |\n| receipt CAUTION — 작업 기준 미기록 | 현재 범위를 확인하고 다음 작업 전에 `vhk receipt --mark-start` |\n| review exit 1 — Goal 스키마 오류·무시 파일 | `vhk goal list`로 확인한 뒤 **vhk-goal-health** 사용 |\n| review exit 1 — 모든 Goal 정상 DONE | 종료 인수인계에서는 review `N/A`; goal-health 호출 금지 |\n| review fail | **vhk-evolve-loop**로 반복 원인을 기록하고 제품 결함이면 수정 |\n\nVHK CLI 자체의 버그나 크래시는 **vhk-dogfood-issue**, 프로젝트의 반복 실수는\n**vhk-evolve-loop**로 보낸다.\n\n완료 조건은 verify exit 0, receipt pass/caution, active Goal의 review pass 또는 모든 Goal 정상 DONE\n종료의 review `N/A`다. 그 전에는 완료를 선언하지 않는다.\n"
      }
    },
    {
      "name": "vhk-evolve-loop",
      "distribution": "project",
      "platforms": [
        "google-antigravity",
        "claude-code",
        "openai-codex",
        "cursor"
      ],
      "files": {
        "SKILL.md": "---\nname: vhk-evolve-loop\ndescription: VHK 검증 실패나 반복 실수를 기록하고 프로젝트 규칙 개선안으로 연결할 때 사용한다.\n---\n\n# VHK Evolve Loop\n\n프로젝트 개선의 정본 흐름은 `.vhk/memory.json` → `vhk evolve` → `RULES.md`다. VHK CLI 자체의\n결함은 **vhk-dogfood-issue**로 보낸다.\n\n## 기록과 패턴\n\n```text\nvhk learn \"한 줄 교훈 — 원인 포함\"\nvhk win \"한 줄 성공 — 유지할 이유 포함\"\nvhk pattern detect\nvhk pattern list\nvhk evolve suggest\nvhk evolve list\n```\n\n팀 공유가 필요하면 프로젝트 기록 규약에 맞는 recurring-defects 문서나 ADR을 사용한다.\n\n## 반영\n\n- 입력 가능한 세션과 사람 확인이 있으면 `vhk evolve apply <id>` 뒤 `vhk sync`를 실행한다.\n- 입력할 수 없는 에이전트는 `vhk evolve digest`로 초안만 제안하며 자동 적용하지 않는다.\n- 같은 교훈이 둘 이상의 VHK 프로젝트에서 확인되면 공개 템플릿 개선 후보로 검토한다.\n\nCLI 결함을 learn만으로 끝내거나, 로컬 memory만 바꾸고 공유할 `RULES.md`를 갱신한 것처럼 말하지 않는다.\n"
      }
    },
    {
      "name": "vhk-dogfood-issue",
      "distribution": "project",
      "platforms": [
        "google-antigravity",
        "claude-code",
        "openai-codex",
        "cursor"
      ],
      "files": {
        "SKILL.md": "---\nname: vhk-dogfood-issue\ndescription: VHK CLI나 하네스 결함을 재현·분류하고 승인된 경우 VHK 이슈로 등록할 때 사용한다.\n---\n\n# VHK Dogfood Issue\n\n먼저 결함의 소유 위치를 나눈다.\n\n| 유형 | 처리 위치 |\n|---|---|\n| VHK 명령·doctor·review·receipt 결함 | VHK 저장소 |\n| 현재 프로젝트의 제품 버그 | 현재 프로젝트 |\n| 공통 작업 배선 누락 | 프로젝트 Skill/RULES, 여러 프로젝트에 공통이면 VHK 개선 후보 |\n\n## 절차\n\n1. 최소 명령, 종료 코드, `vhk --version`으로 재현한다.\n2. VHK 저장소의 기존 이슈에서 같은 증상을 검색한다.\n3. 재현·기대·실제·환경을 담은 초안을 프로젝트의 로컬 임시 경로에 작성한다.\n4. 사용자가 “등록해”처럼 외부 등록을 명시 승인한 경우에만 이슈를 만든다.\n5. 필요한 경우 `vhk learn \"dogfood: ...\"`로 로컬 교훈을 남긴다.\n\n사용자 승인 없이 외부 이슈를 만들거나 현재 프로젝트 버그를 VHK 저장소에 등록하지 않는다.\n"
      }
    },
    {
      "name": "vhk-goal-health",
      "distribution": "project",
      "platforms": [
        "google-antigravity",
        "claude-code",
        "openai-codex",
        "cursor"
      ],
      "files": {
        "SKILL.md": "---\nname: vhk-goal-health\ndescription: VHK Goal 파일이 스키마 오류로 무시되거나 review가 Goal을 찾지 못할 때 진단·복구한다.\n---\n\n# VHK Goal Health\n\n`vhk goal list`와 `vhk review`를 실행해 스키마 오류·무시 파일인지, 모든 Goal이 정상 DONE인 종료\n상태인지 먼저 구분한다. 정상 종료라면 파일을 고치지 않는다.\n\n스키마가 깨진 Goal만 다음 계약에 맞춘다.\n\n```yaml\n---\ntype: goal\nid: 4\ntitle: ...\nstatus: IN_PROGRESS\n---\n```\n\n상태는 `NOT_STARTED`, `IN_PROGRESS`, `DONE`, `BLOCKED`, `CANCELED`, `DEFERRED`, `OBSERVING`\n중 프로젝트 계약이 허용하는 값을 쓴다.\n레거시는 `active` → `IN_PROGRESS`, `done` → `DONE`, `pending` → `NOT_STARTED`로 옮긴다.\n검증은 `vhk goal list`, `vhk goal peek`, `vhk review` 순서로 한다.\n\n도구가 유효한 레거시 상태를 경고 없이 무시한다면 Goal 파일을 계속 바꾸지 말고 VHK 제품 결함으로 분류한다.\n"
      }
    },
    {
      "name": "vhk-bootstrap-cursor",
      "distribution": "project",
      "platforms": [
        "google-antigravity",
        "claude-code",
        "openai-codex",
        "cursor"
      ],
      "files": {
        "SKILL.md": "---\nname: vhk-bootstrap-cursor\ndescription: Cursor 프로젝트에 VHK를 설치하고 공통 Agent Skills와 검증 루프를 연결할 때 사용한다.\n---\n\n# VHK Bootstrap Cursor\n\n목표는 `vhk doctor` green, Goal·receipt·review·learn 연결, gate 1회 통과다.\n\n## 설치\n\n```text\nvhk doctor\nvhk context\nvhk brief\nvhk sync\nvhk mcp-init\n```\n\n`vhk goal list`에서 스키마 오류가 보이면 **vhk-goal-health**를 사용한다. Goal이 하나도 없다면\n프로젝트 원본 문서에서 작업 단위를 정한 뒤 Goal 카드를 만든다.\n\n## 기대 산출물\n\n| 산출물 | 역할 |\n|---|---|\n| `.cursor/rules/` | 항상 적용되는 프로젝트 규칙 |\n| `.agents/skills/` | Antigravity·Codex·Cursor가 함께 읽는 VHK Skill |\n| `.claude/skills/` | 같은 정본에서 만든 Claude Code 관리 사본 |\n| `.cursor/hooks.json` | Cursor 세션 훅 |\n| `docs/context/agent-compact.md` | 짧은 프로젝트 진입점 |\n\n신규 설치는 같은 Skill을 `.cursor/skills`에 중복 생성하지 않는다. 기존 `.cursor/skills`는 사용자\n수정 가능성이 있으므로 자동 삭제·이동·덮어쓰기하지 않는다.\n\n## 검증\n\n```text\nvhk pattern detect\nvhk verify\nvhk receipt\nvhk review\n```\n\nreview exit 1이면 `vhk goal list`로 원인을 나눈다. 스키마 오류만 goal-health로 복구하고, 모든 Goal이\n정상 DONE인 종료는 review `N/A`로 처리한다. bootstrap 중 VHK CLI 결함은 **vhk-dogfood-issue**로 보낸다.\n"
      }
    }
  ]
}
// VHK-GENERATED-AGENT-SKILLS:END

export const AGENT_SKILL_DISCOVERY_ROOTS = Object.freeze({
  'google-antigravity': '.agents/skills',
  'claude-code': '.claude/skills',
  'openai-codex': '.agents/skills',
  cursor: '.agents/skills',
} satisfies Record<AgentSkillPlatform, string>)

export const AGENT_SKILL_MANIFEST = GENERATED_AGENT_SKILL_BUNDLE

const SOURCE_MANIFEST_REL = '.agents/skills/manifest.json'
const GENERATED_BUNDLE_REL = 'src/lib/agent-skill-templates.ts'
const MANAGED_MARKER = /^<!-- vhk-agent-skill: ([a-z0-9-]+)@(\d+) source=\.agents\/skills sha256=([a-f0-9]{64}) -->$/

const LEGACY_UNMANAGED_HASHES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  '.claude/skills/vhk-auto/SKILL.md': [
    '06c308e08c02f4b4d463b17f41a1ccd2196b8058db622e7eee396a0a741a9819',
  ],
  '.claude/skills/overnight-vhk-auto/SKILL.md': [
    '4096d048e5a20359d06b0d7771eadc01d77ce1647f946cbc3a1d24ab8ff3f314',
  ],
})

// 번들 본문이 바뀐 뒤에도 자동 갱신할 과거 관리본만 경로·버전·해시로 명시한다.
// 자체 해시는 사용자도 다시 계산할 수 있으므로, 이 목록에 없는 과거 본문은 보존 충돌이다.
const LEGACY_MANAGED_HASHES: Readonly<
  Record<string, Readonly<Record<number, readonly string[]>>>
> = Object.freeze({
  '.agents/skills/vhk-goal-health/SKILL.md': {
    1: ['328c2c376fbb993bbf238a71087f9c864cf07163176bf262433a5e36f7c78a56'],
  },
  '.claude/skills/vhk-goal-health/SKILL.md': {
    1: ['328c2c376fbb993bbf238a71087f9c864cf07163176bf262433a5e36f7c78a56'],
  },
  '.claude/skills/vhk-auto/SKILL.md': {
    1: ['4a5d60709dda0375234deb4426ee523143cbf70c604f66deb5bc430bf5f50532'],
  },
})

function normalizeContent(content: string): string {
  return content.replace(/\r\n/g, '\n')
}

function canonicalContent(content: string): string {
  const normalized = normalizeContent(content)
  return normalized.endsWith('\n') ? normalized : `${normalized}\n`
}

function contentHash(content: string): string {
  return createHash('sha256').update(canonicalContent(content), 'utf-8').digest('hex')
}

function managedContent(skill: AgentSkillDefinition, content: string): string {
  const canonical = canonicalContent(content)
  const marker = `<!-- vhk-agent-skill: ${skill.name}@${GENERATED_AGENT_SKILL_BUNDLE.bundleVersion} source=.agents/skills sha256=${contentHash(canonical)} -->`
  return `${canonical}${marker}\n`
}

interface ParsedManagedContent {
  name: string
  version: number
  hash: string
  body: string
}

function parseManagedContent(content: string): ParsedManagedContent | null {
  const lines = normalizeContent(content).split('\n')
  let markerIndex = lines.length - 1
  while (markerIndex >= 0 && lines[markerIndex] === '') markerIndex -= 1
  if (markerIndex < 0) return null
  const match = MANAGED_MARKER.exec(lines[markerIndex])
  if (match === null) return null
  const body = canonicalContent(lines.slice(0, markerIndex).join('\n'))
  return {
    name: match[1],
    version: Number(match[2]),
    hash: match[3],
    body,
  }
}

function sourceManifestContent(): string {
  return `${JSON.stringify({
    schemaVersion: GENERATED_AGENT_SKILL_BUNDLE.schemaVersion,
    bundleVersion: GENERATED_AGENT_SKILL_BUNDLE.bundleVersion,
    skills: GENERATED_AGENT_SKILL_BUNDLE.skills.map(({ name, distribution, platforms, files }) => ({
      name,
      distribution,
      platforms,
      files: Object.keys(files),
    })),
  }, null, 2)}\n`
}

function comparableJson(content: string): string | null {
  try {
    const parsed: unknown = JSON.parse(content)
    return JSON.stringify(parsed)
  } catch {
    return null
  }
}

function isSourceRepository(rootDir: string): boolean {
  return fs.existsSync(path.join(rootDir, ...GENERATED_BUNDLE_REL.split('/')))
    && fs.existsSync(path.join(rootDir, ...SOURCE_MANIFEST_REL.split('/')))
}

function hasUnsafeLink(rootDir: string, relativePath: string): boolean {
  const resolvedRoot = path.resolve(rootDir)
  const resolvedTarget = path.resolve(rootDir, ...relativePath.split('/'))
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    return true
  }

  let current = resolvedRoot
  for (const segment of relativePath.split('/')) {
    current = path.join(current, segment)
    try {
      if (fs.lstatSync(current).isSymbolicLink()) return true
    } catch (error) {
      if (
        typeof error === 'object'
        && error !== null
        && 'code' in error
        && error.code === 'ENOENT'
      ) {
        break
      }
      return true
    }
  }
  return false
}

type ManagedState = 'current' | 'updatable' | 'conflict'

function classifyManagedFile(
  relativePath: string,
  skill: AgentSkillDefinition,
  canonical: string,
  existing: string,
): ManagedState {
  const expected = managedContent(skill, canonical)
  if (normalizeContent(existing) === normalizeContent(expected)) return 'current'

  const parsed = parseManagedContent(existing)
  if (parsed !== null) {
    if (parsed.name !== skill.name) return 'conflict'
    if (contentHash(parsed.body) !== parsed.hash) return 'conflict'
    if (parsed.version >= GENERATED_AGENT_SKILL_BUNDLE.bundleVersion) return 'conflict'
    const knownHashes = LEGACY_MANAGED_HASHES[relativePath]?.[parsed.version] ?? []
    return parsed.hash === contentHash(canonical) || knownHashes.includes(parsed.hash)
      ? 'updatable'
      : 'conflict'
  }

  if (normalizeContent(existing) === normalizeContent(canonicalContent(canonical))) return 'updatable'
  const legacyHashes = LEGACY_UNMANAGED_HASHES[relativePath] ?? []
  return legacyHashes.includes(contentHash(existing)) ? 'updatable' : 'conflict'
}

interface AgentSkillFilePlan {
  skill: AgentSkillDefinition
  relativePath: string
  content: string
  sourceCanonical: boolean
  exists: boolean
  state: 'missing' | ManagedState
}

function selectedSkills(rootDir: string): AgentSkillDefinition[] {
  const sourceRepository = isSourceRepository(rootDir)
  return GENERATED_AGENT_SKILL_BUNDLE.skills.filter(
    (skill) => sourceRepository || skill.distribution === 'project',
  )
}

function legacyCursorConflicts(rootDir: string): string[] {
  const conflicts: string[] = []
  for (const skill of selectedSkills(rootDir)) {
    const relativePath = `.cursor/skills/${skill.name}`
    const fullPath = path.join(rootDir, ...relativePath.split('/'))
    try {
      fs.lstatSync(fullPath)
      conflicts.push(relativePath)
    } catch (error) {
      if (
        typeof error === 'object'
        && error !== null
        && 'code' in error
        && error.code === 'ENOENT'
      ) {
        continue
      }
      conflicts.push(relativePath)
    }
  }
  return conflicts
}

function buildAgentSkillPlan(rootDir: string): AgentSkillFilePlan[] {
  const sourceRepository = isSourceRepository(rootDir)
  const plan: AgentSkillFilePlan[] = []

  for (const skill of selectedSkills(rootDir)) {
    for (const [fileName, canonical] of Object.entries(skill.files)) {
      const targets = sourceRepository
        ? [
            { root: '.agents/skills', sourceCanonical: true },
            { root: '.claude/skills', sourceCanonical: false },
          ]
        : [
            { root: '.agents/skills', sourceCanonical: false },
            { root: '.claude/skills', sourceCanonical: false },
          ]

      for (const target of targets) {
        const relativePath = `${target.root}/${skill.name}/${fileName}`
        const fullPath = path.join(rootDir, ...relativePath.split('/'))
        if (hasUnsafeLink(rootDir, relativePath)) {
          plan.push({
            skill,
            relativePath,
            content: target.sourceCanonical ? canonicalContent(canonical) : managedContent(skill, canonical),
            sourceCanonical: target.sourceCanonical,
            exists: true,
            state: 'conflict',
          })
          continue
        }
        const exists = fs.existsSync(fullPath)
        if (!exists) {
          plan.push({
            skill,
            relativePath,
            content: target.sourceCanonical ? canonicalContent(canonical) : managedContent(skill, canonical),
            sourceCanonical: target.sourceCanonical,
            exists: false,
            state: 'missing',
          })
          continue
        }

        let existing: string
        try {
          existing = fs.readFileSync(fullPath, 'utf-8')
        } catch {
          plan.push({
            skill,
            relativePath,
            content: target.sourceCanonical ? canonicalContent(canonical) : managedContent(skill, canonical),
            sourceCanonical: target.sourceCanonical,
            exists: true,
            state: 'conflict',
          })
          continue
        }

        const state = target.sourceCanonical
          ? normalizeContent(existing) === normalizeContent(canonicalContent(canonical))
            ? 'current'
            : 'conflict'
          : classifyManagedFile(relativePath, skill, canonical, existing)

        plan.push({
          skill,
          relativePath,
          content: target.sourceCanonical ? canonicalContent(canonical) : managedContent(skill, canonical),
          sourceCanonical: target.sourceCanonical,
          exists: true,
          state,
        })
      }
    }
  }
  return plan
}

export interface AgentSkillSyncCheckResult {
  missing: string[]
  drifted: string[]
  conflicts: string[]
  bundleDrift: string[]
  ok: boolean
}

export function checkAgentSkillSync(rootDir: string): AgentSkillSyncCheckResult {
  const plan = buildAgentSkillPlan(rootDir)
  const missing = plan.filter((item) => item.state === 'missing').map((item) => item.relativePath)
  const drifted = plan.filter((item) => item.state === 'updatable').map((item) => item.relativePath)
  const conflicts = [
    ...plan.filter((item) => item.state === 'conflict').map((item) => item.relativePath),
    ...legacyCursorConflicts(rootDir),
  ]
  const bundleDrift: string[] = []

  if (isSourceRepository(rootDir)) {
    const manifestPath = path.join(rootDir, ...SOURCE_MANIFEST_REL.split('/'))
    try {
      const manifest = fs.readFileSync(manifestPath, 'utf-8')
      if (comparableJson(manifest) !== comparableJson(sourceManifestContent())) {
        bundleDrift.push(SOURCE_MANIFEST_REL)
      }
    } catch {
      bundleDrift.push(SOURCE_MANIFEST_REL)
    }
    if (plan.some((item) => item.sourceCanonical && item.state === 'conflict')) {
      bundleDrift.push(GENERATED_BUNDLE_REL)
    }
  }

  return {
    missing,
    drifted,
    conflicts,
    bundleDrift: [...new Set(bundleDrift)],
    ok: missing.length === 0 && drifted.length === 0 && conflicts.length === 0 && bundleDrift.length === 0,
  }
}

export interface InstallAgentSkillsResult {
  created: string[]
  updated: string[]
  unchanged: string[]
  conflicts: string[]
}

export function installAgentSkills(rootDir: string = process.cwd()): InstallAgentSkillsResult {
  const created: string[] = []
  const updated: string[] = []
  const unchanged: string[] = []
  const conflicts: string[] = []

  const plan = buildAgentSkillPlan(rootDir)
  const sourceConflictSkills = new Set(
    plan
      .filter((item) => item.sourceCanonical && item.state !== 'current')
      .map((item) => item.skill.name),
  )
  const conflictScopes = new Set(
    plan
      .filter((item) => item.state === 'conflict')
      .map((item) => item.relativePath.split('/').slice(0, 3).join('/')),
  )

  for (const item of plan) {
    const scope = item.relativePath.split('/').slice(0, 3).join('/')
    if (sourceConflictSkills.has(item.skill.name)) {
      if (item.state !== 'current') conflicts.push(item.relativePath)
      continue
    }
    if (conflictScopes.has(scope)) {
      if (item.state === 'conflict') conflicts.push(item.relativePath)
      else if (item.state === 'current') unchanged.push(item.relativePath)
      continue
    }
    if (item.sourceCanonical) {
      if (item.state === 'current') unchanged.push(item.relativePath)
      else conflicts.push(item.relativePath)
      continue
    }
    if (item.state === 'current') {
      unchanged.push(item.relativePath)
      continue
    }
    if (item.state === 'conflict') {
      conflicts.push(item.relativePath)
      continue
    }
    const fullPath = path.join(rootDir, ...item.relativePath.split('/'))
    try {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true })
      atomicWriteFile(fullPath, item.content)
      if (item.exists) updated.push(item.relativePath)
      else created.push(item.relativePath)
    } catch {
      conflicts.push(item.relativePath)
    }
  }

  conflicts.push(...legacyCursorConflicts(rootDir))

  return { created, updated, unchanged, conflicts: [...new Set(conflicts)] }
}

export function projectSkillTemplates(): Readonly<Record<string, string>> {
  return Object.freeze(Object.fromEntries(
    GENERATED_AGENT_SKILL_BUNDLE.skills
      .filter((skill) => skill.distribution === 'project')
      .map((skill) => [skill.name, managedContent(skill, skill.files['SKILL.md'] ?? '')]),
  ))
}
