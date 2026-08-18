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
- 🛡️ **회귀 방지 패턴**: 새 테스트는 `process.chdir` 금지(함수에 cwd 인자 주입), teardown 삭제는 `removeDirSync` 사용(TS-005 — `rmSync` 금지).

## 우회 (로컬 개발자)
실패가 의심되면 **소수 파일 단독 실행**: `pnpm exec vitest run tests/<file>.test.ts`.
단독 통과 = forks 동시성 탓(코드 OK). **CI 매트릭스가 진실원** — 로컬 빨강 ≠ 코드 결함.

## 2026-07-18 악화 재발 관찰 (vitest 4.1.7)

- 증상 격화: 115 테스트 파일이 `Worker exited unexpectedly` — **단독 실행도 크래시**(atomic-write·adr·check 등.
  TS-004 원판에선 단독 통과였음). version-sync 등 일부는 여전히 통과(전체 106/221 파일 green).
- 결정 증거: `--pool=threads` 로 돌리면 본체가 exit **-1073740791(0xC0000409, STATUS_STACK_BUFFER_OVERRUN)**
  = 네이티브 fast-fail. OS 크래시 이벤트 없음(프로세스 자체 종료).
- 무효였던 처방: vite 캐시 제거 · `pnpm rebuild` · node_modules 전체 재설치. NODE_OPTIONS 오염 없음,
  순수 node spawn 정상, node.exe는 1월 설치분 그대로.
- 격리: scratchpad 최소 프로젝트(vitest 4.1.7 + TS config)는 통과 → **vhk 레포 import 체인 한정**.
  main 체크아웃에서도 동일 재현 = 작업 변경과 무관한 선재 결함.
- 판정: 원판 교리 유지 — **CI 매트릭스(green)가 진실원**. 로컬 원인 후보는 vitest 4.x rolldown/esbuild
  네이티브 × 이 머신 조합. 후속: vitest patch 갱신 시 재확인, 빈발 시 pool/isolate 설정 실험.

## 2026-08-16 원인 규명 — vitest 아니라 비ASCII 경로 (TS-005)

위 "vitest 4.x × 이 머신" 추정은 **틀렸다**. 워커를 죽인 것은 테스트 teardown 의
`fs.rmSync(tmpdir)` 이고, 트리거는 임시 경로에 든 **비ASCII 문자**(한글 사용자명)다.
`0xC0000409` 는 그 rmSync 호출의 네이티브 fast-fail 이었다. 상세·실측표는 [TS-005](TS-005-rmsync-file-exit127.md).

- 확인: 임시 디렉터리를 ASCII 경로로 바꾸자 250 파일 3,000+ 테스트가 로컬에서 통과.
- 교훈: "CI 는 green 이니 로컬 빨강은 무시"로 4개월 덮여 있었다. CI 가 초록이었던 이유 자체가
  **CI 경로가 ASCII 라 결함을 못 밟아서**였고, 그 사이 같은 결함이 제품 코드에 남아 있었다.
  환경 차이를 결론으로 쓰기 전에 차이의 내용을 특정해야 한다.
- 잔여: recall-log O(n²)·gh/exec 환경 의존은 이 규명과 별개로 원판 판정 유지.
