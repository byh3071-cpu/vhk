---
name: vhk-dogfood-issue
description: VHK CLI나 하네스 결함을 재현·분류하고 승인된 경우 VHK 이슈로 등록할 때 사용한다.
---

# VHK Dogfood Issue

먼저 결함의 소유 위치를 나눈다.

| 유형 | 처리 위치 |
|---|---|
| VHK 명령·doctor·review·receipt 결함 | VHK 저장소 |
| 현재 프로젝트의 제품 버그 | 현재 프로젝트 |
| 공통 작업 배선 누락 | 프로젝트 Skill/RULES, 여러 프로젝트에 공통이면 VHK 개선 후보 |

## 절차

1. 최소 명령, 종료 코드, `vhk --version`으로 재현한다.
2. VHK 저장소의 기존 이슈에서 같은 증상을 검색한다.
3. 재현·기대·실제·환경을 담은 초안을 프로젝트의 로컬 임시 경로에 작성한다.
4. 사용자가 “등록해”처럼 외부 등록을 명시 승인한 경우에만 이슈를 만든다.
5. 필요한 경우 `vhk learn "dogfood: ..."`로 로컬 교훈을 남긴다.

사용자 승인 없이 외부 이슈를 만들거나 현재 프로젝트 버그를 VHK 저장소에 등록하지 않는다.
<!-- vhk-agent-skill: vhk-dogfood-issue@5 source=.agents/skills sha256=5db4532a3825298d6a8dc83d05550d56b7c559d2371ed07b8d83cd584249c929 -->
