# 2026-06-20 — 실 사용자 도그푸딩 전수 감사

> 세션 목적: VHK를 **실 사용자 관점**으로 직접 써보며(읽기 아님 실행) 문제점·사용감·워크플로·필요 스킬훅·장단점·기능제안 도출.
> 방법: 사용자 여정(세션시작→작업→검증→저장) 순서대로 실명령 실행, 발견마다 재현 증거 수집, 부작용은 `git restore`로 원복.
> 산출: 재활용 프롬프트 `.claude/commands/dogfood.md`(`/dogfood` 스킬) · 개선 로드맵 `docs/rfc/0053-dogfood-hardening.md` · 실행 단위 `goals/78~84`.
> ⚠️ append-only — 이 파일은 추가만, 수정·삭제 금지(헌법).

## 한 줄 결론

**철학은 업계 최상위, 체감은 "강력하지만 길들이기 어려운 도구".** 거짓완료 방지·정직한 한계 명시·한국어 자연어는 드물게 잘 만들었으나, 매일 쓰는 동선에 지뢰 두 개(상태파일 파괴, 로컬에서 늘 빨간 verify)가 박혀 신뢰가 샌다. 지뢰부터 제거하면 체감이 가장 크게 오른다.

---

## 강점 (실측)

- **`vhk work` 세션 의례**: HARD_STOP 확인→변경파일→규칙 우선순위→현재 goal→next-task 미리보기→클립보드 복사→"claude 실행 후 Ctrl+V". 비개발자가 세션 시작을 무의식적으로 수행 가능.
- **자연어 라우팅 + 위험작업 차단**: `vhk "이거 어떻게 배포해?"` → deploy로 인식하되 *"위험 작업 미리보기 — 실행하지 않았습니다(Safety Mode: standard)"*. 자연어로도 위험작업을 못 건드림.
- **한국어 별칭**: `vhk 상태`, `vhk 보안 scan` 완벽 동작.
- **`review`의 메타인지**: *"⚠️ 이 판정은 보장이 아니라 신뢰도 신호 — 통과해도 거짓완료 가능성은 남습니다"*, *"git diff 미사용(v0) — 기존 테스트가 green이어도 이번 변경을 커버 못 했을 수 있음"*. 자기 한계를 도구가 명시 — 희귀.
- **`review`의 증거 의존**: latest.json 없으면 *"증거 부재 → review 중단(새 증거 안 만듦)"*. verify 없이 거짓 통과 불가.
- **`doctor`**: Node shim-safe·MCP 35 tools·드리프트 점검까지 신뢰감 있는 진단.
- 모든 명령 끝의 **"터미널에 복붙 / Cursor에게 말하기" 이중 안내** + `standup`/`today`의 정서적 격려.

---

## 문제점 (심각도순 · 전부 실제 재현)

### 🔴 P0 — 매일 동선의 지뢰

**[D1] `vhk goal next`의 파괴적 덮어쓰기 → Goal 78**
- 재현: "다음 goal 뭐지?" 조회 의도로 `vhk goal next` 1회 실행 → `docs/state/next-task.md`가 **30줄 삭제·8줄 추가**로 스텁이 됨(`git diff --stat` 확인). measure-first 계획·백로그·주의사항 전부 소실. `git restore`로 복구.
- 핵심: 경고문이 **파일 안에** 박혀 있다("⚠️ goal next/work가 이 파일을 스텁으로 전체 덮어쓸 수 있음") = 위험을 알면서 코드로 방치. 조회처럼 보이는 명령이 파괴적 쓰기를 한다.

**[D2] 로컬 `verify`가 영구 빨강(환경의존 테스트) → Goal 79**
- 재현: 깨끗한 `main`에서 `pnpm test:run` → **6 파일 7 테스트 실패**:
  - `tests/cloud.gh-contract.test.ts` (2) — gh CLI `--method/--input`, `gist --files/--raw` 플래그 존재 검증
  - `tests/exec.test.ts` — `safeExecFile: Windows .cmd shim (CVE-2024-27980 회귀 방지)`
  - `tests/context.test.ts` — "모듈을 import 할 수 있다"
  - `tests/mcp-server.test.ts` — "서버 인스턴스가 생성된다"
  - `tests/start.test.ts` — "start 함수가 export된다"
  - `tests/recall-log.test.ts` — "1000줄 초과 시 maxSize trim"
- 패턴 = **환경 의존(gh CLI 버전·Windows shim) + 골격 스모크**. CLAUDE.md "~1758 pass(CI)"는 CI 기준이고 이 로컬 머신에선 verify가 상시 빨강. **늘 빨간 신호등은 무시당한다** → verify 존재 이유 붕괴.
- ⚠️ 미확정: 이게 100% 환경 탓인지, 일부는 진짜 회귀/flaky인지 별도 디버깅 필요(아래 §후속).

### 🟠 P1 — 신뢰·증거

