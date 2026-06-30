---
id: ADR-007
date: 2026-06-30
status: accepted
tags: [subagent, agent, governance, policy]
---

# ADR-007: 서브에이전트 활용 정책 — plugin SoT · 읽기전용 위임 · 판정은 결정론 게이트만

## 맥락 (Context)

"Claude Code 공식 문서 기준으로 vhk에 서브에이전트를 도입하면 어떨까"라는 검토에서 출발했다. 공식 사양(code.claude.com/docs/en/sub-agents)과 vhk 현 구조를 대조한 결과:

- **vhk는 이미 서브에이전트를 쓰고 있다.** `private-agent-repository` 플러그인(marketplace `private-skills-repository`, v0.3.0)에 4개가 정의·설치돼 있다. 경로: `~/.claude/plugins/.../private-agent-repository/agents/*.md`.

  | 에이전트 | model | tools(정의상) | 권한(정의상) | 역할 |
  |---|---|---|---|---|
  | explorer | haiku | Read, Grep, Glob, Bash | 읽기전용 | 정찰 |
  | planner | sonnet | Read, Grep, Glob | 읽기전용 | 설계 |
  | critic | sonnet | Read, Grep, Glob, Bash | 읽기전용(+memory:project, skills:cross-check) | 적대검증 |
  | shipper | sonnet | Read, Edit, Write, Bash | 쓰기 | 출시 |

  > 표의 "읽기전용"은 **Write/Edit 도구 미선언** 기준이다. Bash 보유 에이전트(explorer/critic/shipper)는 셸로 파일을 바꾸는 게 기술적으로 가능하다(planner만 Bash도 없음). 그리고 이 열은 **정의 파일 선언값**이지 런타임 실측이 아니다(아래 ⚠️).

- ⚠️ 위 tools는 **정의상(선언)** 권한이다. probe(2026-06-30)로 직접 실측된 것은 **critic이 선언(읽기전용)과 달리 Write를 실제 실행**한 1건뿐 — explorer/planner/shipper의 런타임 도구셋은 정의 파일 대조만 했을 뿐 probe하지 않았다. 결과 섹션 참조.
- 정의 자체는 공식 best practice(단일 책임 · 도구 최소권한 선언 · 작업별 model 차등)를 따른다. 즉 "새로 도입"이 아니라 "활용도를 정하는" 문제다.
- vhk 자동화(`vhk-auto`·`auto-merge`·병렬 7PR 머지)는 서브에이전트가 아니라 **스킬 + `vhk verify` 결정론 게이트 + 수동 worktree**로 돌아간다. 이는 INV-1(LLM 판정 금지) 때문의 **의도된 설계**다.
- vhk 프로젝트 레벨 `.claude/agents/` 는 존재하지 않는다.

정책을 명문화하지 않으면 "편하니까 합불 판정·머지·루프를 서브에이전트에 맡기자"는 압력이 INV 불변조건을 잠식할 수 있어, 활용 경계를 ADR로 못박는다.

## 결정 (Decision)

1. **범용 에이전트는 `private-agent-repository` plugin을 단일소스(SoT)로 유지한다.** vhk 레포에 복제하지 않는다 — SoT가 2곳이 되면 드리프트이고, 이는 RULES.md 단일소스 철학(sync)에 정면 배치된다.
2. **선언상 읽기전용 에이전트(explorer/planner)는 탐색·정찰 위임에 적극 활용한다.** 대규모 정찰을 위임해 메인 대화 컨텍스트를 격리·절약(공식이 꼽는 1번 이득)한다. 단 ⑴ `dogfood`처럼 "직접 실행해 사용감을 겪는" 평가는 메인이 직접 수행한다(읽기 정찰과 본질이 다름). ⑵ critic은 쓰기가 열려 있음이 실측됐고 결과 가설 ⑶(선언이 런타임을 제한 못 할 수 있음)이 미검증이므로 — **critic 및 Bash 보유 에이전트(explorer 포함)를 위임할 때는 ⑶ 검증 전까지 쓰기·커밋 금지를 프롬프트로 명시한 뒤** 활용한다(프롬프트 규율 — 구조적 보장 아님).
3. **합불 판정·진행 허가는 서브에이전트에 위임하지 않는다.** 판정은 `vhk verify` 결정론 + exit code만(INV-1/INV-4). `critic`은 "결함 발견·보고"까지만 하고, 게이트는 `/code-review`(INV-8)와 vhk CLI가 쥔다.
4. **`vhk-auto` 메인 루프를 서브에이전트로 분해하지 않는다.** 앵커→개발→검증→commit은 컨텍스트를 공유하는 순차 의존 작업 = 공식의 서브에이전트 anti-pattern.
5. **자동 push/머지/publish 오케스트레이션(Workflow·agent-teams)을 금지한다.** INV-7(자동 push·머지 금지) 충돌 + plan mode 약 7배 토큰.
6. **vhk 전용 에이전트가 필요해지면** plugin과 이름이 겹치지 않게 프로젝트 `.claude/agents/`에 추가한다(namespace상 `private-agent-repository:critic`과 프로젝트 `critic`은 override가 아니라 별개 에이전트). 현재 명확한 수요는 없어 보류.

