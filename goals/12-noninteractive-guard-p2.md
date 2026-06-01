---
vhk_format: 1
type: goal
id: 12
title: 비대화형 가드 P2 — 잔여 명령 마이그 + save push 검토
status: NOT_STARTED
priority: P2
---

# Goal 12: 비대화형 가드 P2 (#14 후속)

> 설계 전문: `docs/superpowers/specs/2026-06-01-mcp-noninteractive-guard-design.md`
> Goal 11(P1) 완료 후 진행. 백로그.

## 배경
P1 이 안전핵심(감지 SoT + restore + lite-block + gate)을 처리. P2 는 나머지 대화형
명령을 3버킷 계약으로 기회주의적 마이그 + 걸친 케이스(save push) 정책 결정.

## 동작
- 잔여 benign/essential 마이그: theme, design-palette, sync(confirm), ship.
- `promptOrDefault`/`ensureInteractive` 일괄 적용 → 비-TTY 일관 동작.
- S5: `save` 의 push 가 standard 모드서 비대화형 자동실행되는 문제 — 비대화형 미승인이면
  push 막을지(외부영향) 결정. high-risk 승격 vs strict-extra 유지.
- (선택) `VHK_MCP_MODE` env → channel='mcp' preview UX (P1 에서 YAGNI 로 제외했던 것).

## Completion Check
- [ ] theme/design-palette/sync/ship 비-TTY 일관 동작 + 테스트
- [ ] save push 비대화형 정책 결정·구현
- [ ] 회귀 없음 (P1 동작 보존)
- [ ] 공통 게이트 통과

## Mandatory Reading
- `docs/superpowers/specs/2026-06-01-mcp-noninteractive-guard-design.md` §9 (스코프 P2)
- Goal 11 구현 결과
