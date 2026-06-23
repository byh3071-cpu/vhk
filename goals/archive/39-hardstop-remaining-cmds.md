---
vhk_format: 1
type: goal
id: 39
title: HARD_STOP 가드 완성 — 나머지 상태쓰기 명령 (design/theme/env/ref/cloud) — P2
status: DONE
priority: P2
created: 2026-06-07
completed: 2026-06-07
leads_to: goal-40-atomic-completion
---

# Goal 39: HARD_STOP 가드 완성 — 나머지 상태쓰기 명령

> 출처: 발행 전 적대검증(2026-06-07, hardstop-completeness). Goal 34~36 이 goal/memory/evolve/pattern/
> mission 을 가드했으나, 파일/룰을 쓰는 나머지 명령은 함수레벨 가드가 없었다(저위험이나 일관성 결함).

## 배경
HARD_STOP(모든 자동화 중단) 활성 시에도 아래 명령이 파일을 변경 → 일관성 결함.
- `design`(.cursorrules 등 룰/디자인 산출물) · `theme`(CSS/TS 생성) · `env`(.env.example·.gitignore)
- `refAdd`(.vhk/refs.json) · `cloudPush`(.vhk 백업 업로드)

## 동작 (최소 변경 — 가드만)
- 위 함수 첫 줄(side effect 전)에 `if (!ensureNotHardStopped('<cmd>')) return`.
- **제외(근거)**: `context`/`brief` = 읽기 기반 자동생성 산출물(.vhk/context.md·brief.md, 재생성 가능) ·
  `work` = 이미 자체 `passHardStop` 보유 · 조회 명령(envCheck/refList/refOpen) = 상태 변경 아님.
- save/deploy/publish/sync/cloud-pull 은 guardCli chokepoint 로 이미 보호(중복 가드 불필요).
- **범위 외(→ Goal 41)**: MCP 서버 surface(src/mcp/server.ts)는 일부 툴이 명령 함수 대신 쓰기를
  재구현(env 직접 .env.example 쓰기) → 함수레벨 가드 우회. 별도 surface 라 Goal 41 로 분리 등록.

## Completion Check
- [x] design/theme/env/refAdd/cloudPush 모두 HARD_STOP 활성 시 즉시 중단(파일 미변경)
- [x] HARD_STOP 없으면 기존 동일(회귀 0)
- [x] 회귀 가드 테스트(env blocked/ok · refAdd blocked/ok)
- [x] vhk goal sync → check-goal-39.mjs → check --id 39 통과
- [x] 공통 게이트 통과

## Mandatory Reading
- src/lib/hard-stop-guard.ts (ensureNotHardStopped)
- src/commands/{design,theme,env,ref,cloud}.ts (대상)
- goals/34-hardstop-goal-cmds.md (선행 패턴)
