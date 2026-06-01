# 설계 — 대화형/비대화형 통합 가드 (MCP·CI 안전, #14)

- **날짜:** 2026-06-01
- **이슈:** #14 (vhk start: MCP stdio inquirer stdin 점유)
- **상태:** 설계 확정 → 구현 대기 (Goal 11 = P1, Goal 12 = P2)

## 1. 문제

VHK 의 여러 명령이 `inquirer.prompt` 로 사용자 입력을 받는다(15 파일, 39회). 비-TTY(CI·파이프·MCP stdio) 에서 프롬프트가 뜨면:

- 멈춤(hang) 또는 `ERR_USE_AFTER_CLOSE` 크래시
- **MCP stdio 모드**: inquirer 가 stdin(=JSON-RPC 파이프)을 읽으면 RPC 바이트를 훔쳐 파이프가 깨진다 (#14 의 원래 공포)

현재 상태는 **부분적으로만** 안전:
- 대화형 명령(gate/init/design palette/theme)은 MCP tool 에서 제외 → stdio 직접 호출 불가
- `init` 은 자체 `isNonInteractive` 보유 (v1.6.3)
- `interactive.ts ensureInteractive()` 는 stdin TTY 체크 후 거부
- high-risk CLI 는 `index.ts guardCli/guardCliDefer` → `runGuarded` 경유

문제: **감지·동작이 명령마다 제각각** (init=defaults / recap·design=refuse / high-risk=runGuarded / 나머지 gate·theme·ship·restore=무가드). MCP 사용이 늘어나는 미래에 일관된 계약이 필요.

## 2. 철학 (핵심)

목표는 "항상 진행"이 아니라:

1. **절대 안 멈춤 (never hang)** — 비-TTY 어디서든 깔끔히 종료(기본값 진행 / 명확 거부 / 안전 중단).
2. **위험 작업 무단실행 0** — 되돌리기 어려운 작업은 비대화형·미승인이면 실행 안 함.
3. **MCP 파이프 불변식** — 비-TTY 면 stdin 을 **절대 읽지 않는다** (RPC 바이트 보호). ← 載荷(load-bearing) 불변식.
4. **단일 출처 재사용** — 새 위험 분류/특수케이스 금지. 기존 `risk-policy` + `safety-guard` 재사용.

## 3. 아키텍처 — 3버킷 + 감지 SoT

```
입력 필요? → isInteractive() 판단
   ├─ ① auto-default (benign)   : 비대화형 → promptOrDefault() = 기본값
   ├─ ② refuse-essential        : 비대화형 → ensureInteractive() = 깔끔히 거부(exit 1)
   └─ ③ destructive-guarded     : runGuarded() = 비대화형·미승인 중단, --yes 로만
```

### 감지 단일출처 (`src/lib/interactive.ts`)

```ts
// 프롬프트 가능 여부 — stdin TTY + --yes 아님. (stdout 무관: R1)
// VHK_FORCE_INTERACTIVE=1 = Git Bash/MinTTY 탈출구(E3).
export function isInteractive(opts?: { yes?: boolean }): boolean {
  if (opts?.yes) return false
  if (process.env.VHK_FORCE_INTERACTIVE === '1') return true
  return !!process.stdin.isTTY   // 비-TTY 는 undefined → !! 로 false (E1)
}

// benign: 비대화형 → fallback. (비-TTY 면 stdin 미접근 = MCP 안전, E5)
export async function promptOrDefault<T>(
  ask: () => Promise<T>, fallback: T, opts?: { yes?: boolean }
): Promise<T> {
  if (!isInteractive(opts)) return fallback
  try { return await ask() } catch (e) { if (isPromptAbortError(e)) return fallback; throw e }
}

// essential: 비대화형 → 거부. isInteractive 로 재배선(축 통일).
export function ensureInteractive(hint = ''): boolean { /* !isInteractive() → refuse + exit 1 */ }
```

`init` 의 로컬 `isNonInteractive` 는 이 SoT 로 교체.

## 4. 컴포넌트 변경

| 파일 | 변경 |
| --- | --- |
| `src/lib/interactive.ts` | `isInteractive`, `promptOrDefault` 추가, `ensureInteractive` 재배선 |
| `src/lib/risk-policy.ts` | `HIGH_RISK_ACTIONS` 에 **`restore`** 추가 (R3) |
| `src/lib/safety-guard.ts` | `runGuarded` 'warn'(lite) 분기: destructive + 미승인 + **비대화형(stdin)** 이면 lite 여도 중단 (R13, 축은 stdin = E8) |
| `src/commands/init.ts` | 로컬 isNonInteractive → SoT, stdout 축 제거 |
| `src/index.ts` | `restore` action 을 `guardCli('restore', opts.yes, …)` 래핑 + `--yes` 옵션 (R3) |
| `src/commands/gate.ts` | 진입부 `ensureInteractive()` (② essential) |
| `scripts/check-goal-8.mjs` | init 의 stdout 축 제거에 맞춰 assertion 갱신 (S2 — self-consistency) |

## 5. 명령 분류 (3버킷)

| 버킷 | 명령 | 비대화형 동작 |
| --- | --- | --- |
| ① auto-default | init✅, sync(confirm), theme, design-palette, save(**커밋메시지**) | 기본값. save 메시지 기본 = `"chore: vhk save"` (S1) |
| ② refuse-essential | **gate**(13문), recap✅, design✅ | 거부 |
| ③ destructive-guarded | undo, deploy, publish, migrate, cloud-pull, resume, env-write, **restore**(신규), save/sync(strict) | 미승인 중단 |

- `--yes` 는 ①③ 전용. ② essential 엔 무의미(13문 자동답 불가) → 안 붙임 (S3).
- `sync`(①) 비-TTY 자동진행 = 파생파일 자동 재생성. RULES.md(SoT) 보존·멱등이라 허용 (S4, 문서화).

## 6. 환경 의존 (E)

- **E3 (Git Bash/MinTTY)**: Windows Git Bash 서 `stdin.isTTY` 가 대화형인데도 `undefined` → essential 오거부. 완화: 거부 시 "PowerShell 또는 `winpty …`" 힌트 + `VHK_FORCE_INTERACTIVE=1` 탈출구.
- **E5 (MCP 불변식)**: 비-TTY → stdin 미접근. 전용 테스트로 못박음.
- **E1**: `isTTY` 는 비-TTY 시 `undefined` → `!!` 필수.
- **E11**: `yes | vhk undo` 는 이제 중단(비-TTY+미승인). 동작 변경 — 문서화.

## 7. 에러/엣지

- 전역 `catch(isPromptAbortError)`(index.ts) 최후방어 유지. promptOrDefault 로컬 catch = 2중.
- `readConfig` 절대 throw 안 함 → 손상/없음/타 cwd = standard 폴백 (R20, 안전쪽).

## 8. 테스트

- 단위: `isInteractive`(stdin.isTTY mock + VHK_FORCE_INTERACTIVE), `promptOrDefault`(TTY/비-TTY/abort→fallback), `runGuarded`(lite+비-TTY+미승인→중단).
- **완전성 가드**: HIGH_RISK 전 액션이 `index.ts` 에서 guard 경유 — 교차검증(restore 누락 재발 방지).
- **MCP 불변식 테스트**: 비-TTY 면 promptOrDefault 가 stdin 미접근.
- **실파이프 e2e**: `echo "" | node dist/index.js gate` → 안 멈추고 거부. `init -y` → 안 멈춤.
- **4환경 실측 스파이크** (분석 대체): PowerShell / Git Bash / `echo|` 파이프 / MCP stdio — 실제 거동 확정.

## 9. 스코프 / 단계

**Goal 11 (P1 — 이번):** interactive.ts SoT + init 마이그 + R3(restore) + R13/E8(lite-block, stdin 축) + gate essential + S1(save 기본메시지) + S2(게이트 갱신) + E3 탈출구 + 테스트 + 4환경 스파이크.

**Goal 12 (P2 — 백로그):** 남은 benign/essential 마이그(theme/design-palette/sync-confirm/ship) + S5(save push 비대화형 검토).

## 10. 확정된 결정 (의사결정 기록)

- **R19**: piped-answer(`echo y | cmd`) 지원 **포기**. 비-TTY → stdin 미접근(MCP 안전 우선). 답 주입은 `--yes`/플래그.
- **R13**: 비대화형 + 미승인 destructive 는 **모드 무관 중단**(lite 여도). 비대화형 = 경고 볼 사람 없음.
- **E8**: lite-block 판정 축 = **stdin.isTTY** (confirm 가능성), stdout 아님.
- **VHK_MCP_MODE env**: P1 제외 (YAGNI — 비-TTY 가 이미 MCP 감지 커버, channel='mcp' preview UX 는 P2).

## 11. 위험 / 미해결

- 환경 거동(특히 Git Bash)은 **실측 스파이크**로 확정 — 선분석 한계 인정. 우아한 degradation(never-hang + no-unauthorized-destructive)으로 오판 시에도 비치명.
- 명령 마이그레이션 시 기존 테스트 비-TTY 경로 충돌 가능 (E12) → P1 회귀범위.
