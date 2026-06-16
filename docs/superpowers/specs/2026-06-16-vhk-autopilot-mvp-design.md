# 설계: VHK Autopilot — 1단계 MVP (autopilot-mvp)

**날짜:** 2026-06-16
**상태:** 설계 승인 대기 (brainstorming 산출 — 적대 검증 1회 통과 후 교정본)
**범위:** 1단계만. 2단계(이슈 파이프라인)는 별도 스펙 `2026-06-16-vhk-autopilot-issue-pipeline-design.md`(후속).

---

## 1. 배경·목적

비개발자 사용자가 VHK로 프로젝트(현재 독푸딩 대상 = 카페 미니 POS)를 개발할 때,
**검증·리뷰 루프를 매번 손으로 프롬프트**하던 것을 자율화한다.

지금 사용자가 손으로 하는 반복:
> `vhk review`+`verify` 시킴 → 됐나 눈으로 확인 → 클로드 코드 적대검증·코드리뷰 또 돌림 → 또 확인 → 반복.

이 "지휘자(orchestrator)" 역할을 스킬로 옮긴다. **1단계는 클로드 코드 전용 스킬**(빠른 독푸딩),
바깥 발송·코드 집행·자동 등록은 전부 2단계(결정론 코드)로 이연한다.

### 왜 이렇게 잘랐나 (적대 검증 결론)
독립 5렌즈 적대 검증(거버넌스/안전/실현가능성/스코프/내부모순)이 **blocker 9·high 16**을 잡았고,
공통 원인은 "1단계=순수 지침 스킬"에 **외부 발송(gh issue)·결정론 집행(dedupe·rate-limit)·자동 판정**을
얹은 것이었다. 이는 VHK 헌법 5곳과 정면충돌한다(§3). 따라서 **위험·집행은 2단계 코드로 내리고,
1단계는 "혼자 한 바퀴 돌고 멈춰 보고하는" 안전한 지침만** 남긴다.

---

## 2. 범위

### IN (1단계 MVP)
- 클로드 코드 스킬 `/vhk-auto` (한글 별칭 `/오토파일럿`).
- 모드: **goal 1개 완주 후 정지+보고** (단일 모드만).
- 루프: 앵커 재주입 → 상태 파악 → 개발(TDD) → `vhk verify` 결정론 게이트 → 적대검증(중단 트리거) → 합격 시 commit → 정체 시 blocker 이탈.
- 멈춤 안전핀: 매 틱 HARD_STOP 확인 + 실패의 HARD_STOP 영속화.
- 문제 발견 시: **채팅에 핵심 두괄식 보고 + 이슈 초안 텍스트 제시**(등록·파일쓰기 없음).

### OUT (2단계로 이연 — 이번 스펙 아님)
- `gh issue create` 자동 등록, dedupe, rate-limit, 라벨/레포 라우팅.
- 이슈 초안 영속(`issues-draft.jsonl`), 14필드 템플릿, secure 본문 강제.
- CLI `vhk auto`, MCP `vhk_auto`, yohan-brain core-ruleset 규약, sync 배포.
- 적대검증 수단 선택형(B1 4종) · 검증도 4레벨(B2) · 무인 연속(/loop) 모드.
- `vhk review --json` / `vhk mission check --json` 신규(2단계 선행 의존).

---

## 3. 불변조건 (헌법 충돌 방지 — 위반 시 설계 실패)

적대 검증이 잡은 blocker를 **하드 불변조건**으로 박는다. 구현은 이 목록을 어기면 안 된다.

