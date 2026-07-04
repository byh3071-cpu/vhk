---
id: PAT-003
패턴명: Claude Code SessionStart 훅 command — 상대경로·파이프 matcher·미따옴표 경로는 추론이지 사양이 아님
카테고리: env
증상: `.claude/settings.json`의 훅 `command`를 상대경로(`node .vhk/hooks/x.mjs`)로 쓰거나, `matcher`를 `"startup|resume"`처럼 파이프로 묶어 쓰면 로컬에서 잘 되는 것처럼 보이다가, 실제 세션에서(cwd 가 프로젝트 루트가 아니거나 파이프 OR 가 실은 미지원이면) 훅이 조용히 발동 안 하거나 "command not found"로 실패한다. 경로에 공백(Windows 흔함)이 있으면 인용부호 없이 깨진다.
원인: Claude Code 공식 문서의 훅 예시는 전부 `${CLAUDE_PROJECT_DIR}` 절대경로 치환 + 단일값 matcher(`"startup"`, `"compact"` 등)만 보여준다. 파이프 OR 나 상대경로가 "될 것 같다"는 추론으로 작성되면, 문서에 명시 안 된 동작이라 어떤 버전/환경에서 조용히 실패해도 이상하지 않다.
해결: 훅 `command` 는 항상 `"$CLAUDE_PROJECT_DIR"/...`(공식 예시 그대로) + 경로 전체를 큰따옴표로. `matcher` 에 여러 이벤트를 걸어야 하면 파이프 대신 같은 훅을 가리키는 별도 entry 여러 개로 분리(문서에 실제로 나온 패턴만 사용). 확신이 안 서면 `claude -p "..." --debug-file <path> -d hooks` 로 실제 세션을 돌려 디버그 로그의 "provided additionalContext" 성공 라인으로 실측 확인.
적용조건: `.claude/settings.json`(또는 다른 프로젝트의 동일 파일)에 SessionStart/Stop 등 훅을 직접 작성하는 모든 경우.
출처프로젝트: vhk-cli (goal 89, init 커스터마이징 트리거)
태그: [claude-code, hooks, session-start, settings-json, silent-failure]
발견일: 2026-07-03
출처DevLog: docs/log/2026-07-03-init-customization-goal-88-89.md
---

# PAT-003 — Claude Code SessionStart 훅 command — 상대경로·파이프 matcher·미따옴표 경로는 추론이지 사양이 아님

훅 JSON은 로컬에서 한두 번 손으로 트리거해봐도 "되는 것 같다"는 착각을 주기 쉽다 — cwd 가
우연히 맞았거나, 테스트한 버전에서 파이프가 우연히 동작했을 뿐일 수 있다. 공식 문서에 실제로
나온 패턴만 쓰고, 확신이 필요하면 `claude -p ... --debug-file ... -d hooks` 라이브 세션으로
실측하는 습관이 "이럴 것 같다"는 추론보다 훨씬 싸고 확실하다.
