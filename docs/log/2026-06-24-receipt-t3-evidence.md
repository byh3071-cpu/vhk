# 2026-06-24 — receipt T3 증거: 이번 세션이 만든 거짓완료 코퍼스 + lint 게이트 봉인

> RFC 0056 / ADR-006 의 90일 단일 성공기준 = **`vhk receipt` 가 거짓완료 1건을 실제로 잡는다(T3, 현 0/8).**
> 이 로그 = 2026-06-23~24 멀티웨이브 병렬 작업이 **부산물로 생산한 실제 거짓완료 데이터**의 분석 + receipt 적용 가능성 판정. append-only.

## 무슨 일이 있었나 (실데이터)
3 웨이브(17 PR 머지) 동안 구현 에이전트가 "완료/pass" 라고 보고했으나 **CI(풀게이트)가 거짓을 잡은 사례 3건**:

| # | 에이전트 자기보고 | 실제(CI) | 원인 |
|---|---|---|---|
| **#316** | `pnpm test` 1812 pass → "완료" | secure dogfood **FAIL**(픽스처 토큰 오탐) | 에이전트가 verify 대신 **부분게이트(test)**만 돌림 |
| **#381** | 1913 pass → "완료" | eslint **FAIL** | 에이전트가 **lint 미실행** |
| **#388** | green → "완료" | Windows EBUSY rmdir | env 특정(로컬 통과) |

→ 공통 패턴: **"게이트의 부분집합만 돌리고 완료 선언"** = 정확히 `vhk receipt`/RFC 0056 이 겨냥하는 *게으른 거짓완료* 클래스. 합성 시나리오가 아니라 **실제 작업에서 자연 발생**했다.

## receipt 가 잡았을까 (코드 대조)
`vhk receipt` 의 `red` 증거 = `vhk verify` 게이트의 실종료코드 fail. 대조 시점의 verify 게이트로 판정:

- **#316 (secure)** → ✅ **잡았을 것.** verify 게이트에 secure 포함 → red → `decision=block`. 에이전트가 `pnpm test` 대신 `vhk receipt`(또는 verify)를 돌렸으면 차단됐다.
- **#381 (eslint)** → ❌ **그땐 못 잡았다.** verify 게이트 = typecheck/test/build/secure **4종, lint 없음** → eslint 실패가 receipt 에 안 보였다. **= 발견된 receipt 갭.**
- **#388 (Windows EBUSY)** → ❌ env 특정. 로컬(receipt 실행 환경)에선 통과 → 구조적 한계(정직 경계: receipt 는 "실행 환경에서 재현되는" 거짓완료만 잡는다).

## 조치 — 갭 봉인 (이번 작업)
**verify 에 lint 게이트 추가** (PR #390, main `e03e21e`). verify 4→5 게이트(typecheck/**lint**/test/build/secure)로 CI gate(tsc→eslint→build)와 정합.
- **실행 입증**: PR #390 의 테스트가 임시 git 레포에서 lint 에러 주입 → `evidence.gates.red=true · failedGateIds∋lint · decision=block` 을 **실제로 실행해 통과**(CI 영구 가드). 즉 receipt 가 이제 **#381 클래스(eslint 거짓완료)를 기계적으로 차단**한다 — 주장이 아니라 코드 실행 증거.
- 비-lint 프로젝트는 lint 게이트 skip(회귀 0).

## T3 정직 판정 (현재)
- **메커니즘 입증됨**: 게이트 fail → `red` → `decision=block` 이 실레포에서 실행 확인(secure 기존 + lint 신규). #316·#381 은 이 클래스의 **실제 발생 사례**.
- **그러나 "라이브 캡처"는 아직 아니다**: 위는 *사후 재구성*(에이전트가 receipt 를 안 돌렸으므로 receipt 가 그 순간 막은 게 아님). 90일 기준의 진짜 1건 = **에이전트가 "완료" 직전 `vhk receipt` 를 돌렸는데 그게 block 을 띄워 거짓완료가 머지 전에 잡히는 라이브 사건.**
- **선결 = self-receipt 습관**([[parallel-agent-ci-gate]] 메모리 갱신): 구현 에이전트가 완료 선언 전 풀게이트(`build+lint+test+secure`)/`vhk receipt` 를 돌리도록 워크플로에 고정. 그러면 *다음* 거짓완료가 라이브로 잡힌다.
- ⚠️ **메타정직**: 이 코퍼스를 "T3 달성(1/8)"으로 과대표현하지 않는다 — 그건 T3 증명 자체를 거짓완료하는 꼴. 현 상태 = **"클래스 실재 + 메커니즘 실행입증 + 라이브 캡처 무대 준비"**. 라이브 1건이 진짜 카운트.

## 다음
1. self-receipt 를 에이전트 디스패치 표준에 넣어 라이브 캡처 무대 완성(T1-③ 운영화).
2. Goal 87(의도 증거 = receipt 5번째 `intent`) → receipt 가 *게으른 거짓완료 + 의도위반* 둘 다 커버(해자).
3. 측정(T2): 실사용 누적 — diff-cover 추세(#371)·Recall@5 라벨.
