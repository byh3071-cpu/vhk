---
vhk_format: 1
type: goal
id: 89
title: 새 프로젝트 세션 시작 — 도메인 커스터마이징 인터뷰 강제 트리거 + core-rules 폴백 가시화 — P1
status: NOT_STARTED
priority: P1
created: 2026-07-03
leads_to: vhk init 직후 첫 세션에서 AI가 알아서 도메인 규칙을 묻고 RULES.md에 반영 + 헌법(core-ruleset) 반영 여부가 눈에 보이게 — "안 짚으면 스킵됨" 패턴을 트리거 레벨에서 코드로 봉인
---

# Goal 89: 커스터마이징 트리거 훅 + core-rules 폴백 가시화

> 출처: 대화(2026-07-03) — [goal 88](88-init-docs-scaffold.md)과 짝. 사용자가 사주운세 디스코드봇·축구 레포 독푸딩 중 "새 프로젝트 규칙/헌법이 자동 반영 안 되고, 안 짚으면 스킵된다"고 보고. 조사 결론: "코드냐 지침이냐"는 잘못된 이분법 — 폴더 생성은 코드로 100% 강제, 도메인 내용은 코드가 못 채우지만 "지금 반드시 물어봐라"는 트리거는 코드(훅)로 강제 가능.
>
> ⚠️ **이 goal은 서로 독립적인 두 하위 기능(B-1·B-2)을 담는다.** B-1은 이 세션에서 처음부터 설계된 핵심 기능, B-2는 같은 세션 감사(2026-07-03) 도중 별도로 발견한 관련 갭이다 — 서로 다른 코드 경로를 건드리므로 PR도 분리한다(아래 §구현 단계).

## 근거 (실측 — 코드 확정 2026-07-03)

**B-1 (커스터마이징 트리거) 근거:**
- `vhk init`이 만드는 CLAUDE.md/.cursorrules/RULES.md는 순수 정적 템플릿(이름·설명·기술스택만 문자열 삽입) — vhk 자체 코드에 LLM 호출 0건. 화면에 찍히는 유일한 "다음 단계" 안내가 "**FILL** 표시 찾아서 직접 채워라"(`src/i18n/ko.ts` `init.fillHint`).
- `vhk init`은 `.claude/` 경로에 아무 파일도 안 씀(`grep "\.claude[/\\\\]" src/` — 쓰기 목적 참조 0건). 즉 세션 시작 시점에 뭔가를 강제로 알려줄 배선 자체가 지금은 없음.
- 이 머신에 이미 살아 움직이는 반증 사례: `critical-thinking` 플러그인의 `critical-activate.ps1`이 SessionStart 훅으로 조건 체크 후 `hookSpecificOutput.additionalContext`를 주입하는 걸 매 세션 실측 — 지침만으론 실패했던 "안 짚으면 스킵" 문제를 이 저장소 CLAUDE.md가 아니라 훅이 해결하고 있다는 살아있는 증거.
- `.vhk/HARD_STOP`이 이미 존재-여부만 확인하는 트립와이어 패턴으로 3곳(`src/lib/hard-stop-guard.ts`·`scripts/check-records.mjs`·`scripts/record-reminder.mjs`)에서 재사용되고 있음 — 새 마커도 같은 패턴 재사용.
- `src/commands/sync.ts`가 `RULES.md`(SoT) → `.cursorrules`/`AGENTS.md`/CLAUDE.md 마커블록으로 자동 fan-out하는 구조를 이미 갖춤(백업·드리프트 감지·비대화형 안전장치 완비) — 인터뷰 답변을 여기 흘려보내면 sync.ts 코드는 안 건드려도 됨.

**B-2 (core-rules 폴백 가시화) 근거 — 같은 세션 감사 중 신규 발견:**
- `src/lib/core-rules.ts:77-94` `loadCoreRuleset()` — `YOHAN_BRAIN_ROOT` 환경변수 없거나 읽기 실패 시 **조용히** `CORE_RULESET_SNAPSHOT`(번들, npm 배포 시점에 박제된 스냅샷)로 폴백.
- `grep "source"` core-rules.ts 전역 — 이 값(`'live' | 'bundled'`)을 실제로 사용하는 곳은 `.agents/CORE-RULES.md` 파일 안에 심어지는 HTML 마커 주석 한 줄(`vhk bundled snapshot`)뿐. `console.log`/`chalk.warn` 등으로 사용자에게 알리는 코드 0건.
- 사용자가 "헌법도 자동으로 반영이 안 되고 그러더라"라고 보고한 것과 정확히 부합하는 유력 원인 — 사주운세·축구 레포를 만든 터미널 세션에 `YOHAN_BRAIN_ROOT`가 안 잡혀 있었다면, 조용히 구버전 헌법 스냅샷을 받고도 아무 신호가 없었을 것.

