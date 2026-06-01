---
vhk_format: 1
type: goal
id: 10
title: vhk context 발견성·실행유도 (next-step + MCP 자동호출)
status: DONE
priority: P1
completed: 2026-06-01
---

# Goal 10: `vhk context` 발견성·실행유도

> 출처: 2026-05-31 VHK A/B 미니 해커톤 dogfood (vhk-project- / cafe-with-vhk).
> 자기개선 배치 — 자세한 공통 규칙은 `goals/_meta-self-improve.md` 참조.

## 배경 (핵심)
세션 복원이 VHK 존재 이유인데, 실험에서 `vhk context`가 CLI로
호출조차 안 됨 — 프롬프트에 문구로 타이핑됨. 핵심기능이 자연스럽게
안 불리는 게 최대 약점.

## 동작
- (a) 모든 명령 출력 끝에 next-step 한 줄. 세션 끊김/새 세션 감지 시
      "재개하려면 `vhk context`" 안내
- (b) MCP 툴로 `vhk context` 노출 → AI 에이전트가 새 세션 시작 시
      자동 호출 (사람이 기억 불필요)

## Completion Check
- [ ] 주요 명령 출력에 next-step 노출
- [ ] `vhk context`가 MCP 툴로 등록·호출 가능
- [ ] (검증 재실험) 멀티세션 시 context 실제 호출 횟수 ≥ 1
- [ ] 공통 게이트 통과

## Mandatory Reading
- vhk context 구현 + 출력 포맷
- MCP 툴 등록 레이어 (yohan-mcp 연계 가능)
- next-step UX 패치 이력

## When Stuck
MCP 자동호출이 복잡하면 (a) next-step부터 먼저 ship,
(b)는 별도 후속 goal로 분리.
