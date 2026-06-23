---
vhk_format: 1
type: goal
id: 51
title: 출력 계층 단일화 — logger SoT 승격 + raw console 차단 가드 — P2
status: DONE
priority: P2
created: 2026-06-08
completed: 2026-06-10
leads_to: 코드 4→5 · 출력 일관성·테스트 캡처 단일 지점
---

# Goal 51: 출력 계층 단일화

> 출처: RFC 0048 §2 원리3 · 13-에이전트 감사(2026-06-08) 코드품질 차원 medium.

## 근거 (실측)
- 중앙 출력 래퍼 `src/utils/logger.ts`(`log.success/error/warn/info/step`)가 존재하나 import는 init/ship/start 3파일뿐, 나머지는 raw `console.log(chalk…)` 직접 호출 679곳/44파일.
- 추상화를 만들고 사실상 미채택 → 출력 포맷·색상 일관성을 강제할 단일 지점이 없고, 조용한 모드·테스트 출력 캡처를 한 곳에서 못 끈다.
- 단 문자열 톤은 이미 `i18n/ko.ts`(38파일 채택)로 중앙화됨 — 남은 건 렌더링(색·이모지) 분산.

## 동작
- 방향 결정: `logger`를 출력 SoT로 승격(권장) — 렌더 프린터 4종 확장.
- 신규 raw `console.log(chalk…)`를 머지 차단하는 check 스크립트(`// vhk-allow-raw-output` 예외 허용) 추가.
- 기존 679곳은 점진 마이그레이션(신규부터 강제, 일괄 강제 압박 금지).

## 수용 기준
- 신규 raw console 차단 게이트 동작, logger 채택률 상승(신규 명령은 logger 경유). 회귀 0.

## Completion Check
- [x] logger를 출력 SoT로 승격(단일 sink emit + setQuiet/setSink + 렌더 프린터 plain/dim/bold/list 4종 확장)
- [x] 신규 raw console 차단 check 스크립트(scripts/check-no-raw-output.mjs, `// vhk-allow-raw-output` 주석 경로 포함)
- [x] 점진 마이그레이션(src/commands/preflight.ts → logger 경유) + 회귀 테스트(tests/logger.test.ts·check-no-raw-output.test.ts)
- [x] 공통 게이트 통과, 회귀 0
- [x] check-goal-51.mjs 통과

## ✅ Completion (2026-06-10)
- **logger SoT**: 모든 렌더가 단일 `sink` 경유(`emit`) → 조용한 모드(`setQuiet`)·테스트 캡처(`setSink` 복원함수 반환)를 한 지점에서 제어. `error` 는 quiet 여도 노출(실패 은폐 금지). 프린터 4종 확장(plain/dim/bold/list).
- **가드**: `scripts/check-no-raw-output.mjs` — `console.log(chalk…)` 만 탐지(error/warn 제외), `// vhk-allow-raw-output:` 직전 160자 예외, 기본 리포트(exit 0)·`--strict` 차단. scripts/*.mjs 제외, logger SoT 본인은 sink 경유라 미탐.
- **마이그레이션**: preflight.ts 5곳 → `log.bold`/`log.plain`(chalk 합성은 sink 통과). 출력 문자열 불변 → preflight.test 회귀 0.
- **게이트**: build ✓ · tsc ✓ · test:run 1396 pass(신규 +11) ✓ · check-goal-51 ✓.

## Mandatory Reading
- src/utils/logger.ts · src/i18n/ko.ts · scripts/check-no-silent-fallback.mjs(가드 패턴 참고)
