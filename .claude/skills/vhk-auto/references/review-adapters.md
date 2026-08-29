# 독립 리뷰 어댑터

현재 호스트에서 실제로 제공되는 어댑터 하나만 고른다. 사용할 수 있는지 확인하지 못했거나 실행·인증이
실패하면 리뷰를 통과한 것으로 간주하지 않고 `blocked`로 끝낸다. 어떤 어댑터도 공통 Skill의 중단 조건을
완화할 수 없다.

| 호스트 | 독립 리뷰 1패스 |
|---|---|
| OpenAI Codex · Windows | `codex.cmd review --uncommitted` |
| OpenAI Codex · POSIX | `codex review --uncommitted` |
| Claude Code | 설치되어 있고 현재 세션에서 확인되는 `/code-review` Skill |
| Cursor · Google Antigravity | 현재 호스트가 제공하는 독립 리뷰 기능. 기능을 확인할 수 없으면 `blocked` |

리뷰의 자유 텍스트는 결함 신호로만 읽는다. 자동 합격 입력은 `vhk verify` 결과와 각 명령의 종료 코드뿐이다.
<!-- vhk-agent-skill: vhk-auto@5 source=.agents/skills sha256=2d4298d934c1eb5261c5e1f9afbd519e07fe8a89879271fd3ffcfbacaaa1b34f -->
