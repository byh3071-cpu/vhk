---
vhk_format: 1
type: goal
id: 2
title: 자율 루프 — context → goal → check 사이클 + 안전장치
status: IN_PROGRESS
priority: P1
version: v1.3
started: 2026-05-28
---

# Mission: Close the autonomous loop — context, goal, check, learn, stop

## Your Identity

You design feedback loops. You prefer fewer commands that compose cleanly
over many one-off scripts. You treat `.vhk/HARD_STOP` as a tripwire that
must never be removed automatically. Every state mutation gets a timestamped
log entry.

## The Goal

Goal 1 의 `vhk goal *` 위에 자율 루프 보조 명령을 얹어, 사람이 매번
지시하지 않아도 `context → goal next → 작업 → goal check → goal done` 사이클이
스스로 진행되도록 한다. 단, 멈춰야 할 때는 즉시 멈춘다.

1. `vhk blocker "<설명>"` — `docs/state/blockers.md` 에 타임스탬프 + 현재
   active goal id 와 함께 append. 누적 3 개 이상이면 `.vhk/HARD_STOP` 자동
   생성 (`vhk resume` 으로만 해제).
2. `vhk learn "<교훈>"` — `docs/state/learnings.md` 에 날짜 + active goal id
   prefix 로 append. 동시에 `vhk memory add` 와 동일한 결정사항 저장소에도
   기록 (single SoT 보장).
3. `vhk resume` — `.vhk/HARD_STOP` 제거. 직전에 표시한 사유를 사람이 콘솔에
   타이핑(`--confirm` flag) 해야만 제거. 자동 호출 금지.
4. `vhk context` 가 active goal 의 next-task 와 최근 learning 3 개를 자동
   포함하도록 확장.
5. `_meta` 모든 게이트 통과.

## Mandatory Reading Order

1. `CLAUDE.md` + `AGENTS.md`
2. `goals/_meta.md`
3. `goals/1-goal-command.md` — frontmatter 파서 재사용
4. `src/commands/context.ts` — context 명령의 현재 출력 포맷
5. `src/commands/memory.ts` — append-only SoT 파일 관리 패턴
6. `docs/state/blockers.md` / `learnings.md` — 현재 누적 상태

## 자율 루프 흐름

```
1. vhk context                  → 현재 상태 + active goal + 최근 교훈 로드
2. vhk goal next                → 다음 목표 자동 선택
3. (개발 작업 수행)
4. vhk goal check
   ├─ PASS → vhk goal done → 다음 goal
   └─ FAIL → 3 사이클 진전 없으면 → vhk blocker → 다음 태스크 자동 전환
5. 블로커 3 개 누적 → .vhk/HARD_STOP 자동 생성 → 자동화 즉시 중단
```

## Completion Check

`bash scripts/check-goal-2.sh` 가 exit 0 을 반환한다. 구체적으로:

- [ ] `vhk blocker`, `vhk learn`, `vhk resume` 3 개 구현 + 테스트
- [ ] 블로커 3 개 누적 시 `.vhk/HARD_STOP` 자동 생성 검증 테스트
- [ ] `vhk resume` 이 `--confirm` 없이 호출되면 거부하는 테스트
- [ ] `vhk context` 출력에 `## Active Goal` + `## Recent Learnings` 섹션 포함
- [ ] `vhk memory list` 와 `vhk learn` 의 SoT 일관성 테스트 (이중 기록 금지)
- [ ] `_meta` 게이트 통과

## Forbidden Actions

- `vhk resume` 의 자동 호출 (사람 손이 닿아야만 해제)
- `.vhk/HARD_STOP` 파일을 lockfile 외의 용도로 재사용
- blockers.md / learnings.md 의 과거 항목 수정 (append-only)
- `vhk learn` 과 별개로 `vhk memory add` 도 호출해서 이중 기록
- 본 goal 범위 안에서 멀티 에이전트 / 워커 풀 도입

## When Stuck

Goal 0/1 의 동일 프로토콜 적용. 단, 본 goal 의 안전장치 자체가 막혔다면
`docs/state/blockers.md` 가 아니라 직접 사람에게 보고 (자기 자신을 호출하면
무한루프).

## Dependencies

- Goal 1 완료 후 진입. `vhk goal *` 가 SoT 로 기능해야 본 goal 의 상태
  전이가 의미 있음.
