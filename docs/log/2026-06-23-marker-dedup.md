# 2026-06-23 — 멱등성 버그 2건 TDD 수정 (#325 마커쌍 중복 · #326 gitignore 슬래시)

> 성격: append-only dev log. 도그푸딩 자동 버그수색(2026-06-22)이 발견한 멱등성 결함 2건을 TDD로 수정.
> 작업방: worktree `vhk-fix-marker-dedup` / 브랜치 `fix/325-326-marker-dedup`.

## 한 줄 결론

`vhk sync`·`vhk init`의 멱등성을 깨던 결함 2건을 RED→GREEN TDD로 수정. 둘 다 **정규화 누락**이 근본 원인 — 같은 의미의 변형(마커쌍 중복 / 슬래시 유무)을 dedup 못 해 중복 누적·자기치유 실패.

## #325 — CLAUDE.md 마커쌍 2개면 sync가 관리 블록 통째 중복

- **증상**: `<!-- vhk:rules:start/end -->` 마커쌍이 2개(병합/복붙 사고)면 sync가 첫 쌍만 재생성하고 둘째 쌍을 사용자영역으로 verbatim 보존 → 관리 규칙 블록(코딩/기록/기술스택/커밋)이 통째로 중복. 추가 sync 해도 2쌍으로 고착(자기치유 실패) → 단일출처(SoT) 보증 깨짐.
- **근본 원인**: `src/commands/sync.ts` `splitVhkBlock` 이 `indexOf` 로 첫 START·첫 END 만 잡아 분리. `after = slice(첫 end 이후)` 에 둘째 vhk 블록 전체가 사용자영역으로 포함되고 `toClaudeMd` 가 그대로 보존.
- **수정**: `stripAllVhkBlocks(s)` 헬퍼 신설 — 문자열에서 완결된 vhk 마커블록(START…END, 비중첩 non-greedy)을 전부 제거. `splitVhkBlock` 이 분리한 `before`/`after` 사용자영역에 이를 적용해, 마커쌍이 2개·3개여도 관리 블록은 항상 1개로 수렴. 짝 없는 잔존 마커는 기존 `stripLegacyAutogen` 폴백 경로가 처리하므로 여기선 완결 쌍만 다룸.

## #326 — 루트 .gitignore 슬래시 변형 중복 추가

- **증상**: 기존 .gitignore 에 슬래시 없는 변형(`node_modules`)이 있으면 init 이 슬래시 버전(`node_modules/`)을 중복 추가 → 같은 의미 줄 2개 공존. 같은 레포의 `ensureVhkIgnored` 는 슬래시 정규화를 하므로 정책 불일치.
- **근본 원인**: `src/commands/init.ts` `ensureRootGitignore` 가 `new Set(...trim())` 후 정확일치(`!existing.has(e)`)로만 dedup. 트레일링 슬래시 정규화 누락.
- **수정**: `ensureVhkIgnored`(`src/lib/backup.ts`)와 동일하게 `norm = s.trim().replace(/\/$/, '')` 적용 — 슬래시 유무만 다른 동치 항목은 미추가.

## TDD 증거

- RED: 신규 테스트 6건(#325 4건 + #326 2건) 먼저 작성 → `npx vitest run` 6 fail 확인.
- GREEN: 수정 후 동일 테스트 6건 + 회귀(sync/init/backup 119건) 전부 pass.
- 게이트: `pnpm build` ✅ · `pnpm lint` ✅ · `node dist/index.js secure scan` CRITICAL:0 ✅.
- 전체 `pnpm test`: 1961 pass / e2e 타임아웃 6건(`standup-anchor`·`safety-guard`·`cli-arg-dx` — CLI 서브프로세스 spawn, 풀스위트 병렬 부하서만 5s 초과 / 격리 재실행 시 26/26 pass). 본 수정(순수함수 sync.ts·init.ts)과 무관한 기존 플레이키.

## 변경 파일

- `src/commands/sync.ts` — `stripAllVhkBlocks` 추가 + `splitVhkBlock` 가 before/after 에 적용
- `src/commands/init.ts` — `ensureRootGitignore` 트레일링 슬래시 정규화
- `tests/sync-guard.test.ts` — #325 마커쌍 중복 정규화 4건
- `tests/init.test.ts` — #326 gitignore 슬래시 변형 dedup 2건

## 교훈

같은 코드베이스 안에서 "정규화 정책"이 갈리면(여기선 `ensureVhkIgnored` 는 슬래시 정규화 / `ensureRootGitignore` 는 안 함) 멱등성이 조용히 깨진다. 동치 판정(equality)은 한 곳에 모으거나, 최소한 같은 정규화 함수를 공유해야 한다.
