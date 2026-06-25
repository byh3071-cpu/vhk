# 2026-06-25 — 의도 검증 방향 3-①·②: init mission 스캐폴드 + work 미설정 경고

> append-only dev log. 추가만, 과거 항목 수정·삭제 금지.

## 무엇을 (what)

의도 검증(의도 장갑의 검증 면) **방향 3 — 위조·미설정 차단**의 첫 두 강화안을 한 PR로 구현.

- **3-① `vhk init` mission.json 스캐폴드** — `init` 흐름 마지막(파일 기록 이후, isInteractive 분기 밖)에서
  `.vhk/mission.json` 이 **없을 때만** 빈 계약 뼈대를 생성. 비대화형 `--yes` 에서도 생성.
  - `src/commands/mission.ts`: 순수 팩토리 `scaffoldMission(_projectName)` 추가(fs 없음, objective=placeholder
    `(작업 전 vhk mission set 으로 선언)`, scope/forbidden 빈 배열). `writeMission` 을 export 로 승격(기존 private).
  - `src/commands/init.ts`: `fileExists` 가드로 조건부 생성(이미 있으면 절대 덮어쓰지 않음).
- **3-② `vhk work` 시작 시 mission 미설정 경고** — `work()` 작업 시작 경로에서 `readMission(cwd)===null` 이면
  경고 출력. **exit 0 유지**(block 아님 — 사용자가 의도적으로 미설정할 수 있음).
- `src/i18n/ko.ts`: `init.missionScaffold`, `work.missionUnset` 메시지 추가(기존 키 구조 유지, 추가만).

## 왜 (why)

방향 3 근거(2026-06-25-intent-verification-handoff.md): 의도 검증이 실효하려면 mission 이 실제 설정돼야 하는데,
`init` 이 mission 미생성·`work` 가 유무 확인 0 → **미설정이면 intent 검증이 그냥 0(거짓 안전, 하위호환 악용)**.
스캐폴드로 "미설정 0" 상태를 없애 receipt/work 가 합류 지점을 갖게 하고, work 경고로 사용자에게 미설정을 알린다.

## 검증

- `pnpm build` green · `pnpm typecheck` clean · `pnpm lint` clean(any/execSync/빈 catch 0).
- 동작 검증: vitest fork 가 이 Windows 워크트리에서 불안정(TS-004) → 실 소스 함수를 `tsx` 스모크로 직접 구동,
  **12/12 PASS**(scaffold 팩토리 4 · init 생성/비덮어쓰기 5 · work 경고·exit0·미경고 3). CI(Linux)가 진실원.
- 신규 vitest 테스트 추가: `tests/init-yes.test.ts`(스캐폴드 생성·비덮어쓰기 2건), `tests/work.test.ts`(경고+exit0·미경고 2건).

## 적대 검증(critic) 반영

- **[치명→수정] init scaffold 무방호 호출** — `writeMission` 가 권한/ACL 로 throw 시 init 전체가 크래시.
  선택 기능이므로 try-catch 로 감싸 실패 시 `log.warn`(missionScaffoldFailed) 후 계속 진행하게 함.
- **[중간→수정] 손상 mission.json 미감지** — 파일은 있는데 파싱 실패면 work 가 "없다"고 오안내.
  init 에서 `fileExists && readMission===null` 분기로 손상 경고(missionScaffoldCorrupt) 추가, **덮어쓰진 않음**(보존).
- 통과 확인: scaffold isInteractive 밖·fromNotion answers.name 유효·work cwd 불변·exit0·순환 import 없음·MCP 무영향·`_projectName` 규칙 위반 아님.

## 비고

- 방향 3 잔여: ③ receipt.json mission checksum 스냅샷(사후 위조 탐지) ④ baseSha 무결성 — 본 PR 범위 밖.
