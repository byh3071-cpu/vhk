# 2026-07-27 — 에이전트 지침 배선 감사 + P0 수리

## 배경

"클로드코드·코덱스·커서가 orca CLI 공식문서를 참고해서 쓰는 건지 모르겠다. 프롬프트 보강·리서치·오케스트레이션·병렬/worktree 지침이 각 프로젝트마다 잘 안 돼 있는 것 같다" — 5축 전수 조사 요청.

조사 범위는 vhk 를 넘어 글로벌(`~/.claude`·`~/.codex`·`~/.cursor`·`~/.gemini`)·`yohan-brain`·`dev/.agents` 까지. 이 로그는 그중 **vhk 레포 변경분**을 남긴다. 전체 감사 결과와 P1/P2 처방은 `~/.claude/plans/vhk-ticklish-starlight.md`.

## 한 일 (vhk)

### #516 회귀 수리 — 신규 프로젝트 첫 `sync --check` 가 무조건 실패

- **증상 실측**: 빈 디렉터리에서 `vhk init` → `vhk sync --check` = **exit 1**, `∅ .cursor/mcp.json.example — 파일 없음`
- **원인**: `sync.ts` 가 bootstrap 주입 게이트를 `ecosystem.mdc 부재` 하나로 판정했다. `init.ts:412` 가 `generateFiles()` 에서 ecosystem.mdc 를 **먼저** 쓰기 때문에 이후 `syncCore` 에서 게이트가 닫히고 `injectBootstrapAll` 이 통째로 스킵된다 → `mcp.json.example` 이 영원히 안 생김. `SYNC_BOOTSTRAP_TARGETS`(레지스트리 3종)와 게이트(1종 판정)의 불일치가 근본 원인.
- **수리**: `sync.ts` 의 게이트를 제거하고 `injectBootstrapAll` 을 무조건 호출. 이 함수는 이미 파일별 멱등(`writeInjectFile` 이 기존 내용 검사)이라 안전하다. `init.ts` 는 건드리지 않았다 — bootstrap 산출 목록의 SoT 를 `inject-bootstrap` 한 곳에 유지하기 위함.
- **회귀 테스트**: `tests/sync-check.test.ts` 에 "ecosystem.mdc 만 있고 나머지 bootstrap 이 없어도 sync 가 채운다" 추가. **양방향 검증** — 수정 적용 시 12/12 통과, `git stash` 로 수정 제거 시 이 테스트만 실패(11 passed / 1 failed).

## 결정

- **init 이 아니라 sync 를 고쳤다.** init 에 `.cursor/mcp.json.example` 을 추가하는 쪽이 변경은 작지만, bootstrap 산출 목록을 init 과 inject-bootstrap 두 곳이 알게 된다(SoT 2곳). 미래에 bootstrap 타깃이 늘면 같은 버그가 재발한다.
- ADR 승격 후보는 아님 — 기존 설계(inject-bootstrap 이 bootstrap SoT)를 복원한 것이지 새 결정이 아니다.

## 막힌 것

- **로컬 테스트 7건 실패(기존 결함, 이 변경과 무관)**: `src/lib/core-rules.test.ts` 3건 + `tests/init-core-rules-warn.test.ts` 4건. 전부 "`YOHAN_BRAIN_ROOT` 미설정 → `source=bundled`" 를 기대하는데 실제로는 `live` 가 나온다. `git stash` 로 이번 변경을 제거하고 돌려도 **동일하게 7건 실패** — 기준선 대조로 확인했다. 이 머신에 brain 이 기본 경로에 실존해서 코드가 live 로 판정하는 환경 의존 실패. CI 가 진실원(CLAUDE.md LIVE · TS-004).
- `pnpm lint` exit 0, 신규 회귀 테스트 포함 `tests/sync-check.test.ts` 12/12 통과.

## 교훈

- **`| tail` 파이프가 종료코드를 가린다.** `pnpm test | tail -40` 의 exit code 는 vitest 가 아니라 `tail` 의 것이라 실패를 성공으로 오독했다. 게이트 판정에 쓰는 명령은 파이프 없이 돌리고 `$?` 를 따로 찍어라. (PowerShell 에서 `orca ... | Select-Object` 가 `$LASTEXITCODE` 를 오염시키는 것과 같은 부류)
- **회귀 수리는 "고친 뒤 통과"만으로 부족하다.** 수정을 임시로 되돌려 테스트가 실제로 빨개지는지까지 봐야 그 테스트가 회귀를 잡는다는 근거가 생긴다.
- **레지스트리와 게이트가 다른 집합을 보면 조용히 샌다.** `SYNC_BOOTSTRAP_TARGETS` 는 3종인데 주입 게이트는 1종만 봤다. 레지스트리를 쓰는 코드는 판정도 레지스트리 전체로 해야 한다.
