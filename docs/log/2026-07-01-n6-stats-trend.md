# 2026-07-01 — N6 vhk stats --trend (ⓔ 복리 척추)

## 무엇·왜
- ⓔ: N7(receipt-log.jsonl 영속, 머지됨)이 쌓은 측정치를 **시계열 추세**로 가시화. ⓐ(loop tick)가 "추세 악화"를 다음 한 수 근거로 쓸 토대.
- `vhk stats --trend` — receipt-log 읽어 거짓완료 판정(decision) 추이 출력.

## 구현
- `stats.ts`: `computeReceiptTrend(entries)` 순수함수(fs/시간 부수효과 0) — total·decision분포·red/dirty율·diff-cover 평균·**앞절반 vs 뒷절반 block율 델타**(양수=악화). `stats(opts.trend)` 분기 + `renderTrend`(읽기 전용).
- 정직성: total<2 → trend null, 측정분 0 → avgDiffCover null (표본부족을 0으로 위장 안 함, RFC0056 정신).
- 등록: index.ts `.option('--trend')` (신규 명령 아님 → 드리프트 4지점 불요). ko stats.trend* 4키.

## 검증
- TDD: `stats-trend.test.ts` 6케이스(빈입력·분포·평균·추세방향·정렬결정성·total1) RED→GREEN.
- 전체 2108 tests green · typecheck 무에러.

## 다음
- N1 loop --tick(ⓐ) — 추세 소비 조율자. → N4 objective 토큰(ⓑ) → N5 evolve digest(ⓓ).
