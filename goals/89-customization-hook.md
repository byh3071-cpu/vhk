---
vhk_format: 1
type: goal
id: 89
title: 커스터마이징 트리거 훅 — 마커·SessionStart 훅·settings.json 배선 — P1
status: IN_PROGRESS
priority: P1
created: 2026-07-03
leads_to: vhk init 직후 첫 세션에서 AI가 도메인 규칙 인터뷰를 알아서 시작하도록 코드로 강제 — "안 짚으면 스킵됨" 패턴의 트리거 지점을 봉인
---

# Goal 89: 커스터마이징 트리거 훅

> 출처: 대화(2026-07-03) — [goal 88](88-init-docs-scaffold.md)과 짝. 원래 이 goal은 "커스터마이징 트리거(B-1) + core-rules 폴백 가시화(B-2)"를 한 파일에 담았으나, 외부 세션 교차검증(같은 날) 결과 (a) 두 하위기능이 서로 다른 코드 경로라 분리가 맞고 (b) 트리거 자체보다 더 근본적인 리스크(RULES.md 신규 섹션이 실제로 `.cursorrules`/CLAUDE.md까지 도달하는지 미검증)가 발견돼 goal 90으로 분리 필요 — 3-way 분리: **89(이 파일)=트리거 메커니즘만** · [goal 90](90-sync-propagation-fidelity.md)=전파 정합성 · [goal 91](91-core-rules-fallback-visibility.md)=core-rules 폴백 가시화(구 B-2).

> ⚠️ **goal 90 의존 관계**: 이 goal의 완료가 "도메인 규칙이 실제로 `.cursorrules`/CLAUDE.md에 반영됨"을 의미하지 않는다. 89는 "인터뷰가 트리거되고 답변이 RULES.md에 쓰인다"까지만 책임진다 — 그 답변이 도구별 산출물까지 도달하는지는 goal 90이 별도로 검증한다. 두 goal은 순서 무관하게 병행 가능하나, "커스터마이징이 실제로 먹힌다"는 주장은 89+90이 둘 다 완료돼야 성립.

## 근거 (실측 — 코드 확정 2026-07-03)

- `vhk init`이 만드는 CLAUDE.md/.cursorrules/RULES.md는 순수 정적 템플릿(이름·설명·기술스택만 문자열 삽입) — vhk 자체 코드에 LLM 호출 0건. 화면에 찍히는 유일한 "다음 단계" 안내가 "**FILL** 표시 찾아서 직접 채워라"(`src/i18n/ko.ts` `init.fillHint`).
- `vhk init`은 `.claude/` 경로에 아무 파일도 안 씀(`grep "\.claude[/\\\\]" src/` — 쓰기 목적 참조 0건). 즉 세션 시작 시점에 뭔가를 강제로 알려줄 배선 자체가 지금은 없음.
- 이 머신에 이미 살아 움직이는 반증 사례: `critical-thinking` 플러그인의 `critical-activate.ps1`이 SessionStart 훅으로 조건 체크 후 `hookSpecificOutput.additionalContext`를 주입하는 걸 매 세션 실측 — 지침만으론 실패했던 "안 짚으면 스킵" 문제를 이 저장소 CLAUDE.md가 아니라 훅이 해결하고 있다는 살아있는 증거.
- `.vhk/HARD_STOP`이 이미 존재-여부만 확인하는 트립와이어 패턴으로 3곳(`src/lib/hard-stop-guard.ts`·`scripts/check-records.mjs`·`scripts/record-reminder.mjs`)에서 재사용되고 있음 — 새 마커도 같은 패턴 재사용.

## 동작

`vhk init` 실행 → `.vhk/NEEDS_CUSTOMIZATION` 마커 생성(내용 없음, HARD_STOP과 동일 트립와이어) + 새 프로젝트에 `.claude/settings.json`을 만들어 SessionStart 훅 배선 → 새 프로젝트에서 Claude Code를 처음 열면 → 훅이 마커 존재를 확인하고 "지금 도메인 인터뷰 해라"는 지시를 세션에 주입 → Claude가 핵심 질문(도메인 규칙/절대 금지 행동/외부 API·서비스/데이터 민감도)을 프로젝트에 맞게 알아서 던지고 → 답변을 `RULES.md`에 적고 `vhk sync`로 전파 시도 → `.vhk/customization-done` 마커 생성.

**"RULES.md에 답변을 정확히 어떤 섹션 제목으로 쓸지"는 이 goal의 범위가 아니다** — 훅의 `additionalContext` 지시문에는 "RULES.md에 적고 vhk sync 돌려라"까지만 담고, 정확한 섹션 제목·`.cursorrules`/CLAUDE.md 도달 검증은 goal 90이 결정한다(사유: `sync.ts`의 `CURSORRULES_KEYS`/`CLAUDE_MD_KEYS`가 섹션 제목 substring 매칭이라 "도메인 규칙" 같은 자연스러운 제목이 기존 키 어디에도 안 걸릴 수 있음 — goal 90 참조).

