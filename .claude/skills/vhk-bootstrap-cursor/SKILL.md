---
name: vhk-bootstrap-cursor
description: Cursor 프로젝트에 VHK를 설치하고 공통 Agent Skills와 검증 루프를 연결할 때 사용한다.
---

# VHK Bootstrap Cursor

목표는 `vhk doctor` green, Goal·receipt·review·learn 연결, gate 1회 통과다.

## 설치

```text
vhk doctor
vhk context
vhk brief
vhk sync
vhk mcp-init
```

`vhk goal list`에서 스키마 오류가 보이면 **vhk-goal-health**를 사용한다. Goal이 하나도 없다면
프로젝트 원본 문서에서 작업 단위를 정한 뒤 Goal 카드를 만든다.

## 기대 산출물

| 산출물 | 역할 |
|---|---|
| `.cursor/rules/` | 항상 적용되는 프로젝트 규칙 |
| `.agents/skills/` | Antigravity·Codex·Cursor가 함께 읽는 VHK Skill |
| `.claude/skills/` | 같은 정본에서 만든 Claude Code 관리 사본 |
| `.cursor/hooks.json` | Cursor 세션 훅 |
| `docs/context/agent-compact.md` | 짧은 프로젝트 진입점 |

신규 설치는 같은 Skill을 `.cursor/skills`에 중복 생성하지 않는다. 기존 `.cursor/skills`는 사용자
수정 가능성이 있으므로 자동 삭제·이동·덮어쓰기하지 않는다.

## 검증

```text
vhk pattern detect
vhk verify
vhk receipt
vhk review
```

review exit 1이면 `vhk goal list`로 원인을 나눈다. 스키마 오류만 goal-health로 복구하고, 모든 Goal이
정상 DONE인 종료는 review `N/A`로 처리한다. bootstrap 중 VHK CLI 결함은 **vhk-dogfood-issue**로 보낸다.
<!-- vhk-agent-skill: vhk-bootstrap-cursor@5 source=.agents/skills sha256=6823dc503625787aafe36daf30338d68c49c4dac3b78ad74c900ec58c6ed036f -->
