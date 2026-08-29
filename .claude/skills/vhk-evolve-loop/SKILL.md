---
name: vhk-evolve-loop
description: VHK 검증 실패나 반복 실수를 기록하고 프로젝트 규칙 개선안으로 연결할 때 사용한다.
---

# VHK Evolve Loop

프로젝트 개선의 정본 흐름은 `.vhk/memory.json` → `vhk evolve` → `RULES.md`다. VHK CLI 자체의
결함은 **vhk-dogfood-issue**로 보낸다.

## 기록과 패턴

```text
vhk learn "한 줄 교훈 — 원인 포함"
vhk win "한 줄 성공 — 유지할 이유 포함"
vhk pattern detect
vhk pattern list
vhk evolve suggest
vhk evolve list
```

팀 공유가 필요하면 프로젝트 기록 규약에 맞는 recurring-defects 문서나 ADR을 사용한다.

## 반영

- 입력 가능한 세션과 사람 확인이 있으면 `vhk evolve apply <id>` 뒤 `vhk sync`를 실행한다.
- 입력할 수 없는 에이전트는 `vhk evolve digest`로 초안만 제안하며 자동 적용하지 않는다.
- 같은 교훈이 둘 이상의 VHK 프로젝트에서 확인되면 공개 템플릿 개선 후보로 검토한다.

CLI 결함을 learn만으로 끝내거나, 로컬 memory만 바꾸고 공유할 `RULES.md`를 갱신한 것처럼 말하지 않는다.
<!-- vhk-agent-skill: vhk-evolve-loop@2 source=.agents/skills sha256=b43f5a3ff58436cb5b4a5e1bb2be047263d3501b4f527274b0c3bdbfcb1556a0 -->
