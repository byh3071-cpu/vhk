---
vhk_format: 1
type: goal
id: 90
title: sync 전파 정합성 — RULES.md 신규 섹션이 .cursorrules/CLAUDE.md까지 실제 도달하는가 — P1
status: DONE
priority: P1
created: 2026-07-03
completed: 2026-07-03
leads_to: goal 89(커스터마이징 트리거)가 쓰는 인터뷰 답변이 실제로 도구별 산출물(.cursorrules·CLAUDE.md)까지 도달함을 코드로 보장 — 원래 버그("안 짚으면 스킵")의 사촌(조용히 반쪽 전파)을 차단
---

# Goal 90: RULES.md → .cursorrules/CLAUDE.md 전파 정합성

> 출처: [goal 89](89-customization-hook.md) 설계 중 "인터뷰 답변을 RULES.md에 쓰면 `vhk sync`가 알아서 `.cursorrules`/CLAUDE.md로 전파한다, sync.ts는 안 건드려도 된다"는 가정을 세웠는데, 같은 날 외부 세션 교차검증이 이 가정을 코드로 반박했다. 이 세션에서 직접 재확인(2026-07-03) — 반박이 맞다.

## 근거 (실측 — 코드 확정 2026-07-03, 직접 재검증 완료)

`src/commands/sync.ts`의 라우팅은 섹션 제목의 **substring 매칭**이다:

```
sync.ts:19  const CURSORRULES_KEYS = ['코딩 규칙', '기술 스택', '아키텍처', '디자인', 'Anti-patterns', '커밋']
sync.ts:23  const CLAUDE_MD_KEYS = ['기록', '로그', 'ADR', '트러블슈팅', 'TIL', '/done', '체크리스트', 'VHK 운영']
sync.ts:79  const codingSections = sections.filter(s => CURSORRULES_KEYS.some(k => s.title.includes(k)))   // buildCodingDoc — .cursorrules 등
sync.ts:316 const codingSections = sections.filter(s => CURSORRULES_KEYS.some(k => s.title.includes(k)))   // toClaudeMd — CLAUDE.md
```

`## 도메인 규칙`이나 `## 절대 금지 행동` 같은 — goal 89의 인터뷰 훅이 자연스럽게 쓸 법한 — 섹션 제목은 위 두 키 목록 어디에도 substring으로 안 걸린다. 즉 `.cursorrules`·CLAUDE.md(정작 Cursor/Claude가 읽는 파일)엔 그 내용이 **빠지고**, RULES.md 원본과 (AGENTS.md 등 다른 SYNC_TARGETS 경유 시) 일부 산출물에만 남는다.

완전 침묵은 아니다 — `findUnmappedSections()`(`sync.ts:35-41`)가 매칭 안 되는 섹션 제목을 모아 `sync()` 실행 중 경고로 노출한다(`sync.ts:593` 호출부). 하지만 경고는 콘솔에 스쳐 지나가는 텍스트일 뿐 — 이 경고를 놓치면 원래 버그("사람이 안 짚으면 스킵됨")의 사촌이 그대로 재현된다: 인터뷰는 코드로 강제됐는데 그 산출물이 조용히 반쪽만 전파.

## 동작 — 결정 완료(2026-07-03): 옵션 (b) 채택

**`CURSORRULES_KEYS`에 `'도메인'` 키 1개만 추가.** (a)(기존 키 재사용) 대신 (b)를 택한 이유:

- 코딩 산출물은 스스로 "코딩/디자인 전용"이라 선언한다(`buildCodingDoc`, sync.ts:85) — 도메인 불변식·금지행동을 `## 코딩 규칙` 밑에 억지로 넣으면 문서 구조가 왜곡된다. 인터뷰 AI가 매번 마법의 접두어(`## 코딩 규칙 — 도메인`)를 붙여야 하는 것도 깨지기 쉽다(접두어 누락 시 즉시 원래 버그 재현).
- `rules-md.ts:6-7`의 기존 관례("섹션 제목은 키셋과 정렬돼야 함")를 지키는 올바른 방법은 "자연스러운 제목을 키로 등록"이지 "제목을 억지로 구부리기"가 아니다.
- **`toClaudeMd()`가 `CURSORRULES_KEYS`를 union해서 쓴다**(sync.ts:316-317) — `CURSORRULES_KEYS`에만 추가해도 CLAUDE.md까지 자동 도달, `CLAUDE_MD_KEYS`엔 안 넣어도 됨(그쪽은 기록/로그 의미라 넣으면 오히려 의미 오염). 최소 변경.
- 영향 범위 확인: 두 키 배열은 `sync.ts` 안에서만 정의·소비(grep, 중복 하드코딩 0곳), 배열 구성원을 단언하는 테스트도 0개, `'도메인'`은 기존 6개 기본 섹션·흔한 사용자 섹션 어디와도 substring 충돌 없음(직접 대조 완료).

**부수 발견(범위 밖, 기록만)**: `RULES_MD_TEMPLATE()`의 기본 `## 안전 규칙`(rules-md.ts:30)이 이미 어느 키에도 안 걸려 조용히 반쪽 전파 중임을 확인(같은 버그 클래스, 별도 goal 후보).

