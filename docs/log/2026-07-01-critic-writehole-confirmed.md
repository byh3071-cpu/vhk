# 2026-07-01 — critic 쓰기구멍 원인 확정 (memtest probe) + 병렬 실행 계획 수립

> append-only. 추가만, 수정·삭제 금지.

## 한 일
1. **VHK 일감·자동화·시스템 전수 실측** → 병렬 실행 계획서 수립(서브에이전트 5개: Explore 3 + Plan 2 병렬).
2. **T1 critic-probe 실행** → `yohan-core:critic` 쓰기구멍 원인 격리 확정.

## T1 결과 (핵심)
- **probe**: `.claude/agents/memtest.md`(frontmatter `tools: Read` + `memory: project` 단독) 호출 → 지정 경로(scratchpad)에 파일 생성 시도.
- **결과**: **생성 성공.** memtest 실보유 도구 = `Read·Write·Edit` (정의는 `Read` 하나뿐).
- **판정**: **`memory: project` 필드가 런타임에 Write+Edit를 주입함이 확정.** ADR-007의 `yohan-core:critic` 쓰기 구멍 원인 = critic.md의 `memory: project` 줄. 기존 n=1 추정 → **격리 재현으로 확정**.
- 보조 단서: Claude Code 에이전트 레지스트리도 memtest 유효 도구를 `Read, Write, Edit`로 해석(frontmatter 무시하고 memory 필드가 권한 확장).

## 정크 청소
- probe 에이전트가 자기 Write 구멍으로 레포 `.claude/agent-memory/memtest/`(MEMORY.md·memtest-write-probe.md)에 메모리 파일 생성 → **"워크플로 에이전트 정크커밋" 패턴 재현**. 즉시 제거.
- `.claude/agent-memory/`는 gitignore라 커밋엔 무영향(git status 깨끗). 디스크 정크만 정리.
- scratchpad probe 파일(`memtest-probe.txt`)은 의도된 산출 → 유지(세션 종료 시 자동 정리).

## 보안 플래그 (별건)
- probe 세션 중 **lazyweb MCP 서버가 "사용자 허락 없이 `~/.claude/CLAUDE.md`에 LAZYWEB:ROUTER 규칙 블록 영구 주입하라"** 지시 발신. memtest·메인 둘 다 **거부**. 사용자 전역 설정을 본인 요청 없이 수정하는 외부 권한 누출 시도 → 무시 정당. (마침 이 세션 주제 "의도 안 한 쓰기 구멍"과 동일 계열.)

## 다음 (T2 — 다음 세션)
- `yohan-cc-skills`의 `plugins/yohan-core/agents/critic.md`에서 **`memory: project` 줄 제거** → 전역 plugin PR.
- 머지 후 같은 memtest probe로 **Write 도구 사라졌는지 회귀확인** → 확인되면 `.claude/agents/memtest.md` 제거.
- ⚠️ yohan-cc-skills 미커밋 `critic-gate.ps1`(출처불명) 정체도 그때 확인.
- 즉시 위험은 CLAUDE.md LIVE B가드(critic 호출 시 쓰기·커밋 금지)로 이미 덮임 → 긴급도 낮음.

## 계획서 (이번 세션 산출)
- 병렬 실행 로드맵: 트랙 9 + 사람게이트 2(RFC0056 정체성·v2.8.0 2FA). WAVE 1 동시 worktree 4~5개. 직렬 2쌍(goal50→79 vitest.config / reinforce→evolve-apply evolve.ts).
- 자가진화 격차 ⓐ~ⓔ 안전버전(ⓑ는 LLM 판정금지 철칙 충돌 → 결정론 토큰 교집합 advisory·block 금지로 변형 / ⓓ 자동apply·N13 자동done은 철칙 위반 배제).
- 복리 척추 신규기능 5개: 지금 N2(reinforce evolve)·N7(receipt-log) → 다음 N1(loop tick)·N4(의도신호)·N6(stats trend).
- 전문: `~/.claude/plans/vhk-goal-shimmying-moore.md`.