| INV | 내용 | 근거(코드/헌법) |
|-----|------|------|
| INV-1 | **진행 허가는 결정론 게이트(`vhk verify` green)에만.** LLM 적대판정은 "진행 허가" 권한 없음 — **"중단 트리거"로만** 작동. | PAT-003 (LLM을 되돌리기 어려운 작업의 결정경로에서 제외) |
| INV-2 | **1단계는 외부 발송 0.** `gh issue create` 호출 금지. 문제는 채팅 보고 + 초안 텍스트까지만. | 글로벌/PRD: 발송은 LLM 빼고 룰+하드리밋 |
| INV-3 | **1단계는 집행 코드 0.** 이슈 버퍼 영속(`issues-draft.jsonl`)·dedupe·rate-limit 금지(스킬은 LLM 지침일 뿐 강제 불가). 영속·집행은 2단계 코드. (예외: dev log append+stage는 허용 — INV-5 필수 절차) | 검증 blocker #5 (형식 모순) |
| INV-4 | **자동 합·불 입력 = `vhk verify`의 `latest.json` + 각 명령 exit code만.** `review`·`mission check`의 **exit code는 결정론 신호로 사용 가능**(예: `mission check` exit 1 = forbidden 위반 → 중단), 단 **stdout 텍스트 파싱 금지** — 텍스트는 적대 판단의 LLM 신호로만. | 코드확인: review/mission `--json` 부재, verify만 `latest.json` |
| INV-5 | **commit 전 dev log append+stage 필수.** src/** 변경 commit은 `docs/log/<오늘>-autopilot.md`(append-only)를 stage하지 않으면 `check-records` 훅(exit 2)에 막힌다. src 실코드에 `[skip-record]` 우회 금지. | 코드확인: `scripts/check-records.mjs` |
| INV-6 | **멈춤은 영속화.** critical 발견·게이트 연속 2회 실패 시 `.vhk/HARD_STOP` 생성 → 사람 `vhk resume --confirm` 전엔 재진입 불가. 매 틱 0번에 HARD_STOP 확인. | 코드확인: HARD_STOP 자동생성은 blocker≥3 단일 트리거뿐(state-files.ts:65) → 다른 멈춤은 미연동 = 무한 재시도 위험 |
| INV-7 | **commit만 자동.** push·PR·머지·publish는 자동 절대 금지. | 헌법 #119 / governance |
| INV-8 | **인프라 가정 금지.** 이 레포에 `.claude/agents`·cavecrew 부재 → 1단계 적대검증은 `/code-review` 스킬(가용 확인됨)만 사용. Workflow 다중에이전트·cavecrew는 1단계 제외. | Glob 확인: `.claude/agents` 없음 |

---

## 4. 아키텍처

단일 산출물: **클로드 코드 스킬 1개**.

```
~/.claude/skills/vhk-auto/SKILL.md      ← 글로벌(POS 등 모든 프로젝트에서 호출)
<vhk-repo>/.claude/skills/vhk-auto/SKILL.md  ← SoT 복제(레포가 진실원천)
```

스킬은 **지침(절차 + 불변조건 + 보고 규약)** 만 담는다. 새 코드·새 의존성 없음.
스킬이 호출하는 것은 전부 **기존** VHK 명령 + 클로드 코드 내장 기능(Bash로 `vhk`/`git` 호출,
`/code-review` 스킬, TodoWrite, Read/Edit/Write).

### 단위 경계 (한 가지 책임씩)
- **앵커 단계**: 컨텍스트 재주입만 (`vhk loop-brief`·`vhk remind` 실행 후 산출 파일 Read).
- **개발 단계**: active goal 카드 1개 구현 (TDD).
- **게이트 단계**: `vhk verify` 실행 → `latest.json` 읽어 결정론 합·불.
- **적대 단계**: `/code-review` 1패스 → 자유텍스트 → "치명 발견?" 보수적 판단(중단 트리거).
- **종결 단계**: 합격 → dev log append + commit / 정체 → blocker / critical·게이트실패 → HARD_STOP.
- **보고 단계**: 채팅 두괄식 + 이슈 초안 텍스트(등록 X).

---

## 5. 루프 상세 (1 호출 = goal 카드 1개)

```
0. 안전 확인   : .vhk/HARD_STOP 존재? → 있으면 즉시 중단·보고하고 종료 (INV-6)
1. 앵커 재주입 : vhk loop-brief; vhk remind  → 산출(.vhk/loop-brief.md·remind.md) Read
2. 상태 파악   : vhk work (또는 vhk goal next) → active goal 카드 식별
3. 개발        : 카드 미션 구현. TDD 기본(실패 테스트 먼저 → 통과 구현). 기존 코딩 규칙 준수.
4. 결정론 게이트: vhk verify  → .vhk/reports/latest.json 읽기
                  - green(typecheck/test/build/secure 통과) = 진행 허가 (INV-1)
                  - red = 게이트 실패 카운트+1
5. 적대 검증   : /code-review 1패스(자유텍스트) + vhk review·vhk mission check 실행
                  → exit code = 결정론 중단신호 / stdout 텍스트 = LLM 적대판단 신호(파싱 X / INV-4)
                  - "치명(critical) 결함 1개라도? 불확실하면 치명으로 간주" = 중단 트리거 (INV-1, 보수적)
6. 종결 분기   :
   - 합격(게이트 green AND 적대 치명 0):
       a. docs/log/<오늘>-autopilot.md append (무엇을/검증결과 1줄, append-only) + git add (INV-5)
       b. 작은 commit 1개 (commit만 — push/PR 금지, INV-7)
       c. goal 완주 → 정지 + 핵심 보고 → 종료
   - critical 발견 또는 게이트 연속 2회 실패:
       a. .vhk/HARD_STOP 생성(이유 기록) (INV-6) → 핵심 보고 → 종료(사람 resume 대기)
   - 3사이클 진전 없음:
       a. vhk blocker "<증상>" (독푸딩 중이면 [dogfood] 태그로 HARD_STOP 임계 우회 가능) → 종료
7. 보고        : 채팅에 두괄식 — [결과 1줄] → [무엇을 했나] → [문제 있으면 핵심+이슈 초안 텍스트]
                  (이슈 등록·파일 영속은 1단계에서 안 함 — 2단계 vhk auto가 함, INV-2·INV-3)
```

### 게이트 실패 카운트
- 같은 호출(goal 1개) 내 `vhk verify` red 누적 ≥2 → INV-6 HARD_STOP. (단일 goal 한 바퀴라
  iteration 폭주 위험은 구조적으로 작다 — 무인 연속은 2단계.)

---

## 6. 판정 모델 (가장 중요 — INV-1 구현)

```
진행 허가 (commit 해도 되나?)  = vhk verify latest.json 이 green 인가 (결정론, LLM 무관)
중단 트리거 (멈춰야 하나?)      = (a) verify red  OR  (b) 적대검증이 치명 결함 지목  OR  (c) HARD_STOP
```

- LLM(`/code-review`)은 **"멈출 이유를 찾는" 역할만**. "진행해도 된다"는 긍정 판정 권한 없음.
- 적대검증 출력은 **자유텍스트**(구조화 강제 시 발견사항 유실 — auto-merge 실측). 닫힌집합 자동판정 포기.
- 판단 규칙: **"치명 1개라도 있으면 불합격. 불확실하면 치명으로 간주"**(보수적, 사람읽기).

---

## 7. 보고 규약 (저장된 feedback 메모리 반영)

- **문제·정리 = 핵심 먼저(두괄식).** 설계·이론 설명은 자세히 OK. (메모리 `reporting-core-first`)
- 형식: `[결과 1줄] → [한 일] → [문제 핵심 + 이슈 초안 텍스트(있으면)]`.
- 이슈 초안 텍스트 = 사람이 읽고 2단계 `vhk auto`로 등록 결정. 1단계는 **텍스트 제시까지만**.
- 1단계 보고 채널 = **채팅 + dev log 1줄**(영속 로그·일자분할 파일·3채널은 2단계).

---

## 8. 산출물 (1단계)

| 파일 | 내용 |
|------|------|
| `<vhk-repo>/.claude/skills/vhk-auto/SKILL.md` | 스킬 본문(frontmatter + 루프 절차 + INV 목록 + 보고 규약). SoT. |
| `~/.claude/skills/vhk-auto/SKILL.md` | 글로벌 복제(POS 등에서 호출용). 설치 절차는 README에 수동 안내(자동 sync는 2단계). |
| `docs/log/2026-06-16-autopilot-mvp.md` | 이 작업 dev log (append-only). |
| README/COMMANDS 갱신 | `/vhk-auto` 사용법(스킬이라 CLI 카탈로그엔 미등록 — 명령 아님). |

**코드 변경 0.** src/** 미변경 → 단, 스킬 자체 검증을 위한 독푸딩이 곧 테스트(§10).

---

## 9. 의존성 (코드로 확인된 사실 — 추정 아님)

- `vhk verify`: `.vhk/reports/latest.json` 항상 기록(성공·실패 무관) + `--json` stdout 옵션 있음. → 판정 입력 OK.
- `vhk review` / `vhk mission check`: `--json` 없음, exit code + chalk 텍스트뿐. → 파싱 금지(INV-4).
- `scripts/check-records.mjs`: src/** staged commit에 당일 dev log 미스테이지면 차단. → INV-5.
- `.vhk/HARD_STOP`: 자동생성은 blocker≥3 단일 트리거(state-files.ts:65). `writeHardStop()` 노출.
  `[dogfood]`/`[skip-hardstop]` 태그 blocker는 임계 우회. → INV-6.
- `/code-review` 스킬: 가용(이 세션 스킬 목록 확인). cavecrew·Workflow·`.claude/agents` = 이 레포 부재 → 1단계 제외(INV-8).

---

## 10. 테스트·검증

- 스킬(마크다운)이라 단위테스트는 약함 → **검증 = 독푸딩 자체**.
- 수용 기준(1단계 성공 정의):
  1. POS 프로젝트에서 `/vhk-auto` 1회 호출 → goal 1개를 사람 개입 없이 완주(또는 정직한 blocker/HARD_STOP).
  2. `vhk verify` red인데 commit하는 일이 **없다**(INV-1 준수).
  3. `gh issue create`가 **호출되지 않는다**(INV-2 준수).
  4. critical 발견 시 `.vhk/HARD_STOP` 생성되고 다음 호출이 0번에서 멈춘다(INV-6 준수).
  5. commit이 `check-records` 훅에 막히지 않는다(INV-5 준수).
- 2단계로 승격(코드화) 시 vitest로 결정론 부분(dedupe·rate-limit·gh 래퍼) 테스트.

---

## 11. 2단계 로드맵 (이연 — 별도 스펙)

| 항목 | 2단계 처방 |
|------|-----------|
| 이슈 등록 | `gh` = safeExecFile + atomicWrite + dedupe + rate-limit (결정론 코드). 레포·라벨·등록여부 = 룰. LLM은 초안 텍스트만. |
| 승인 | undo 패턴 — 1차 호출 초안 반환·등록 0 → `vhk auto approve`(또는 confirm 인자) 재호출로만 등록. MCP는 초안 반환까지만(TTY 없음). |
| 유출 방지 | public 레포 app-bug 자동등록 기본 금지 → 로컬 보관. 등록 직전 issue body 전체 secure 강제, 1건이라도 걸리면 차단. |
| 판정 강화 | `vhk review --json` · `vhk mission check --json` 신규(선행 의존). |
| 배포 | CLI `vhk auto`(등록 7항 + MCP 30→31) · MCP `vhk_auto` · yohan-brain core-ruleset 규약(inject_core_rules) · sync 자동설치. |
| 확장 | 적대검증 수단 선택형(B1) · 검증도 4레벨(B2) · 14필드 템플릿(D6) · 3채널 로깅(E) · 무인 연속(/loop). |
| 승격 트리거 | 1단계 3세션 무사 가동 or 유효 이슈 5건 수집 시 재평가. |

---

## 12. 오픈 항목 (구현 전 확인)

- 글로벌 스킬 설치를 1단계에서 수동(README 안내)으로 둘지, 최소 `vhk` 명령으로 복사할지 — **수동 권고**(자동 sync는 2단계).
- 보고 빈도(verbose/quiet) — 첫 독푸딩 1세션 후 재결정(E2).
- TDD 강제 수준 — 기본 경고, `VHK_TEST_FIRST=1`일 때만 HARD(검증 med 권고).
