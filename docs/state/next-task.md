# 다음 작업 (next-task)

> "지금 무엇부터"의 **세션층** SoT — 본문 15줄 상한, 역사는 링크로 밀어냄. 순서(Phase)의 SoT = [roadmap.md](roadmap.md), 사실값(버전·테스트)은 package.json·CHANGELOG.
> ⚠️ `vhk goal next`/`vhk work`가 이 파일을 스텁으로 **전체 덮어쓸 수 있음** — 소실 시 `git restore docs/state/next-task.md`.

**갱신:** 2026-07-13 (심야 3차)
**Phase:** [roadmap.md](roadmap.md) **Phase 0~1·3 ✅ 완결** — Wave 2 양축(0060 #481·#483 / 0061 #485) + **v2.11.0 발행 완결**(npm latest·태그·Release·노션 정합, e2e 도그푸딩 영수증 첨부). 다음 = **Phase 2**.

## 지금
- **사람 큐:** G3 육안 3항목만(색상·Ctrl+C 래퍼 생존·리사이즈 — 종료감지/통과는 실측 완료) · Recall 라벨은 **#488 수정 후 재시도**(eval --init 이 recall 미스 쿼리 라벨 불가 — 첫 시도 라벨 0 dead-end) · SEO 키 발급(가이드는 07-13 세션 보고, 투입은 GTM 주간)
- **AI 큐:** Phase 2 — RFC 0062(드리프트 자동감지) 초안 → #457 report-mode(preflight.ts 접촉은 #457 먼저 직렬) → #455/#456/#458 → #488 수정 → GTM 준비(quickstart·데모)
- **최근 이력:** [07-13 v2.11.0 릴리즈](../log/2026-07-13-v2.11.0-release.md)(#487·태그·Release·노션 정합·#488 발견) · [07-13 RFC 0061 완주](../log/2026-07-13-rfc0061-record-net.md)(#485) · [07-13 RFC 0060 완료](../log/2026-07-13-rfc-0060-init-onboarding.md)(#481·#483) · [07-13 로드맵 재편](../log/2026-07-13-roadmap-realign-p1.md)(#482) · [07-12 독푸딩 Wave1 + v2.10.0 발행](../log/2026-07-12-dogfood-init-wave1.md)

## 블로커
- [blockers.md](blockers.md) 활성 2건(goal-50 실데이터 · SEO 22~26 자격증명) — [skip-hardstop] 사람 대기, 진행 차단 아님.

## 주의
- publish = main에서만(#119)·사람 2FA(실 터미널 `npm publish --ignore-scripts`) / main 직접 push 차단 → PR 경유 / 로컬 게이트에 `pnpm lint` 필수 / 적대리뷰 에이전트 read-only 명시 / worktree 병합 직전 `git branch --show-current` 재확인.
- active goal은 goals/ 동적 계산(`vhk goal peek` 권장 — `goal next`는 이 파일 덮어씀). 완료 goal은 goals/archive/.
- 과거 이력 전문: [2026-07-13-next-task-archive.md](../log/2026-07-13-next-task-archive.md) + git history.