- **재사용(신규 발명 안 함):** `.vhk/HARD_STOP` 트립와이어 패턴 · `critical-activate.ps1`의 얼리엑싯+JSON stdout 구조(Node `.mjs`로 이식 — PowerShell 대신 Node를 쓰는 이유: vhk 자체가 Node/TS 도구고, `scripts/check-records.mjs`가 이미 이 저장소에서 `node xxx.mjs` 훅 호출을 매일 검증하고 있음).
- **신규 함수:** `ensureCustomizationMarker()`(`customization-done`이 이미 있으면 절대 재생성 안 함 — 인터뷰 끝난 프로젝트를 재우지 않는 게 핵심), `ensureSessionStartHook()`(`.claude/settings.json` 기존 내용 보존하고 SessionStart 항목만 병합, 깨진 JSON이면 조용히 스킵).
- **잔여 리스크(설계 시점부터 인지, 코드로 완전 해소 불가):** 트리거가 도는 것은 코드로 보장되지만, 인터뷰를 실제로 끝까지 잘 하는지·`customization-done`을 성급하게 만들어버리지 않는지는 여전히 AI 판단에 의존한다. Completion Check에 "체감 검증" 항목을 넣어 이 잔여 리스크를 명시적으로 추적한다.

## 설계 (구현 단계 — PR 분해)

1. **PR1 (핵심):** `src/templates/customization-hook.ts`(훅 스크립트 템플릿) + `ensureCustomizationMarker()`/`ensureSessionStartHook()` + `generateFiles()`/`writeInitExtras()` 배선 + 단위 테스트.
2. **PR2:** `docs/spec.md`(`.vhk/` 규격 문서, 현재 spec_version 1.1) 1.2로 갱신 — `hooks/`·`NEEDS_CUSTOMIZATION`·`customization-done` 표 등록 + 변경이력. `src/templates/vhk-dir.ts`의 `.vhk/.gitignore`·`.vhk/README.md` 템플릿에도 신규 항목 반영. `tests/init.test.ts`의 spec_version 단언(기존 핀 테스트) 1.1→1.2 갱신 필수.
3. **PR3:** 훅 스크립트 서브프로세스 동작 테스트(마커 상태 4가지 조합 — 둘 다 없음/NEEDS만/DONE만/둘 다).

## Completion Check

- [x] `.vhk/NEEDS_CUSTOMIZATION`/`customization-done` 마커 로직이 `tests/init.test.ts`에서 4가지 상태 조합 모두 통과
- [x] `.claude/settings.json`이 없던 프로젝트 → 생성, 있던 프로젝트(다른 훅 포함) → 기존 내용 보존 + SessionStart만 병합, 이미 배선된 경우 → 중복 추가 안 함 (실측: `created`/`merged`/`unchanged`/`skipped` 4상태 + 손상 JSON·배열 hooks 등 7개 테스트 케이스로 3가지 요구보다 더 넓게 커버 — `tests/init.test.ts:408-490`)
- [x] `docs/spec.md` 1.2 갱신 + `tests/init.test.ts` spec_version 단언 갱신
- [x] 훅 스크립트 서브프로세스 테스트(마커 4조합) green
- [ ] **체감 검증(수동, 필수):** 실제 임시 프로젝트에 `vhk init` 돌리고 Claude Code를 열어 SessionStart 넛지가 실제로 뜨는지, 인터뷰가 자연스러운지 확인 — **미이행. 이 항목 때문에 status 를 DONE 으로 전환하지 않음(IN_PROGRESS 유지).**
- [x] 공통 게이트(_meta) 통과 — `check-goal-89.mjs`는 스텁 유지(status `IN_PROGRESS`라 `_meta.md` M.6 규정상 정상 — 스텁 허용은 DONE에만 강제)
- [x] **이 goal 단독 완료로 "규칙이 .cursorrules/CLAUDE.md까지 도달한다"고 주장하지 않는다** — 그건 goal 90의 Completion Check(90은 별도로 DONE 완료됨)

## 완료 처리 정정 (2026-07-03, 별도 감사 중 발견)

구현(`4db5d31`)·자동 게이트(build/tsc/test/lint)·critic 적대검증까지는 실제로 다 끝났으나, 이 goal 파일의 frontmatter/Completion Check 갱신이 구현 커밋에서 누락됐었다(`git show 4db5d31 -- goals/89-customization-hook.md` = 빈 diff). "완료됐다"고 사람에게 보고했던 것은 부정확했음 — 자동화 가능한 항목 6/7은 실측 재확인해 체크했지만, 자체적으로 "필수"라 못박은 47행 체감 검증은 실제로 한 번도 수행되지 않아 정직하게 미체크·`IN_PROGRESS`로 남긴다.

