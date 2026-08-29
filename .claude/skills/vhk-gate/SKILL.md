---
name: vhk-gate
description: VHK 변경의 verify, receipt, review를 연결해 완료 전에 검증할 때 사용한다.
---

# VHK Gate

코드 변경이나 Goal 완료를 주장하기 전에 다음 순서로 실행한다.

```text
vhk verify
vhk receipt
vhk review
```

## 판정

| 결과 | 다음 행동 |
|---|---|
| verify red | `.vhk/reports/latest.json`에서 실패 원인을 확인하고 수정한 뒤 다시 검증 |
| receipt BLOCK — dirty | 변경을 확인·커밋한 뒤 receipt 재실행 |
| receipt BLOCK — stale | 현재 HEAD를 `vhk verify`로 다시 검증한 뒤 receipt 재실행 |
| receipt BLOCK — forbidden | 금지 경로 변경을 제거하거나 사람과 작업 범위를 재합의 |
| receipt CAUTION — 작업 기준 미기록 | 현재 범위를 확인하고 다음 작업 전에 `vhk receipt --mark-start` |
| review exit 1 — Goal 스키마 오류·무시 파일 | `vhk goal list`로 확인한 뒤 **vhk-goal-health** 사용 |
| review exit 1 — 모든 Goal 정상 DONE | 종료 인수인계에서는 review `N/A`; goal-health 호출 금지 |
| review fail | **vhk-evolve-loop**로 반복 원인을 기록하고 제품 결함이면 수정 |

VHK CLI 자체의 버그나 크래시는 **vhk-dogfood-issue**, 프로젝트의 반복 실수는
**vhk-evolve-loop**로 보낸다.

완료 조건은 verify exit 0, receipt pass/caution, active Goal의 review pass 또는 모든 Goal 정상 DONE
종료의 review `N/A`다. 그 전에는 완료를 선언하지 않는다.
<!-- vhk-agent-skill: vhk-gate@2 source=.agents/skills sha256=6fa1ed84aaff2c935266459d1b046cd5350b911da361f2b395944f17bb8111fc -->
