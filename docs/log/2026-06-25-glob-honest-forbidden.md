# 2026-06-25 — glob 미지원 forbidden 문법 거짓 안전 → caution (방향 2-1)

## 결함 요약

`mission.json`의 `forbidden` 배열에 `!`, `{}`, `[]`, 후행 `/`를 포함한 glob 패턴을 쓰면
`globToRegExp`가 해당 패턴을 잘못 처리해 **파일이 실제로는 금지 경로인데도 매칭 실패**로 조용히 통과했다.

- `!src/a.ts` — negation glob. globToRegExp가 `!`를 리터럴로 escape해 `\!src\/a\.ts`가 됨 → 경로와 절대 매칭 안 됨.
- `src/{a,b}.ts` — 중괄호 확장. escape돼 리터럴 `\{a\,b\}` 매칭 → 실제 `src/a.ts` 통과.
- `src/[ab].ts` — 문자 클래스. escape돼 리터럴 `\[ab\]` 매칭 → `src/a.ts` 통과.
- `src/` — 후행 `/`. 경로는 `/`로 끝나지 않으므로 절대 매칭 안 됨.

결과: forbidden인데 위반 0 → receipt에서 forbidden 검증이 완료된 것처럼 보였다 = **거짓 안전**.

## 수정 접근 (방향 2-1 — 정직화, 차단 격상 없음)

1. `detectUnsupportedGlob(g: string): string | null` 순수 함수 추가 (mission.ts)
   - 검출: `!` 어느 위치든 / `{` / `[` / 후행 `/` → 비null(미지원 표시).
   - `?`는 `[^/]`로 변환돼 **지원되므로** 검출 안 함.

2. `MissionCheckResult`에 `unsupportedForbiddenPatterns: string[]` 추가.
3. `ReceiptIntentEvidence`에 `unsupportedForbiddenCount?: number` 옵셔널 추가 (GA 동결).
4. `decideReceipt` caution 분기에 `unsupportedForbidden` 조건 추가 — block 분기 절대 불변.
5. `collectIntent` (receipt.ts 경계)에서 `unsupportedForbiddenCount` 전파.
6. `receiptReasons` + `renderReceiptMarkdown` ⑤ intent 행에 사유/비고 표기.
7. `ko.ts` receipt 섹션에 `unsupportedForbiddenGlob` 키 추가.
8. `missionCheck` CLI에서 미지원 패턴 경고 출력 + "✓ 통과" 모순 방지.

## 불변식 유지 확인 (tsx 직접 실행)

- 8/8 detectUnsupportedGlob 케이스 PASS
- checkMission: violations=0, unsupportedForbiddenPatterns=1 (src/{a,b}.ts)
- decideReceipt unsupportedForbiddenCount=1 → caution (block 아님)
- decideReceipt missionKnown=false, unsupportedForbiddenCount=5 → pass (하위호환)

## 참조

- Goal 87 방향 2-1 (방향 B 설계)
- critic: L-1(중간 ! 검출·"✓ 통과" 모순), L-2(? 지원됨 예외), L-3(toBe 단언) 반영
