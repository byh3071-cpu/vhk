---
vhk_format: 1
type: goal
id: 54
title: 제품 메타 SoT — README 버전 빌드주입 + version-sync README 확장 — P2
status: DONE
priority: P2
created: 2026-06-08
completed: 2026-06-10
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
- [x] version-sync.test.ts에 README 버전 대조 케이스 2개(frontmatter tags + 제목 blockquote) — package.json 동적 비교
- [x] README 버전 두 곳 갱신(v2.5.0 → v2.5.1 = 현 package.json). 빌드주입은 스코프 아웃(tsup SoT 주석)
- [ ] (옵션) 영어 요약 1문단 — 스코프 아웃(본질 한국어 우선 유지)
- [x] 공통 게이트 통과, 회귀 0
- [x] check-goal-54.mjs 통과

## ✅ Completion (2026-06-10)
- **드리프트 실측·교정**: README frontmatter tag·제목 blockquote 가 v2.5.0 인데 package.json 은 2.5.1 → 두 곳 갱신.
- **가드 확장**(tests/version-sync.test.ts): 기존 CLAUDE.md 케이스 유지 + README 2케이스 추가. **버전 하드코딩 0** — 모두 `package.json.version` 과 동적 대조(blockquote 은 상단 16줄 범위 검색). 이제 README 드리프트가 CI 를 조용히 통과 못 함.
- **SoT 선언**(tsup.config.ts 주석): package.json = 버전 SoT, README/CLAUDE.md 는 version-sync.test 가 대조. 런타임 빌드 주입은 스코프 아웃(가드 기반 정합으로 충분).
- **check-goal-54**: README 두 버전 추출 → package.json 동적 일치(하드코딩 금지) + 가드 확장 확인.
- **게이트**: tsc ✓ · version-sync 3 pass · test:run 회귀 0 · check-goal-54 ✓.

## Mandatory Reading
- README.md · tests/version-sync.test.ts · package.json · tsup.config.ts(빌드주입 지점)
