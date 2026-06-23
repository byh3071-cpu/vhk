# 다음 작업 (next-task)

> "지금 무엇부터"의 상태 SoT. 버전·테스트 등 사실값은 package.json·CHANGELOG가 SoT.
> ⚠️ `vhk goal next`/`vhk work`가 이 파일을 스텁으로 **전체 덮어쓸 수 있음** — 수동 편집
> 직후 해당 명령 실행 주의. 소실 시 복구: `git restore docs/state/next-task.md`.

**갱신:** 2026-06-23
**Phase:** **도그푸딩 하드닝(RFC 0053 · goals 78~84) 완료** — 78(#303)·79(#304)·80(#310)·81(#311)·82(#312)·83(#332)·84(#348) 전부 머지. 우선순위 2 measure-first가 현재 최우선(Recall@5 라벨링·diff-cover 누적 대기). 뒷단 4트랙(74~77)·SEO 22~26·SOUL 상속 기완료. 사실값(버전·테스트수)은 package.json·CHANGELOG.

## 다음 할 일 (measure-first 최우선)
- **✅ [2026-06-23 완료] v2.7.0 npm 발행** → `@byh3071/vhk` 2.6.0 → 2.7.0 (latest). 집 컴퓨터에서 pull(behind 3)→build·test 1799 pass→`npm publish --ignore-scripts`. 발행 절차(보안키 2FA → 실 터미널 필수) = [docs/log/2026-06-23-vhk-2.7.0-publish.md](../log/2026-06-23-vhk-2.7.0-publish.md). 🔧 잔여 갭: `.vhk/ops-prompt.md`·`sell-prompt.md` gitignore 미등록 → 발행 시 pnpm 막힘(npm은 무관). 보강 PR 권장.
- **⓪ [새 전략 최우선 · 2026-06-22 · RFC 0056] `vhk receipt` MVP** → 진입점 [docs/log/2026-06-22-rfc0056-evidence-receipt.md](../log/2026-06-22-rfc0056-evidence-receipt.md). VHK 정체성을 "멀티툴 솔로용 거짓완료 탐지기(Evidence Receipt)"로 재정의([RFC 0056](../rfc/0056-vhk-evidence-receipt.md)·[ADR-006](../adr/ADR-006-vhk-identity-evidence-receipt.md)). **선결**: vhk가 추적파일(`.vhk/events/*.jsonl`) 갱신→작업트리 늘 dirty→receipt 늘 block 봉인(세션시작 `git status M .vhk/events/ai-actions.jsonl` 관찰). **T1** `vhk receipt`(4대 기계증거→`.vhk/receipts/<id>.{json,md}`, decision 기계만, 등록 4지점+드리프트 테스트 수용기준) → T2 위조방어+.md → T3 거짓완료 적발 1건 입증(현 0/8). **90일 단일 성공기준=적발 1건, 0건이면 가설 폐기.** ※ RFC 0055 §8/§7 폐기, §3·§4·§9는 결함 정정 후 재사용. measure-first와 같은 방향(거짓완료 측정).
  - **★2026-06-23 적대검증 + goal 등록**: 탐지범위 역설(diff-cover는 "실행됐나"만 잼·정밀화로 안 풀림 → "게으른 거짓완료"로 정직화, 0056 §6·§11)·#315 실재(verify가 추적 ledger append → 자기 dirty) **코드 확정**. → **[Goal 85](../../goals/85-receipt-self-reference-seal.md)(#315 봉인·T1 선결) · [Goal 86](../../goals/86-receipt-mvp.md)(receipt MVP T1)** 신규 등록. 진입점 [docs/log/2026-06-23-rfc0056-adversarial-review.md](../log/2026-06-23-rfc0056-adversarial-review.md). **코드 미착수(등록만)** — T1 선결 = Goal 85.
- **[2026-06-23 완료] 도그푸딩 버그수색 라운드2 — safety/MCP high 7 + resume 해소** → 6-22 라운드2(#313~347) 중 처리: undo HARD_STOP·non-TTY(#337/#338 → #352) · HARD_STOP 가드 누락 goal sync·seo(#334/#335/#336 → #354) · MCP 거짓보고 NL미인식·audit(#340/#341 → #355) · MCP dist parity 버전스큐(#339 → #356) · resume exit127(#353 → #357, **rmSync(파일) silent exit127 근본 — TS-005**) · 미인식 exit0 위장(#346 → #359) · help 정합(#347 → #351). **남은 = med/low ~29건** (high 잔여: **#313** recall NLP 가로채기 · **#315** verify check-fresh[Goal 85가 봉인]). 착수 시 **worktree 분리 필수**(동시 세션 git 레이스 — 공유 워킹트리서 브랜치 조작·force push 금지). 우선순위: #313(recall) → 파괴적 med(#317/#318 memory id 부분파싱·#316 secure 오탐) → 레지스트리(#345/#344/#314).
- **[완료] 도그푸딩 하드닝 (RFC 0053 · goals 78~84)** → 실 사용자 전수 감사(`docs/log/2026-06-20-dogfood-audit.md`) 기반 전 goal 머지.
  - ✅ **78**(#303): `goal next` 비파괴화 + `vhk goal peek`. ✅ **79**(#304): recall-log timeout 30s + TS-004(환경분리는 YAGNI 관찰).
  - ✅ **80**(#310): 증거 신선도 SHA 강등(review가 SHA≠HEAD/dirty 감지, goal 44 소비측 완결).
  - ✅ **81**(#311): 제품 설명 단일 SoT(index.ts `.description` → `getVhkDescription()` 런타임 주입). brief는 VHK-004 의도로 미변경.
  - ✅ **82**(#312): `.vhk/ledger.jsonl` 추적 정합(카드 "gitignore"는 정책과 반대 — spec 1.1이 ✅추적). 정책 가드 vitest.
  - ✅ **83**(#332): secure 픽스처 MEDIUM→INFO 강등(`isTestFixturePath`+`downgradeTestFixtureFindings`). critical/high·게이팅 불변.
  - ✅ **84**(#348): doctor/status next-step 맥락 분기(`classifyMaturity` — established→work, new→온보딩). D9 해소.
  - 각 goal: TDD + 다각 적대리뷰(7~12 에이전트, 반증). **81·82·84는 선조사로 범위 재조정**("확실한 것만" — 카드 전제가 코드와 어긋남).
  - **연계(새 goal 없음)**: D4 recall 오매칭 → RFC 0049 · D5 검증 집행력 → Goal 53.
  - ⚠️ goal 은 `vhk goal next` 대신 `vhk goal peek` 권장(D1). PR 은 `--base main` 직접 생성. **적대리뷰 워크플로 에이전트는 read-only 명시**(과거 `vhk save` 정크커밋 사고).
  - 🔧 **작은 갭(미착수)**: `.vhk/ops-prompt.md`·`sell-prompt.md` gitignore 미등록(82가 ledger만 다룸) → `.vhk/.gitignore`+`templates/vhk-dir.ts` 보강.
  - ⚠️ **동시 세션 주의**: 다른 Claude 세션이 같은 폴더에서 measure-first/proof 작업 중(`docs/rfc/0055`·`docs/log/2026-06-22-dogfood-measure-first.md`·`docs/state/research-backlog.md` untracked) — git 충돌 주의, worktree 분리 권장.
- **[현재] measure-first 가동 (2026-06-20 착수)** → 도구 3종 작동 확인(`vhk recall`·`vhk diff-cover`·`vhk memory eval`, 로컬 dist v2.6.0). **Recall@5 측정 = 평가셋 필요 → `vhk memory eval --init` 대화형 라벨링(사용자가 실쿼리에 정답 표시)이 선결** — 내가 비대화형으로 못 함. 실쿼리는 `.vhk/recall-log.jsonl`에 3개 누적(리뷰 기준·커버리지 게이트), 며칠 더 다양한 쿼리 쌓여야 의미. diff-cover는 실작업 기능소스(src/commands·src/lib) diff가 쌓일 때 자동 측정 — 현재 작업트리 변경 0이라 "측정 대상 없음". ※ 풀사이클 뒷단 4트랙(RFC 0052)·SOUL 상속(#297)은 **완료**.
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
- publish는 항상 main에서만 (가드 #119) · 사용자가 직접(2FA = Windows 보안키 → 실 터미널 `npm publish --ignore-scripts`, Claude `!`·`--otp` 불가) · v2.7.0 2026-06-23 발행 완료
- 직접 main push 차단됨(분류기) → 변경은 PR 경유 + `gh pr merge --squash`
- active goal 은 goals/ 기준 동적 계산 (vhk work / vhk goal next)
- (2026-06-23) goals/ 완료 80개 → `goals/archive/` 이동 — `vhk goal list`엔 active 6개(50·62·65·79·85·86)만, 완료 이력은 `goals/archive/README.md` 자동 인덱스. listGoals·gen-goals-index·M.4 모두 flat 읽기라 archive 무시(무영향 검증).
- ⚠️ `vhk goal next`/`vhk work`는 이 파일을 **자동 스텁으로 덮어씀**(수동 콘텐츠 소실) — 수동 편집 후엔 goal next 실행 주의, 덮어쓰였으면 git restore.
- (cosmetic) tag `v2.4.2` → `131e3c3` (npm tarball 정확 일치, goals 30/33 미포함). main release 커밋은 `09e4b88` — 발행 tag 이동 금지라 둠(v2.4.0 동류).