## 동작

### B-1. 커스터마이징 트리거 훅

`vhk init` 실행 → `.vhk/NEEDS_CUSTOMIZATION` 마커 생성(내용 없음, HARD_STOP과 동일 트립와이어) + 새 프로젝트에 `.claude/settings.json`을 만들어 SessionStart 훅 배선 → 새 프로젝트에서 Claude Code를 처음 열면 → 훅이 마커 존재를 확인하고 "지금 도메인 인터뷰 해라"는 지시를 세션에 주입 → Claude가 핵심 질문(도메인 규칙/절대 금지 행동/외부 API·서비스/데이터 민감도)을 프로젝트에 맞게 알아서 던지고 → 답변을 `RULES.md`에 적고 `vhk sync`로 전파 → `.vhk/customization-done` 마커 생성.

- **재사용(신규 발명 안 함):** `.vhk/HARD_STOP` 트립와이어 패턴 · `sync.ts`의 SoT 전파 구조(새 섹션 제목이 기존 `CURSORRULES_KEYS`/`CLAUDE_MD_KEYS`에 걸리게 설계, sync.ts 코드는 안 건드림) · `critical-activate.ps1`의 얼리엑싯+JSON stdout 구조(Node `.mjs`로 이식 — PowerShell 대신 Node를 쓰는 이유: vhk 자체가 Node/TS 도구고, `scripts/check-records.mjs`가 이미 이 저장소에서 `node xxx.mjs` 훅 호출을 매일 검증하고 있음).
- **신규 함수:** `ensureCustomizationMarker()`(`customization-done`이 이미 있으면 절대 재생성 안 함 — 인터뷰 끝난 프로젝트를 재우지 않는 게 핵심), `ensureSessionStartHook()`(`.claude/settings.json` 기존 내용 보존하고 SessionStart 항목만 병합, 깨진 JSON이면 조용히 스킵).
- **잔여 리스크(설계 시점부터 인지, 코드로 완전 해소 불가):** 트리거가 도는 것은 코드로 보장되지만, 인터뷰를 실제로 끝까지 잘 하는지·`customization-done`을 성급하게 만들어버리지 않는지는 여전히 AI 판단에 의존한다. Completion Check에 "체감 검증" 항목을 넣어 이 잔여 리스크를 명시적으로 추적한다.

### B-2. core-rules 소스 가시화

`vhk init`/`vhk start` 실행 시 `loadCoreRuleset().source === 'bundled'`면 콘솔에 경고 1줄(예: "⚠️ YOHAN_BRAIN_ROOT 미설정 — 헌법 번들 스냅샷(vX.Y.Z) 사용 중, 최신 아닐 수 있음") + `.vhk/context.md`에도 동일 정보 1줄 남겨서 init 완료 시점이 지나도 나중에 확인 가능하게.

- **경고만, 자동 해결 금지** — `YOHAN_BRAIN_ROOT`를 코드가 임의로 탐색·설정하지 않는다(환경변수를 코드가 건드리는 건 이 goal의 범위 밖이자 별도 논의가 필요한 문제).

## 설계 (구현 단계 — PR 분해)

1. **PR1 (B-1 핵심):** `src/templates/customization-hook.ts`(훅 스크립트 템플릿 + `RULES.md` 섹션 제목 상수) + `ensureCustomizationMarker()`/`ensureSessionStartHook()` + `generateFiles()`/`writeInitExtras()` 배선 + 단위 테스트.
2. **PR2 (B-1):** `docs/spec.md`(`.vhk/` 규격 문서, 현재 spec_version 1.1) 1.2로 갱신 — `hooks/`·`NEEDS_CUSTOMIZATION`·`customization-done` 표 등록 + 변경이력. `src/templates/vhk-dir.ts`의 `.vhk/.gitignore`·`.vhk/README.md` 템플릿에도 신규 항목 반영. `tests/init.test.ts`의 spec_version 단언(기존 핀 테스트) 1.1→1.2 갱신 필수.
3. **PR3 (B-1):** `RULES.md` 신규 섹션이 기존 `CURSORRULES_KEYS`/`CLAUDE_MD_KEYS` 라우팅을 실제로 타는지 블랙박스 회귀 테스트 + 훅 스크립트 서브프로세스 동작 테스트(마커 상태 4가지 조합).
4. **PR4 (B-2, 독립 — B-1과 순서 무관하게 먼저 처리해도 됨):** `init.ts`/`start.ts`에 `loadCoreRuleset().source` 체크 + 콘솔 경고 1줄 + `.vhk/context.md` 템플릿에 소스 표기 필드 추가. 테스트: `source='bundled'` 픽스처로 경고 출력 단언 + `source='live'`일 때 무경고(회귀 없음) 단언.

