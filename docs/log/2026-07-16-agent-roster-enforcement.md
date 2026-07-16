# 2026-07-16 — agent roster enforcement wiring

## 한 일
- brain: agent-roster active + Goal 7/8 + handoff/inventory
- mcp: agent_roster_digest on get_context + get_agent_roster
- vhk: AGENTS Ecosystem Roster 포인터 1줄 (sync.ts)
- Tier S ecosystem.mdc v2 inject; Tier A/B/C AGENTS 포인터

## 검증
- orca-enforcement.ps1 smoke pass_paths_and_cli
- yohan-mcp pytest test_agent_roster 4 passed
- check-ecosystem roster status=active
