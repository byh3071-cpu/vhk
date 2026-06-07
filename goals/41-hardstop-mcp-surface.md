---
vhk_format: 1
type: goal
id: 41
title: HARD_STOP 가드 — MCP 서버 surface (직접쓰기 우회 차단) — P2
status: NOT_STARTED
priority: P2
created: 2026-06-07
---

# Goal 41: HARD_STOP 가드 — MCP 서버 surface

> 출처: Goal 39 머지 전 적대검증(2026-06-07, doctrine 벡터). CLI 명령 함수는 가드했으나
> MCP 서버(src/mcp/server.ts)는 일부 툴이 명령 함수를 호출하지 않고 쓰기를 **재구현** →
> HARD_STOP 활성 시에도 파일을 변경(가드 우회). src/mcp/ 전체에 HARD_STOP 참조 0개.

## 배경
MCP 는 CLI 와 별개 surface. 현재 확인된 우회:
- `env` 툴(server.ts ~387): `.env.example`·`.gitignore` 를 `env()` 호출 없이 직접 writeFileSync → 가드 우회.
다른 write 툴은 명령 함수를 호출하면 함수레벨 가드로 보호되나, 재구현/직접쓰기 여부 전수 확인 필요.

## 동작 (설계 후보)
- **A안(권장)**: MCP write 툴 전수 감사 → 상태쓰기 툴 핸들러 첫 줄에 `if (isHardStopActive()) return <안내 텍스트>`.
  CLI 의 `ensureNotHardStopped` 는 process.exitCode/console.error 기반이라 MCP 응답엔 부적합 →
  MCP 용 얇은 가드(isHardStopActive() + 안내 content 반환) 헬퍼 신설 고려.
- **B안**: 재구현된 핸들러(env 등)를 명령 함수 위임으로 교체 → 함수레벨 가드 자동 상속(중복 로직 제거 보너스).
- 읽기전용 툴(status/diff/doctor/check/recap/log 등)은 제외.

## Completion Check
- [ ] MCP write 툴 전수 목록 + 각 가드 여부 표
- [ ] env(및 기타 직접쓰기) 툴이 HARD_STOP 활성 시 파일 미변경
- [ ] HARD_STOP 없으면 기존 동일(회귀 0)
- [ ] 회귀 가드 테스트(MCP env 차단/정상)
- [ ] vhk goal sync → check-goal-41.mjs → check --id 41 통과
- [ ] 공통 게이트 통과

## Mandatory Reading
- src/mcp/server.ts (registerTool 핸들러 — 특히 env ~387)
- src/lib/hard-stop-guard.ts · src/lib/state-files.ts (isHardStopActive)
- goals/39-hardstop-remaining-cmds.md (CLI 측 선행 — 함수레벨 가드 패턴)
