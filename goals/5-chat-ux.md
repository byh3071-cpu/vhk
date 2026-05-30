---
vhk_format: 1
type: goal
id: 5
title: 배치3 — 채팅 UX 안전 마감 + AGENTS.md 6번째 타겟 + MCP/도움말
status: DONE
priority: P3
version: v1.9
completed: 2026-05-30
---

# [배치 3] 비개발자/바이브코더가 에이전트 채팅창에서 자연어로 안전하게 쓰게 마감

VHK를 비개발자/바이브코더/솔로프리너가 에이전트 채팅창(Cursor, Copilot, Antigravity 등)에서 자연어로 안전하게 쓰도록 개선한다. 배치 0~2 머지 후 진행.

## 공통 가드 (반드시 준수)
- Windows PowerShell 기준. bash heredoc/sh 금지. 게이트는 pnpm.cmd.
- 한국어 UX 유지. 사용자-facing 한국어를 영어로 바꾸지 마라.
- 사용자 변경 revert 금지. git status --short 먼저 확인, 기존 수정 보존, 최소 범위 패치.
- docs/state/blockers.md, learnings.md append-only.
- 기존 컨벤션 준수. 신규 의존성 금지. TDD. 별도 커밋/PR. ko.ts 는 이 배치 문자열만.

## 먼저 읽을 것
- 자연어 → 명령 라우터(printNextStep/cursorHint 및 자연어 매핑 위치), src/commands/status.ts
- src/mcp/index.ts (runVhkCli), src/commands/mcp-init.ts, sync.ts(SYNC_TARGETS), src/commands/migrate.ts

## 우선순위
0. vhk start 단일 진입점 (초보 온보딩 첫 화면):
   - vhk start 실행 시 현재 상태 요약 + quick actions 10문장만 노출(상태 알려줘 / 뭐 바뀌었어 / 저장해줘 / 오늘 한 일 정리해줘 / 다음에 뭐 하면 돼 / 도움말 / 동기화 / 백업 복원 / 보안 점검 / 종료 등). 전체 명령어 목록을 들이밀지 말 것 — 첫 화면은 vhk start 하나로 끝낸다.
   - 비대화형(TTY 아님)에서도 동작하게. 테스트 추가.
1. 자연어 라우터에 도움말 계열 추가:
   - "도움말", "사용법", "명령어", "뭐 할 수 있어", "처음 뭐 해"
   - 결과는 CLI help 또는 초보자용 quick actions 로 연결. 테스트 추가.
   - ⚠️ 자연어 라우터는 실제 명령어 이름(restore/undo/sync 등)을 절대 가로채지 마라 — 명령어 매칭 우선, 자연어는 fallback. (배치 0 R1: restore가 라우터에 삼켜져 안전망이 죽은 실결함 확인.) 테스트 추가.
2. status 다음 액션을 더 안전하게:
   - 변경사항이 있으면 바로 vhk save 추천 금지.
   - 먼저 vhk diff / "뭐 바뀌었어" 추천, 저장은 그 다음 액션으로 안내. 테스트 추가.
3. (MCP undo 는 배치 0에서 처리됨 — 중복 구현 금지. 미반영이면 여기서 마무리: dry-run 기본 또는 confirm token, CLI undo UX 유지.)
4. 에이전트 채팅창 dogfooding 마감:
   - (RULES.md 기본 생성 흐름은 배치 1에서 구현됨 — 재구현 금지.)
   - vhk sync 로 .github/copilot-instructions.md, .agents/rules/vhk-rules.md, .windsurfrules 가 실제 생성되는지 테스트(배치 1과 중복 시 보강).
   - README "Cursor/Copilot/Antigravity 에서 이렇게 말하세요" 섹션 확인/보강.
5. MCP runVhkCli PATH 의존 제거:
   - dist/mcp/index.js 에서 전역 vhk 가 없어도 로컬 dist/index.js 를 실행하도록 fallback.
   - mcp-init smoke 테스트 보강.

## AGENTS.md 6번째 타겟 + UX 마감 (§11 Phase 3)
- RULES.md → AGENTS.md 생성기 추가(toAgentsMd()) 후 SYNC_TARGETS 레지스트리에 항목 1개만 추가 → sync·드리프트·백업 가드(배치 0)가 자동 반영. adopt 스캔 대상에도 AGENTS.md 포함.
  ⚠️ AGENTS.md 가 생성물이 되면, 배치 2의 compact 안내가 AGENTS.md 에 하드코딩돼 있으면 안 됨(RULES.md 소스로 이동). 두 배치 일관성 확인.
- 대규모 대응: Antigravity 12,000자 절삭 시 조용히 자르지 말고 큰 경고(또는 .agents/rules/ 다중 파일 분할 검토). adopt 충돌은 섹션별 프롬프트 대신 미리보기 1회 + 일괄 결정.
- 모든 파괴적 동작 기본값 안전화, 평문 결과 요약 + 복구 명령 안내.
- migrate 도움말에 "패키지매니저 전환(설정 마이그레이션 아님)" 명시.
- MCP 도구(src/mcp/) description 에 "sync 는 덮어쓰기 전 자동 백업함" 명시, 에이전트가 사용자에게 백업·복원을 안내하도록.
- (선택) mcp-init 이 현재 .cursor/mcp.json 만 생성 → Windsurf/Copilot/Antigravity 등 다른 도구 MCP 설정도 지원하도록 일반화 검토.

## 검증 (이 배치 끝 — 전체 게이트)
- pnpm.cmd exec tsc --noEmit
- pnpm.cmd run test:run
- pnpm.cmd run build
- pnpm.cmd run scan
- pnpm.cmd audit --audit-level moderate
- node scripts/check-meta.mjs
- node scripts/check-goal-0.mjs
- node scripts/check-goal-1.mjs
- node scripts/check-goal-2.mjs
