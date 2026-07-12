# 다음 작업 (next-task)

> "지금 무엇부터"의 **세션층** SoT — 본문 15줄 상한, 역사는 링크로 밀어냄. 순서(Phase)의 SoT = [roadmap.md](roadmap.md), 사실값(버전·테스트)은 package.json·CHANGELOG.
> ⚠️ `vhk goal next`/`vhk work`가 이 파일을 스텁으로 **전체 덮어쓸 수 있음** — 소실 시 `git restore docs/state/next-task.md`.

**갱신:** 2026-07-13
**Phase:** [roadmap.md](roadmap.md) Phase 0(출고·결정 청산)~1(정합화+계측 스위치온) 진행 중 — v2.10.0 발행 ✅

## 지금
- **사람 큐:** PR #464 머지 클릭(rebase 완료·MERGEABLE) · PR #461 판정 · G3 스파이크 TTY 채점(`scripts/spike-g3-process-wrap.mjs`) · Recall 라벨 시작(`vhk memory eval --init`, 실쿼리만·건수 강제 금지) · SEO 키 발급 신청만(투입은 Phase 2 GTM 주간) · RFC 0061 승인 여부(0060 T1은 별도 세션 착수됨)
- **AI 큐:** Phase 1 계측 스위치온(receipt 적발률 90일 개시·주간 `vhk stats --trend`→계측 DB) → Phase 2 준비(RFC 0062 초안·#457 report-mode — preflight.ts 접촉은 #457 먼저 직렬)
- **최근 이력:** [07-13 RFC 0060 완료(init 기록 온보딩 T1~T4+T1b)](../log/2026-07-13-rfc-0060-init-onboarding.md)(#481·#483) · [07-13 로드맵 재편](../log/2026-07-13-roadmap-realign-p1.md) · [07-12 독푸딩 Wave1 + v2.10.0 발행](../log/2026-07-12-dogfood-init-wave1.md) · [07-08 Wave 1~4 머지](../log/2026-07-08-wave1-4-merge-closure.md) · [07-07 RSI 결정·전수감사](../log/2026-07-07-rsi-decision-and-next-phase-audit.md)(#464)

## 블로커
- [blockers.md](blockers.md) 활성 2건(goal-50 실데이터 · SEO 22~26 자격증명) — [skip-hardstop] 사람 대기, 진행 차단 아님.

## 주의
- publish = main에서만(#119)·사람 2FA(실 터미널 `npm publish --ignore-scripts`) / main 직접 push 차단 → PR 경유 / 로컬 게이트에 `pnpm lint` 필수 / 적대리뷰 에이전트 read-only 명시 / worktree 병합 직전 `git branch --show-current` 재확인.
- active goal은 goals/ 동적 계산(`vhk goal peek` 권장 — `goal next`는 이 파일 덮어씀). 완료 goal은 goals/archive/.
- 과거 이력 전문: [2026-07-13-next-task-archive.md](../log/2026-07-13-next-task-archive.md) + git history.
