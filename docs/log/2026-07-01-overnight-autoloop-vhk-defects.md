# 🌅 밤샘 무인 결함루프 — 2026-07-01 (vhk 정본)

> ℹ️ 이 파일 = **vhk 대상 정상 실행**(Task wcxkh08ct). args 하네스 폴백으로 첫 실행이 엉뚱 레포에 돌았던 건은 [overnight-2026-07-01.md](overnight-2026-07-01.md) 참조. 이번은 스크립트에 vhk 하드코딩 후 재실행 → 대상 확정 검증 통과.

## 결론 먼저
밤새 vhk에서 실재 결함 **2건** 발굴→수정→PR(머지 0, 사람 결정 대기). 둘 다 적대리뷰·자기검증 통과. **#432 CI green→오늘 머지 권고**, **#433 CI 진행중→green 확인 후.**

| PR | 결함 | 심각도 | 시도 | 머지 권고 |
|----|------|--------|------|-----------|
| [#432](https://github.com/byh3071-cpu/vhk/pull/432) | readMission 스키마 검증 누락 → 손상된 mission.json이 `vhk receipt`/`mission check` 크래시 | med | 1회 | ✅ 권고(오늘) |
| [#433](https://github.com/byh3071-cpu/vhk/pull/433) | `vhk review`: goals/ 비었을 때 자기검증이 exit 1 (미사용을 실패로 오인) | med | 1회 | ⏳ CI green 후 |

## #432 — 머지 권고 (오늘)
- **결함:** mission.json 손상 시 스키마 검증 없이 읽어 `vhk receipt`·`mission check` 크래시. 크래시 경로(collectIntent try/catch 밖 checkMission) 실재 확인.
- **수정:** 최소·범위 내 스키마 가드 추가. 회귀·범위이탈 없음.
- **검증:** 적대리뷰 승인(blocker 0). mission 테스트 31/31. 전체 2096 tests(189파일) pass. 커밋 06b1045 check-records 통과. CI: CLEAN/MERGEABLE, 전 체크 SUCCESS.
- **잔존 갭(비차단):** mission 배열 원소 타입 미검증 — 후속.

## #433 — CI green 후 머지
- **결함:** goals/ 비면(선택기능 미사용) 읽기전용 `vhk review`가 exit 1로 실패 처리. 정상 사용을 실패로 오인.
- **수정:** 빈 goals에서만 exit 1→0(스킵). #157 정책 일관. 기존 exit-1 분기(활성 goal 없음·증거 없음) 보존, 범위를 '빈 goals'로만 좁힘.
- **검증:** 적대리뷰 pass. review 40/40(신규 회귀 포함). 전체 2094 tests pass. CI: 리포트 시점 IN_PROGRESS(BLOCKED) → green 확인 필요.

## Park / 미시도
- **둘 다 없음.** 발굴 2 = PR 2, park 0, 미시도 0. 각 1회 성공.

## 후속 (아침 액션)
1. **#432 머지** — CI green·리뷰승인·회귀 0.
2. **#433** `gh pr checks 433` green 확인 후 머지.
3. 순서 무관(독립 파일: mission 스키마 vs review exit코드).
4. #432 잔존 갭은 별도 후속 이슈 판단(비차단).

*밤 동안 코드 집행·머지·발송 0(설계 준수). 소규모 med 2건·저리스크만, 아키텍처 변경 없음.*
