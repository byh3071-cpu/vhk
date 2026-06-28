# 2026-06-28 — #372 memory.json 재마이그레이션 가드 (디스크 영속)

## 증상 (이슈 #372)
vhk 본체 레포에서 `vhk memory list`는 18개를 보여주는데 `.vhk/memory.json`이 디스크에 없음(find 0).
매 실행 learnings.md(18개 항목)에서 **in-memory 로만** 재마이그레이션 → 영속 0회.
→ measure-first 자기측정(recall/memory) 데이터가 디스크에 안 쌓임(데이터 파이프 (c) 차단).

## 근본 원인 (이슈 추정과 다름 — 정직하게 기록)
이슈 "근본 추정"은 `memory.ts:200`(v1 배열 + 잠금 의심 경로)을 지목했으나, **그 경로는 디스크에 v1 배열이
실재할 때만 발동**한다. 본체 레포엔 memory.json 이 아예 없으므로(missing) 실제 발동 경로는 다름:

- `readMemory()`의 **"파일 없음" 분기**(구 line 208-209): `migrateMemory(null, learnings)` 로 흡수만 하고
  주석 그대로 "쓰지 않음" → 영구화 0회. 매 read 마다 learnings.md 18개를 in-memory 로 다시 빚음.
- 대조: v1 배열 분기(line 193~)는 read 에서도 1회 영구화(+.v1.bak) → **계약 일관성** 보장. 누락된 건 missing 분기뿐.
- 토이 프로젝트엔 learnings.md 가 없어 흡수분 0 → 빈 v2 → 증상 안 보임(memory add 는 mutate 경로라 정상 영속).

## 고친 방법 (최소 변경 — missing 분기를 v1 분기와 동일 정책으로)
- `src/commands/memory.ts`
  - `persistOnRead(cwd, v2)` 헬퍼 추출 — write + 잠금 실패 시 메모리상 진행(메시지 byte-identical).
    v1 배열 분기도 이 헬퍼 사용(중복 제거, 두 read 경로 일관성 보장).
  - `isEmptyV2(m)` 헬퍼 — 흡수할 게 0이면 빈 memory.json 을 만들지 않게 판정(litter 방지).
  - **missing 분기**: `migrateMemory(null, learnings)` 결과가 비어있지 않으면 `persistOnRead` 로 1회 영속.
    learnings 도 v1 도 없어 빈 v2 면 쓰지 않음(memoryMigrate line 512 와 동일 "빈 파일 안 만듦" 정책).
- 멱등 보장: 1회 영속 후 memory.json 은 v2 → 다음 read 는 isV2 분기로 즉시 반환(learnings 재흡수 0).
- 안전: memory.json·memory.json.* 는 .gitignore 대상 → read 가 파일 생성해도 git 더럽힘/정크커밋 0.

## 회귀 테스트 (tests/memory.test.ts · readMemory 직접 호출 = chdir 회피)
- `#372 파일 없음 + learnings → 디스크 v2 영속(1회 write), .v1.bak 없음(신규 생성)`.
- `#372 두 번째 read 는 재마이그레이션 안 함` — failures 2 유지(4 아님) + `.bak` 미생성(2차 write 0 증거) + 디스크 무변경.
- `#372 파일·learnings 둘 다 없으면 memory.json 생성 안 함`(빈 파일 litter 방지).

## 게이트
- 로컬 worktree 에 node_modules 없어 `pnpm install` 선행 후 시도 — 결과는 PR 본문에 정직 기록.
- 로컬 vitest forks 불안정(TS-004: exit 127·`process.chdir() not supported in workers`) 시 memory.test.ts 단독 실행으로 확인,
  그래도 불안정하면 **CI 가 진실원**으로 명시.

## 다음
- CI green 확인 후 머지 판단. 본체 레포에서 `vhk memory list` 1회 실행 시 memory.json 생성되는지 실사용 확인 권장.
