---
rfc: 47
title: "CLI 콜드스타트 단축 — 명령 지연 로딩(dynamic import) + 번들 코드 분할"
status: In Progress
author: VHK
created: 2026-06-08
depends_on: "index.ts 를 건드리는 모든 선행 작업(예: goal 21 seo-init 등록, 명령 추가 이슈) 머지 완료"
---

> **구현 진행(2026-06-10):** 측정으로 단일 최대 레버 = **inquirer(~212ms net = 콜드스타트 절반)** 확정 → `lib/prompt.ts` lazy 래퍼로 먼저 처리. **vhk --version 512→323ms (−37%)**. 22파일 코드모드 + 회귀 가드(`tests/check-inquirer-lazy.test.ts`). 나머지(명령 60+ lazy + tsup splitting)는 잔여 dep 가 12~33ms로 ROI 낮아 보류 — §9 참조.

# RFC 0047 — CLI 콜드스타트 지연 로딩

> **번호 안내:** 일련번호 RFC. 이슈/goal 번호와 무관(0001·0038 다음 빈 슬롯).
> **상태 Deferred 이유:** 이 작업은 `src/index.ts`(906줄, 명령 등록 중앙)를 통째 재작성한다.
> index.ts 를 건드리는 다른 작업과 **반드시 직렬화**해야 충돌이 없다 → 선행 작업 전부 머지 후 단독 PR. (§6)

## 1. 요약 (Summary)

`vhk` 콜드스타트가 느린 원인은 **런타임(Node)이 아니라 VHK 자기 코드의 즉시 로드(eager import)** 다.
실측상 콜드스타트 489ms 중 Node 런타임은 28ms(6%), 나머지 ~461ms(94%)가 VHK 번들 파싱·모듈 초기화다.
`src/index.ts` 가 명령 60+개와 무거운 의존성(handlebars·@notionhq/client·inquirer)을 **시작 시 한꺼번에**
import 하기 때문 — `vhk --version` 한 줄을 찍는 데도 Notion 클라이언트·템플릿 엔진까지 로드된다.

해결책은 **명령 지연 로딩**(서브명령 실행 시점에 `await import()`) + **tsup 코드 분할**(`splitting: true`)로,
스택(TypeScript·Node·npm·MCP SDK) 변경 없이 94% 병목을 직격한다.

## 2. 측정 근거 (Evidence)

Windows 11 / Node, n=10, warmup 후 측정:

| 측정 | 시간 | 의미 |
|---|---|---|
| `node --version` (순수 런타임) | 28ms | Node 시작 바닥 |
| `node -e console.log` (최소 eval) | 43ms | Node + 코드 한 줄 |
| `node dist/index.js --version` (VHK 풀) | **489ms** | VHK 콜드스타트 |
| 글로벌 `vhk --version` (PATH 경유) | 437ms | `.ps1` 래퍼 포함 |
| `dist/index.js` 크기 | 380KB (dist 전체 534KB) | 단일 번들 |

**분해:** 489 − 28 = ~461ms = Node 무관, VHK 자기 로드.

## 3. 근본 원인 (Root Cause)

- [`src/index.ts:10-50`](../../src/index.ts) — 명령 모듈 60+개를 top-level `import` 로 즉시 로드.
- 그 모듈들이 무거운 dep 를 transitive 로 끌어옴: handlebars(큼), @notionhq/client, inquirer, simple-git, zod.
- tsup 가 전부 단일 380KB 번들로 묶어, 가벼운 명령(`--version`·`status`)도 전체 그래프를 파싱·실행.

## 4. 기각안 (Rejected: 런타임 전환)

**Bun/Rust 전환은 기각.** 콜드스타트의 6%(28ms)뿐인 Node 런타임만 공격하므로 ROI 최악(489→~475ms, 체감 0).
OpenAI Codex 가 Rust 로 간 것은 Codex 가 *핫 런타임 + 임의코드 실행 샌드박스 + 비개발자 대량 배포* 이기 때문이며,
VHK(얇은 git/파일 래퍼, 유저가 이미 Node 보유)에는 그 4대 이득이 거의 0이다. 또한 Rust 전환 시 MCP SDK(TS-first)
재구현 부담 + AI 의 코드 수정 정확도 하락(JS/TS 학습데이터 최다)으로 오히려 손해.

