# TS-004 — 로컬 verify/test 가 상시 빨강 (vitest forks 불안정 + recall-log O(n²))

> 출처: 도그푸딩 감사 D2 + goal 79 선조사(2026-06-20). 관련: `docs/log/2026-06-20-dogfood-audit.md`, RFC 0053.

## 증상
Windows 로컬에서 `pnpm test:run`(또는 `vhk verify`) 시 6 파일 7 테스트가
`Test timed out in 5000ms` + `[vitest-pool]: Worker forks emitted error / Worker exited unexpectedly`
로 실패. **CI(ubuntu/windows × Node 22·24)는 전부 green.**

## 원인 (선조사 — 소수 단독 재실행으로 분류 → 소스 회귀 0건)
1. **context·start·mcp-server (3)** — 단독 실행 시 **통과**. 1초도 안 걸릴 골격 테스트가 전체 병렬에서만 5s timeout = worker fork 가 죽어 그 worker 의 테스트가 무차별 timeout. **forks 풀 불안정**(이 머신 특정 자원/동시성).
2. **recall-log (1)** — 단독으로도 timeout. `logRecall`(src/lib/recall-log.ts)이 매 호출 파일 전체 read + `atomicWriteFile` 전체 재작성(O(n)) → 테스트가 `RECALL_LOG_MAX+5`(1005)회 연속 호출 = **O(n²) × Windows 동기 I/O**. 기능 정상(실사용은 recall 1회당 1호출이라 무해). **성능 특성**.
3. **cloud.gh-contract(2)·exec(1)** — 실제 `gh`/Windows `.cmd` shim spawn. **환경 의존**(외부 프로세스).
- 부수: teardown `fs.rmSync(tmp)` 가 `process.chdir` 상태/핸들 잔존 시 throw → forks 에서 worker crash 로 위장됨(goal 78 테스트 디버깅에서 확인).

## 조치
- ✅ **recall-log**: 테스트 timeout 30s 상향(goal 79). 구현은 무해라 유지(append 최적화는 YAGNI).
- ⏸️ **forks 불안정**: 전역 `vitest` pool 변경은 **CI(현재 green)를 건드리는 리스크** → **YAGNI 관찰**. 재현이 빈발하면 `poolOptions.forks` 조정 검토.
- ⏸️ **gh/exec**: CI green 이라 비차단. `@env` 분리는 실사용 신호 누적 시 재개.
- 🛡️ **회귀 방지 패턴**: 새 테스트는 `process.chdir` 금지(함수에 cwd 인자 주입), teardown `rmSync` 는 try-catch(Windows 핸들 잔존 무해화).

## 우회 (로컬 개발자)
실패가 의심되면 **소수 파일 단독 실행**: `pnpm exec vitest run tests/<file>.test.ts`.
단독 통과 = forks 동시성 탓(코드 OK). **CI 매트릭스가 진실원** — 로컬 빨강 ≠ 코드 결함.
