# 다음 작업 (next-task)

> "지금 무엇부터"의 **세션층** SoT — 본문 15줄 상한, 역사는 링크로 밀어냄. 순서(Phase)의 SoT = [roadmap.md](roadmap.md), 사실값(버전·테스트)은 package.json·CHANGELOG.
> ⚠️ `vhk goal next`/`vhk work`가 이 파일을 스텁으로 **전체 덮어쓸 수 있음** — 소실 시 `git restore docs/state/next-task.md`.

**갱신:** 2026-07-16 (세션 마감 — Orca 탭 스크롤 PR 대기)
**Phase:** [roadmap.md](roadmap.md) Phase 2 코어 ✅ 이후 — VHK 본선은 사람/GTM 큐. 사이드: Orca ADE 스크롤 수정 PR 대기.

## 지금
- **사이드(대기):** Orca [PR #8968](https://github.com/stablyai/orca/pull/8968) OPEN — 탭 전환 스크롤 보존. 메인테이너 perf 우려 코멘트. 머지·릴리즈 후 ADE 업데이트로 검증. 로그: [2026-07-16-orca-tab-scroll-session.md](../log/2026-07-16-orca-tab-scroll-session.md)
- **사람 큐:** ① **#455 종결 판단** ② G3 육안 3항목 ③ Recall 라벨 재시도(`vhk memory eval --init`) ④ GTM 게시 판단 ⑤ SEO 키
- **AI 큐:** GTM 준비 → T6 → goal 65 판정 → Phase 4
- **최근 이력:** [07-16 Orca 탭 스크롤](../log/2026-07-16-orca-tab-scroll-session.md) · [07-13 Phase 2 코어](../log/2026-07-13-phase2-leg1.md)

## 블로커
- [blockers.md](blockers.md) 활성 2건 — [skip-hardstop] 사람 대기, 진행 차단 아님.

## 주의
- publish = main에서만(#119) / main 직접 push 차단 → PR 경유 / `pnpm lint` 필수 / worktree 병합 직전 `git branch --show-current` 재확인.
- active goal은 `vhk goal peek` 권장.
