---
vhk_format: 1
type: goal
id: 91
title: core-rules 폴백 가시화 — YOHAN_BRAIN_ROOT 미설정 시 조용한 구버전 스냅샷 사용을 경고 — P2
status: NOT_STARTED
priority: P2
created: 2026-07-03
leads_to: "헌법도 자동 반영 안 됨" 불만의 유력 원인(조용한 폴백)을 가시화 — 최소 수정으로 독립 완료 가능
---

# Goal 91: core-rules 폴백 가시화

> 출처: [goal 88](88-init-docs-scaffold.md)/[goal 89](89-customization-hook.md) 설계 세션(2026-07-03) 중 감사로 새로 발견. 원래 goal 89의 B-2로 묶여있었으나 서로 다른 코드 경로(`core-rules.ts` vs 커스터마이징 훅)라 독립 goal로 분리.

## 근거 (실측 — 코드 확정 2026-07-03)

- `src/lib/core-rules.ts:77-94` `loadCoreRuleset()` — `YOHAN_BRAIN_ROOT` 환경변수 없거나 읽기 실패 시 **조용히** `CORE_RULESET_SNAPSHOT`(번들, npm 배포 시점에 박제된 스냅샷)으로 폴백.
- `grep "source"` core-rules.ts 전역 — 이 값(`'live' | 'bundled'`)을 실제로 사용하는 곳은 `.agents/CORE-RULES.md` 파일 안에 심어지는 HTML 마커 주석 한 줄(`vhk bundled snapshot`)뿐. `console.log`/`chalk.warn` 등으로 사용자에게 알리는 코드 0건.
- 사용자가 "헌법도 자동으로 반영이 안 되고 그러더라"라고 보고한 것과 정확히 부합하는 유력 원인 — 사주운세·축구 레포를 만든 터미널 세션에 `YOHAN_BRAIN_ROOT`가 안 잡혀 있었다면, 조용히 구버전 헌법 스냅샷을 받고도 아무 신호가 없었을 것.
- **정정(외부 교차검증 반영)**: 헌법 파일(`.agents/CORE-RULES.md`) 자체가 안 만들어지는 건 아니다 — `init.ts:366`(현재 라인은 구현 시점 재확인)이 무조건 생성은 한다. 문제는 생성되는 *내용의 신선도*가 조용히 결정된다는 것.
- **번들 스냅샷이 이미 라이브보다 뒤처짐(실측)**: `core-ruleset-snapshot.ts`엔 `pattern_refs`가 PAT-007까지만 있는데, `.agents/CORE-RULES.md`(라이브 상속분, `YOHAN_BRAIN_ROOT` 있을 때 core-ruleset.yaml에서 옴)엔 PAT-009까지 참조됨 — 이 goal이 풀려는 문제가 이미 실측으로 재현됨.

## 동작

`vhk init`/`vhk start` 실행 시 `loadCoreRuleset().source === 'bundled'`면 콘솔에 경고 1줄(예: "⚠️ YOHAN_BRAIN_ROOT 미설정 — 헌법 번들 스냅샷(vX.Y.Z) 사용 중, 최신 아닐 수 있음") + `.vhk/context.md`에도 동일 정보 1줄 남겨서 init 완료 시점이 지나도 나중에 확인 가능하게.

- **경고만, 자동 해결 금지** — `YOHAN_BRAIN_ROOT`를 코드가 임의로 탐색·설정하지 않는다(환경변수를 코드가 건드리는 건 이 goal의 범위 밖이자 별도 논의가 필요한 문제).

## Completion Check

- [ ] `source='bundled'`일 때 init/start 콘솔 출력에 경고 문구 포함
- [ ] `source='live'`일 때 경고 없음(회귀 없음)
- [ ] `.vhk/context.md`에 core-rules 소스 표기
- [ ] 공통 게이트(_meta) + `check-goal-91.mjs`(status `NOT_STARTED` 단계라 스텁 허용)

## Forbidden Actions (OUT)

- `YOHAN_BRAIN_ROOT` 자동 탐색·설정 로직 추가 금지 — 경고만.
- 번들 스냅샷 자체를 최신화하는 자동화 금지 — 별도 릴리즈 프로세스 영역.
- goal 89/90의 커스터마이징 훅·sync 라우팅 로직 변경 금지 — 별개 코드 경로.

## Mandatory Reading

`src/lib/core-rules.ts` · `src/lib/core-rules.test.ts` · `src/commands/init.ts` · `src/commands/start.ts`