## 5. 제안 (Proposal)

1. **명령 지연 로딩** — index.ts 의 top-level command import 제거, 서브명령 dispatch 시점에 `await import('./commands/x.js')`.
2. **tsup 코드 분할** — `splitting: true`. dynamic import 만으로는 단일 번들 내라 파싱이 안 미뤄질 수 있음 → 무거운 모듈을 별도 청크로 분리해야 실제 미로드.
3. **무거운 dep 격리 확인** — handlebars·notion 이 command 밖 *공유 최상위*에서 import 되지 않는지 점검(되면 그것만 lazy).

## 6. 순서·충돌 제약 (Sequencing — 중요)

- index.ts(906줄)는 **명령 등록 중앙점.** 이 RFC = index.ts 통째 재작성.
- **충돌하는 작업:** index.ts 를 편집하는 모든 것 — 특히 **goal 21 seo-init** ("등록 3곳: index.ts·command-registry.ts·cli-args.ts"), 명령을 추가/변경하는 이슈 픽스(#157·#148·#128 등).
- **규칙:** 위 작업들을 **전부 머지한 뒤**, 이 RFC 를 **단독 PR 로 마지막에**(= index.ts 의 "마지막 writer"). index.ts 닿는 작업과 **동시 worktree 병행 금지.**
- **선행 권장:** 작업2.3(tsc strict / no-floating-promise)을 먼저 — 그래야 `await import()`(async) 코드를 처음부터 strict 기준으로 작성, 재작업 0.
- **무충돌:** 작업2.2(fuzz)·2.4(Stryker)는 test/config 파일만 → 병렬 OK.

## 7. 검증 계획 (Validation)

1. **프로토타입 선검증:** 명령 2~3개만 lazy + splitting 켜고 `--version` 재측정 → 461ms 실제 감소 확인 후 전체 적용. (안 줄면 splitting 설정 문제)
2. **안전망:** 이미 머지된 MCP↔CLI 계약 테스트(`tests/mcp-cli-contract.test.ts`, PR #212) + fuzz 테스트가 CLI 외부 동작 불변을 검증 → 리팩터 회귀 차단.
3. **게이트:** `pnpm build; pnpm test:run` green 유지. 콜드스타트 before/after 수치 PR 본문에 기록.

## 8. 미해결·리스크 (Open / Risks)

- 측정에 Windows 오버헤드(Defender의 node spawn 스캔, `.ps1` 래퍼) 섞임. 절대 수치는 OS별 상이하나 **비율(VHK로드 ≫ Node바닥)은 OS 불문 유지** → 결론 불변.
- splitting 활성 시 dist 산출물이 단일파일→다중청크. `bin` 진입점(dist/index.js·dist/mcp/index.js)과 청크 경로 해석이 깨지지 않는지 확인 필요.
- `--help` 전체 출력은 모든 명령 메타가 필요 → help 경로는 지연 이득이 작을 수 있음(명령 *실행*은 이득 큼).

## 9. 구현 결과 (2026-06-10)

**측정이 전략을 바꿈(measure-first).** dep별 import 비용 실측:

| dep | net import |
|---|---|
| **inquirer** | **212ms** ← 단일 최대(전체 434ms의 절반) |
| handlebars | 33ms |
| simple-git | 31ms |
| @notionhq/client | 20ms |
| chalk / commander | 14 / 12ms |

→ "명령 60+ 전부 lazy" 대신 **inquirer 하나만 lazy** 가 80/20. `lib/prompt.ts`(`await import('inquirer')`) 래퍼 + 22파일 `inquirer.prompt`→`prompt` 코드모드. 모든 호출이 async라 무위험. splitting 불필요(ESM dynamic import 자체가 모듈 init 지연).

**결과:** `vhk --version` 512→**323ms (−37%)** · `vhk status` 739→610ms · 전체 1383 테스트 green(inquirer mock 정상, 테스트 import도 23s→12s). 회귀 가드 `tests/check-inquirer-lazy.test.ts`.

**보류(다음 레버는 작음):** 명령 모듈 60+ lazy + tsup splitting 으로 잔여 ~297ms 추가 공략 가능하나, 다음 dep 가 12~33ms 단위라 inquirer 만큼 극적이지 않고 index.ts 통째 재작성(고위험)이 필요 → 실수요/추가 실측이 정당화할 때.
