# Show HN 초안 — VHK (게시 = 사람, 이 파일은 초안·체크리스트)

> 상태: 초안 v1 (2026-07-18). 게시 판단·버튼은 요한.
> 제출 URL: https://news.ycombinator.com/submit
> 링크 대상: https://github.com/byh3071-cpu/vhk

## 제목 후보 (HN은 80자 제한, 과장 금지 문화)

1. `Show HN: VHK – catch AI "false completions" with machine evidence, not LLM judgment`
2. `Show HN: A harness that makes AI coding agents prove they actually finished`
3. `Show HN: VHK – exit codes and git state as a lie detector for AI coding agents`

추천 = 1번. [추론] "machine evidence, not LLM judgment"가 HN 청중의 LLM-판정 피로감을 정확히 찌름.

## 본문 (제출 폼 text 칸에 붙여넣기)

```text
I build software with AI coding agents (Claude Code, Cursor, Codex) daily,
and the failure mode that burned me most wasn't bad code — it was the agent
saying "done!" when it wasn't. Tests failing, changes uncommitted, stale
builds, all behind a confident summary.

VHK is a CLI harness that sits on top of whatever agent you use. The core
idea: completion claims must be backed by machine evidence, not model output.

`vhk receipt` checks four mechanical signals — real exit codes of
tsc/test/build, git dirty state, stale base SHA, and diff coverage — and
issues a BLOCK/PASS receipt. Zero LLM calls in the verdict path, so it can't
be sweet-talked.

Around that there's a full loop: rules that survive agent switching (one
RULES.md generates configs for 8 tools), goal gates that re-run checks before
anything is marked DONE, a commit hook that blocks code changes without a
session log, and repo-local memory that accumulates project rules over time.

Honest limits: it catches lazy false completions (broken builds, uncommitted
work, stale evidence). It does not catch plausible-but-wrong code — that
still needs review. It's also Korean-first (I built it for myself; English
docs are partial).

MIT licensed. npm: @byh3071/vhk. Feedback welcome, especially from people
who've been bitten by the same failure mode.
```

## 게시 체크리스트 (누르기 전 순서대로)

- [ ] README 데모 섹션이 main에 렌더되는지 최종 확인 (#509 머지분)
- [ ] `npm install -g @byh3071/vhk` 신품 머신 관점 1회 재현 (또는 npx)
- [ ] 제출 시간대: 미 동부 오전(한국 밤 10시~새벽 1시)이 Show HN 노출 유리
- [ ] 첫 1시간 댓글 응답 가능한 시간에 게시 (HN은 초기 응답이 생사 가름)
- [ ] 게시 후 URL을 docs/state/next-task.md 사람 큐에 기록 → Phase 2 exit "게시 1회 집행" 충족

## 예상 질문 3개 + 답 뼈대

1. **"LLM으로 LLM 검증하는 것보다 나은가?"** → 판정 경로에 LLM 0이 설계 핵심. 종료코드·git 상태는 조작 비용이 훨씬 높다. (한계 문단 그대로 인용)
2. **"CI랑 뭐가 다른가?"** → CI는 push 후·원격. 이건 에이전트 루프 안·로컬·세션 단위. 완료 '주장' 시점에 개입한다는 게 차이.
3. **"영어 지원은?"** → 정직하게: Korean-first, 영문 문서 부분적. 관심 있으면 이슈로.
