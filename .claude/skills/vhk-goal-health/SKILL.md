---
name: vhk-goal-health
description: VHK Goal 파일이 스키마 오류로 무시되거나 review가 Goal을 찾지 못할 때 진단·복구한다.
---

# VHK Goal Health

`vhk goal list`와 `vhk review`를 실행해 스키마 오류·무시 파일인지, 모든 Goal이 정상 DONE인 종료
상태인지 먼저 구분한다. 정상 종료라면 파일을 고치지 않는다.

스키마가 깨진 Goal만 다음 계약에 맞춘다.

```yaml
---
type: goal
id: 4
title: ...
status: IN_PROGRESS
---
```

상태는 `NOT_STARTED`, `IN_PROGRESS`, `DONE`, `BLOCKED`, `CANCELED`, `DEFERRED`, `OBSERVING`
중 프로젝트 계약이 허용하는 값을 쓴다.
레거시는 `active` → `IN_PROGRESS`, `done` → `DONE`, `pending` → `NOT_STARTED`로 옮긴다.
검증은 `vhk goal list`, `vhk goal peek`, `vhk review` 순서로 한다.

도구가 유효한 레거시 상태를 경고 없이 무시한다면 Goal 파일을 계속 바꾸지 말고 VHK 제품 결함으로 분류한다.
<!-- vhk-agent-skill: vhk-goal-health@5 source=.agents/skills sha256=aebbd3863086200cb83d2d0459dfeb0bb17cf14bd4fb973aa37bac3c52d0c653 -->
