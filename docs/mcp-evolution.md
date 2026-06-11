# MCP 진화 카탈로그 — 0 → 29 tools

> governance T5 백필(2026-06-11). 출처 = CHANGELOG·git 태그·`src/mcp/server.ts` 실측.
> v1.0.2→v1.3.0 사이 태그가 없어 일부 도입 버전은 goal 0 Phase 기준 **추정** 표기.
> 아키텍처 결정 배경: [ADR-002](adr/ADR-002-mcp-architecture.md).

## 버전별 추이

| 버전 | 날짜 | 누적 | 추가 tools |
|------|------|:---:|-----------|
| v0.6.0 | 2026-05-24 | 8 | save · undo · status · diff · ship · doctor · check · recap |
| v0.7.1 | 2026-05-24 | 10 | env · env-check |
| (goal 0 Phase 3, v1.x 추정) | 2026-05-25~28 | 16 | sync · secure · audit · harness · context · brief |
| (goal 0 Phase 4, v1.3 추정) | 2026-05-28 | 24 | deploy · publish · migrate · update · ref-list · memory-list · context-show · mcp-init |
| v2.0.1 | 2026-06-03 | 25 | learn (goal 18 — memory v2) |
| v2.1.0 | 2026-06-04 | 27 | pattern-detect · pattern-list (goal 19) |
| v2.3.0 | 2026-06-04 | 29 | evolve-suggest · evolve-list (goal 20) |

## 현재 29 tools (src/mcp/server.ts 등록 순)

| # | tool | 도입 | goal |
|--:|------|------|------|
| 1 | save | v0.6.0 | 0 |
| 2 | undo | v0.6.0 | 0 |
| 3 | status | v0.6.0 | 0 |
| 4 | diff | v0.6.0 | 0 |
| 5 | ship | v0.6.0 | 0 |
| 6 | doctor | v0.6.0 | 0 |
| 7 | check | v0.6.0 | 0 |
| 8 | recap | v0.6.0 | 0 |
| 9 | env | v0.7.1 | 0 |
| 10 | env-check | v0.7.1 | 0 |
| 11 | sync | v1.x(추정) | 0 Phase 3 |
| 12 | secure | v1.x(추정) | 0 Phase 3 |
| 13 | audit | v1.x(추정) | 0 Phase 3 |
| 14 | harness | v1.x(추정) | 0 Phase 3 |
| 15 | context | v1.x(추정) | 0 Phase 3 |
| 16 | brief | v1.x(추정) | 0 Phase 3 |
| 17 | deploy | v1.3(추정) | 0 Phase 4 |
| 18 | publish | v1.3(추정) | 0 Phase 4 |
| 19 | migrate | v1.3(추정) | 0 Phase 4 |
| 20 | update | v1.3(추정) | 0 Phase 4 |
| 21 | ref-list | v1.3(추정) | 0 Phase 4 |
| 22 | memory-list | v1.3(추정) | 0 Phase 4 |
| 23 | learn | v2.0.1 | 18 |
| 24 | context-show | v1.3(추정) | 0 Phase 4 |
| 25 | mcp-init | v1.3(추정) | 0 Phase 4 |
| 26 | pattern-detect | v2.1.0 | 19 |
| 27 | pattern-list | v2.1.0 | 19 |
| 28 | evolve-suggest | v2.3.0 | 20 |
| 29 | evolve-list | v2.3.0 | 20 |

## 호환성 원칙

- **기존 tool API 시그니처 변경 금지**(GA 안정성 — RULES.md MCP 규칙). 0→29 까지
  제거·개명 0건, 전부 가산.
- CLI=SoT, MCP 는 `runVhkCli(args, headline)` 래퍼(goal 48 단일 SoT) — CLI 동작이
  곧 MCP 동작.
- 대화형 커맨드(gate/init/design palette/theme)는 MCP 제외(TTY 없음) — 비대화형
  가드는 goal 11/12.
