---
date: 2026-06-05
project: VHK
version: 2.3.0 → 2.3.2 (재발행)
type: 세션로그
---

# 2026-06-05 — CLAUDE.md sentinel marker 버그 수정(#117) + 2.3.1 오발행 → 2.3.2 재발행

## 요약

BACKLOG 배치1 **CLAUDE.md 사용자 섹션 조용한 드롭 결함**을 수정(PR #117)하고 main 머지·게이트
통과까지 완료. 발행 단계에서 **잘못된 브랜치(`feat/goal-20-evolve`)에서 `vhk publish` 실행**돼
npm `2.3.1` 이 **픽스 없는 옛 코드(goal-20-evolve)** 로 나가는 오발행 발생. npm 버전은
immutable 이라 2.3.1 은 보존(unpublish 금지)하고, 올바른 main 코드로 **2.3.2 재발행** 준비.

## 무엇을 했나

### 1) CLAUDE.md sentinel marker 보존 버그 수정 (PR #117, main 머지)

- **결함(확정):** `toClaudeMd` 가 CLAUDE.md 재생성 시 `header` + `## 현재 상태` + RULES record
  섹션만 보존하고 `## 프로젝트 정보`·`## 코딩 컨벤션`·`## Safety` 등 **비-키 사용자 섹션을 조용히 드롭**.
  비대화형 무경고. 실 vhk CLAUDE.md 에도 해당 섹션 존재 → 도그푸딩 직접 타격.
- **수정:** vhk 관리 영역(배너+record)을 `<!-- vhk:rules:start/end -->` sentinel 마커로 감싸 재생성,
  **마커 밖 사용자 섹션은 보존**. 마커 없는 기존 파일은 1회 마이그레이션(옛 자동생성만 제거 + 사용자 섹션 보존).
- **구조:** 순수함수 `buildVhkBlock`/`splitVhkBlock`/`stripLegacyAutogen`/`claudeMdMigration` 분리,
  `toClaudeMd` 시그니처 유지(GA 안정성). `syncCore.claudeMigration` 노출 + `ko.sync.claudeMigrated` 경고.
- **검증:** TDD(RED→GREEN), tsc 0, test +14, 실 CLAUDE.md dry-run e2e, **적대적 반례 5종 실행 검증**
  (CRLF 멱등 / 마커 텍스트 오염 / 손글 키섹션 드롭+경고 / 빈입력·마커훼손 폴백 / 코드블록 들여쓰기 보존).
- 머지 적대적 검증: mergeable CLEAN, 회귀 0(키매칭 드롭은 기존 동작과 동일, 비-키 보존+경고는 순수 개선).

### 2) 병렬 라인 — pattern dismiss/detect 누수 (PR #118, 다른 세션)

- `pattern dismiss/detect` 가 자연어 라우터로 새는 버그 + dismiss 재제안 수정. main 머지(`584d5f8`).

### 3) 2.3.1 오발행 사고 + 진단

- `vhk publish` 를 main 체크아웃 없이 `feat/goal-20-evolve` 에서 실행 → 태그 `v2.3.1`(`9f81936`)이
  **goal-20-evolve 옛 코드** 기반. npm `2.3.1` tarball 검증: `VHK_BLOCK` 마커 0개 = **#117·#118 픽스 누락 확정**.
- release 커밋 `9f81936` 은 main 에 미반영(stranded), main package.json 은 2.3.0 으로 npm(2.3.1)과 불일치.
- 두 세션(vhk-cli dev repo + Solo_projects/vhk 클론)이 독립 진단 → 동일 결론. 재발행은 dev repo(vhk-cli)
  단일 세션이 전담(태그/커밋 중복·main 분기 방지), 클론 세션은 발행에서 빠짐.

### 4) 2.3.2 재발행 준비 (이 세션)

- main(`072dead`, #117+#118+goal-20 전부 포함)에서 package.json 2.3.0 → **2.3.2** 범프.
- pnpm build success / **test 843 pass** / tsc 0.
- CLAUDE.md 프로젝트 정보·현재 상태 v2.3.2 갱신.

## 교훈

1. **발행은 반드시 발행 대상 브랜치(main)에서.** `vhk publish` 가 현재 브랜치 코드를 그대로 패키징한다.
   체크아웃을 건너뛰면 엉뚱한 브랜치(feature) 코드가 latest 로 나간다. **publish 전 `git branch --show-current`
   + `git log -1` 로 무엇을 발행하는지 확인**하는 가드가 필요(향후 `vhk publish` 에 main/clean 가드 추가 후보).
2. **npm 버전은 immutable.** 잘못 나간 버전은 unpublish 하지 말 것(이미 받은 사용자 깨짐 + 72h 후 거의 불가).
   다음 patch 로 올바른 코드 재발행 + 필요 시 `npm deprecate` 딱지.
3. **"발행됨" ≠ "올바른 게 발행됨".** latest 버전 번호만 보지 말고 **tarball 내용을 직접 검증**
   (`npm pack` → grep 핵심 심볼). 태그가 어느 커밋·어느 브랜치인지(`git branch --contains <tag>`) 대조.
4. **버전 정합은 3곳**(package.json · npm latest · CLAUDE.md). 발행이 git 에 안 올라가면 셋이 어긋나
   다음 발행 때 충돌/혼란. release 커밋·태그가 main 에 push 됐는지 확인.
5. **동시 발행 금지.** 두 세션/클론이 같은 원격에 release 커밋·태그를 만들면 충돌. 한 곳만 전담.

## 결과

- PR #117(마커 fix)·#118(pattern fix) main 머지 완료.
- npm `2.3.1` = 오발행(픽스 누락, goal-20-evolve 코드) — **보존**(unpublish 금지), deprecate 선택.
- 2.3.2 재발행 준비 완료(package.json 2.3.2 / build / test 843 / CLAUDE.md 갱신) — **npm publish 는 사람(2FA OTP)**.

## 남은 것

- **v2.3.2 npm publish**(사람) — main 에서 release 커밋 + tag `v2.3.2` push 후 `npm publish --otp`.
- (선택) `npm deprecate @byh3071/vhk@2.3.1 "픽스 누락 — 2.3.2 사용"`.
- (후보) `vhk publish` 에 발행 전 브랜치(main)·clean 가드 추가 — 이번 오발행 재발 방지.
