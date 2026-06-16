export function VISION_TEMPLATE(name: string, description: string): string {
  return `# VISION — ${name}

> 북극성 앵커. 루프가 매 틱 의도 재고정용으로 읽는다. 짧게 유지.
> 자주 바뀌는 상태는 .vhk/context.md · docs/state/ 로. 여기엔 변하지 않는 의도만.

## What (한 줄)
${description || '<무엇을 만드는가 — 한 문장>'}

## Why (북극성)
<왜 이것이 필관리자가 — 사용자/문제. 2~3줄>

## Definition of Done (v1 출시 기준)
- [ ] <측정 가능한 완료 조건 1>
- [ ] <조건 2>

## Non-goals (범위 수비)
- <안 하는 것 1 — BACKLOG.md v1 OUT 과 연결>

## Loop Anchor (루프가 매 틱 지킬 것)
- 한 번에 goal 1개. STOP 조건 우선.
- 의심되면 멈추고 사람 확인.
- .vhk/HARD_STOP 있으면 즉시 중단.
`
}
