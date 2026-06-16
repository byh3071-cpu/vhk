# VISION — vhk

> 북극성 앵커. 루프가 매 틱 의도 재고정용으로 읽는다. 짧게 유지.
> 자주 바뀌는 상태는 .vhk/context.md · docs/state/ 로. 여기엔 변하지 않는 의도만.

## What (한 줄)
AI 코딩 세션을 목표·증거·기억·규칙으로 묶는 한국어 CLI

## Why (북극성)
한국어 개발자가 AI 에이전트와 협업할 때 목표 漂流(표류)·증거 부재·규칙 증발을 막는다.
vhk가 없으면 LLM은 매 세션 방향을 잃는다. vhk가 있으면 100번째 턴도 1번째와 같은 의도를 유지한다.

## Definition of Done (v1 출시 기준)
- [ ] `vhk init` 한 번으로 목표·규칙·컨텍스트·기억 구조 생성
- [ ] `vhk check` 로 게이트 통과 증거 자동 수집
- [ ] `vhk memory` 로 교훈·결정·실패·성공 4버킷 관리
- [ ] `pnpm publish` 이전 모든 게이트(typecheck·lint·test·build) 통과

## Non-goals (범위 수비)
- UI/대시보드 — CLI 전용, 시각화는 Notion·MCP 위임
- 다국어 지원 — 한국어 전용 (ko.ts 단일소스)
- LLM 직접 호출 — vhk는 구조 도구, 모델 선택은 사용자 몫

## Loop Anchor (루프가 매 틱 지킬 것)
- 한 번에 goal 1개. STOP 조건 우선.
- 의심되면 멈추고 사람 확인.
- .vhk/HARD_STOP 있으면 즉시 중단.
