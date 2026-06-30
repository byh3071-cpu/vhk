---
id: ADR-007
date: 2026-06-30
status: accepted
tags: [subagent, agent, governance, policy]
---

# ADR-007: 서브에이전트 활용 정책 — plugin SoT · 읽기전용 위임 · 판정은 결정론 게이트만

## 맥락 (Context)

"Claude Code 공식 문서 기준으로 vhk에 서브에이전트를 도입하면 어떨까"라는 검토에서 출발했다. 공식 사양(code.claude.com/docs/en/sub-agents)과 vhk 현 구조를 대조한 결과:

- **vhk는 이미 서브에이전트를 쓰고 있다.** `yohan-core` 플러그인(marketplace `yohan-cc-skills`, v0.3.0)에 4개가 정의·설치돼 있다. 경로: `~/.claude/plugins/.../yohan-core/agents/*.md`.

  | 에이전트 | model | tools(정의상) | 권한 | 역할 |
  |---|---|---|---|---|
  | explorer | haiku | Read, Grep, Glob, Bash | 읽기전용 | 정찰 |
  | planner | sonnet | Read, Grep, Glob | 읽기전용 | 설계 |
  | critic | sonnet | Read, Grep, Glob, Bash | 읽기전용(+memory:project, skills:cross-check) | 적대검증 |
  | shipper | sonnet | Read, Edit, Write, Bash | 쓰기 | 출시 |

- ⚠️ 위 tools는 **정의상** 권한이다. 실측(probe, 2026-06-30)에서 explorer/planner/shipper는 정의=실권한 일치였으나 **critic만 정의(읽기전용)와 달리 Write/Edit를 실제 보유**했다 — 결과 섹션 참조.
- 이 정의는 공식 best practice(단일 책임 · 도구 최소권한 · 작업별 model 차등)를 **이미 따르고 있다.** 즉 "새로 도입"이 아니라 "활용도를 정하는" 문제다.
- vhk 자동화(`vhk-auto`·`auto-merge`·병렬 7PR 머지)는 서브에이전트가 아니라 **스킬 + `vhk verify` 결정론 게이트 + 수동 worktree**로 돌아간다. 이는 INV-1(LLM 판정 금지) 때문의 **의도된 설계**다.
- vhk 프로젝트 레벨 `.claude/agents/` 는 존재하지 않는다.

정책을 명문화하지 않으면 "편하니까 합불 판정·머지·루프를 서브에이전트에 맡기자"는 압력이 INV 불변조건을 잠식할 수 있어, 활용 경계를 ADR로 못박는다.

## 결정 (Decision)

1. **범용 에이전트는 `yohan-core` plugin을 단일소스(SoT)로 유지한다.** vhk 레포에 복제하지 않는다 — SoT가 2곳이 되면 드리프트이고, 이는 RULES.md 단일소스 철학(sync)에 정면 배치된다.
2. **읽기전용 위임(explorer/critic)은 적극 활용한다.** 대규모 정찰·적대검증을 위임해 메인 대화 컨텍스트를 격리·절약(공식이 꼽는 1번 이득)한다. 단 ⑴ `dogfood`처럼 "직접 실행해 사용감을 겪는" 평가는 메인이 직접 수행하고(읽기 정찰과 본질이 다름), ⑵ critic은 실권한에 Write/Edit가 열려 있으므로(결과 참조) 적대리뷰에 쓸 때 쓰기·커밋 금지를 보장한 뒤 활용한다.
3. **합불 판정·진행 허가는 서브에이전트에 위임하지 않는다.** 판정은 `vhk verify` 결정론 + exit code만(INV-1/INV-4). `critic`은 "결함 발견·보고"까지만 하고, 게이트는 `/code-review`(INV-8)와 vhk CLI가 쥔다.
4. **`vhk-auto` 메인 루프를 서브에이전트로 분해하지 않는다.** 앵커→개발→검증→commit은 컨텍스트를 공유하는 순차 의존 작업 = 공식의 서브에이전트 anti-pattern.
5. **자동 push/머지/publish 오케스트레이션(Workflow·agent-teams)을 금지한다.** INV-7(자동 push·머지 금지) 충돌 + plan mode 약 7배 토큰.
6. **vhk 전용 에이전트가 필요해지면** plugin과 이름이 겹치지 않게 프로젝트 `.claude/agents/`에 추가한다(namespace상 `yohan-core:critic`과 프로젝트 `critic`은 override가 아니라 별개 에이전트). 현재 명확한 수요는 없어 보류.

## 대안 (Alternatives, 기각)

- **범용 explorer/critic을 vhk 레포에 복제** — SoT 2곳 드리프트. vhk 철학 정면 충돌.
- **합불 판정을 서브에이전트에 위임** — INV-1/INV-4 위배(LLM 판정 0 원칙).
- **Workflow/agent-teams로 병렬 머지 자동화** — INV-7 충돌 + ~7배 토큰.

## 결과 (Consequences)

- **정책 확정. 코드·동작 변경 0, 드리프트 0** (이 ADR 문서만 추가).
- **검증된 결함 (probe 2026-06-30)**: critic 정의 파일(cache·marketplace 동일)은 `Read, Grep, Glob, Bash`(읽기전용)인데, 실제 로드된 `yohan-core:critic`은 `Write, Edit`를 보유했고 임의 경로(scratchpad)에 파일을 **실제로 생성**했다. explorer/planner/shipper는 정의=실권한 일치, critic만 어긋난다 → critic 고유의 `memory: project`/`skills: cross-check`가 Write/Edit를 부여했으나 그 권한이 memory store로 스코프되지 않아 임의 쓰기가 열린 것으로 추정. **결과적으로 '적대리뷰 에이전트는 read-only'(CLAUDE.md LIVE, 과거 `vhk save` 정크커밋 사고) 원칙이 구조적으로 깨져 있다.**
- **후속 대응(별도 작업)**: ① 단기 — critic 적대리뷰 호출 시 쓰기·커밋 금지를 프롬프트로 명시(규율 가드). ② 구조 — plugin 서브에이전트의 tools가 이 환경에서 실제로 강제되는지 재현 확인 → 프로젝트 레벨 `.claude/agents/critic.md` 또는 settings 권한 deny로 쓰기 차단(plugin tools가 미적용이면 yohan-core 레포 측이 SoT). ③ 새 세션에서 read-only로 로드되는지(이 세션 한정 stale 로드인지) 확인.
- **참고**: `critic-gate.ps1` 훅은 도구 권한이 아니라 git push 직전 `.claude/.gate-pass`(6h) 확인용 release 게이트로, 본 정책과 별개 레이어다.
- 출처: code.claude.com/docs/en/sub-agents, /agent-sdk/subagents, /costs, /agent-teams, /workflows.
