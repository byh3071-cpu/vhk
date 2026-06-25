# 2026-06-25 — receipt 위조 방어: mission checksum 스냅샷 + baseSha 무결성 (방향 3-③·3-④)

> append-only dev log. Goal 87 의도 검증 방향 3(위조·미설정 차단)의 두 조각을 한 PR에 순차 구현.
> 브랜치 `feat/receipt-integrity` · 베이스 main(#398 머지 후 — unsupportedForbiddenCount/decideReceipt 반영본).

## 무엇을·왜 (위조 방어 0 → checksum + baseSha 무결성)

receipt 는 "AI 의 됐어요"를 기계증거로 대조하는데, 그 증거 자체가 위조·오타로 무력화되는 두 구멍이 있었다.

### 3-③ mission checksum 스냅샷 (사후 위조 탐지)
- 구멍: receipt 발행 *후* `.vhk/mission.json`(목표·forbidden)을 완화로 사후 위조해도, 그 영수증이
  *어떤 계약으로* 판정했는지 증명할 길이 없었다. → 같은 mission 의 두 영수증을 구분 못 함.
- 수정: `ReceiptIntentEvidence.missionChecksum?: string`(옵셔널, GA 동결) 추가 — `collectIntent`에서
  Node 내장 `crypto.createHash('sha256')`로 mission.json **raw 내용**(BOM·양끝공백 정규화) 해시 앞 16자.
  - raw 파일을 해시(파싱 결과 아님) → objective/scope/forbidden 한 글자만 바뀌어도 checksum 변화.
  - **decision 영향 0** — 순수 사후 감사용. `decideReceipt` 손대지 않음(단조성 불변식 ②·③ 불변).
  - `.md` 출력에 1줄 표시(mission 있을 때만 — 없으면 출력 변화 0 = 하위호환).

### 3-④ baseSha 무결성 검증 (거짓 stale 방지)
- 구멍: baseSha(`.base-sha` 파일 또는 `--since` 인자)가 위조·오타·다른 레포 SHA·비커밋 객체여도
  그대로 사용 → `baseSha ≠ HEAD`가 무조건 참 = **거짓 stale(block)**, intent 의 `git diff <baseSha>`도
  엉뚱한 기준으로 돌아감.
- 수정: `verifyBaseSha(cwd, sha)` 추가 — receipt.ts 가 이미 쓰는 `gitOut`(safeExecFile 통로, **execSync 신규 0**)으로
  `git rev-parse --verify <sha>^{commit}` 실행. 커밋으로 역참조 가능할 때만 통과, 아니면 throw→false.
  - `collectReceipt`에서 baseSha 계산 직후 검증 — 무효면 null 처리(stale 미상=caution, **block 아님**) + 경고 출력.
  - `^{commit}` 핵심: blob/tree/태그가 아니라 커밋인지까지 확인(SHA 존재만으로 통과 금지).

## 검증

- `pnpm build` green · `pnpm typecheck` green · `pnpm lint` green(영구 규칙 ESLint 3종 통과 — execSync 신규 0·빈 catch 0·any 0).
- 순수 로직 테스트(vitest): decideReceipt 18 + render 3 + checksum-decision 2 전부 green.
- git 스폰 경로(`collectIntent` checksum · `verifyBaseSha` · `collectReceipt` baseSha): 로컬 vitest forks
  워커가 child-process 스폰에서 크래시(환경 이슈 — [[vhk-local-vitest-forks]], 기존 collectIntent 테스트도 동일 크래시 재현).
  → tsx 단독 하니스로 **실 git 레포 대조 13/13 green**. 전체 `pnpm test:run`: 954 pass · **assertion 실패 0** · 92 worker-crash(전부 환경). CI(forks)가 진실원.
- 적대검증(verifyBaseSha): `--hard`(flag-like)→false(인젝션 0), `HEAD; rm -rf x`(no-shell)→false, 빈문자/공백→false,
  `HEAD`·단축SHA·이미 `^{commit}` 붙은 값→true. 거짓 *pass* 방향 우회 없음(모두 caution 방향으로만 보수적).

## 테스트 설계 함정 (스스로 잡음)
- 초안: "무효 baseSha → decision ≠ block" 단언. 실패. 원인은 코드 아님 — bare 임시 레포가 `collectReceipt`
  실행 중 `.vhk/reports`·ledger 를 써서 **dirty=true**가 독립적으로 block 을 만듦(diag 로 확인).
- 교정: decision(오염 가능)이 아니라 3-④ 직접 출력(`base.sha=null`·`staleKnown=false`·`stale=false`)만 단언.

## 파일
- `src/lib/receipt.ts` — `ReceiptIntentEvidence.missionChecksum?`(why 블록주석) + render checksum 1줄.
- `src/commands/receipt.ts` — `missionChecksum()` 헬퍼 + `verifyBaseSha()` + `collectReceipt` baseSha 검증·경고.
- `src/i18n/ko.ts` — `receipt.invalidBaseSha(sha)` 추가만(기존 키 불변).
- `tests/receipt.test.ts` — 3-③·3-④ describe 블록 추가.
