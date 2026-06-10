# 다음 작업 (next-task)

> "지금 무엇부터"의 상태 SoT. 버전·테스트 등 사실값은 package.json·CHANGELOG가 SoT.

**갱신:** 2026-06-10
**Phase:** measure-first 2종 진행. recall(RFC 0049) MVP+eval 머지(#232·#233). diff-coverage(RFC 0050·Goal 50) PR1 머지(#236)+파서픽스(#239) — `vhk diff-cover` 측정 도구(차단 0). 둘 다 **실측 누적 대기**(게이트/ML은 숫자가 정당화한 뒤). 추가: 콜드스타트 −37%(#240, inquirer lazy). 사실값(버전·테스트수)은 package.json·CHANGELOG.

## 다음 할 일 (measure-first 최우선)
- **diff-coverage 실측 누적** → `vhk diff-cover`를 실제 코드 작업 **diff ≥5건(며칠)** 돌려 미검증 변경분 분포 수집(RFC 0050 §5 관찰 프로토콜). 유의미>0 → PR2(review line-40 제거 + verify 증거 + CI). ≈0 → "이론적 구멍" 문서화 후 중단(YAGNI). ※ diff-hunks `+++` 파서 엣지는 #239에서 이미 강화 완료(상태머신).
- **recall 실측** → 며칠 `vhk recall` 실사용 → `vhk memory eval --init` 실쿼리 라벨 → 진짜 Recall@5. <70 반복이면 2차 ML(bge-m3, RFC 0049 §2 결정 잠금됨).
- **🎯 업계최상위(~4.7) 품질 로드맵** → [docs/rfc/0048](../rfc/0048-top-tier-quality-roadmap.md) + **Goals 47~54**. 13-에이전트 감사(3.5/5) 도출. 순서: **P0 먼저** — Goal 47(win32+Node20 CI 매트릭스) · Goal 48(MCP↔CLI 단일 진실원) → P1 49(린트 확대)·50(커버리지) → P2 51~54. 각 goal `vhk goal next`로 꺼내 개별 PR(AI 독주 방지). ※ 작업2.2(fast-check #213)·2.3(tsc/eslint #216) 머지로 Goal 49는 "도입→확대", Goal 52 property 옵션은 선점됨 — 재조정 필요.
- **미완 goal** (goals/ 동적 계산 — `vhk goal next`): silent-fallback 린트(Goal 25/27 영역·#128) · SEO 묶음(Goal 21~26) 등.
- **열린 이슈 = #38 1개** (RFC 0001 .vhk 규격 의견수렴 — 코딩 아닌 결정 토론, 4개 미해결 질문). 나머지(#157·#155·#171·#148·#160·#159·#158·#151) close 완료. #38은 close/유지 product 결정.

## 백로그 (예약 — 선행조건 충족 후)
- **CLI 콜드스타트 — inquirer lazy 머지 완료(#240, 512→323ms −37%)**. dep별 실측 결과 inquirer가 단일 최대(212ms=절반) → `lib/prompt.ts` lazy 래퍼로 80/20 처리(RFC 0047 §9). 잔여 명령 lazy+splitting(잔여 ~297ms, dep 12~33ms 단위)는 ROI↓·index.ts 고위험이라 보류.

## 블로커
- 없음

## 주의
- publish는 항상 main에서만 (가드 #119) · 사용자가 직접(2FA)
- 직접 main push 차단됨(분류기) → 변경은 PR 경유 + `gh pr merge --squash`
- active goal 은 goals/ 기준 동적 계산 (vhk work / vhk goal next)
- ⚠️ `vhk goal next`/`vhk work`는 이 파일을 **자동 스텁으로 덮어씀**(수동 콘텐츠 소실) — 수동 편집 후엔 goal next 실행 주의, 덮어쓰였으면 git restore.
- (cosmetic) tag `v2.4.2` → `131e3c3` (npm tarball 정확 일치, goals 30/33 미포함). main release 커밋은 `09e4b88` — 발행 tag 이동 금지라 둠(v2.4.0 동류).
