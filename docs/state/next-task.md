# 다음 작업 (next-task)

> "지금 무엇부터"의 **세션층** SoT — 본문 15줄 상한, 역사는 링크로 밀어냄. 순서(Phase)의 SoT = [roadmap.md](roadmap.md), 사실값(버전·테스트)은 package.json·CHANGELOG.
> ⚠️ `vhk goal next`/`vhk work`가 이 파일을 스텁으로 **전체 덮어쓸 수 있음** — 소실 시 `git restore docs/state/next-task.md`.

**갱신:** 2026-07-13 (오후 — Phase 2 코어 완주)
**Phase:** [roadmap.md](roadmap.md) **Phase 0~1·3 ✅ + Phase 2 코어 ✅** — 5트랙 병렬 완주(RFC 0062 #498 · #457 report-mode #492 · #455 가드 #497 · #456 상속 #495 · #458 recall 주입 #496 · 한글 서브별칭 #494 · #488 수정 #490). 각 트랙 critic 적대검증(불통과→수정 2회 포함) 후 머지. 잔여 = **GTM**(게시=사람)·T6·goal 65 판정.

## 지금
- **사람 큐:** ① **#455 종결 판단**(가드 구현 완료 — "승인 큐"는 자문형 구조상 무의미가 critic 판정, 수용 시 close) ② G3 육안 3항목(색상·Ctrl+C·리사이즈) ③ **Recall 라벨 재시도 가능**(#488 수정 머지됨 — `vhk memory eval --init`, 이제 미스도 라벨 가능) ④ GTM 게시 판단(Show HN·블로그 정정 — 초안은 AI 준비 예정) ⑤ SEO 키 발급(투입은 GTM 주간)
- **AI 큐:** GTM 준비(README 30초 quickstart·거짓완료 적발 데모·이슈템플릿 자발제출) → T6 부채정리 → goal 65 흡수판정 브리핑 → Phase 4(트리거 불가지론화 Cursor 스파이크)
- **최근 이력:** [07-13 Phase 2 코어 5트랙](../log/2026-07-13-phase2-leg1.md)(#490·#492·#494~#498) · [07-13 v2.11.0 릴리즈](../log/2026-07-13-v2.11.0-release.md) · [07-13 RFC 0061 완주](../log/2026-07-13-rfc0061-record-net.md)(#485) · [07-13 RFC 0060 완료](../log/2026-07-13-rfc-0060-init-onboarding.md)(#481·#483·#491) · [07-13 로드맵 재편](../log/2026-07-13-roadmap-realign-p1.md)(#482)

## 블로커
- [blockers.md](blockers.md) 활성 2건(goal-50 실데이터 · SEO 22~26 자격증명) — [skip-hardstop] 사람 대기, 진행 차단 아님.

## 주의
- publish = main에서만(#119)·사람 2FA(실 터미널 `npm publish --ignore-scripts`) / main 직접 push 차단 → PR 경유 / 로컬 게이트에 `pnpm lint` 필수 / 적대리뷰 에이전트 read-only 명시 / worktree 병합 직전 `git branch --show-current` 재확인.
- active goal은 goals/ 동적 계산(`vhk goal peek` 권장 — `goal next`는 이 파일 덮어씀). 완료 goal은 goals/archive/.
- 과거 이력 전문: [2026-07-13-next-task-archive.md](../log/2026-07-13-next-task-archive.md) + git history.