## 훅 신뢰성 보강 (2026-07-03, 같은 감사의 후속 — claude-code-guide 공식 사양 대조)

`claude-code-guide` 에이전트로 SessionStart 훅 스키마를 Claude Code 공식 문서 기준으로 대조한 결과, 코드가 이미 만들어둔 산출물 자체(JSON 포맷·이벤트명)는 정확했으나 실전 신뢰성에 영향을 줄 수 있는 갭 2건을 발견해 즉시 TDD로 고쳤다(전부 트레이드오프 없는 강화 — 기존 설계 의도를 해치지 않음):

1. **cwd 미보장 위험**: `node .vhk/hooks/customization-check.mjs`(상대경로)는 Claude Code 가 SessionStart 훅을 어떤 cwd 로 spawn 하는지 문서로 확정 안 됨 — cwd 가 프로젝트 루트가 아니면 "command not found"로 조용히 실패할 수 있음. 공식 문서가 명시적으로 권장하는 `${CLAUDE_PROJECT_DIR}`(Claude Code 가 매번 실제 프로젝트 루트로 동적 치환)로 교체 — 원래 상대경로였던 이유(프로젝트 이동/클론 대비)를 절대경로이면서도 그대로 만족.
2. **matcher 파이프 OR 미확정**: 공식 문서의 SessionStart matcher 예시는 전부 단일값(`"startup"`·`"compact"`)뿐이라 `"startup|resume"` 파이프 조합이 SessionStart 에서도 동작하는지 100% 확정 못 함 — 만약 안 되면 트리거 전체가 조용히 안 뜨는 catastrophic 실패. 단일값 2개 entry(`startup`/`resume`, 상호배타적이라 중복실행 없음)로 분리해 문서에 실제로 나온 패턴만 사용하도록 원천 제거.
3. **(부수 발견) 경로 공백 미보호**: 공식 문서 예시(`"$CLAUDE_PROJECT_DIR"/...`)가 변수를 따옴표로 감싸는 걸 보고 대조하다 발견 — Windows 사용자 경로에 공백(흔함, 예: "John Doe")이 있으면 미보호 시 셸 단어분리로 command 가 깨질 수 있어 전체를 큰따옴표로 감쌈.

`tests/init.test.ts`에 회귀 가드 테스트 3개 추가, 기존 2개 테스트는 새 2-entry 구조에 맞게 단언 갱신(구조 변경이지 동작 축소 아님 — `already` 멱등 체크·기존 훅 보존 로직은 그대로).

**그럼에도 47행 체감 검증은 여전히 미이행이다.** 이번 보강은 "이 산출물이 Claude Code 공식 사양과 어긋나지 않는다"는 신뢰도를 올린 것이지, "실제 세션에서 진짜로 뜬다"를 증명한 게 아니다 — 문서 대조로는 못 잡는 마지막 검증(실제 세션 육안 확인)은 여전히 사람 손이 필요하다.

## Forbidden Actions (OUT)

- 정식 Claude Code 플러그인화(marketplace.json 등) — 별도 후속 과제로 보류(이유: 전역 활성화는 "새 머신마다 깜빡함" 재발 구조가 있어 지금 이 버그의 근본원인과 같은 실패패턴을 배포 메커니즘 레벨에서 재현함).
- 사주운세·축구 레포 대상 전용 리트로핏 커맨드 신규 작성 — 멱등 설계로 "재실행하면 됨"까지만, 별도 커맨드 안 만듦.
- 세션 중간(post-init) 지속 독푸딩 넛지 — 별개 대기 과제 "N11 evolve-nudge Stop hook"(`docs/log/2026-07-01-followup-handoff.md`) 영역, 이 goal에서 안 다룸.
- `sync.ts`의 `CURSORRULES_KEYS`/`CLAUDE_MD_KEYS` 수정 금지(이 goal에서는) — 라우팅 결정·수정 필요 여부는 goal 90의 범위.
- core-rules 폴백 가시화(구 B-2) 관련 변경 금지 — goal 91의 범위.
- `vhk-auto` 1단계/2단계 경계 재논쟁 금지(이미 설계 스펙·RFC 0054·ADR-007로 확정) — 이 goal도 그 경계 밖(외부 발송·gh 등록 없음)에서만 동작.

## Mandatory Reading

`src/commands/init.ts` · `src/lib/state-files.ts`(HARD_STOP 선례) · `docs/spec.md` · `src/lib/backup.ts`(`ensureVhkIgnored`) · [goal 90](90-sync-propagation-fidelity.md)(선결 조건 아니지만 훅 지시문 문구 작성 시 참조)
