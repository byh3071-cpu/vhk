# VHK Autopilot 1단계 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** VHK 프로젝트에서 active goal 1개를 사람 개입 없이 한 바퀴 자율 구동하고 멈춰 핵심 보고하는 클로드 코드 스킬 `/vhk-auto`를 만든다(코드 변경 0, 외부 발송·집행 0).

**Architecture:** 단일 산출물 = `.claude/skills/vhk-auto/SKILL.md`(지침만). 새 코드·의존성 없음. 스킬은 기존 VHK 명령(`vhk loop-brief`/`remind`/`work`/`verify`/`review`/`mission check`/`blocker`)과 `/code-review` 스킬만 호출. 위험·집행(이슈 등록·dedupe·rate-limit)은 2단계 `vhk auto` 명령으로 이연.

**Tech Stack:** Markdown 스킬(Claude Code skill 포맷), git. 빌드·테스트 코드 없음 — 검증은 구조 점검 + 독푸딩 수용기준.

**Spec:** `docs/superpowers/specs/2026-06-16-vhk-autopilot-mvp-design.md` (불변조건 INV-1..8 = 이 플랜의 정합 기준)

---

## File Structure

| 파일 | 책임 | 작업 |
|------|------|------|
| `.claude/skills/vhk-auto/SKILL.md` | 오토파일럿 루프·불변조건·보고 규약(SoT) | Create (Task 1) |
| `~/.claude/skills/vhk-auto/SKILL.md` | 글로벌 복제(POS 등에서 호출) | Create (Task 2) |
| `README.md` (또는 `COMMANDS.md` 부록) | `/vhk-auto` 사용법 | Modify (Task 2) |
| `docs/log/2026-06-16-autopilot-mvp.md` | 세션 dev log(append-only) | Create (Task 3) |

