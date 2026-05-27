# Next Task

_수동 갱신. 자동화는 Goal 1 의 `vhk goal next` 도입 후 활성화._

```
TASK: Goal 1 — vhk goal 명령어 구현 (v1.2)
  - goals/1-goal-command.md 의 Completion Check 항목 5 개 서브커맨드 구현
    (init / list / next / check / done)
  - YAML frontmatter 파서 (정규식 기반, gray-matter 의존성 추가 금지)
  - `vhk check --goal N` goal-aware 확장
  - tests/goal-*.test.ts 단위 테스트
  - COMMANDS.md + README.md 명령어 표 갱신
  - 게이트: scripts/check-goal-1.sh 작성 + 통과
```

## Goal 0 완료 (2026-05-27)

- MCP tool 10 → 24 도달
- _meta 게이트 (tsc/tests/build) 모두 ✓
- 대화형 본질 4 커맨드 (gate/init/design palette/theme/start) MCP 제외 확정
