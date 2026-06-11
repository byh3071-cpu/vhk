---
vhk_format: 1
type: goal
id: 64
title: COMMANDS.md 전 명령 문서화 + registry 기반 게이트 --strict 승격 — P1
status: NOT_STARTED
priority: P1
created: 2026-06-11
leads_to: 만들어놓고 사용자가 모르는 명령 0 · 신규 명령 문서 누락 CI 차단
---

# Goal 64: COMMANDS.md 커버리지

> 출처: governance 배치(#261) check-commands-doc 실측 — 49개 명령 파일 중 32개가
> COMMANDS.md 미등장(verify·save·recap·stats·worktree…). 게이트는 v0 리포트 전용으로
> 들어갔고 한계(파일명≠registry SoT) 헤더에 명문화됨.

## 배경

- COMMANDS.md = 비개발자 사용자용 사용법 SoT. 미등장 명령 = 존재를 모르는 기능.
- v0 게이트 한계: ①비명령 파일 과대집계 ②동명 파일 없는 명령(recall·blocker·learn 등)
  검사 밖 ③글롭/산문 토큰 우연 매칭 거짓통과 ④하이픈 명령의 공백형 표기 거짓미등장.

## 동작

1. **게이트 재구현(선행)**: 명령 우주를 src/lib/command-registry.ts `TOP_LEVEL_COMMANDS`
   (+한글 별칭 표)에서 유도 — vitest 테스트 고도(registry import 선례: command-registry.test).
   scripts/check-commands-doc.mjs 는 위임/폐기 판단.
2. **32건 문서화**: 명령별 "하고 싶은 것 | 터미널 명령 | Cursor에게 말하기" 행 추가
   (기존 표 형식 유지, 영문 명령 1회 병기 — 게이트 매칭 보장).
3. **--strict 승격**: 부채 0 확인 후 게이트를 FAIL 모드로 — CI 에서 신규 명령 문서 누락 차단.

## Completion Check

- [ ] registry 기반 검사(테스트)가 실제 명령 전수를 우주로 사용 — 파일명 휴리스틱 폐기
- [ ] COMMANDS.md 미등장 0건 (실측 리포트 첨부)
- [ ] --strict(또는 테스트 FAIL)가 CI 에서 강제됨 — 명령 1개 빼면 red 재현
- [ ] 문서 행의 사용법이 실제 CLI 와 일치(각 명령 --help 대조 샘플 ≥10)

## 경계 (OUT)

- README 전면 개편(COMMANDS.md 만) · 명령 동작 변경 0 · MCP tool 문서는 별도.
