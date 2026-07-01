# 2026-07-01 — 후속 3건 핸드오프 (다음 세션 이어서)

> 복리 척추 스프린트(v2.8.0) 마감 후 남은 후속 3건. 각 항목 = 진입점·정확한 위치·계획·게이트. 다음 세션은 이 문서 + docs/state/next-task.md 최상단부터.

---

## ① 🔧 선재버그 — evolve/goal/seo 한글 서브별칭 CLI 차단 (중간 난이도)

**증상:** `vhk evolve 제안`·`묶음`·`목록`, `vhk goal <한글서브>` 등 **컨테이너 명령의 한글 서브별칭이 전부** "'X' 는 evolve 의 서브커맨드가 아니에요"로 거부됨(영문 `vhk evolve digest`는 정상). N5 스모크에서 발견 — 형제 6개(`.alias('제안')` 등)도 동일하게 죽어있는 **선재 결함**(N5 무관).

**근본 원인 (정확한 위치):**
- `src/lib/cli-args.ts:254-255` — `subs = CONTAINER_SUBCOMMANDS[canonical]` + `isRealSubcommandPath(first, rest[1])`. `rest[1]`(서브커맨드 토큰)이 유효 경로인지 검사하는데 **영문 allowlist만** 봄.
- `src/lib/command-registry.ts:23` — `CONTAINER_SUBCOMMANDS.evolve = ['suggest','negatives','list','digest','apply','reject','undo']` (영문 전용). goal·seo도 동형.
- index.ts 의 `.alias('제안')` 등은 commander엔 등록되나, **NL 가드가 commander 도달 전에 차단**해서 무력.

**수정 방향 (택1):**
1. `CONTAINER_SUBCOMMANDS` 에 한글 별칭 합류(각 컨테이너: evolve·goal·seo) → `isRealSubcommandPath` 가 한글도 유효로 인정. 드리프트 테스트(한글 서브별칭 ⊆ 실제 commander 별칭) 추가.
2. `isRealSubcommandPath` 가 commander 의 실제 등록 별칭을 조회하도록 변경(단일 진실원).

**주의:** GA 라우팅(NL 가드)이라 광범위·민감. 전 컨테이너 스모크 필수(`vhk evolve 제안`·`goal <한글>`·`seo <한글>` 실행 확인 — 유닛만으론 못 잡음, N1 KNOWN·N5 CONTAINER 교훈).
**게이트:** pnpm lint; typecheck; build; test:run + 스모크. **난이도:** 중(30~60분).

---

## ② 📊 measure-first — Recall@5 / diff-cover 실측 (사용자 데이터 게이트)

**상태:** 도구 3종 **이미 존재**(`vhk recall`·`vhk memory eval --init`·`vhk diff-cover`). 코딩 아님 — **데이터 축적 + 사용자 대화형 라벨링**이 선결.

**필요:**
- `vhk memory eval --init` = **사용자 대화형** 라벨링(실쿼리에 정답 표시). AI가 비대화형으로 못 함.
- 며칠 `vhk recall` 실사용 → `.vhk/recall-log.jsonl` 다양한 쿼리 누적 → 진짜 Recall@5.
- diff-cover는 실작업 기능소스(src/commands·src/lib) diff ≥5건 누적 시 자동 측정.

**다음 한 수(사용자):** `vhk memory eval --init` 실행 + 며칠 recall 사용. 데이터 쌓이면 Recall@5 <70 반복 시 2차 ML(bge-m3, RFC0049 §2 결정 잠금).
**AI 몫:** 데이터 쌓인 후 측정 스크립트·추세 리포트(N6 stats --trend와 조인).

---

## ③ 🪝 N11 — evolve-nudge Stop hook (S 난이도)

**무엇 (플랜 Part C ⓐ / Part D N11):** Claude 세션 Stop 시 패턴 임계 도달하면 **자문 넛지**(advisory). 읽기전용·집행0.

**구현:**
- `scripts/evolve-nudge.mjs`(신규) + `.claude/settings.json` Stop hook 배선.
- 로직: 패턴 감지 임계(미제안 후보 > N or 추세 악화) → "evolve suggest 후보 N건 대기" 1줄 출력. 집행 0.

**★시너지:** N1 `loop --tick`(#436)이 이미 `collectState`/`computeLoopTick`으로 폐회로 상태 읽음 → **N11은 Stop hook에서 `vhk loop`(또는 그 하위 로직) 호출**로 대부분 재사용 가능. evolve-nudge.mjs를 새로 짜기보다 loop 조율자 얹기가 저렴.
**주의:** 실패비용 high 자동화 배제 철칙 — 넛지는 **자문만**(자동 apply·커밋 0). settings.json Stop hook 은 사용자 승인(자동화 배선).
**게이트:** 훅 스크립트 순수성·읽기전용 확인 + 실제 Stop 트리거 스모크. **난이도:** S.

---

## 우선순위 제안
1. **① 선재버그** — 사용자 체감(한글 별칭 안 됨) + 중난이도, 바로 착수 가능.
2. **③ N11** — S난이도·N1 재사용, 복리 척추 마무리.
3. **② measure-first** — 사용자 라벨링 병행(며칠 백그라운드).

기타 후보: ecosystem 6 PR 머지 확인(검증 완료·사용자 머지 대기) · goal 73 BLOCKED(RFC0056 §2 정체성).
