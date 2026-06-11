# Governance T5 — 과거 전수 백필 (설계, 선택·LOW)

> 출처: audit-docs-governance-2026-06-10 테마 T5. 가치 중·비용 M. **선별 백필**(전수 재구성은 정보손실로 비현실 — 최근만 충실, 초기는 요약). git history 기반, 손실 구간 정직 표기.

## Context
초기 v0.x~v1.9 ADR/devlog 부재(현 devlog는 2026-06-08부터). breaking 변경(v2.0 memory v2 제외) 미문서화. MCP 0→29 진화 미추적. 의사결정 근거가 git 메시지·goal 본문에만 산재 → 검색성 0.

## 동작 (선별 — 가치 높은 것만)
1. **ADR 백필 3건**(git/코드 기반 재구성):
   - ADR: v0.6.0 MCP 아키텍처 도입 결정·대안·트레이드오프.
   - ADR: v0.8.0 design/theme/ref 시스템 결정.
   - ADR: v2.0.0 memory schema v2 breaking 운영 정책(향후 breaking 템플릿 겸용).
2. **MCP 진화 카탈로그** `docs/mcp-evolution.md`: 29 tools 각 추가 시점·goal·호환성 표(git log + MCP 정의 기반).
3. **초기 Phase 회고** `docs/log/`에 v0.x~v2.4 마일스톤 회고 4-5건(append-only, 손실 구간은 "git 기반 재구성·일부 추정" 명시).

## 경계 (OUT)
- 전 커밋 전수 ADR화(비현실). 초기 goal 1~10 본문 보강(별도). 정보손실 구간 억지 재구성 금지 — 정직 표기.

## 순서: git log/태그/CHANGELOG 정독 → ADR 3건 → mcp-evolution.md → 초기 회고 devlog → 게이트 green(문서뿐이라 가벼움).
## 검증: ADR 3건이 ADR-0001 템플릿 형식 준수(결정/맥락/대안/결과). mcp-evolution 표가 현 29 tools 일치. 회고에 손실 명시.
## 주의: 이건 LOW·선택 — governance v2/T3/T4 끝나고 예산/시간 남을 때만. 막히면 스킵(블로커 아님).
