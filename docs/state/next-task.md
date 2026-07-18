# 다음 작업 (next-task)

> "지금 무엇부터"의 **세션층** SoT — 본문 15줄 상한, 역사는 링크로 밀어냄. 순서(Phase)의 SoT = [roadmap.md](roadmap.md), 사실값(버전·테스트)은 package.json·CHANGELOG.
> ⚠️ `vhk goal next`/`vhk work`가 이 파일을 스텁으로 **전체 덮어쓸 수 있음** — 소실 시 `git restore docs/state/next-task.md`.

**갱신:** 2026-07-18 (세션 마감 — 로드맵 정합 + GTM AI 준비분 완료·#509 머지)
**Phase:** [roadmap.md](roadmap.md) Phase 0 ✅ · 2 코어 ✅ — **GTM AI 준비분 완료(#509)**. AI 큐 빈 상태, 다음은 사람 큐 소화 후 Phase 4 판정. 사이드: Orca ADE 스크롤 PR 대기.

## 지금
- **AI 큐:** 비어 있음 — GTM 준비물 완료(적발 데모·이슈템플릿 #509 / quickstart 기존 실재). 다음 AI 작업 = Phase 4 판정 재료(실측 데이터) 누적 후.
- **사람 큐:** ① PR #505(goal 65 종결)·#504 검토·머지 ② G3 육안 3항목 ③ Recall 라벨 재시도(`vhk memory eval --init`) ④ GTM 게시 판단(Show HN·블로그) ⑤ SEO 키
- **사이드(대기):** Orca [PR #8968](https://github.com/stablyai/orca/pull/8968) OPEN — 머지·릴리즈 후 ADE 업데이트로 검증.
- **주의:** 로컬 vitest 전면 크래시(TS-004 악화, 0xC0000409) — 코드 무관·CI가 진실원. 로컬은 단독 파일 실행으로 우회.
- **최근 이력:** [07-18 로드맵 정합+GTM](../log/2026-07-18-roadmap-gtm-prep.md) · [07-16 Orca 탭 스크롤](../log/2026-07-16-orca-tab-scroll-session.md)

## 블로커
- [blockers.md](blockers.md) 활성 2건 — [skip-hardstop] 사람 대기, 진행 차단 아님.

## 주의
- publish = main에서만(#119) / main 직접 push 차단 → PR 경유 / `pnpm lint` 필수 / worktree 병합 직전 `git branch --show-current` 재확인.
- active goal은 `vhk goal peek` 권장.
