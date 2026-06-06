---
date: 2026-06-06
project: VHK
version: 2.4.0 → 2.4.1 (발행 완료)
type: 세션로그
---

# 2026-06-06 — `vhk` 메뉴 개선 + version-check SoT + 적대검증 핫픽스(2.4.1)

## 요약

`vhk` 인자 없이 실행 시 뜨는 대화형 메뉴를 개선(버전 표시·업데이트 알림·단축키 안내·항목 3개
추가·렌더 글리치 수정)하고, 업데이트 체크 로직을 단일 소스 `version-check.ts` 로 추출. 그 직후
**적대 검증(4각도 워크플로)**으로 오프라인 hang CRITICAL 버그를 잡아 핫픽스 → npm `2.4.1` 발행.
앞선 `vhk work`/`work handoff` 와 메뉴 개선은 `2.4.0` 에 함께 나감.

## 무엇을 했나

### 1) `vhk` 메뉴 개선 (`src/index.ts`, v2.4.0)

- 헤더 3블록: 현재 버전(`v2.4.x`, 즉시·네트워크 0) + 업데이트 알림(`🆕 ... → vhk update`, 캐시 기반) + 직접입력/자연어 안내(`💬`).
- 항목 3개 추가: `🚀 작업 시작/이어하기(work)`(최상단)·`🎯 다음 목표 보기(goal)`(중간)·`⏸️ 작업 중단 정리(handoff)`(끝). `start` 는 `🆕` 로 이모지 구분.
- **렌더 글리치 수정**: `pageSize=choices.length` + `loop:false` → Windows 기본 콘솔(conhost) 스크롤 잔상(항목 중복 표시)·잘림("Move up and down…") 제거.

### 2) version-check 단일 소스 추출 (`src/lib/version-check.ts`, v2.4.0)

- 업데이트 체크 = "가끔 자동 확인": 글로벌 캐시 `~/.vhk/version-check.json` 이 신선(24h)이면 네트워크 0, 만료 시에만 1회 1.5s `npm view` + 1h 실패 쿨다운. 메뉴는 거의 항상 즉시.
- `fetchLatestNpmVersion`/`compareSemver` 를 doctor.ts → version-check.ts 로 **이동**, doctor 는 re-export(테스트 import 경로 보존, 순환 0). `doctor`/`update` 가 `recordLatest` 로 캐시 점진 적재.

### 3) 적대 검증 → BUG#1 핫픽스 (`#135`, v2.4.1)

- 4각도 워크플로(캐시 상태머신/통합/엣지/테스트) 적대 검증.
- **BUG#1 (CRITICAL)**: 캐시 파일이 한 번도 없던 상태 + 오프라인이면 `getUpdateInfo` 가 매 `vhk` 실행마다 1.5s `npm view` 를 무한 재시도 → 메뉴 hang. 쿨다운을 캐시 쓰기에만 의존해, 캐시 없으면 쿨다운이 영영 안 걸림.
- 수정: `VersionCache.latest` optional 화 → 조회 실패 시 캐시가 없던 경우에도 `{ checkedAt:0, lastTriedAt:now }` 기록해 1h 쿨다운 발동. `readCache` 검증 완화. 회귀 가드 테스트 추가(⑥-c: 쿨다운 내 재조회 0).
- 나머지 finding 은 REFUTED: index.ts "missing await"(async action `return promise` 자동 await 정상), 동시쓰기/v-prefix/compareSemver crash(방어코드로 차단).

## 검증

- 타입체크 0 · 빌드 OK · 테스트 **890 pass**(868 → +work 16 → +version-check 6).
- E2E: 메뉴 헤더(버전·🆕·💬)·항목 15개·손상 캐시 폴백(크래시 0)·자연어 라우팅·`Get-Clipboard` 한글 보존.
- 발행 후 tarball grep: `dist/index.js` 에 `lastTriedAt` 매칭 5 → 픽스 발행본 포함 확정(2.3.1 식 오발행 아님). npm latest=2.4.1, package.json=2.4.1 일치.

## 교훈

- **CLI 메뉴는 매 실행 네트워크 동기 호출 금지** — 캐시 + 쿨다운으로 hang 방지. 단 쿨다운 상태를 파일 캐시에만 의존하면 "캐시가 없는 경로"가 사각지대 → 실패 시에도 쿨다운 마커를 반드시 남겨야(스키마에서 핵심 값 optional 화).
- **재사용 함수 이동 시 re-export** 로 기존 테스트 import 경로 보존 + 순환 import 회피(이동 방향을 단방향으로).
- **발행 후 tarball grep 검증** 습관 — git/npm 정합을 코드 마커로 직접 확인(2.3.1 오발행 재발 방지).
- `vhk publish` 는 강제 범프 + CHANGELOG/CLAUDE 버전줄 자동 스텁 + 태그 push. 발행 전 working tree clean 가드(미커밋 차단) — LIVE 상태 갱신을 먼저 커밋해야 통과.

## 다음

- 뒷단 Goal 21~24 (launch·content·sell·ops) → docs/state/roadmap.md.
- (cosmetic) tag v2.4.0 는 핫픽스 전 커밋 76db882 가리킴 — npm 정상이라 둠.
