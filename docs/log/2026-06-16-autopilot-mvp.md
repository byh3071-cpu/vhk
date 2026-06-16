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

## 핸드오프 (2026-06-17 — 독푸딩 보류, 나중에 재개)
**상태:** 1단계 MVP 구현·커밋 완료. 브랜치 `feat/autopilot-mvp` (main +5, 미푸시·미머지, 작업트리 클린).
독푸딩은 사용자가 나중에 하기로 → 이번엔 미실행.

**재개 순서 (다음 세션):**
1. `git checkout feat/autopilot-mvp` → `/vhk-auto` 가 글로벌(`~/.claude/skills/vhk-auto/`)에 설치돼 있음(확인: `Test-Path $env:USERPROFILE\.claude\skills\vhk-auto\SKILL.md`).
2. **Task 4 독푸딩** — POS 프로젝트에서 `/vhk-auto` 1회 호출 → INV 준수 4개 관찰(플랜 Task 4 Step 3):
   ① verify red인데 commit 0  ② `gh issue create` 호출 0  ③ critical 시 `.vhk/HARD_STOP` 생성  ④ commit이 check-records에 안 막힘.
3. 검증 OK → `feat/autopilot-mvp` PR 머지(PR 경유, 사람 승인). 위반 발견 → SKILL.md 수정 후 재검증.
4. 그 다음 → 2단계 스펙 착수.

**참고 SoT:** 스펙 `docs/superpowers/specs/2026-06-16-vhk-autopilot-mvp-design.md` · 플랜 `docs/superpowers/plans/2026-06-16-vhk-autopilot-mvp.md` · 프로젝트 기억 `vhk-autopilot-dogfooding`(매 세션 자동 로드).
**미커밋 작업 없음. 블로커 없음.**

### 갱신 (2026-06-17) — 재개 1순위 = 2단계 스펙 작성
- PR **#291** 생성됨(`feat/autopilot-mvp` → main, docs/skill only). CI 통과 시 머지.
- **재개하면 가장 먼저 = 2단계 스펙 작성**(`autopilot-issue-pipeline`). 사용자 지시로 독푸딩보다 우선.
  - 입력 SoT(이미 결정된 것): MVP 스펙 `§11 로드맵 표` + 적대검증 mustFixBeforeSpec —
    gh safeExecFile·dedupe·rate-limit·undo 승인 패턴·secure 본문 강제·public app-bug 등록 금지·
    CLI `vhk auto`(등록 7항+MCP 30→31)·MCP `vhk_auto`·`vhk review`/`mission check --json` 신규.
  - 흐름: brainstorming 가볍게(결정 대부분 끝남) → 스펙 작성 → writing-plans.
- 그 다음 순서: 독푸딩(Task 4 검증) → 2단계 구현.

## 독푸딩 첫 발견 (2026-06-17) — flaky 테스트 (tool-gap)
- PR #291 CI(windows-latest, node22)에서 `tests/goal.test.ts:533 "goal sync 자연어는 파일 쓰기 전에 confirmation 대상"` **5초 타임아웃 flaky** 발견(win-22 2회 연속, win-24·ubuntu 통과).
- **근본원인:** 이 테스트가 파일 내 `nlp-run.js` 첫 import → 콜드 transform/import 비용(파일 import 24s)이 5초 타임아웃 테스트에 전가, 느린 win-22에서 초과. 로직 자체는 순수·즉시.
- **fix:** 해당 테스트 타임아웃 20000ms + why-comment. 로컬 통과(1.04s). (증상패치 아님 — 원인=타임아웃 과소)
- **분류:** VHK 본체 tool-gap(테스트 인프라). autopilot docs PR과 무관, main에도 있던 기존 결함. **독푸딩이 잡은 첫 실제 버그.**