## 대안 (Alternatives, 기각)

- **범용 explorer/critic을 vhk 레포에 복제** — SoT 2곳 드리프트. vhk 철학 정면 충돌.
- **합불 판정을 서브에이전트에 위임** — INV-1/INV-4 위배(LLM 판정 0 원칙).
- **Workflow/agent-teams로 병렬 머지 자동화** — INV-7 충돌 + ~7배 토큰.

## 결과 (Consequences)

- **정책 확정. 코드·동작 변경 0, 드리프트 0** (이 ADR 문서만 추가).
- **실측 결함 (probe 2026-06-30, 재현법 포함)**: `private-agent-repository:critic`을 서브에이전트로 띄워 임의 경로(세션 scratchpad)에 파일 쓰기를 지시하자 **Write 도구로 파일을 실제로 생성**했다 — 정의 파일의 `tools: Read, Grep, Glob, Bash`(읽기전용 선언)와 모순. **직접 실측된 사실은 이 1건이다.**
- **추정(미검증)**:
  - ⑴ explorer/planner/shipper는 정의 파일·시스템 표기가 일치해 *보이나* 런타임 probe를 하지 않았다 — 선언 외 도구 보유 가능성을 배제하지 못한다.
  - ⑵ 원인은 critic 고유의 `memory: project`가 Write를 부여하고 그 권한이 memory store로 스코프되지 않은 것으로 *추정*하나 확정 아님.
  - ⑶ 더 강한 가설: `tools:` 선언이 이 환경에서 런타임 도구셋을 제한하지 않을 수 있다. 그렇다면 결함은 "critic만"이 아니라 도구 선언 전반의 문제이고, "critic만 deny" 같은 스코프 수정은 진단 오류가 된다.
- **확정된 함의**: 적어도 critic은 쓰기가 열려 있어, '적대리뷰 에이전트는 read-only'(CLAUDE.md LIVE, 과거 `vhk save` 정크커밋 사고) 원칙이 **critic에 한해** 구조적으로 깨져 있다.
- **후속 대응(별도 작업)**: ① 단기 — critic 적대리뷰 호출 시 쓰기·커밋 금지를 프롬프트로 명시(규율 가드, 이미 CLAUDE.md LIVE 반영). ② 구조 — **explorer/planner도 동일 probe**해 `tools` 선언이 실제 강제되는지부터 확정(⑶ 검증) → 그 결과에 따라 프로젝트 레벨 `.claude/agents/critic.md` 또는 settings 권한 deny로 차단(plugin tools 미적용이면 private-agent-repository 레포 측이 SoT). ③ 새 세션에서 read-only로 로드되는지(이 세션 한정 stale 로드인지) 확인.
- **참고**: `critic-gate.ps1` 훅은 도구 권한이 아니라 git push 직전 `.claude/.gate-pass`(6h) 확인용 release 게이트로, 본 정책과 별개 레이어다.
- 출처: Claude Code 공식 서브에이전트 문서(code.claude.com/docs/en/sub-agents, /agent-sdk/subagents, /costs, /agent-teams, /workflows).

## 후속 검증 노트 (2026-06-30 — probe 결과, 결정 불변)

후속 대응 ②(explorer/planner probe)를 실행해 가설 ⑶을 검증했다. 결정 섹션은 불변이고, 결과 섹션의 추정을 사실 수준별로 갱신한다.

- **실측(measured)**: `explorer`(정의 Read·Grep·Glob·Bash)·`planner`(정의 Read·Grep·Glob)를 각각 probe한 결과 **둘 다 Write/Edit 미보유로 파일 생성 실패** — 정의대로 읽기전용이었다. 따라서 가설 ⑶의 **전면적 형태**("선언이 어느 에이전트에서도 런타임을 제한하지 않는다")는 반증됐다 — 기본 tools 선언 제한은 작동한다. **단 선언은 '하한'(선언된 도구는 보장)일 뿐 상한이 아니다**: critic은 선언(Read·Grep·Glob·Bash)에 없는 Write를 실행했으므로(결과 섹션 실측), 부가 메커니즘(`memory:project` 추정)이 선언 외 도구를 더할 수 있다 — 이 우회 가능성은 critic 실측으로 남는다. (advisor 도구는 explorer/planner/critic 셋 다 공통 부여 — 정의와 무관한 기본값)
- **추론(inferred, n=1)**: 그렇다면 critic만 정의 밖 Write를 가진 원인은 critic 고유의 `memory: project`로 좁혀진다(`cross-check` 스킬은 `allowed-tools` 읽기전용이라 앞서 배제). 단 memory를 가진 에이전트가 critic 하나뿐이라 **단일 사례 추론**이며 인과 확정은 아니다.
- **미검증(pending)**: 위 인과를 확정하려면 `memory: project`만 단독으로 켠 격리 에이전트를 probe해야 한다(이 레포 `.claude/agents/memtest.md`로 셋업 — 다음 세션 로드 후 확인 예정). **확정 전까지 critic의 `memory` 제거 같은 구조 차단은 보류**하고, 단기 가드(후속 ① · CLAUDE.md LIVE 주의)로 운영한다 — 가설(n=1)에 근거한 전역·영구 변경의 리스크 회피.
