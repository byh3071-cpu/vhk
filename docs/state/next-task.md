# 다음 작업 (next-task)

> "지금 무엇부터"의 상태 SoT. 버전·테스트 등 사실값은 package.json·CHANGELOG가 SoT.
> ⚠️ `vhk goal next`/`vhk work`가 이 파일을 스텁으로 **전체 덮어쓸 수 있음** — 수동 편집
> 직후 해당 명령 실행 주의. 소실 시 복구: `git restore docs/state/next-task.md`.

**갱신:** 2026-06-16
**Phase:** Fable5 배치3(goal68 remind·69 evolve negatives·70 MCP 옵트인) + 풀사이클 뒷단 첫 트랙(goal74 vhk content)+RFC 0052(뒷단 4트랙 설계) 머지(#282·#283·#284·#285). measure-first 2종(recall·diff-coverage)은 **여전히 실측 누적 대기**(게이트/ML은 숫자가 정당화한 뒤). 사실값(버전·테스트수)은 package.json·CHANGELOG.

## 다음 할 일 (measure-first 최우선)
- **풀사이클 뒷단 나머지 트랙 (RFC 0052)** → ~~`vhk launch`(goal 75)~~ 구현 완료(feat/fullcycle-launch) → **다음 `vhk ops`(76)** → `sell`(77). content(74)·launch(75)·RFC 0052 머지/구현됨. 전부 자문형(상태수집+프롬프트 생성, 발송·결제·삭제 0 — 헌법). `src/commands/launch.ts`(또는 content.ts) + `src/lib/emit-prompt.ts` 패턴 복제, 개별 goal·개별 PR(동시 착수 금지). 핸드오프: `C:\Users\user\.claude\plans\handoff-fullcycle-2026-06-16.md`.
- **goal 73 (#276 `vhk check --evals` LLM-judge)** → Fable5 프롬프트 위생 golden-set. L1(결정적 검사) 먼저, L2(LLM-judge) 나중.
- **diff-coverage 실측 누적** → `vhk diff-cover`를 실제 코드 작업 **diff ≥5건(며칠)** 돌려 미검증 변경분 분포 수집(RFC 0050 §5 관찰 프로토콜). 유의미>0 → PR2(review line-40 제거 + verify 증거 + CI). ≈0 → "이론적 구멍" 문서화 후 중단(YAGNI). ※ diff-hunks `+++` 파서 엣지는 #239에서 이미 강화 완료(상태머신).
- **recall 실측** → 며칠 `vhk recall` 실사용 → `vhk memory eval --init` 실쿼리 라벨 → 진짜 Recall@5. <70 반복이면 2차 ML(bge-m3, RFC 0049 §2 결정 잠금됨). **실사용 시나리오 추가(2026-06-11): "리뷰 기준 추출"** — PR 리뷰 전 diff 요약을 쿼리로 `vhk recall` 실행 → 관련 ADR·패턴만 뽑아 리뷰 기준으로 주입(외부 사례 gen-criteria 패턴: 메타데이터 1차 필터 + 의미 2차 판단 + "이 작업에 어떻게 적용되는지" 서술 강제). 실쿼리 라벨 축적과 직결.
- **🎯 업계최상위(~4.7) 품질 로드맵** → [docs/rfc/0048](../rfc/0048-top-tier-quality-roadmap.md) + **Goals 47~54**. 13-에이전트 감사(3.5/5) 도출. 순서: **P0 먼저** — Goal 47(win32+Node20 CI 매트릭스) · Goal 48(MCP↔CLI 단일 진실원) → P1 49(린트 확대)·50(커버리지) → P2 51~54. 각 goal `vhk goal next`로 꺼내 개별 PR(AI 독주 방지). ※ 작업2.2(fast-check #213)·2.3(tsc/eslint #216) 머지로 Goal 49는 "도입→확대", Goal 52 property 옵션은 선점됨 — 재조정 필요.
- **미완 goal** (goals/ 동적 계산 — `vhk goal next`): silent-fallback 린트(Goal 25/27 영역·#128) · SEO 묶음(Goal 21~26) 등.
- **하네스 사례 연구 후속(2026-06-11)**: CodeRabbit 자동 PR 리뷰 설정 PR #255 — **사용자 GitHub App 설치 대기**(coderabbit.ai에서 vhk 레포 승인, ~2분, public=Pro 무료). Goal 62(docs-first+docs-diff, P2) 기안됨. 파이썬 headless 러너는 보류(6/15 Agent SDK 종량제 전환 + 현행 worktree 패턴으로 충분). 후속 구현 완료(저녁): @claude 리뷰반영 워크플로(#259) + auto-merge 무인 머지 스킬(#262 — 가동은 전용 세션 `/loop 15m /auto-merge`, 라벨은 사람만 부착).
- **열린 이슈 = #38 1개** (RFC 0001 .vhk 규격 의견수렴 — 코딩 아닌 결정 토론, 4개 미해결 질문). 나머지(#157·#155·#171·#148·#160·#159·#158·#151) close 완료. #38은 close/유지 product 결정.

## 백로그 (예약 — 선행조건 충족 후)
- **2026-06-11 전수 코드 리뷰 잔여분** → [docs/log/2026-06-11-full-code-review.md](../log/2026-06-11-full-code-review.md) — P1 23건 중 Top 10 즉시수정 외 잔여 P2 60건(HARD_STOP 갭 의도확정·sync 마커 견고화·goal next 덮어쓰기 보존 등)·리팩토링 로드맵(server.ts→memory→ko 순)·테스트 보강(MCP save L2)·DX(git hooks·check-goal 통합·CI 가드 배선). 파이썬 도입은 불필요 결론.
- **CLI 콜드스타트 — inquirer lazy 머지 완료(#240, 512→323ms −37%)**. dep별 실측 결과 inquirer가 단일 최대(212ms=절반) → `lib/prompt.ts` lazy 래퍼로 80/20 처리(RFC 0047 §9). 잔여 명령 lazy+splitting(잔여 ~297ms, dep 12~33ms 단위)는 ROI↓·index.ts 고위험이라 보류.

## 블로커
- 없음

## 주의
- publish는 항상 main에서만 (가드 #119) · 사용자가 직접(2FA)
- 직접 main push 차단됨(분류기) → 변경은 PR 경유 + `gh pr merge --squash`
- active goal 은 goals/ 기준 동적 계산 (vhk work / vhk goal next)
- ⚠️ `vhk goal next`/`vhk work`는 이 파일을 **자동 스텁으로 덮어씀**(수동 콘텐츠 소실) — 수동 편집 후엔 goal next 실행 주의, 덮어쓰였으면 git restore.
- (cosmetic) tag `v2.4.2` → `131e3c3` (npm tarball 정확 일치, goals 30/33 미포함). main release 커밋은 `09e4b88` — 발행 tag 이동 금지라 둠(v2.4.0 동류).