## Completion Check

**B-1:**
- [ ] `ReceiptEvidence`류 신규 필드 없음(이 goal은 receipt와 무관) — 대신 `.vhk/NEEDS_CUSTOMIZATION`/`customization-done` 마커 로직이 `tests/init.test.ts`에서 4가지 상태 조합 모두 통과
- [ ] `.claude/settings.json`이 없던 프로젝트 → 생성, 있던 프로젝트(다른 훅 포함) → 기존 내용 보존 + SessionStart만 병합, 이미 배선된 경우 → 중복 추가 안 함 (3가지 케이스 테스트)
- [ ] `docs/spec.md` 1.2 갱신 + `tests/init.test.ts` spec_version 단언 갱신
- [ ] `RULES.md` 신규 섹션이 `.cursorrules`/CLAUDE.md 양쪽에 실제로 전파되는 회귀 테스트 green
- [ ] 훅 스크립트 서브프로세스 테스트(마커 4조합) green
- [ ] **체감 검증(수동, 필수):** 실제 임시 프로젝트에 `vhk init` 돌리고 Claude Code를 열어 SessionStart 넛지가 실제로 뜨는지, 인터뷰가 자연스러운지 확인 — 자동테스트가 못 잡는 "잔여 리스크" 항목을 사람이 눈으로 확인

**B-2:**
- [ ] `source='bundled'`일 때 init/start 콘솔 출력에 경고 문구 포함
- [ ] `source='live'`일 때 경고 없음(회귀 없음)
- [ ] `.vhk/context.md`에 core-rules 소스 표기

**공통:**
- [ ] 공통 게이트(_meta) + `check-goal-89.mjs`(status `NOT_STARTED` 단계라 스텁 허용)

## Forbidden Actions (OUT)

- 정식 Claude Code 플러그인화(marketplace.json 등) — 별도 후속 과제로 보류(이유: 전역 활성화는 "새 머신마다 깜빡함" 재발 구조가 있어 지금 이 버그의 근본원인과 같은 실패패턴을 배포 메커니즘 레벨에서 재현함).
- 사주운세·축구 레포 대상 전용 리트로핏 커맨드 신규 작성 — 멱등 설계로 "재실행하면 됨"까지만, 별도 커맨드 안 만듦.
- 세션 중간(post-init) 지속 독푸딩 넛지 — 별개 대기 과제 "N11 evolve-nudge Stop hook"(`docs/log/2026-07-01-followup-handoff.md`) 영역, 이 goal에서 안 다룸.
- `sync.ts`의 `CURSORRULES_KEYS`/`CLAUDE_MD_KEYS` 자체 수정 금지 — 새 섹션 제목이 기존 키에 걸리게 설계.
- `YOHAN_BRAIN_ROOT` 자동 탐색·설정 로직 추가 금지(B-2) — 경고만.
- 번들 스냅샷 자체를 최신화하는 자동화 금지(B-2) — 별도 릴리즈 프로세스 영역.
- `vhk-auto` 1단계/2단계 경계 재논쟁 금지(이미 설계 스펙·RFC 0054·ADR-007로 확정) — 이 goal도 그 경계 밖(외부 발송·gh 등록 없음)에서만 동작.

## Mandatory Reading

`src/commands/init.ts` · `src/commands/sync.ts`(§`CURSORRULES_KEYS`/`CLAUDE_MD_KEYS`/`toClaudeMd`) · `src/lib/state-files.ts`(HARD_STOP 선례) · `docs/spec.md` · `src/lib/backup.ts`(`ensureVhkIgnored`) · `src/lib/core-rules.ts`(B-2) · `src/lib/core-rules.test.ts`(B-2)