> 모든 변경이 `.claude/`·`docs/`·`README` (= src/** 아님) → 커밋 메시지에 `[skip-record]`. check-records 훅 비대상.

---

## Task 1: 스킬 본문 작성 (SoT)

**Files:**
- Create: `.claude/skills/vhk-auto/SKILL.md`

- [ ] **Step 1: 스킬 파일 생성 (전체 내용 그대로)**

`.claude/skills/vhk-auto/SKILL.md` 에 아래를 **그대로** 쓴다:

````markdown
---
name: vhk-auto
description: VHK 프로젝트에서 active goal 1개를 사람 개입 없이 한 바퀴 자율 구동(앵커→개발→검증→적대리뷰→commit)하고 멈춰 핵심 보고. 외부 발송·이슈 등록·코드 집행 0(1단계 MVP). 트리거 - "오토파일럿", "자동으로 돌려", "혼자 한 바퀴", "vhk auto", "goal 자동 진행".
---

# VHK Autopilot (1단계 MVP)

VHK로 개발 중인 프로젝트에서 **active goal 카드 1개**를 사람 개입 없이 한 바퀴 돌리고,
끝나면 **멈춰서 핵심만 보고**한다. 위험한 건 하지 않는다 — 외부 발송·이슈 등록·코드 집행은
2단계 `vhk auto` 명령 영역이다.

## 🔒 불변조건 (절대 어기지 마라)
- **INV-1** 진행 허가 = `vhk verify` green(결정론)에만. 적대리뷰(LLM)는 "중단 트리거"로만 —
  "진행해도 된다"는 긍정 판정 금지.
- **INV-2** 외부 발송 0. `gh issue create` 호출 금지. 문제는 채팅 보고 + 이슈 초안 텍스트까지만.
- **INV-3** 집행 코드 0. dedupe·rate-limit·이슈 jsonl 영속 금지. (dev log append 는 허용·필수 — INV-5)
- **INV-4** 자동 합·불 입력 = `vhk verify` 의 `.vhk/reports/latest.json` + 각 명령 exit code 만.
  `vhk review`·`vhk mission check` 는 exit code 만 신뢰하고 stdout 텍스트는 파싱하지 말 것
  (텍스트는 적대 판단의 신호로만 읽는다).
- **INV-5** commit 전 `docs/log/<오늘날짜>-autopilot.md` 에 1줄 append + `git add` 필수.
  안 하면 check-records 훅(exit 2)이 막는다. src 실코드 커밋에 `[skip-record]` 우회 금지.
- **INV-6** critical 결함 발견 또는 `vhk verify` 연속 2회 red 시 `.vhk/HARD_STOP` 파일 생성하고 종료.
  매 시작(0번)에 `.vhk/HARD_STOP` 존재를 먼저 확인한다.
- **INV-7** commit 만 자동. push·PR·머지·publish 는 절대 자동 금지.
- **INV-8** 적대리뷰는 `/code-review` 스킬만 사용. cavecrew·Workflow 다중에이전트 쓰지 마라
  (이 환경에 없을 수 있음).

## 루프 (1회 호출 = active goal 카드 1개)
0. **안전 확인**: `.vhk/HARD_STOP` 존재? → 있으면 즉시 중단, 사유 보고하고 종료. (INV-6)
1. **앵커 재주입**: `vhk loop-brief` 와 `vhk remind` 실행 → 산출 파일
   (`.vhk/loop-brief.md`·`.vhk/remind.md`) 를 Read 해서 의도·치명규칙을 컨텍스트에 넣는다.
2. **상태 파악**: `vhk work`(또는 `vhk goal next`) 실행 → 지금의 active goal 카드 1개를 식별한다.
3. **개발**: 그 카드의 미션을 구현한다. test-first(실패 테스트 먼저 → 통과 구현) + 기존 코딩 규칙 준수.
4. **결정론 게이트**: `vhk verify` 실행 → `.vhk/reports/latest.json` 을 읽는다.
   green(typecheck/test/build/secure 통과) = 진행 허가 / red = 게이트 실패 카운트 +1. (INV-1·INV-4)
5. **적대 검증**: `/code-review` 1패스(자유텍스트). 추가로 `vhk review`·`vhk mission check` 실행 —
   exit code 는 결정론 중단신호, stdout 텍스트는 적대판단 신호로만(파싱 X, INV-4).
   판단 규칙: "치명(critical) 결함이 1개라도 있나? 불확실하면 치명으로 간주" → 있으면 중단. (보수적)
6. **종결 분기**:
   - **합격**(verify green AND 적대 치명 0):
     1) `docs/log/<오늘날짜>-autopilot.md` 에 "무엇을 했고 검증 결과" 1줄 append + `git add`. (INV-5)
     2) 작은 commit 1개. **commit 만** — push/PR 금지. (INV-7)
     3) goal 완주 → 정지 + 핵심 보고 → 종료.
   - **critical 발견 또는 verify 연속 2회 red**:
     1) `.vhk/HARD_STOP` 파일을 사유와 함께 생성. (INV-6)
     2) 핵심 보고 → 종료(사람이 `vhk resume --confirm` 하기 전엔 재진입 금지).
   - **3사이클 진전 없음**:
     1) `vhk blocker "<증상>"` (독푸딩 중이면 `[dogfood]` 태그로 HARD_STOP 임계 우회 가능) → 종료.
7. **보고**(두괄식, 핵심 먼저):
   `[결과 1줄] → [한 일] → [문제 있으면 핵심 + 이슈 초안 텍스트]`.
   이슈는 **초안 텍스트만** 제시한다 — 등록은 사람이 2단계 `vhk auto` 로 결정한다. (INV-2)

## 판정 모델
- **진행 허가**(commit 해도 되나?) = `vhk verify latest.json` 이 green 인가 (결정론, LLM 무관).
- **중단**(멈춰야 하나?) = verify red OR 적대 치명 OR `.vhk/HARD_STOP`.
- 적대리뷰는 "멈출 이유"만 찾는다. 불확실하면 치명으로 본다.

## 보고 규약
- 문제·정리는 **핵심 먼저(두괄식)**. 설계·이론·플랜 설명은 자세히 해도 됨.
- 비개발자 대상 — 전문용어는 쉬운 말로 풀이.
````

- [ ] **Step 2: 구조 검증 — 불변조건 8개 + frontmatter 존재 확인**

Run (PowerShell):
```powershell
$f = ".claude/skills/vhk-auto/SKILL.md"
1..8 | ForEach-Object { if (-not (Select-String -Path $f -Pattern "INV-$_" -Quiet)) { Write-Host "MISSING INV-$_" } }
if (Select-String -Path $f -Pattern '^name: vhk-auto' -Quiet) { Write-Host "frontmatter name OK" } else { Write-Host "MISSING name" }
if (Select-String -Path $f -Pattern '^description:' -Quiet) { Write-Host "frontmatter desc OK" } else { Write-Host "MISSING desc" }
```
Expected: `frontmatter name OK` + `frontmatter desc OK`, **그리고 MISSING 출력 없음**(INV-1..8 모두 존재).

- [ ] **Step 3: 금지 패턴 부재 확인 (INV-2·INV-8 정합)**

Run (PowerShell):
```powershell
$f = ".claude/skills/vhk-auto/SKILL.md"
if (Select-String -Path $f -Pattern 'gh issue create' -Quiet) { Write-Host "WARN: gh issue create 언급 — 금지 맥락인지 확인" }
if (Select-String -Path $f -Pattern 'cavecrew|Workflow 다중' -Quiet) { Write-Host "INFO: cavecrew/Workflow 언급 — 제외 맥락인지 확인" }
```
Expected: 둘 다 **금지/제외 맥락으로만** 등장(허용 절차로 등장하면 안 됨). 본문 검토로 확인.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/vhk-auto/SKILL.md
git commit -m "feat(autopilot): vhk-auto 스킬 본문 — 1단계 MVP 루프+불변조건 [skip-record]" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 글로벌 설치 + 사용법 문서

**Files:**
- Create: `~/.claude/skills/vhk-auto/SKILL.md` (Task 1 산출물 복제)
- Modify: `README.md` (사용법 섹션 추가)

- [ ] **Step 1: 글로벌 스킬 디렉토리 생성 + 복제**

Run (PowerShell):
```powershell
$dst = Join-Path $env:USERPROFILE ".claude/skills/vhk-auto"
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item ".claude/skills/vhk-auto/SKILL.md" (Join-Path $dst "SKILL.md") -Force
Test-Path (Join-Path $dst "SKILL.md")
```
Expected: `True` (글로벌 경로에 SKILL.md 존재 → POS 등 다른 프로젝트에서 `/vhk-auto` 호출 가능).

- [ ] **Step 2: README 사용법 섹션 추가**

`README.md` 의 적절한 위치(명령/스킬 안내 근처)에 아래 섹션을 추가한다:

```markdown
## 🤖 오토파일럿 스킬 `/vhk-auto` (1단계 MVP)

VHK 프로젝트에서 **active goal 1개를 혼자 한 바퀴 돌리고 멈춰 보고**하는 클로드 코드 스킬.

- 호출: 클로드 코드에서 `/vhk-auto` (또는 "오토파일럿으로 한 바퀴 돌려").
- 하는 일: 앵커 재주입(`loop-brief`+`remind`) → 개발(TDD) → `vhk verify` 결정론 게이트
  → `/code-review` 적대검증 → 합격 시 작은 commit → 끝나면 핵심 보고.
- **안전(1단계 한계)**: 외부 발송·이슈 등록·`gh` 호출 **안 함**. commit 만 자동(push·PR·publish 금지).
  문제는 "이슈 초안 텍스트"로만 보고 — 실제 GitHub 등록은 2단계 `vhk auto` 명령(예정).
- 설치(다른 프로젝트에서 쓰려면): 이 스킬은 글로벌 `~/.claude/skills/vhk-auto/` 에 복제되어 있어야 함.

> 2단계 로드맵: CLI `vhk auto` + MCP `vhk_auto` 로 승격 시 이슈 자동등록(safeExecFile gh·dedupe·
> undo 승인 패턴·secure 강제)이 결정론 코드로 추가된다.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(autopilot): /vhk-auto 사용법 + 글로벌 설치 안내 [skip-record]" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> 참고: `~/.claude/skills/` 는 vhk 레포 밖이라 커밋되지 않음(글로벌 복제는 로컬 설치 행위).

---

## Task 3: dev log 기록

**Files:**
- Create: `docs/log/2026-06-16-autopilot-mvp.md`

- [ ] **Step 1: dev log 작성 (append-only)**

`docs/log/2026-06-16-autopilot-mvp.md` 에 아래를 쓴다:

```markdown
# 2026-06-16 — VHK Autopilot 1단계 MVP

## 한 일
- 오토파일럿(지휘자) 설계 → 적대 검증(5렌즈, blocker 9·high 16) → 교정 → 스펙·플랜·스킬 작성.
- 1단계 산출물 = `.claude/skills/vhk-auto/SKILL.md` (코드 0, 외부발송·집행 0).

## 결정 (교정안)
- "1단계=순수 지침 스킬"에 외부발송·집행·자동판정을 얹으면 헌법 5곳과 충돌(검증 결론) →
  위험·집행은 2단계 `vhk auto` 코드로 이연, 1단계는 "혼자 한 바퀴 돌고 멈춰 보고"만.
- 불변조건 INV-1..8 로 못박음(진행허가=verify green만 / 발송0 / 집행0 / 판정입력=latest.json+exit /
  commit 전 dev log stage / 멈춤=HARD_STOP 영속 / commit만 자동 / cavecrew·Workflow 제외).

## 교훈
- 자율 설계는 저자 자평 금지 — 독립 적대 검증이 코드까지 까서 "review/mission --json 부재",
  "check-records 훅이 무인 commit 차단", "MCP TTY 없어 승인 프롬프트 불가" 등 실측 결함 7건을 잡음.
- 바깥행동(gh issue)·집행(dedupe)은 LLM 결정경로에서 빼고 결정론 코드로(PAT-003 재확인).

## 다음
- 독푸딩: POS 프로젝트에서 `/vhk-auto` 1회 호출 → 수용기준(스펙 §10) 검증.
- 검증되면 2단계 스펙(`...-issue-pipeline-design.md`) 착수.
```

- [ ] **Step 2: Commit**

```bash
git add docs/log/2026-06-16-autopilot-mvp.md
git commit -m "docs(log): autopilot 1단계 MVP 세션 기록 [skip-record]" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: 독푸딩 수용기준 검증 (실측 게이트 — POS 프로젝트에서)

> 단위테스트 없음(마크다운 스킬). 검증 = 실제 한 바퀴 돌려 불변조건 준수 관찰. **이 Task는 커밋 없음** —
> POS 프로젝트에서 수동 실행하고 결과를 다음 세션 dev log 에 기록.

- [ ] **Step 1: 글로벌 스킬 인식 확인**

POS 프로젝트 디렉토리에서 클로드 코드를 열고 `/vhk-auto` 가 스킬 목록에 뜨는지 확인.
Expected: 스킬이 보임(글로벌 설치 OK).

- [ ] **Step 2: 1회 호출 → goal 1개 완주 또는 정직한 정지**

`/vhk-auto` 1회 호출.
Expected: active goal 1개를 구현→`vhk verify`→`/code-review`→(합격 시) 작은 commit 1개 후 정지+보고,
또는 blocker/HARD_STOP 으로 정직하게 정지.

- [ ] **Step 3: 불변조건 준수 관찰 (스펙 §10 수용기준)**

아래를 눈으로 확인:
1. `vhk verify` red 인데 commit 한 적 **없다** (INV-1).
2. `gh issue create` 가 **호출되지 않았다** (INV-2). → `git log` 및 GitHub 이슈 목록에 신규 0.
3. critical 발견 시 `.vhk/HARD_STOP` 이 생겼고 다음 호출이 0번에서 멈춘다 (INV-6).
4. commit 이 check-records 훅에 막히지 않았다 (INV-5) — 같은 커밋에 dev log staged.
Expected: 4개 모두 준수. 위반 1개라도 있으면 SKILL.md 수정 후 재검증.

- [ ] **Step 4: 결과를 dev log 에 기록**

POS 프로젝트(또는 vhk 레포) 의 다음 dev log 에 "수용기준 4개 결과 + 관찰된 문제"를 append.
유효 결함 발견 시 → 2단계(`vhk auto` 이슈 파이프라인) 백로그로.

---

## Self-Review (작성자 체크)

**Spec coverage:**
- INV-1..8 → Task 1 Step 1 본문 + Step 2 구조검증 + Task 4 Step 3 관찰. ✅
- 산출물(SKILL.md SoT + 글로벌 복제 + README + dev log) → Task 1·2·3. ✅
- 테스트=독푸딩(§10) → Task 4 수용기준 4개로 1:1 매핑. ✅
- 2단계 이연 항목 → 코드/플랜에 미포함(범위 밖) — README·dev log 에 로드맵으로만 언급. ✅

**Placeholder scan:** TBD/TODO/"적절히"/"나중에" 없음. SKILL.md 전체 내용·검증 명령·dev log 내용 모두 실체로 제공. ✅

**Type consistency:** 불변조건 명칭 INV-1..8 이 스펙·SKILL.md·검증 step·수용기준에서 동일. 경로
`.claude/skills/vhk-auto/SKILL.md`·`.vhk/reports/latest.json`·`docs/log/<오늘>-autopilot.md` 일관. ✅

**주의(실행 시):** Task 1 의 SKILL.md 는 펜스 안에 ```` ```markdown ```` 블록을 포함하므로, executor 는
**바깥 4-backtick 펜스 안의 내용만** SKILL.md 로 저장한다(중첩 펜스 보존).
