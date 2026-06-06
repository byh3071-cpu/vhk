---
vhk_format: 1
type: goal
id: 27
title: silent fallback 안티패턴 린트 (check-no-silent-fallback) — P2
status: NOT_STARTED
priority: P2
created: 2026-06-06
---

# Goal 27: silent fallback 안티패턴 린트

> 출처: 2026-06-06 바이브코딩 커뮤니티 스레드 2건(검증 루프 + fallback 최소화) +
> 같은 날 VHK 자체 점검(레포 grep). Notion SUMMARY: "(2026-06-06) VHK — 바이브코딩 커뮤니티 합의 점검".
> 패턴 선례: scripts/check-no-raw-json-parse.mjs (grep 기반 머지 게이트).

## 배경 (왜)
점검에서 확인(추측 아님 — 레포 grep): RULES.md 코딩 규칙은 "try-catch 필수 · 빈 catch 금지"
뿐이고, **실패를 조용히 기본값으로 때우는 silent fallback / 무근거 default 를 막는 규칙·게이트가 없다.**
커뮤니티 합의(글타래2): fallback 은 실패를 숨겨 디버깅을 어렵게 한다 → "실패하면 에러 그대로 노출".
VHK 설계철학(거짓완료 금지 · 항상 증거)과 같은 방향.

## 동작 (어디·무엇) [추론]
- scripts/check-no-silent-fallback.mjs — check-no-raw-json-parse.mjs 구조 복제(src/**/*.ts grep).
- v0 금지 패턴(보수적, 오탐 최소):
  - catch 블록이 로그·throw 없이 곧장 기본값 return (`catch { return null | [] | '' | {} }`)
  - 명백한 무근거 폴백 주석 패턴(예: `// fallback`, `// 기본값`) + 조용한 return 동반
- 화이트리스트: `// vhk-allow-fallback: <이유>` 인접 시 통과 (의도된 폴백은 근거를 남기게).
- check-meta / 머지 게이트에 연결 (check-no-raw-json-parse 와 동일 레벨).

## Completion Check
- [ ] silent catch-default 샘플 → FAIL + 파일:라인 출력
- [ ] `// vhk-allow-fallback:` 주석 → PASS (의도 폴백 허용)
- [ ] 기존 src 전수 스캔 → 현황 리포트(기존 위반 건수 baseline)
- [ ] 오탐 0 목표: 정상 try-catch(로그/throw 동반)는 통과
- [ ] 공통 게이트 통과 (typecheck + test + build)

## 범위
- IN: grep 기반 정적 린트 v0 + 화이트리스트 주석.
- OUT: AST 기반 정밀 분석(별도 goal), `||`/`??` 전수 차단(오탐 과다 → 제외).

## 트리거 / 우선순위 메모
- 안전축이라 가치 높지만, 기존 src 위반이 많으면 baseline 부채가 큼 → 먼저 현황 스캔으로 규모 측정 후 강도 결정.
- 과안정화 경계(헌법 제2조): v0 는 경고/리포트 우선, HARD 게이트 승격은 baseline 확인 후.

## Mandatory Reading
- scripts/check-no-raw-json-parse.mjs (grep 게이트 선례)
- RULES.md 코딩 규칙 / goals/_meta.md (게이트 연결 지점)
