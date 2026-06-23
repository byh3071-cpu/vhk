# 2026-06-23 — diff-cover 거짓 '측정 대상 없음'/은폐 결함 3건 수정 (#319 #320 #321)

> append-only. 추가만, 수정·삭제 금지.

## 배경
2026-06-22 미니 심시티 도그푸딩 자동 버그수색이 diff-cover(자문형 품질 게이트)에서
조용한 false-negative·은폐 결함 3건을 격리 temp 독립 재현으로 적발. TDD 로 일괄 수정.

## 결함 3건
- **#319 (P2)** 한글/비ASCII 경로 소스 변경이 통째 누락 → 거짓 '측정 대상 없음'(exit 0).
  - 원인: `diffUnified0`(`git diff --unified=0 HEAD`)가 `core.quotepath=false` 미전달 →
    Git 기본 quotepath 가 비ASCII 경로를 `"b/src/lib/\355\225\234...ts"`(따옴표+8진 이스케이프)로 출력.
    `diff-hunks.ts` 의 `+++` 정규식 `(?:b\/)?` 가 선두 따옴표 매칭 실패 → 파일 드롭.
  - 수정: ① `diffUnified0` argv 에 `-c core.quotepath=false` 선행(따옴표 자체 차단).
    ② `diff-hunks.ts` 에 `decodeGitDiffPath()` 추가 — 따옴표/8진 이스케이프를 방어적으로 디코드
    (다른 경로로 quotepath 가 켜져 들어와도 견디는 belt-and-suspenders).
- **#320 (P3)** untracked 신규 소스(가장 미검증 위험)를 diff-cover 가 못 봄 → 거짓 '측정 대상 없음'.
  - 원인: `diff HEAD` 는 정의상 untracked 미포함. `added.size===0` 분기가 untracked 확인 없이 단정.
  - 수정: `diff-cover.ts` 가 `untrackedFiles()`(이미 존재하는 헬퍼) 로 untracked 기능소스를 확인 →
    있으면 '측정 대상 없음' 단정 대신 'untracked N개는 git add 후 측정' 정직 안내.
    순수 추출 `untrackedFeatureSources()` 로 테스트 가능화.
- **#321 (P3)** 손상/빈 coverage-final.json(파일은 실재)이 '리포트 없음'으로 보고 → 손상 은폐.
  - 원인: `fileCoverageByFile` 가 부재(`!existsSync`)와 파싱실패(`catch`)를 동일 `null` 로 붕괴.
  - 수정: 파싱 실패 시 별도 sentinel `COVERAGE_CORRUPT` 반환. 호출부 2곳(diff-cover·receipt) 구분 소비:
    diff-cover → '리포트 손상(재생성 필요)' exit 1 / receipt → 측정 불가(empty) 처리.

## 회귀 주의
- #239 에서 강화된 `diff-hunks` 상태머신(`+++` 본문 오인 차단)은 그대로 유지 — 디코드는 헤더 영역에서만.
- `receipt.collectDiffCover` 의 `covered === null` 분기에 corrupt 도 empty 로 합류시켜 측정 불가 유지.
- `git-session.test.ts` 의 `diffUnified0` argv 단언을 `-c core.quotepath=false` 포함으로 갱신.

## 수용 기준(테스트)
- 비ASCII 경로 파일 인식(따옴표 경로 디코드 + quotepath=false argv)
- untracked 신규파일 정직 안내(은폐 0)
- 손상 coverage 파일 → '손상'으로 정직 보고(부재와 구분)
- 정상 케이스 회귀 0