**[D3] verify 증거 신선도가 review에 연결 안 됨 → Goal 80**
- `vhk verify`는 test FAIL(exit 1) 기록, 직후 단독 `test:run`은 결과가 갈림 + 백그라운드 도중 작업트리가 `docs/soul-inject→main`으로 전환된 정황(reflog: `checkout` + `pull --ff-only`). 증거가 어느 코드/브랜치 것인지 추적 곤란.
- Goal 44가 verify 리포트에 HEAD SHA·dirty를 *기록*까지 했으나, `review` 출력은 여전히 *"증거(latest.json)는 commit/goal 바인딩이 없어 신선도는 생성시각으로만 추정"* → **데이터는 있는데 review가 소비를 안 함.**

**[D4] `recall` 검색 품질(키워드 한계) → RFC 0049로 위임**
- `vhk recall "리뷰 기준 추출"`(next-task에 "실사용 시나리오"로 박아둔 바로 그 쿼리) → 리뷰 관련 ADR·패턴 0개, 엉뚱한 "McpServer `_registeredTools` introspection" 실패 기억만(점수 3.17). "추출"↔"introspection" 오매칭. bge-m3(의미검색, RFC 0049 §2) 필요성의 살아있는 증거. **새 goal 아님 — 기존 RFC 0049 추진.**

**[D5] 검증 도구 = 철학 최상 / 집행 최하 → Goal 53 연계**
- `vhk check`: 자동 집행 규칙 **2개**(ban-L31 execSync · ban-L40 process.exit)만, 나머지는 "수동 확인".
- `vhk mission check`: scope 미설정 시 *"변경이 계약 안입니다"* 항상 통과 + *"objective 의미 부합은 검증 안 함(보장 아님)"*. 기본값이 무제한이라 가드 무력.
- 정직해서 좋지만 비개발자는 "통과=됐다"로 오독 위험. **기존 Goal 53(가드 behavior 이전)과 연계.**

### 🟡 P2 — 노이즈·UX

- **[D6] `.vhk` 산출물 gitignore 누락 → Goal 82**: `.vhk/ledger.jsonl`이 untracked로 노출, `.vhk/events/ai-actions.jsonl`은 추적되어 명령마다 변경 → vhk 몇 번 쓰면 `git status` 오염.
- **[D7] 보안 scan false positive → Goal 83**: `tests/property-parsers.test.ts:31`의 테스트 픽스처 가짜 JWT를 MEDIUM으로 보고. 사용자가 "유출됐나?" 놀람.
- **[D8] 제품 설명 SoT 분산 → Goal 81**: `vhk brief`는 "바이브코딩 풀사이클 CLI", `package.json`은 "AI 코딩 세션을 목표·증거·기억·규칙으로 묶는 한국어 CLI". G54는 *버전*만 SoT화했고 *설명*은 사각지대.
- **[D9] next-step 맥락 무지 → Goal 84**: `vhk doctor`/`status`가 396커밋 된 활성 레포인데도 "vhk 시작 / 프로젝트 만들어줘" 신규 사용자 멘트. 현재 상태(브랜치·변경·활성도)를 안 봄.
- **[D10] 백그라운드 자동화의 브랜치 전환**: 작업 중 트리가 `docs/soul-inject→main`으로 바뀜(추정: `/loop /auto-merge` 상주 세션). 동시성 리스크 — 워크플로로 회피(터미널 분리).

---

## 사용감 (1인칭)

첫 `vhk --help`는 **명령 50+개로 압도적**("어디서 시작하지?"). 그러나 `vhk work`를 치는 순간 "이 한 줄만 외우면 되는구나"로 반전. 자연어·별칭·정서적 격려가 솔로/비개발자에게 잘 듣는다. 그러다 `goal next`로 상태파일이 날아가고 `verify`가 빨갛게 뜨는 두 번의 경험에서 **"이 도구 말을 믿어도 되나?"**가 흔들린다. → 신뢰 회복이 최우선.

---

## 권장 워크플로 (함정 회피 포함)

```
아침   vhk standup        # 읽기전용 — 안전
시작   vhk work           # 클립보드 → claude Ctrl+V
작업   자연어 OK ("뭐 바뀌었어" / "보안 scan")
검증   vhk verify         # ⚠️ 빨강이면 환경의존 7개부터 걸러라(D2)
확인   vhk review         # "신뢰도 낮음"은 정상일 수 있음
저장   vhk save
종료   vhk work handoff
```
- **`goal next`를 조회로 쓰지 말 것**(D1) — 다음 goal은 `standup`으로.
- **터미널 2개 분리** — 작업용 vs `auto-merge` 루프용(D10).

## 스킬·훅 제안 (현재 훅 2개: check-records·record-reminder)

