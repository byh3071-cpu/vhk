---
vhk_format: 1
type: goal
id: 54
title: 제품 메타 SoT — README 버전 빌드주입 + version-sync README 확장 — P2
status: NOT_STARTED
priority: P2
created: 2026-06-08
leads_to: 제품 3→4 · README 버전 드리프트 0
---

# Goal 54: 제품 메타 SoT

> 출처: RFC 0048 §3 · 13-에이전트 감사(2026-06-08) 제품화 차원 medium.

## 근거 (실측)
- README 버전 표기가 package.json과 어긋난 채 발행됨 — package는 2.5.1인데 `README.md:4`(frontmatter tag)·`:9`(제목 blockquote)는 v2.5.0.
- 핵심: `tests/version-sync.test.ts:9-17`이 CLAUDE.md만 정규식 대조하고 README는 안 봐서 드리프트가 CI를 조용히 통과. (코드 자체는 정상 2.5.1 발행 — 표기/메타 드리프트.)

## 동작
- `version-sync.test.ts`에 README의 `> **vX.Y.Z**` 및 frontmatter tag를 package.json과 대조하는 케이스 추가(가드를 README까지 확장).
- README 두 곳을 현재 버전으로 갱신.
- 근본: README 버전 문자열을 빌드 시 package.json에서 주입해 단일 SoT화.
- (옵션) README 상단 영어 1문단 요약 — 본질(한국어 우선) 유지하며 제품 3→4.5 레버.

## 수용 기준
- version-sync가 README까지 검사, README 버전 드리프트 0. 회귀 0.

## Completion Check
- [ ] version-sync.test.ts에 README 버전 대조 케이스 추가
- [ ] README 버전 문자열 빌드주입(package.json SoT) 또는 갱신
- [ ] (옵션) 영어 요약 1문단
- [ ] 공통 게이트 통과, 회귀 0
- [ ] check-goal-54.mjs 통과

## Mandatory Reading
- README.md · tests/version-sync.test.ts · package.json · tsup.config.ts(빌드주입 지점)
