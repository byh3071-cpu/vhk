# 2026-06-16 — MCP 도구 수 드리프트 정정 + 기능 안내 문서

## 배경

VHK 전체 기능 맵을 워크플로(12 에이전트 병렬)로 정리하다 문서·코드 드리프트 2건 의심 발견.
실제 코드 대조 결과 1건만 진짜 드리프트였음.

## 한 일

- **MCP 도구 수 드리프트 정정 (29→30)**: 실제 등록 30개(`mcp-cli-contract.test.ts` 가 `toBe(30)` 으로 강제), 문서·진단 floor 만 stale.
  - `src/doctor/diagnostics/mcp.ts` — `buildMcpDiag` 기본 `expected` `20→30` (회귀가드 floor 정상화. 20 floor 는 도구 25개로 줄어도 ok 통과 = 회귀 미탐)
  - `README.md` — "MCP 29 tools" 헤더·본문 `29→30`, 컨텍스트/기억 행에 누락된 `loop-brief` tool 추가(실제 빠져 있던 1개)
  - `package.json` — description "MCP 29 tools" `→ 30`
  - `tests/mcp-cli-contract.test.ts` — 도크스트링 주석 "(29)" `→ (30)` (line 47 단언은 이미 30)
- **기능 안내 문서**: `docs/vhk-feature-guide.md` 신규 — 비개발자용 쉬운말 기능 맵(일 흐름 순서 + 철학 3가지)
- **슬래시 명령**: `.claude/commands/vhk-features.md` — `/vhk-features [영역]` 으로 위 문서 surface(docs 단일 소스 참조)

## 비-드리프트 (오탐 정정)

- blocker 임계값: 코드는 `HARD_STOP_BLOCKER_THRESHOLD = 3` 단일 상수 1곳(`state-files.ts`), `agent.ts` 가 import 해서 표시 → 드리프트 없음. 초기 워크플로 리포트의 "5" 가 에이전트 추출 오류였음.

## 검증

- `pnpm build` ✓
- `pnpm test:run` → 1708 pass (165 files)

## 교훈

- 워크플로 에이전트 추출값(특히 상수·임계값)은 코드 grep 으로 재확인 후 신뢰 — 한 에이전트의 "5" 가 단일 상수 `=3` 을 오독.
- MCP 도구 수는 SoT 3곳(코드 등록·README 표·package.json desc) + doctor floor 까지 4곳 동기화 필요. floor 는 정확 count 와 같게 둬야 회귀를 잡는다(여유 floor = 미탐).