**critic 리뷰가 찾은 리스크(반영 완료)**: `CURSORRULES_KEYS` 확장이 `VHK_MANAGED_KEYS`(spread, sync.ts:30)에도 자동 반영되고, 이 배열은 `stripLegacyAutogen`(레거시 마커없는 CLAUDE.md 1회 마이그레이션의 "옛 자동생성→삭제" 판정)에도 쓰인다 — 즉 이 기능 이전에 사용자가 CLAUDE.md에 손으로 써둔 "도메인" 관련 섹션이 있으면 최초 sync 시 삭제 대상으로 분류될 수 있다. `docs/log/2026-06-10-governance.md:63-65`가 'Forbidden' 키에 대해 정확히 이 이유로 신규 키 추가를 거부한 전례가 있어 무겁게 봤다.
- **두 키셋을 분리하는 완화책은 채택 안 함** — `sync.ts:27-29` 자체 주석이 "재생성 판정과 삭제 판정은 반드시 같은 키 집합을 써야 한다(다르면 재생성 섹션이 사용자 섹션으로 오인돼 중복된다)"고 명시 — 분리하면 이 저장소 자신의 설계 의도와 정면 배치.
- **대신 위험을 받아들이되 명시적으로 문서화·테스트**: (1) 완전 침묵 아님 — `removed` 목록으로 노출 + `syncCore`가 덮어쓰기 전 항상 백업(복구 가능). (2) 위험 시나리오가 'Forbidden'보다 훨씬 좁음 — "도메인"은 이 기능 이전엔 표준 관용구가 아니라 손으로 미리 써놨을 확률이 낮음. `tests/sync.test.ts`에 이 트레이드오프를 캡처하는 characterization test 추가(동작이 조용히 바뀌면 잡힘).

**인터뷰 지시문 확정**: 4개 주제를 별도 H2로 쪼개지 않고 **단일 `## 도메인 규칙` + `###` 하위제목**으로 묶는다(`parseRulesMd`가 `## `만 섹션 경계로 봄 — sync.ts:53 — 이므로 `###`는 같은 섹션 본문에 남아 함께 전파됨). 쪼개면 각 H2가 다시 unmapped 될 위험이 있어 단일 H2로 못박음.

## Completion Check

- [x] (a)/(b) 중 하나를 결정하고 이 문서에 결정 근거 기록 — (b) 채택, 위 참조
- [x] `sync.ts`의 `CURSORRULES_KEYS` 확장(`'도메인'` 추가) + 기존 `findUnmappedSections`/`buildCodingDoc`/`toClaudeMd` 테스트 회귀 없음 확인(`tests/sync.test.ts` 33/33 pass)
- [x] **블랙박스 전파 테스트**: `tests/sync.test.ts`에 합성 도메인 규칙 섹션(SENTINEL 마커) → `.cursorrules`·CLAUDE.md(마커블록 안)·나머지 5개 코딩 타깃(windsurf/copilot/gemini/cline/antigravity) 전부 도달 확인 + `findUnmappedSections`가 더는 안 잡음을 확인하는 회귀 테스트 4개 추가, TDD RED→GREEN으로 검증
- [x] `findUnmappedSections()` 경고가 실제로 뜨는 케이스 — 기존 테스트(`sync.test.ts` "미매칭 섹션 silent drop 방지" describe, 프로젝트 정체성 케이스)가 이미 커버 중이라 신규 테스트 불필요, 확인만 함
- [x] 공통 게이트(_meta) + `check-goal-90.mjs`(고유 검증 채움 — 도메인 키·훅 지시문·블랙박스 테스트 존재 확인, 정규식으로 배열 리터럴 라인 한정하여 주석 오탐 방지)
- [x] critic 리뷰가 찾은 `VHK_MANAGED_KEYS`/레거시 마이그레이션 상호작용 리스크 — 위 참조, characterization test로 트레이드오프 문서화

## Forbidden Actions (OUT)

- goal 89의 마커·SessionStart 훅·`.claude/settings.json` 배선 재구현 금지 — 이 goal은 라우팅/전파 정합성만 다룬다.
- goal 91(core-rules 폴백 가시화) 범위 침범 금지 — 별개 코드 경로(`core-rules.ts`).
- (a)/(b) 결정 없이 구현 착수 금지 — 결정이 이 goal의 첫 산출물이다.
- `CURSORRULES_KEYS`/`CLAUDE_MD_KEYS` 확장 시(옵션 b) 기존 키 삭제·이름변경 금지 — 추가만(GA 안정성, 기존 산출물 회귀 방지).

## Mandatory Reading

`src/commands/sync.ts`(전체, 특히 `CURSORRULES_KEYS`/`CLAUDE_MD_KEYS`/`parseRulesMd`/`buildCodingDoc`/`toClaudeMd`/`findUnmappedSections`/`SYNC_TARGETS`) · `tests/sync.test.ts`(기존 라우팅 테스트 패턴) · [goal 89](89-customization-hook.md)