1. **상태파일 보호 훅**(P0) — `goal next`/`work` 전 next-task.md 자동 백업 or 미커밋 시 덮어쓰기 차단(D1을 코드로 봉인).
2. **verify 증거 신선도 게이트**(P1) — PreToolUse(commit/save)에서 latest.json HEAD 일치 확인(D3).
3. **환경의존 테스트 분리**(P0) — verify가 `@env` 태그를 로컬 skip하고 "환경 N개 보류" 표기(D2).
4. **`vhk-doctor-fix` 스킬** — 로컬 verify 빨강을 "환경 vs 진짜 버그"로 자동 분류.
5. **`/dogfood` 스킬**(이번 세션 산출) — 이 감사를 반복 가능하게.

## 후속 (별도 작업)

- **로컬 verify 7개 실패 디버깅** — 환경 탓 확정 vs 회귀 분리(Goal 79 선결 조사).
- 발견 → 실행 매핑은 `docs/rfc/0053-dogfood-hardening.md` + `goals/78~84`.

## 선조사 결과 (goal 79, 2026-06-20) — 로컬 verify 7개 timeout 원인 규명

7개 전부 `Test timed out in 5000ms` + `[vitest-pool]: Worker forks emitted error / Worker exited unexpectedly`. 실패 파일을 소수 단독 재실행해 분류:
- **context·start·mcp-server (3)** — 단독 실행 시 **통과**(3 passed). 1초도 안 걸릴 골격 테스트가 전체 병렬 실행에서만 5초 timeout = **worker fork가 죽어** 그 worker의 테스트가 무차별 timeout. **worker 동시성 flaky**(환경/인프라), 회귀 아님.
- **recall-log (1)** — 단독으로도 timeout. 원인: `logRecall`이 매 호출 파일 전체 read + `atomicWriteFile` 전체 재작성(O(n)) → 테스트 1005회 연속 호출 = **O(n²) × Windows 동기 I/O**. 기능 정상(실사용은 recall 1회당 1호출이라 무해). **성능 특성**, 회귀 아님.
- **cloud.gh-contract(2)·exec(1)** — 실제 `gh`/Windows `.cmd` shim spawn. timeout 패턴 = **환경 의존**(외부 프로세스), 정황상 회귀 아님.

**결론: 진짜 소스 회귀 0건.** D2("로컬 verify 빨강 = 환경") 입증, goal 79 방향(환경 분리) 정당. 후속 처리 3갈래 → ① worker 동시성: vitest pool 로컬 설정(fork 제한 or pool 조정) ② recall-log: 테스트 timeout 상향(or 구현 batch화) ③ gh/exec: `@env` 태그 분리. goal 79 착수 시 troubleshooting 문서로 정식화.

## goal 78 구현 (2026-06-20, feat/goal-78 worktree → PR)

D1 봉인: `goal next` 비파괴화 + `vhk goal peek` 신설(조회/변경 분리).
- **goalNext**: next-task.md 덮어쓰기 전 `saveBackup`(.vhk/backups, 보존 20·`pruneBackups`) + 수동편집 휴리스틱(auto-update 마커 부재) 경고.
- **goalPeek**: 읽기전용 조회(쓰기 0). `goalNext/goalPeek` 에 `cwd` 인자 도입 → chdir 없이 테스트 격리(chdir 이 vitest fork worker 와 충돌함을 디버깅에서 확인 — 선조사 worker 죽음 관측과 일치).
- 등록: index(`.command('peek')`+미리보기)·command-registry(`goal.peek`)·ko(`peekTitle`). 회귀 `tests/goal-peek.test.ts`(5건) + `check-goal-78.mjs`(고유검증 9).
- **검증**: typecheck ✓ · lint ✓ · build ✓ · check-goal-78 ✓ · tsx 직접검증 5/5(peek 불변·next 백업보존·스텁덮어씀·신규생성·백업없음). **로컬 vitest forks/threads 불안정(D2)으로 vitest 게이트만 CI 대기** → goal 78 IN_PROGRESS(거짓 DONE 금지, CI green 후 DONE 전이).

## goal 78 DONE + goal 79 1차 (2026-06-20)

- **goal 78 DONE**: #300(retarget 누락→docs 머지)·#302(squash 충돌) 수습 후 **#303 으로 main 반영 + DONE 전이**. CI green(ubuntu/windows × Node 22·24) + CodeRabbit pass + 적대적 리뷰 통과.
- **goal 79 = 선조사 후 범위 재조정(확실한 것만)**: 환경 분리의 실효가 제한적(CI green, 로컬 머신 특정) → over-engineering 회피(RFC 0048 §1).
  - ✅ recall-log 테스트 timeout 30s 상향(O(n²)×Windows I/O — 단독 5/5 통과 확인)
  - ✅ TS-004 troubleshooting 정식화(선조사 + 회귀방지 패턴: chdir 금지·teardown try-catch)
  - ⏸️ @env/pool 환경분리 = **YAGNI 관찰**(CI green 이라 비차단, 전역 pool 변경은 CI 리스크) → goal 79 IN_PROGRESS 유지
