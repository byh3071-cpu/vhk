# Changelog

VHK 변경 이력. [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/) 형식, [Semantic Versioning](https://semver.org/lang/ko/).

## [Unreleased]

### Security

- `vhk save`를 high-risk로 승격했다(ADR-021, #611). 비-TTY/에이전트 Commander 실행은
  `--yes`(commit+push) 또는 `--no-push`(로컬 commit만) 중 하나가 없으면 차단되고 exit 1로 끝난다.
  standard·strict 자연어 "저장해줘"는 미리보기만 하고 exit 1로 끝나며, lite는 TTY에서만 경고 후
  실행하고 비-TTY에서는 차단한다. TTY Commander 흐름은 승격 전과 동일하다 — standard는 save 자체
  프롬프트가 확인 역할(이중 프롬프트 없음), strict는 기존 y/N 확인 유지. 두 플래그는 대체 관계이며
  에이전트 권장 로컬 경로는 `vhk save --no-push -m "메시지"`다. 가드의 대화형 판정은
  stdin TTY 단일 축이라 `vhk save | tee` 오판이 없고, `VHK_FORCE_INTERACTIVE` 환경변수는 가드
  승인을 대신하지 못한다(Git Bash/MinTTY는 `--yes`로 승인 — 이후 save 자체 프롬프트는 탈출구가
  정상 동작). strict의 y/N에서 No를 답하면 이제 exit 1로 끝난다.
- 가드의 safetyMode를 cwd가 아니라 git 루트의 `.vhk/config.json`으로 해석한다 — 저장소 하위
  폴더에서 실행할 때 strict가 조용히 standard로 떨어져 확인 없이 push되던 우회를 봉인.
- CLI 위험 작업의 확인 프롬프트가 실패하면 사용자 거절로 삼키지 않고 오류를 전파해 exit 1로 끝낸다.
  작업이 실행되지 않았는데 자동화가 성공으로 오판하던 경로를 막았다.
- 종료 코드 범위 주의: 자연어 가드 차단 시 exit 1은 save 전용이 아니라 자연어로 부른 위험 작업
  전체(undo·deploy·publish·sync 등)에 적용된다(이전 exit 0).
- **마이그레이션**: 비-TTY/에이전트 자동화는 원격 push까지 필요하면
  `vhk save --yes -m "메시지"`, 로컬 commit만 필요하면 `vhk save --no-push -m "메시지"`로 바꿔야
  한다. 바꾸지 않으면 조용한 push 대신 차단 안내 + exit 1로 끝난다. 발행 버전은 아직 정하지 않았다.
  이 변경은 공개 CLI 비호환이므로 현 전역 규칙 아래에서는 major에서만 허용되며, 2.15.x 배치를
  검토하려면 발행 전에 전역 규칙을 별도의 사람 결정으로 정식 개정해야 한다.

### Changed

- Agent Skills의 공통 정본을 `.agents/skills`로 통합했다. Google Antigravity·Codex·Cursor는 같은
  경로를 직접 읽고 Claude Code는 해시가 붙은 `.claude/skills` 관리 사본을 사용한다. `vhk sync`는
  새 프로젝트에 두 경로를 만들며, `sync --check`는 정본·npm 번들·투영 drift와 사용자 충돌을 쓰기
  없이 검사한다. 기존 `.cursor/skills`와 사용자 수정본은 자동으로 덮거나 옮기거나 지우지 않는다.
- README·COMMANDS·2.x 원본 문서를 실제 2.15 동작에 맞췄다. MCP 35개 목록에서 CLI 전용 `policy`를
  제외하고, `policy check`의 셸 경계, receipt의 자체 5-gate 검증·stale 미상 CAUTION,
  DONE/CANCELED 종결 스냅샷 계약을 명시했다. 이 수정은 GitHub 문서부터 적용되며 이미 발행된 npm
  2.15.0의 내장 README는 불변인 릴리스 시점 스냅샷으로 남는다.

### Internal

- Codex hook 검증기가 입력을 읽기 전에 정상 종료한 자식 프로세스의 stdin 닫힘을 Node 24/Linux와
  Windows 모두에서 처리한다. 실제 종료 코드와 출력은 그대로 검증하며 다른 스트림 오류는 실패로 남긴다.

## [2.15.0] - 2026-08-29

### Fixed

- `vhk receipt`가 작업 시작 기준선과 검증 증거 기준선을 분리한다. 작업 범위는 `mark-start` 시점부터
  계산하되, 낡은 증거 여부는 `receipt`가 자체 검증을 시작할 때의 HEAD·dirty와 게이트 종료 후 상태로
  판정해 정상적인 A→B 구현 뒤 B 검증을 stale로 오인하지 않는다. 검증 중 HEAD가 바뀌거나 작업트리가
  더러워지면 stale이 된다.
- 모든 Goal이 정상 DONE인 branch closeout을 손상된 Goal 상태와 구분한다. 전자는 review N/A·branch
  receipt 안내로 닫고, 후자만 `goal-health`로 보낸다. 관리되는 Cursor 스킬은 사용자 수정본을 덮지 않고
  안전하게 새 템플릿으로 이관한다.
- `vhk goal next`가 BLOCKED·DEFERRED·OBSERVING Goal을 전체 완료로 오인하지 않으며, 미해결 Goal 없이
  DONE/CANCELED만 남은 종결 상태를 반복 조회해도 `next-task` 시각이나 백업을 다시 쓰지 않는다. 완료
  스냅샷 뒤 Goal이 재개되면 낡은 완료 표시와 시각을 함께 무효화한다.
- 패턴 ID의 빈 값과 추적되지 않은 패턴 문서 내부의 깨진 `PAT-NNN` 참조까지 검사한다. 자기 선언은 내부
  참조로 세지 않아 정상 패턴 문서를 거짓 차단하지 않는다.
- JSON 형식은 맞지만 알 수 없는 자율 런 event를 종결로 취급하지 않아, 손상 라인 하나가 정상 complete를
  영구히 가로막지 않는다.
- 신규 Gist 생성 뒤 공개 여부 확인이 실패하거나 공개 Gist로 판정되면 `cloud.json`에는 연결하지 않되,
  이미 생성된 객체를 확인·삭제할 수 있도록 복구 ID를 출력한다.
- 릴리스 worktree와 중첩된 `.vhk` 작업공간이 Vitest 수집·공개 경계 검사에 섞이지 않으며, 정책·원자 쓰기
  상태 파일을 클라우드 백업 대상에서 제외한다.
- 자율 런이 완주해도 관찰 게이트 표본에 들어가지 않던 문제 — 완주 판정은 같은 커밋 SHA 의
  `vhk receipt` 를 요구하는데 `vhk verify` 는 그 원장을 쓰지 않고, 자율 루프 스킬에도 호출이
  없었다. 기록은 남지만 `verified=false` 로 떨어져 유효 실행에 안 들어가고 권한 승급까지
  막힌다. 합격 종결 전 `vhk receipt` 를 불변식(INV-10)으로 못박았다.

### Internal

- 릴리스 검증용 `.vhk/npm-cache-*`를 로컬 전용으로 고정해 npm 로그·캐시의 절대경로가 공개 경계 검사나 커밋 후보에 섞이지 않게 했다.
- 실행 전 결정론 검사를 신설 (작업 단위 125a-T5 · RFC 0067 §4). 중단신호 → 허용목록 → 호출 수 →
  시간 → 권한 단계 순 **단락 평가**이고, **하드리밋을 전부 통과한 뒤에만 사람 승인을 묻는다** —
  순서가 뒤바뀌면 사람이 승인한 순간 한도 없는 실행이 된다. `require-human` 은 종료 코드 0 이 아니다.
  **아직 배선되지 않았다**.
- 호출 수·시간 한도 판정과 런 단위 상태를 신설 (작업 단위 125a-T3·T4 · RFC 0067 §5.3-3).
  **기계가 직접 세는 값만 쓴다** — 단조 시계 경과와 명령 호출 수다. 자기 보고 비용은 안 부르는 것이
  가장 쉬운 우회라 하드리밋 근거가 못 된다. 벽시계가 역행하면 그 런은 멈춘다 — 드문 상황에서
  관대해지는 것이 하드리밋이 뚫리는 방식이다. **아직 배선되지 않았다**.
- 명령 허용목록과 그 설정 파싱을 신설 (작업 단위 125a-T1·T2 · RFC 0067 §3). 셸 문자열이 아니라
  **argv 토큰 배열의 정확 일치**다 — 파서를 두면 그 파서가 곧 우회 표면이 된다. `limits` 세 값은
  전부 필수이고 하나라도 없거나 `≤0` 이면 섹션이 무효다: 한도는 "안 쓰면 없음" 이 아니라
  "안 쓰면 못 돎" 이어야 한다. **아직 배선되지 않았다**(판정 자료만).

### Changed

- 오너 결정(2026-08-28)으로 기본-off인 2.15 판정 기능의 패키지 공개를 관찰 게이트와 분리했다.
  자동 집행 활성화와 2.16 실행 배선은 기존대로 4주·유효 실행 10회·사람 계속 판정 뒤에만 진행한다.
- `vhk policy` 출력이 판정 사유를 사람 문장으로 함께 보여준다 — `LEDGER_EMPTY` 같은 코드만
  노출하면 무슨 상태인지 알 수 없다. 코드는 원장과 대조할 수 있게 그대로 남긴다.

### Added

- `vhk policy check -- <명령>` — 실행 전 결정론 검사 (작업 단위 125a-T6·T7 · RFC 0067 §4·§6).
  판정만 하고 **명령을 실행하지 않는다**. 종료 코드로 결과를 준다 — `allow` 0 · `require-human` 2 ·
  `deny` 1. 설정이 없으면 형식을 안내한다(파일은 만들지 않는다 — 무엇을 허용할지는 사람이 정한다).
  한글 별칭 `정책 검사`.
- `vhk policy` — 자율 실행 권한 정책 조회 (작업 단위 124-T4 · RFC 0066 §8). `policy level` 은 현재
  단계와 다음 승급 조건을, `policy risk` 는 스테이징된 변경의 위험도를, `policy show` 는 설정까지
  함께 보여준다. 한글 별칭 `정책 단계`·`정책 위험도`·`정책 보기`. **세 서브커맨드 전부 읽기 전용이고
  원장에 기록하지 않는다** — 조회로 단계가 오르면 세 번 불러 권한을 올리는 경로가 열린다.

### Internal

- 권한 판정 원장을 신설 (작업 단위 124-T3 · RFC 0066 §3·§4.5). `record` 또는 `enforce` 일 때만
  쓰고, 단계 전이는 **마지막 라인 CAS** 를 통과해야 기록된다 — 병렬 세션 둘이 같은 직전 단계를
  읽고 둘 다 승급을 쓰는 것을 막는다. **아직 배선되지 않았다**.
- 권한 정책 설정 로더와 변조 탐지 베이스라인을 신설 (작업 단위 124-T4 전제 · RFC 0066 §7.3·§7.4).
  설정을 신뢰할 수 없으면 자율 레인을 **fail-closed**(전부 거부)로 두고 사람 CLI 는 건드리지 않는다 —
  깨진 설정으로 자율 레인이 조용히 예전처럼 도는 것은 안전한 상태가 아니다. 해시 베이스라인 대조는
  `enforce` 와 **무관하게 항상 동작한다**. **아직 배선되지 않았다**(계산·읽기만).
- 위험도 분류를 신설 (작업 단위 124-T2 · RFC 0066 §5). 기존 `TaskKind` 7종을 `auto`/`human`
  두 갈래로 접는 순수 매핑이다. **변경 경로 중 미분류가 하나라도 있으면 `human`** — 최댓값만 보면
  `['docs/a.md', 'Dockerfile']` 이 통째로 `docs` 로 통과하던 구멍을 막는다. 권한 단계는 `human`
  위험도를 완화하지 않는다. 이를 위해 `deriveTaskKindDetailed` 를 additive 로 추가하고
  `.vhk/policy.json` 을 `security` 경로로 등재했다. **아직 배선되지 않았다**(계산만).
- 권한 단계 판정을 순수 함수로 신설 (작업 단위 124-T1 · RFC 0066 §4). 자율 실행이 어디까지 갈 수
  있는지(`L0` 관찰 ~ `L3` 제출)를 3중 판정 집계에서 매번 재계산한다. 단계를 저장하지 않으므로
  원장이 사라지면 시작값으로 돌아간다 — fail-closed 다. **아직 어디에도 배선되지 않았다**(계산만).
- 자율 런 3중 판정 집계를 `commands/stats.ts` 에서 `lib/autonomy-stats.ts` 로 이관 (RFC 0066 §2.1).
  권한 단계 판정(작업 단위 124)이 이 계산을 유일한 입력으로 쓰는데, lib 이 commands 를 import 하면
  역방향 의존이 생긴다. 공개 표면과 출력은 불변 — `commands/stats.ts` 는 re-export 만 남긴다.

## [2.14.1] - 2026-08-18

### Internal

> 아래 두 항목은 저장소의 검사 체계 변경이라 npm 배포물(`dist`)은 바뀌지 않는다.

- 패턴 사전 규약 검사 (#527) — `PAT-NNN` 명명·frontmatter 필수 필드·번호 중복·**참조 무결성**을
  `vhk check` 가 검사한다. 규약이 문서로만 있던 탓에 결번을 가리키는 참조가 `vhk sync` 로 파생본 8개에
  복제된 적이 있어, 없는 번호를 참조하면 차단한다.
- 원격 에이전트·CI 가 기록 집행 사각지대이던 문제를 메우는 PR 게이트 (#526) — 코드가 바뀐 PR 은
  `CHANGELOG.md`·`README.md`·`RULES.md`·`docs/` 중 하나를 함께 갱신해야 한다. 로컬 훅이 요구하는
  세션 기록은 비추적이라 클론만 받는 CI 가 볼 수 없어, 추적되는 공개 기록물로 검증 축을 바꿨다.
  `[skip-record]` 우회는 로컬 훅과 동일하게 인정한다.

### Fixed

- **한글 등 비ASCII 경로에서 VHK 가 아무 메시지 없이 종료되던 문제** (TS-005) — Windows 사용자명에 한글이 들어가면
  홈·임시 디렉터리 경로가 비ASCII가 되고, 이때 `fs.rmSync`가 프로세스를 즉사시키거나(상위 경로에 비ASCII)
  삭제를 조용히 건너뛴다(이름에 비ASCII). 백업 정리·패키지 매니저 전환·미션 삭제·원자적 쓰기 실패 정리가
  여기에 해당했다. 전용 삭제 헬퍼로 교체하고 신규 사용을 규칙 검사(`vhk:check=no-rm-sync`)로 차단한다.
  같은 원인으로 4개월간 "로컬만 실패, CI는 통과"로 오진돼 있던 테스트 실행 불능도 함께 해소된다(TS-004).
- 생성 프로젝트의 `.vhk` 제외 규칙이 `memory.json` 백업본(`.bak`·`.v1.bak`)까지 덮는다. 원본과 같은 개인 메모라
  보호등급도 같아야 한다 (#557).
- 모든 goal 이 완료된 뒤 `docs/state/next-task.md` 에 마지막 완료 작업이 다음 작업처럼 남던 문제 (#558) —
  다른 세션이나 에이전트가 끝난 일을 다시 할 수 있었다. 없는 파일을 새로 만들지는 않는다.
- 지정한 규칙 원본을 읽지 못해 VHK 내장 기본 규칙으로 대체될 때 `vhk sync` 가 이를 알린다 (#556) —
  `vhk init` 은 이미 경고하는데 sync 만 조용히 넘어가, 조직 규칙이 적용된 줄 알고 더 약한 규칙을 쓰게 됐다.
- `vhk testmap` 이 소스와 같은 위치에 둔 테스트(`src/lib/foo.test.ts`)를 인식한다 (#559) —
  `tests/` 만 스캔해 실제로는 테스트가 있는 파일을 "테스트 없음"으로 보고했다.
- 한글 사용자명 PC 에서 테스트 임시 경로를 ASCII 로 고정해, 환경변수를 손으로 지정하지 않아도 전체 테스트가
  실행된다 (TS-005 후속). 임시 경로가 이미 ASCII 인 환경은 건드리지 않는다.
- `fs.rmSync` 금지 규칙 검사가 실제로 실행되고 `tests/` 까지 검사한다 — 스크립트만 있고 게이트에 연결돼
  있지 않아 한 번도 돌지 않았다. 기존 잔존분은 baseline 으로 허용하되 증가는 차단한다.

## [2.14.0] - 2026-08-12

### Added

- **Goal Phase/Task 읽기 전용 투영** — Goal 본문의 `### Phase N`·`**Task N**` 체크리스트를 원본 변경 없이 구조화해 읽는다. Phase 순서에 따른 ready/waiting 판정, Task 간 의존 관계, 증거 힌트를 계산하며 코드 펜스 안의 문법은 무시한다.
- **에이전트용 안전한 컨텍스트 JSON** — `vhk context --json`이 활성 Goal의 Phase/Task를 기계가 읽는 단일 JSON(`WorkContextV1`)으로 출력한다. 시크릿·홈 절대경로·개인 식별자는 직렬화 전에 차단하고, 사람용 출력과 기존 명령은 그대로 유지한다.
- **완주 판정을 자기 보고에서 기계 증거로** — 자율 런의 완주 집계가 에이전트의 "완료" 신고가 아니라 같은 커밋 SHA의 `vhk receipt` 기계 판정(검증 통과·리포트 유효·사람 개입 0)으로 이뤄진다. 작업 유형은 변경 파일 경로에서 자동 유도하고, 최근 10회 중 3회 실패 시 권한 축소를 판정하며, 인프라 실패는 분모에서 뺀다.
- **병목 계측** — `vhk stats`에 병목 섹션이 생겼다. PR이 검토 가능해진 뒤 사람이 처음 반응하기까지의 시간과 아침에 검토 없이 넘어온 PR 수를 GitHub 데이터에서 재고, 자율/수동 PR을 구분해 5가지 판정(확정·혼합·미입증·데이터 부족·측정 불가)으로 완결한다. 표본이 없으면 없다고 말하고 0%로 위장하지 않는다.
- **아침 확인 절차 자기신고** — 아침 보고 생성 시 상태 파악 시간과 확인 없는 승인 건수를 선택 입력할 수 있고, 응답률이 함께 집계된다. 미입력이어도 절차는 막히지 않는다.
- **공용 에이전트 자동화 설정** — 저장소에 추적되는 push+PR 전용 래퍼 스크립트와 에이전트 공용 스킬·훅 설정을 추가했다. 자율 런이 만든 PR에는 `autonomous` 라벨이 자동으로 붙는다.

### Changed

- worktree 생성 시 의존성 설치가 자동으로 실행된다.

### Fixed

- `nanoid`를 3.3.18로 고정해 High 등급 의존성 취약점을 해소했다.

## [2.13.0] - 2026-08-08

### Added

- **규칙과 자동 검사의 연결** — `RULES.md` 규칙에 검사 ID를 붙이면 `vhk check`가 해당 스크립트를 실행하고, 검사된 규칙 수와 전체 규칙 대비 비율을 CLI·JSON·검사 기록에 남긴다.
- **PR 필수 검사 템플릿** — `vhk init --ci`가 검증·규칙 검사·공개 경계 검사를 수행하는 `VHK Gate` 워크플로를 만들며, 기존 워크플로는 덮어쓰지 않는다.
- **Goal 선행 조건** — 선택 필드 `depends_on`을 추가해 선행 Goal이 끝나기 전 선택·시작·완료되는 일을 막고, 누락·자기 참조·순환 참조를 설정 오류로 안내한다.
- **확인할 항목의 경과 시간과 행동 기록** — 아직 시작하지 않은 작업, 오래 기다린 항목, 숨긴 알림 횟수와 실제 커밋·검사 행동을 상태·검증 출력에서 확인할 수 있다.

### Changed

- **첫 실행을 추측보다 확인 중심으로 변경** — `vhk start`는 지정하지 않은 기술 구성을 확정값으로 저장하지 않고 확인할 후보로 남기며, 기본 도움말은 개발 핵심 명령만 보여주고 전체 목록은 `vhk help --all`로 분리한다.
- **검사·설정 진단을 구체화** — 도입하지 않기로 선언한 검사는 정상 상태로 구분하고, 실제 설정 차이는 기대값·현재값·해결 방법으로 보여준다.
- **설치·동기화 결과를 정직하게 표시** — 사용자 규칙과 VHK 내장 규칙의 출처·버전을 구분하고, 연결되지 않은 규칙 섹션에는 인식 가능한 이름과 `vhk:sync=all` 해결 방법을 함께 안내한다.
- **진화 후보를 임시 제안 방식으로 단순화** — 장기 대기열을 없애고 후보를 그 자리에서 제안한 뒤 만료하며, 기존 대기열은 호환 마이그레이션하고 자동 적용 경로는 두지 않는다.
- 사용자 문서와 CLI 문구를 일반적인 개발 용어로 정리하되 기존 명령어·옵션·MCP 사용법은 유지한다.

### Fixed

- 필수·반드시 같은 표현이 붙은 코드 토큰을 금지 규칙으로 잘못 읽던 규칙 파서 오탐을 수정하고 실제 금지 규칙 탐지는 유지한다.
- 파생 규칙 파일의 필수 섹션 누락과 내용 차이를 구분해 탐지하고, `sync --check`가 누락 원인을 숨기지 않도록 수정한다.
- 기존 프로젝트 적용 시 같은 관리 구역은 하나로 정리하되, 내용 충돌·마커 불균형·중첩이 있으면 원본을 쓰지 않고 복구 방법을 안내한다.
- 로컬 Goal 상태와 실제 코드 상태가 어긋나 다음 작업이 잘못 선택되던 문제와 첫 실행의 거짓 성공 표현을 보완한다.

## [2.12.0] - 2026-07-27

### Added

- **독립 규칙 소스** — `VHK_RULES_FILE`, 홈 설정 `rulesFile`, `vhk config set-rules-file <yaml경로>`를 추가해 VHK가 개인 저장소 없이 사용자 지정 YAML을 직접 읽도록 전환. 영문·한국어 별칭과 유효성 검증 포함.
- **공개 경계·보안 기본값** — npm dry-run 파일 목록과 빌드 산출물에서 개인 운영 경로·런타임명을 차단하는 `pnpm boundary:check`, High 이상 의존성 감사, `SECURITY.md`·기여·행동 강령 문서를 추가.

### Changed

- bootstrap·sync·MCP 예시·Cursor 스킬 산출물을 범용 VHK 계약으로 변경하고 개인 생태계 자동 감지와 교차 저장소 경로를 제거.
- 개인 환경에 결합된 기존 규칙 소스 호환 계층을 제거하고 범용 규칙 파일 계약만 유지.
- pnpm을 `11.17.0`으로 올리고 `hono`, `@hono/node-server`, `fast-uri`의 취약 버전을 workspace override로 해소.
- 생성 프로젝트의 증거 원장 추적 기본값은 유지하되, VHK 공개 저장소 자체의 `.vhk` 관리자 운영 원장과 `.agents/SOUL.md`는 비공개로 분리하고 재추적을 차단.

## [2.11.0] - 2026-07-13

### Added

- **기록 집행 커밋훅(record-net)** (RFC 0061 T1~T3) — 새 프로젝트가 `vhk init` 만 하면 세션일지 없는 실질 코드변경 커밋이 git `commit-msg` 훅에서 차단된다. git 훅이라 Claude Code·Cursor·Codex 어디서 커밋해도 동작(도구 불가지론).
  - **3겹 그물**: ①규칙 선언(RULES·CLAUDE 템플릿에 handoff 의례·집행 체계 명시) ②커밋훅(결정적 검사만 차단 — src/** 스테이지 + 오늘·어제 일지 미스테이지, 에러는 AI 작업지시서·`[skip-record]` 우회) ③세션종료 수확(`vhk work handoff` 의례 배출).
  - **정직한 경계**: merge/pull·cherry-pick·revert·rebase 는 화이트리스트 통과(병합엔 새 일지가 없는 게 정상), amend·같은 날 후속 커밋은 HEAD 의 일지 인정, `core.hooksPath`(husky 등) 감지 시 거짓 배선 대신 수동 통합 안내, node 부재·게이트 결함은 fail-open. 기존 commit-msg 훅은 불가침(`vhk:record-net` 마커 소유권).
  - 적대검증(critic) 2라운드 실측 통과 — merge 차단 지옥·amend false-block·husky 거짓 성공을 라운드 1에서 잡아 수정.
- **`vhk init` 기록 온보딩** (RFC 0060) — 새 프로젝트 첫걸음의 세 구멍을 닫음.
  - **채움 마커**: PRD·ARCHITECTURE 의 빈 칸이 개발자 은어 `**FILL**` 이던 것을 `[여기에 작성: 구체 질문]` 관행 마커 + 상단 "AI 추측 금지" 가드로 교체(비개발자가 뭘 채울지 질문으로 읽음).
  - **첫 세션 인터뷰 2단계**: 도메인 규칙(1단계) 뒤에 PRD·ARCHITECTURE 슬롯을 사용자 답변으로만 채우는 2단계 추가(핵심 5±2·컨펌·옵트아웃·VISION 미터치).
  - **init 자동 sync + 설치 점검 영수증**: 그린필드/adopt 승인 시 `AGENTS.md` 등 도구별 규칙 파일을 즉시 파생(Codex·Zed 등이 첫 세션부터 규칙 인식). 브라운필드 거절 시 기존 파일 보존. 영수증은 디스크 읽기검증(거짓완료 금지).
  - **트리거 격차 계승**(RFC 0057 §7): 마커 규칙을 `RULES.md` → sync 로 전 도구 파일 전파 → SessionStart 훅이 없는 에이전트(Cursor·Codex)도 파일 규칙으로 백업 트리거.
  - **`vhk check` 슬롯 카운트**: PRD·ARCHITECTURE 의 미완성 `[여기에 작성:]` 수를 콘솔·`--json fillSlots` 로 노출(온보딩 진행 측정).

## [2.10.0] - 2026-07-12

### Fixed

- **`vhk init` 죽은 안내문 정직화** (독푸딩 Wave 1) — init 완료 후 "다음에 할 일" 1번이 `CLAUDE.md · .cursorrules에서 👉 여기를 채워주세요 표시를 찾아 채우세요`라 안내했으나, 어떤 생성 파일에도 그 마커가 없어 비개발자가 첫걸음부터 헛수색했다. 실제 흐름(스택/설명은 이미 채워져 확인만·도메인 규칙은 첫 세션 인터뷰 자동)에 맞게 문구를 교체하고, `--from-notion` 경로의 동일 마커 안내(`notionReviewHint`)도 정정. 안내문이 존재하지 않는 마커를 재도입하지 못하게 회귀 테스트로 잠금.
- **누적 미발행분 발행** — Goal 88~100·RFC 0057/0058 등 v2.9.0 이후 21커밋이 npm 미반영 상태였던 것을 v2.10.0으로 묶어 발행(아래 항목들).

### Added

- **init 커스터마이징 트리거 훅** (Goal 89) — `vhk init` 직후 `.vhk/NEEDS_CUSTOMIZATION` 마커 + `.claude/settings.json` SessionStart 훅 배선 → 첫 세션에서 AI가 도메인 규칙 인터뷰를 자동 시작. 실 라이브 세션(`claude -p --debug-file`)으로 훅 발화 검증 완료.
- **사용자 규칙 파일 설정** — `~/.vhk/config.json`에 범용 YAML 경로를 저장하고 다음 실행부터 즉시 반영. 환경변수 우선 적용과 잘못된 파일을 구분해 안내.
- **core-rules 폴백 가시화** — 사용자 규칙 파일이 없거나 읽기 실패하면 번들 스냅샷을 사용한다는 사실을 `vhk init`/`vhk start`와 `.vhk/context.md`에 표시.

### Fixed

- **`vhk seo report`에 누락된 HARD_STOP 가드** — `#335`/`#336`과 같은 클래스(HARD_STOP 활성 중에도 파일 쓰기 진행)가 `report.ts`에 남아있던 것을 발견해 수정.

## [2.9.0] - 2026-07-02

### Added

- **`vhk watch` — 무인 세션 정지 감시 (트랙 A 수준 2: 감지+알림)** (#441) — 2026-07-01 밤샘루프 무감지 사건(8.5h) 재발 방지. Claude Code 세션 로그(`~/.claude/projects/<proj>/<session>.jsonl`) mtime 폴링 → idle 초과(기본 15분) 시 **stalled 1회 알림**(재알림 금지)·활동 재개 시 recovered+재무장. 알림은 텔레그램(`VHK_TG_TOKEN`·`VHK_TG_CHAT_ID`, 미설정 시 콘솔 전용을 시작 배너에 명시, 발송 실패는 삼키고 감시 루프 생존). 완료/멈춤은 로그만으론 구분 불가 — 둘 다 확인 신호로 정직하게 알림. 감시자는 에이전트가 아닌 경량 폴러(공멸 방지). 옵션 오입력은 fail-fast(silent 기본값 폴백 금지 — 사건 교훈). 하위폴더(서브에이전트·워크플로) 로그 제외, 메인 세션만 depth 2 스캔. 한글별칭 `감시`, `--once` 1회 점검 모드, `--idle-min`/`--interval`/`--window`.

### Docs

- **TS-005 확장 — 디렉토리 `rmSync` 도 silent exit 127 재현 확정** (#441) — 노트북(Windows·Node v24.13.0)에서 파일·디렉토리 모두 `node -e` 한 줄로 결정적 재현(샌드박스 무관). tmp+rmSync cleanup 패턴이 vitest 워커를 즉사시켜 이 머신에서 스위트 실행 불가였던 근본 원인. 회귀 방지 패턴을 "신규 rmSync 금지(파일·디렉토리 모두), cleanup 은 unlink+rmdir 재귀(`tests/watch.test.ts` `rmTree()`)"로 갱신.

## [2.8.0] - 2026-07-01

### Added

- **자가진화 복리 척추 5개 (N-series)** — 측정→진단→개선→재측정 루프의 "다음 한 수를 누가 부르나"(전부 사람)를 자동화. 폐회로: win→reinforce→evolve digest→apply(사람)→RULES→receipt(objective 대조)→receipt-log→`stats --trend`→`loop --tick`.
  - **`vhk win` 성공 기록** (N3, #434) — `vhk learn`(실패/교훈)의 성공 쌍둥이. memory v2 `successes` 에 append → pattern reinforce 입력. ✅/❌ 대칭. 한글별칭 `성공`.
  - **reinforce evolve 확장** (N2, #434) — `evolve generateCandidates` 필터를 `avoid|reinforce` 로 확장 → 버려지던 성공패턴도 룰 후보로 복리. RULES 반영은 apply 사람 승인 유지(철칙).
  - **`vhk stats --trend`** (N6, #435) — receipt-log.jsonl 시계열 추세(거짓완료 판정 block율 델타·red/dirty율·diff-cover 평균). 표본 부족·미측정은 null(0 위장 금지·표본수 정직 병기).
  - **`vhk loop --tick`** (N1, #436) — 읽기 전용 자가진화 조율자. 폐회로 상태(HARD_STOP·블로커·진화 대기·추세·미제안 패턴·goal)를 읽어 "닫힌 것/다음 한 수" 1장 합성(집행 0·결정경로 LLM 0·결정적 우선순위). 한글별칭 `틱`.
  - **objective 토큰 교집합 advisory** (N4, #437) — receipt 의 mission.objective ↔ (goal.title+commit) 결정론 토큰 교집합(LLM 0, tokenize 재사용). overlap 0 → caution 까지만(block 절대 금지·단조성 불변식 보존·undefined 미계산=하위호환).
  - **`vhk evolve digest`** (N5, #438) — pending 룰 후보를 신뢰도별(빈도 기반) 묶음 초안으로 출력(읽기 전용·자동 apply 배제·PR 초안용). 한글별칭 `묶음`.
- **receipt-log.jsonl 영속** (N7, #431) — `vhk receipt` 발행마다 decision·기계증거 요약을 `.vhk/events/receipt-log.jsonl` 에 append(측정 토대, `stats --trend` 가 소비). 자기참조 봉인(self-tracked) 유지.
- **`vhk receipt` — 거짓완료 탐지 영수증 MVP** (Goal 86, RFC 0056 T1, #377) — 에이전트 "완료" 시점에 4대 기계증거(tsc/test/build 종료코드·git dirty[자기파일 제외]·작업시작 SHA≠HEAD stale·변경라인 diff-cover)를 영수증 1장(`.vhk/receipts/<id>.{json,md}`)으로 조립. `decision = block|caution|pass` 는 기계증거 전용(LLM 0)·단조성 불변식(caution→pass 격상 금지)·diff-cover 는 advisory(decision 격하 불가). 등록 4지점 + 한글별칭 `증거영수증` + 드리프트 테스트. 한글별칭/`.md` 정직성 1줄("게으른 거짓완료를 잡지, 미묘한 오류는 못 잡는다"). ※ T1 본체 — 효과 입증(T3=거짓완료 적발 1건)은 후속.

### Fixed

- **`readMission` 스키마 검증 누락 — 손상 mission.json 이 `vhk receipt`/`mission check` 크래시** (#432) — 밤샘 무인 결함루프 발굴. 스키마 가드 추가(최소·범위 내).
- **`vhk review` — goals/ 비었을 때 exit 1 오인** (#433) — 선택 기능 미사용(빈 goals)을 실패로 처리하던 것을 경고 후 스킵(exit 0)으로 정정(#157 정책 일관). 밤샘 무인 결함루프 발굴.
- **`vhk goal done` 파이프 조기종료(EPIPE) 시 상태 전이 누락 + exit 255 차단** (#287) — 게이트 통과 후 상태 write(frontmatter→DONE)를 게이트 출력보다 **먼저** 수행. Windows 는 파이프 write 가 동기라, 소비자가 출력 도중 파이프를 닫으면(예: `... | Select-Object -First 3`) `console.log(gate.out)` 이 EPIPE 를 throw 해 스택을 풀고 `atomicWriteFile` 전에 함수를 빠져나가던 게 원인 — 부수효과(상태 전이)를 출력보다 앞세워 출력 소비 여부와 무관하게 전이를 보장. 추가로 CLI 진입점에서 stdout/stderr 의 EPIPE 를 정상 종료(0)로 흡수. 회귀: 게이트 출력 print 가 EPIPE 로 죽어도 DONE 전이 보존.
- **verify 자기참조 봉인** (Goal 85, #315, #370) — dirty 판정에서 vhk 자기 산출 추적파일(`.vhk/ledger.jsonl`·`.vhk/events/*.jsonl`)을 제외(`src/lib/self-tracked.ts` 단일 SoT). verify 직후 자기 ledger append 때문에 늘 거짓 "낡은 증거(dirty)"로 done/release 게이트를 막던 자기모순 해소. 과확장 0·퇴행 0 테스트 고정.
- **recall 자유형식 쿼리 NL 라우터 가로채기 차단** (#313, #365) — `recall`/`회상` 쿼리에 트리거 단어(어떻게·보안·롤백 등)가 섞여도 NL 라우터에 가로채이지 않고 commander 로 위임(`FREEFORM_ARG_COMMANDS` 에 추가). 흔한 한국어 쿼리에서 메모리 검색이 무에러로 불능이던 문제 해소.
- **goal·memory 파괴적 입력 검증 강화** (#317·#318, #367) — `goal check/done --id` 빈/공백 값(`Number('')===0` 으로 goal 0 오염)과 `memory remove/archive` 부분파싱(`parseInt('2zzz')=2`·`'1.5'=1`)을 정수 정규식으로 거부 — 엉뚱한 항목 DONE/삭제 차단.
- **secure `.env.example` placeholder 오탐 차단** (#316, #369) — env 템플릿 파일(`.env.example`/`.sample`/`.template`)의 명백한 placeholder 토큰(`ghp_xxxx…`·`xoxb-your-…`)을 진짜 CRITICAL 시크릿으로 오탐해 verify 전체를 FAIL 시키던 문제 해소. false-negative 0 가드(진짜 시크릿·주석 시크릿 검출 불변) + repo self-scan 회귀 가드.
- **`.vhk` 일회성·사적 산출물 gitignore** (#331, #368) — `recall-log.jsonl`·`recall-eval.json`(사용자 검색어 원문) 등 일회성/사적 산출물이 git 에 노출되던 갭 차단(`ledger.jsonl`·`events/` 추적은 유지).

## [2.7.0] - 2026-06-23

### Added

- **풀사이클 뒷단 4트랙 `vhk content`·`launch`·`ops`·`sell`** (Goal 74~77, RFC 0052, #284·#293·#294·#295) — 바이브코딩 뒷단(콘텐츠·런칭·운영·판매)을 앞단과 동일한 "상태수집 + 체크리스트 + 프롬프트 생성" 자문 패턴으로 채움. 전부 초안만 — 발송·결제·삭제 0(헌법 실패비용 high 배제). `src/lib/emit-prompt.ts` 공유 헬퍼 단일 SoT + Fable5 프롬프트 위생(✅/❌ 예시쌍·수치 하드리밋·"승인 전 발송·결제 금지") 상속. MCP 읽기전용 32→35. `ship`(코드 npm 배포)≠`launch`(제품 공개) 구분 명시.
- **`vhk init` 기타(other) 프로젝트 타입 + 스택 직접 입력/건너뛰기** — OS·게임·임베디드 등 5개 프리셋 밖 프로젝트 지원. ① 타입 선택지에 `🧩 기타 — 직접 입력` 추가 ② 기타 선택 시 스택 자유 입력(쉼표 구분 — 전각 ，·모점 、 포함, Enter=미정으로 건너뛰기) ③ 추천 스택 거절 시 즉시 취소 대신 직접 입력 기회(Enter=기존처럼 취소) ④ 비-JS 매니페스트 언어 감지 `detectManifestLangs`(Cargo.toml→Rust, go.mod→Go, pyproject.toml/requirements.txt→Python, Gemfile→Ruby, build.zig→Zig, CMakeLists.txt→C/C++) — init 전용 소비(`resolveInitStack`): JS deps 감지 시 병합(Tauri 류), 프리셋 타입에선 떠돌이 매니페스트가 명시적 `--type` 을 대체하지 않음, 프리셋 없는 other 만 매니페스트 사용. `detectProjectStack` 은 JS-only 유지(theme #158 src/ 오염 비회귀). `-y --type other` 비대화형은 프롬프트 0 + 미정 폴백.

- **`vhk goal peek` + `goal next` 비파괴 전환** (Goal 78, #303) — `goal next` 가 active goal 을 파괴적으로 넘기던 동작을 비파괴화하고, 상태 변경 없이 다음 goal 을 들여다보는 `vhk goal peek` 추가.
- **도그푸딩 하드닝 — 증거 신선도·정합 일관성** (Goal 80~84, RFC 0053, #310·#311·#312·#332·#348) — ① `vhk review` 증거 신선도 연결: 기록 SHA≠HEAD 또는 dirty 면 "낡음" 강등 ② 제품 설명 단일 SoT(index.ts `.description` 런타임 주입) ③ `.vhk` 증거 원장 `ledger.jsonl` 추적 정합 + 정책 가드 ④ secure 테스트 픽스처 false positive MEDIUM→INFO 강등 ⑤ doctor/status next-step 맥락 인지(신규 vs 기존 레포 분기).
- **SEO 무인 자동화 범위 완료** (Goal 22~26, #307) — init·submit·check-index·check-revenue·report 무인 트랙 + RFC 0054 자율형 진화 로드맵.
- **Fable5 배치3 — 규칙 재주입·부정 예시·high-risk 옵트인·상속·스캔** (Goal 68~72, #282·#283·#285·#277) — `vhk remind`(치명 규칙 재주입), `vhk evolve` 부정 예시 자동 수집, MCP high-risk 도구 옵트인 정책(save confirm 게이트), `vhk init` core-ruleset 마커블록 상속, secure PAT 휴리스틱 스캔.
- **`vhk-auto` 오토파일럿 1단계 MVP 스킬** (#291) — active goal 1개를 사람 개입 없이 한 바퀴 자율 구동(앵커→개발→검증→적대리뷰→commit). 외부 발송·이슈 등록·코드 집행 0.

### Fixed

- **거짓 성공 위장 차단** (#346·#340·#341·#281) — 미인식 명령을 exit 1 + stderr 로 정정(exit 0 성공 위장 차단), MCP NL 미인식·audit 불명을 성공으로 위장하던 거짓 보고 차단, MCP 도구 수 드리프트 정정.
- **HARD_STOP 가드 강화** (#334·#335·#336·#337·#338) — goal sync·seo init·seo submit 가드 누락 보강, undo HARD_STOP 우회 + non-TTY 크래시 차단.
- **`vhk resume` exit 127** (#353) — clearHardStop 의 rmSync→unlinkSync 로 이 환경 silent exit 127 수정.
- **MCP 위임 CLI 버전 스큐** (#339) — 동봉 dist 우선으로 전역 vhk 버전 스큐 차단.
- **`vhk goal` 컨테이너 help 정합** (#347) — 컨테이너 description 에 peek 추가.

## [2.6.0] - 2026-06-12

> v2.5.1 이후 main 누적분 백필(2026-06-11 전수 리뷰 G-01에서 공백 발견) + 전수 리뷰 Top 10 즉시수정.

### Added

- **`vhk sync --check` — 8개 sync 타겟 drift 검사 모드** (Goal 63, #266) — 쓰기 0, 생성 로직(buildSyncPlan) 재사용으로 검사기 자체의 drift 차단, drift 시 exit 1(CI/게이트용).
- **governance 배치 — 기록 집행 + 문서 인덱스 + 게이트 4종** (T1~T5, #261·#263) — ① 기록 집행 hook(코드 커밋 시 당일 dev log 스테이지 강제, `[skip-record]` 우회) + Stop 자문 넛지 ② docs/README 대시보드 + goals 인덱스 자동 생성(gen-goals-index) ③ check-rules-sync·check-commands-doc·check-goal-frontmatter 게이트 ④ `.vhk` spec v1.1(하위 폴더 공식화·트래킹 정책 확정) ⑤ 첫 실제 ADR 4건 + MCP 진화 카탈로그 + 회고 백필. `.gitattributes` 신설(`*.mjs`/`*.sh` LF — 셔뱅+CRLF로 Windows CI 전멸하던 결함 차단).
- **COMMANDS.md 전 명령 커버리지** (Goal 64, #266) — 전체 명령 카탈로그 표(registry desc 1:1) + command-registry 기반 테스트가 미문서 명령을 CI에서 차단(기존 미문서 32건 → 0).
- **auto-merge 무인 머지 스킬 + @claude 리뷰 반영 워크플로** (#262·#264·#259·#255) — auto-merge 라벨 PR을 4중 게이트(CI·diff 상한·CodeRabbit 해소·적대 리뷰) 통과 시 무인 squash 머지 + CodeRabbit 자동 PR 리뷰 설정. 머지·publish 권한은 여전히 사람.
- **`vhk recall` — 기억 회상 MVP + 검증 하네스** (RFC 0049, #232·#233) — 키워드 검색 + 위험 작업 직전 just-in-time 과거 교훈 경고 + 사용 로그/eval(Recall@5·MRR).
- **`vhk diff-cover` — diff 커버리지 측정** (RFC 0050 PR1, Goal 50, #236·#239) — 변경 줄 중 미검증분 자문 측정(차단 0). `+++/---` 본문 오인 파서 픽스 포함.
- **`vhk cost` — 비용·예산 가드** (Goal 56, #234) — 자문형 비용 원장 + 양방향 입력.
- **`vhk stats`·AI 행동 원장·위험 글롭 가드** (Goal 55·57·59·61, #238·#252) — 가드 통과 행동 영속 기록(.vhk/events/) + 대상 글롭 위험 평가 + scan-incomplete 신호.
- **`vhk seo init`** (Goal 21, #214) — SEO 대시보드 스캐폴드 + 사이트 등록 + 키 보관(Env 참조). SEO 22~26 scaffold(#252).
- **CI 멀티 OS/Node 매트릭스** (Goal 47, #227·#229) — ubuntu·windows × node 22·24 + engines.node >=22 정직화.
- **MCP↔CLI 계약 테스트 + fast-check 속성 테스트** (#212·#213) — 위임 드리프트·파서 불변식 회귀 봉쇄.
- **handoff 미기록 ADR/TS 후보 자동 보고** (RFC 0051, #253).
- **시크릿 패턴 7종 추가** (전수 리뷰 C-01) — GitHub fine-grained PAT(`github_pat_`)·OAuth(`gho_/ghu_/ghs_/ghr_`)·npm(`npm_`)·Slack(`xox*-`)·Google(`AIza`)·Stripe(`sk_live_/rk_live_`)·Notion(`ntn_`) + 17패턴 전수 단위테스트.

### Fixed

- **도그푸딩 버그 8건 일괄** (#243~#250, #254) + 퍼징 발견 파싱 가드 3건(#218~#220, #224) + cloud/blocker/goal check·theme·ref/memory 소픽스(#221~#223·#226).
- **자연어 오라우팅 5계열** (전수 리뷰 F2-01~05·08) — "컨텍스트 업데이트해줘"가 무확인 자가업데이트로, "버전 올려줘"가 git 커밋으로, "검증 실행해줘"가 아이디어 마법사로 새던 것 등 실측 13케이스 수정 + 회귀 가드.
- **거짓 성공/음성 제거 4건** (전수 리뷰) — BOM goal 파일에서 `goal done`이 변경 없이 "✅ DONE" 출력(A3-02) · `vhk audit` 해석 실패를 "취약점 없음"으로 보고(B1-01) · recap CLAUDE.md 갱신 무매치에도 "완료"(A3-03) · MCP에서 가드 차단을 "✅"로 보고(A1-03).
- **데이터 보호 2건** (전수 리뷰) — 손상 refs.json을 빈 배열 취급 후 덮어써 전체 소실되던 경로 차단(B1-02) · memory.json 쓰기를 atomicWriteFile로 통일해 동시 세션 tmp 충돌 제거(A2-02).
- **publish 가드 강화** (전수 리뷰 A3-01/04) — untracked 신규 src 파일 발행 차단(빌드 포함분) + git 상태 실패 시 fail-closed.
- **review advisory 기본 모드** (#157, #226) — skip/미검증만으로 거짓 실패 안 함.

### Changed

- **eslint type-aware 결함룰 확대** (Goal 49, #230) + tsc strict 플래그·async 안전성 게이트(#216) + silent-fallback 린트 리포트 v0(Goal 27, #207).
- **MCP↔CLI git 단일 진실원** (Goal 48, #228) — git-session 추출, 인라인 재구현 제거.
- **릴리즈 준비 게이트** (Goal 42, #206) — CHANGELOG 빈/플레이스홀더 본문 차단.
- **harness/audit 중첩 패키지 발견** (#171, #225) — 루트+nested 점검.
- **init 생성 템플릿 정비** (전수 리뷰 F1) — PowerShell 미호환 `&&` 안내 제거(`vhk save`로), 유령 `/done` 커맨드 → `vhk recap`, 기술 스택 섹션 생성, 시작/핸드오프 프롬프트에 blockers·dev log append-only 지시 추가.

### Performance

- **CLI 콜드스타트 512→323ms (−37%)** (RFC 0047 §9, #240) — inquirer 지연 로딩.

## [2.5.1] - 2026-06-08

### Changed

- README와 npm package 설명을 v2.5.0 구현 기준으로 갱신: goal/trust/memory/rules 루프, MCP 29 tools, 최신 명령 표면을 전면 재정리.
- `vhk mcp` 도움말의 MCP 도구 수 표기를 실제 등록 수(29 tools)와 맞춤.

## [2.5.0] - 2026-06-08

> **생산성 5종 마무리 + 증거 체인 + self-gate 자동화.** preflight·worktree·doctor·standup·today(생산성 5종) Phase 2~3 완성 + goal↔코드 드리프트·증거↔커밋 SHA·증거 원장·test-first 매핑 게이트 + git-access 단일 통로화.

### Added

- **`vhk worktree` 가드** (Goal 30, #139) — worktree 생성 시 `.env` 자동 복사 + 누락 점검.
- **`vhk doctor` Phase 2** (Goal 31, #177) — VHK·MCP·audit 진단 3종 + `--json`(CI·MCP용)·`--audit`(PM 자동감지 취약점 점검). 진단 전용(자동수정 0).
- **`vhk standup` / `vhk today` + DevLog 연동** (Goal 32·33, #178·#162) — 아침/저녁 브리핑 + 로컬 dev log(`docs/log/`)를 파싱해 "어제 한 일"·"오늘 교훈"에 반영(공유 `daily/devlog.ts`, Notion 아님·인증 불요).
- **`vhk standup --if-stale` / `--install-anchor`** (Goal 32 Phase 3, #188) — 하루 1회 자동 브리핑(KST 자정, 상태 `~/.vhk/daily-shown.json`) + 터미널 자동실행 앵커 줄 안내(셸 rc 자동수정 X, 사람이 직접 붙여넣기).
- **`vhk goal check` 드리프트 게이트** (Goal 43, #192) — shipped 됐는데 status `NOT_STARTED` 인 goal 차단(코드↔상태 드리프트 방지).
- **증거↔커밋 SHA 바인딩** (Goal 44, #194) — `vhk verify` 리포트에 HEAD SHA·dirty 여부 기록 + 증거 신선도 검사.
- **증거 원장 `ledger.jsonl`** (Goal 45, #196) — verify 통과 요약을 git 추적 원장에 append.
- **`vhk testmap`** (Goal 28, #200) — 변경된 기능 ↔ 테스트 누락을 경고(test-first 매핑 게이트).
- **`vhk deploy` Cloudflare Pages/Workers 구분** (#199, #152) — Pages vs Workers 자동 구분 + `npx wrangler` + MCP 통일.

### Fixed

- **`vhk worktree add --install` PM 자동감지** (#168) — lockfile 로 pnpm/yarn/npm 감지(기존 pnpm 하드코딩 → yarn/npm 프로젝트 설치 실패 위험 제거).
- **`vhk secure scan`** (#182, #170) — `.cursor` 스캔 누락 + `Authorization: Bearer` 자격증명 탐지 추가.
- **`vhk learn` / `vhk blocker` 다단어 인자** (#185, #147) — NLP 라우터가 본문을 가로채 `sync` 가 실행되던 문제 수정(따옴표 없는 다단어 허용).
- **비-TTY 대화형 명령** (#197, #153·#154) — 파이프/CI 에서 `TTY_REQUIRED` 전용 종료 + `vhk save --message`.
- **`vhk preflight`** (#189, #156·#172·#173) — package 스크립트 우선 + `test:gate` 인식 + `.env.example` 선택키를 필수로 오판하지 않음.
- **`vhk sync` / `vhk init`** (#184·#193, #133·#149·#130·#131·#132) — CLAUDE.md 에 코딩/커밋/아키텍처·VHK 운영 섹션 전파 + AGENTS 중복 제거 + 커스텀 H2 전파 + `init -y` 기존 규칙 adopt.
- **`vhk doctor`** (#191, #175) — npm 프로젝트에서 pnpm 부재를 fail 로 오처리하지 않음.
- **`vhk` MCP 서버** (#195, #150·#161) — Windows spawn ENOENT 수정 + check 를 CLI 로 위임.

### 내부

- **git-access 단일 통로화** (Goal 46, #198) — git-repo 접근을 `safeExecFile` 경유로 통일 + 중복 통합.
- **CI** — CodeQL action v3 → v4 (#120).
- **드리프트 교정** — Goal 19(pattern) status `NOT_STARTED` → `DONE` 반영 (#190).

## [2.4.2] - 2026-06-07

> **Safety 강화 — HARD_STOP 가드 완성 + 원자적 쓰기 완성.** 자동화 트립와이어(`.vhk/HARD_STOP`)가 모든 상태변경 경로를 막고, 영속 쓰기가 쓰기 도중 kill 에도 손상되지 않도록 마무리(Goal 34~41).

### Added

- **HARD_STOP 가드 전면 확대** — 활성 시 상태변경 작업을 즉시 차단(파일/git 미변경 + 안내 출력, `vhk resume --confirm` 으로만 사람이 해제).
  - goal 명령군(next/init/done) · memory 명령군(add/remove/archive/resolve/unarchive) · evolve(apply/reject/undo)·pattern(dismiss)·mission(set/clear) (Goal 34~36)
  - 나머지 상태쓰기 명령: `design`·`theme`·`env`·`ref add`·`cloud push` (Goal 39)
  - **MCP 서버 surface** (`save`·`undo`·`env`) — CLI `guardCli` chokepoint 를 우회해 git/파일 쓰기를 인라인 재구현하던 핸들러에 `hardStopBlocked` 가드 신설. MCP stdio(JSON-RPC) 오염 방지로 console 대신 안내 content 반환 (Goal 41).

### Changed

- **원자적 쓰기(`atomicWriteFile`) 완성** — temp 파일에 먼저 쓰고 `rename`(원자 교체)으로 옮겨, 쓰기 도중 kill 되어도 대상 파일이 부분기록(손상)되지 않도록.
  - 헬퍼 신설 + 영속 상태 적용 · `ref`/`review`/`verify`/`sync`/`mission`/`state-files` 확대 (Goal 37~38)
  - `goal.ts`: `next-task.md`·scaffold 첫 생성·goal frontmatter 갱신 (Goal 40)
- **`.gitignore`** — `.vhk/mission.json`(로컬 미션 범위 상태) 추가, 다른 `.vhk` 로컬 파일과 일관.

### 내부

- 도그푸드 샌드박스 디렉터리·orphan goal 게이트 스크립트 정리 + 회귀 가드 테스트 다수 추가(998 pass).

## [2.4.1] - 2026-06-06

### Fixed

- **version-check 오프라인 hang** (`src/lib/version-check.ts`, #135) — 캐시가 한 번도 없던 상태 + 오프라인이면 `vhk` 메뉴가 매 실행 1.5s `npm view` 를 무한 재시도하던 결함(적대 검증으로 발견). 조회 실패 시 캐시가 없어도 쿨다운(`lastTriedAt`)을 기록해 1h 동안 재조회 차단 → 메뉴 hang 제거. `VersionCache.latest` optional 화 + `readCache` 검증 완화. 회귀 가드 테스트 추가(890 pass).

## [2.4.0] - 2026-06-06

### Added

- **`vhk work` / `vhk work handoff`** (`src/commands/work.ts`) — AI 작업 세션 이어받기/인수인계. Claude CLI 세션 기억이 휘발돼도 repo 파일(CLAUDE.md·next-task.md) + VHK 상태로 빠르게 이어가도록, 상태를 수집해 "시작/중단 정리 프롬프트"를 만들고 클립보드에 복사한다.
  - `work` — git status + active goal + `.vhk/context.md` 갱신 → 시작 프롬프트(CLAUDE.md 1순위·AGENTS.md는 Codex/보조 참고) 생성·복사.
  - `work handoff` — git status 수집 → 완료/미완료 분리·테스트 기록·next-task 갱신·커밋 판단을 요청하는 인수인계 프롬프트 생성·복사.
  - **안전 1원칙**: CLI는 상태 수집 + 프롬프트 준비만. 커밋/stash/reset/goal done/파일 삭제 0. HARD_STOP 활성 시 즉시 중단. 별칭 `작업`/`인수인계`, NLP `작업 시작`·`인수인계`.
- **`src/lib/clipboard.ts`** — 외부 의존성 0 클립보드 헬퍼. Windows는 PowerShell `Set-Clipboard`에 base64(UTF-8) 전달(한글 보존), mac `pbcopy`, linux `wl-copy`/`xclip`/`xsel`. 실패 시 `.vhk/work-prompt.md` 사본 + 화면 출력 폴백.
- **`vhk` 대화형 메뉴 개선** (`src/index.ts`) — 헤더에 현재 버전(`v2.4.0`) + 업데이트 알림(`🆕 업데이트 가능: vX → vhk update`) + 직접입력/자연어 안내(`💬`) 표시. 메뉴 항목에 `🚀 작업 시작/이어하기(work)`(최상단)·`🎯 다음 목표 보기(goal)`·`⏸️ 작업 중단 정리(handoff)` 추가. `pageSize`/`loop:false`로 Windows 콘솔 스크롤 잔상·잘림 수정.
- **`src/lib/version-check.ts`** — 설치 버전 업데이트 체크 캐시(글로벌 `~/.vhk/version-check.json`). "가끔 자동 확인": 신선(24h) 캐시면 네트워크 0, 만료 시 1회 1.5s `npm view` + 1h 실패 쿨다운 → 메뉴는 거의 항상 즉시. `fetchLatestNpmVersion`/`compareSemver`를 doctor.ts에서 이 단일 소스로 이동(re-export로 호환), `vhk doctor`/`vhk update`가 캐시를 점진적으로 채움.

## [2.3.0] - 2026-06-04

> **vhk evolve — Evolution Loop 도미노 4 (Goal 20).** 패턴(Goal 19) → 룰 후보 → 사람 승인 → RULES.md 반영 → sync.
> 성장 루프의 마지막 도미노(패턴→진화)를 닫는 반자동 진화 v0. 철학: 자동 학습 OK·자동 적용 금지 — 모든 반영은 diff·사람 승인·undo 경유.

### Added

- **`vhk evolve`** (`src/commands/evolve.ts`) — `.vhk/evolve/queue.json`(version 1) 큐로 패턴 → 룰 후보 관리.
  - `suggest` — active `avoid` 패턴(Goal 19)에서 결정적 한국어 룰 초안 생성(ML/LLM 0). A1: `rejected` 재제안 억제 · A2: `pending`/`applied` 스킵.
  - `list [--status pending|rejected|applied]` · `apply <id>` · `reject <id>` · `undo`.
  - `apply`: TTY 확인 + diff + 문구 수정 → RULES.md append → `vhk sync` 재생성. `.bak` 원자적 처리. C1: 미해소 `applied` 시 단일-apply 차단. B3: 중복 룰 감지. A4: 댕글링 참조 가드.
  - `undo`: 최근 apply 1건 `.bak` 복원 + sync + 소스 패턴 `archived → active` 복구. 트리거는 수동만.
- **MCP `evolve-suggest` · `evolve-list`** — MCP 도구 총 **29종**(비대화형, `runVhkCli` 위임). apply/reject/undo는 대화형·위험작업이라 MCP 제외.

### Note

- **안전 1원칙 유지** — 자동 적용 0. 반영은 항상 사람 승인 + diff + undo. secret 미포함(secure scan 관문).
- Evolution Loop 4도미노(증거→기억→패턴→진화) 완성. 다음 봉우리는 v3 "VHK Hub"(크로스 프로젝트 학습).

## [2.2.0] - 2026-06-04

> **버전 범프만.** 기능 변화 없음 — `package.json` 버전만 상향(2.1.0 → 2.2.0). 코드·동작 무변경.

### Changed

- `package.json` 버전 2.1.0 → 2.2.0 (범프만, +1/-1). 신규 기능·수정 없음.

## [2.1.0] - 2026-06-04

> **pattern detection v0 — Evolution Loop 도미노 3 (Goal 19).** active 실패·성공 기억에서 반복을 추출해 `avoid`/`reinforce` 후보 생성.
> 읽기·제안만 — RULES.md 반영 0(반영은 Goal 20 evolve). 보수적 임계(기본 3회+), ML/LLM/외부 의존 0.

### Added

- **`vhk pattern`** (`src/commands/pattern.ts`) — `memory.json`의 active `failures`+`successes`에서 2축 감지.
  - **① 태그 군집** — 같은 버킷 태그 빈도 ≥ 임계 → 후보. **② 키워드 문서빈도** — 신호 텍스트 정규화 후 토큰 문서빈도 ≥ 임계 → 후보. 임계 기본 3(`--min <n>`). failures → `avoid`, successes → `reinforce`.
  - `detect`(`--min`,`--json`) · `list`(`--kind`,`--all`) · `dismiss <n>`(→archived). 별칭 `패턴`, NLP `패턴/반복/되풀이/버릇`.
  - **결정적·멱등** — count desc → signal asc 안정 정렬, 시그니처(`kind:axis:정규화signal`) 병합으로 재실행 시 중복 0. `resolved`/`archived` 입력 제외.
  - `PatternEntry` 스키마 구체화 — `{ id, kind, axis, signal, count, sources[], summary, status, tags[] }`(Goal 18 placeholder 대체).
- **MCP `pattern-detect` · `pattern-list`** — 비대화형 노출(`runVhkCli`).

### Note

- **반영 0** — detect는 RULES.md·다른 버킷 무변경(회귀 가드). secret 미포함. 한국어 형태소분석·의미/임베딩은 제외(v0=구조/빈도).

## [2.0.2] - 2026-06-03

### Fixed

- **글로벌/심링크 실행 시 CLI 미동작 가드** (`src/index.ts`) — `isMainModule` 판정을
  `import.meta.url ↔ pathToFileURL(argv[1])` 단순 비교에서 **realpath 정규화 비교**(`fs.realpathSync`)로 변경.
  `pnpm link`·글로벌 설치처럼 `process.argv[1]`(심링크)와 실제 모듈 경로가 다르면 main 액션이 안 돌던 문제 해소.
  vitest import(비-main) 판정은 그대로(realpath 도 불일치) — 테스트 동작 무손상.

## [2.0.1] - 2026-06-03

> ℹ️ npm 발행 버전은 **2.0.1** (2.0.0 은 npm 미발행 — `vhk publish` 강제 patch 범프로 건너뜀). 내용은 v2.0 메이저(BREAKING)이며, major=2 가 breaking 신호.
>
> **BREAKING — memory schema v2 (Goal 18, Evolution Loop 도미노 2).** 평면 `.vhk/memory.json` →
> 4버킷(decisions/failures/successes/patterns) + 교훈 단일 SoT(learn 통합). 패턴(19)·진화(20)의 학습 입력 토대.
> GA 약속대로 `.vhk` 포맷 breaking 은 메이저에서.

### Changed (BREAKING)

- **`memory.json` v1 → v2** (`src/commands/memory.ts`) — 평면 배열 → `{ schemaVersion:2, decisions[],
  failures[], successes[], patterns[] }`. 항목 생명주기 `status: active|resolved|archived`(+ `vhk memory archive`).
  `add --type decision|failure|success`(failure: `--why`/`--lesson`, success: `--why`), `list [--type][--all]`,
  `remove`, `migrate` 추가.
- **`vhk learn` 통합** — 교훈을 `memory failures.lesson` **단일 SoT** 로 기록. `docs/state/learnings.md`
  신규 기록 중단(과거 `vhk learn` 의 learnings.md 분리 기록 폐지). 기존 learnings.md 내용은 마이그레이션으로 흡수.

### Migration (자동·무손상)

- **자동 v1 → v2** — `vhk` 실행 시(`memory`/`context`/`brief`/`learn` 등) v1 파일이면 **read 경로에서도 1회**
  v2 로 변환. 어느 명령으로 첫 실행해도 동일 결과(멱등 — 이미 v2 면 no-op).
- **`.v1.bak` 원본 영구 백업**(write-once, 안 덮음) + `.bak` 롤링 백업 — 데이터 손실 0.
- `context`/`brief` 는 v2 4버킷(active)을 "저장된 기억" 섹션에 렌더.

## [1.9.0] - 2026-06-03

> **vhk mission — Mission Contract v0 (Goal 17, Trust Loop 배치 7).** 작업의 목표·허용/금지 범위를
> 계약으로 선언하고 변경이 계약 안인지 검증하는 scope/intent 층 (mission → verify → review).

### Added

- **`vhk mission`** (`src/commands/mission.ts`) — `.vhk/mission.json` 계약(objective·scope·forbidden glob).
  - `set`(선언/갱신, 비대화형 가드) · 기본(현재 계약 표시) · `check`(변경 ↔ glob 교차검증) · `clear`(삭제).
  - `check`: working tree + staged 변경(`simple-git status`)을 scope/forbidden glob 과 대조 —
    **forbidden 매칭 = 위반(exit 1)**, scope 밖 = 경고. `checkMission`/`globToRegExp` 순수 함수.
  - `미션`/자연어(`미션 계약`/`작업 범위`) 라우팅. R1 command-registry 단일소스 등록.

### Note (v0 정직성)

- **경로 glob 기준** — objective 의미 부합은 검증하지 않음(disclaimer 명시, 신뢰도 신호·보장 아님).
- glob **자체 구현(외부 의존 0)**. `.vhk/mission.json` **별도 네임스페이스** — latest.json(verify 증거) 불변.
  secret 미포함(경로·objective 텍스트만). forbidden 액션 금지·strict 하드블록·의미 검증은 후속.
- 테스트 674 pass(신규 18, 회귀 0).

## [1.8.1] - 2026-06-02

> **vhk sync 확대 — Gemini CLI + Cline (Goal 16, 포터빌리티 STEP 1.5 잔여).** RULES.md 단일소스 →
> sync 대상 5종 → 7종. 도구를 바꿔도 규칙이 따라가는 포터빌리티 강화.

### Added

- **`vhk sync` 대상 +2종** (`src/commands/sync.ts`) — Gemini CLI `GEMINI.md`(공식 컨텍스트 파일) +
  Cline `.clinerules/vhk-rules.md`(공식 docs.cline.bot — `.clinerules/` 디렉터리 다중 규칙). 둘 다 Markdown 무제한 → `buildCodingDoc` 재사용(절삭 없음).
  `SYNC_TARGETS` 레지스트리 2 엔트리 추가 = drift 감지·백업·`.synced`·`--dry-run`·비대화형 가드 **자동 반영**
  (추가 배선 0). `ko.sync.geminiDone`/`clineDone` 메시지.

### Note

- **Zed 제외** — Zed 는 이미 `AGENTS.md`·`CLAUDE.md`·`.cursorrules` 를 읽으므로(공식 docs) 기존 sync 로 커버, 중복.
  공식 경로 근거 없는 도구는 추가하지 않는다. 테스트 656 pass(신규 4, 회귀 0). SYNC_TARGETS 7종 회귀 가드.

## [1.8.0] - 2026-06-02

> **vhk review — 적대적 자기검증 v0 (Goal 15, Trust Loop 배치 5).** verify(Goal 13)가 모은 증거(latest.json)를
> 그대로 믿지 않고, goal 의 Completion Check 와 교차검증해 "거짓완료"를 적극적으로 찾는 반대 심문 층.
> 철학: 증거를 의심 + 새 증거 안 만듦(렌더·심문만) + 판정은 보장이 아니라 신뢰도("보장 아님" 표기 필수).

### Added

- **`vhk review`** (`src/commands/review.ts`) — `.vhk/reports/latest.json` + 대상 goal 의 Completion Check 를
  교차검증. 완료조건 ↔ 게이트 증거 매핑으로 거짓완료 의심(체크됨인데 게이트 fail/skip/부재, status DONE 인데
  verify FAIL) + 미검증(unmapped) + 신뢰도(low/medium/high) 판정. 판정을 latest.json 의 `review` 섹션으로
  병합(SoT 유지, 새 증거 안 만듦). `--id N` 또는 active goal. `검토` 별칭 + 자연어 라우팅.

### Note (자기모순 방지 — 거짓 안심 금지)

- **신뢰도 상한 규칙**: confidence high 는 (의심 0 **AND 미검증 0** AND coverage ≥ 0.5 AND 증거 신선) 일 때만.
  unmapped 가 하나라도 있거나 stale(>6h)·신선도 미확인이면 medium 으로 캡 — 증거 없음 ≠ 통과.
- **exit 정책**: exit 0 은 (vacuous | cleanHigh) 뿐. medium·low·병합 실패 → exit 1 + `goal done` 안내 금지.
- **한계 disclaimer 명시**: 기능 완료조건의 미매핑·git diff 미사용(변경 미커버)·commit 바인딩 없음(신선도 추정).
- **secret 누출 0**: latest.json 이 이미 시크릿 미포함 → review 도 파일 원문 echo 안 함(`vhk secure scan` 통과).

## [1.7.1] - 2026-06-02

> **verify --report (Human Panel HTML v0, Goal 14, 배치 6).** Goal 13 의 `latest.json`(기계용 증거)을
> 같은 진실원천 그대로 사람이 한눈에 보는 **정적 HTML**로 렌더. 성장 루프의 "증거 → 사람이 읽는 패널" 단계.
> 철학: 새 증거 안 만듦(렌더만) + 무빌드·무의존(인라인 CSS, 오프라인) + 기존 verify 무손상(옵션 추가만).

### Added

- **`vhk verify --report`** (`src/commands/verify-report.ts`) — `.vhk/reports/latest.json` 을 읽어
  사람용 정적 HTML `.vhk/reports/latest.html` 생성. `renderReportHtml(report)` 순수 함수 —
  인라인 CSS, **외부 의존 0**(CDN/스크립트 없음), 오프라인 동작. status 배지(PASS/WARN/FAIL) +
  게이트별 표(label·종료코드·detail) + nextActions + generatedAt. `escapeHtml` 로 사용자 텍스트 이스케이프.
  latest.json 없으면 verify 1회 선실행 후 렌더, 있으면 **BOM-safe `readJsonFile`** 로 읽음.
- **`vhk verify --open`** — 리포트 생성 후 기본 브라우저로 열기(`safeExecFile`, shell 없는 argv 호출).
  비대화형/CI/MCP(비-TTY)에서는 `isInteractive()` 로 **자동 스킵**.

### Security

- HTML 에 **secret/env 미포함** — latest.json 이 이미 미포함(Goal 13) → 그대로 렌더(누출 0).
  쓰기 권한 없으면 크래시 대신 친절 에러 + exit≠0.

### Note

- 기존 `vhk verify` / `--json` 동작 무손상(옵션 추가만). 테스트 11개 추가(FAIL→HTML 회귀 가드 포함).

## [1.7.0] - 2026-06-02

> **verify 증거화 (Evidence Ledger v0, #13 Goal 13).** `vhk verify` 가 lite(체크리스트 안내)에서
> **실제 게이트 실행 + 증거 기록**으로 승격. 성장 루프(learning·pattern·evolve)의 입력 데이터 토대.
> 철학: 결과는 실제 종료코드에서만(거짓 PASS 금지) + 성공·실패 무관 항상 증거 + Windows 1급.

### Added

- **`vhk verify` 증거화** (`src/commands/verify.ts`) — 게이트 4종(typecheck/test:run/build 외부 +
  secure in-process)을 **실제 실행**하고 각 종료코드를 수집. 결과를 **항상**
  `.vhk/reports/latest.json` 으로 기록(성공·실패 무관). 스키마: `{ schemaVersion, generatedAt,
  date, status(PASS|WARN|FAIL), summary, gates[], nextActions[] }` — head(요약·기계용) + body(사람용).
- **`vhk verify --json`** — 경로 대신 리포트 JSON 을 stdout 으로(CI용).
- **거짓 PASS 금지** — 게이트 스크립트/설정 없으면 `skip`(WARN), 실행 자체 실패는 `fail`(추측 금지).
  `status`: fail 하나라도 → FAIL, 없고 skip 있으면 → WARN, 전부 pass → PASS. `exitCode`: FAIL=1.

### Security

- `latest.json` 에 **시크릿 값 미포함** — secure 게이트는 severe 발견 **건수만** 기록(값 미수집).
  리포트 자체가 `vhk secure scan` 에 안 걸린다(누출 0). `reports/` 는 로컬 전용(`.vhk/.gitignore` 자동 등재).

### Note

- **Windows 1급** — `.cmd` shim 은 `cmd.exe` 래핑(CVE-2024-27980), maxBuffer 64MB 상향(ENOBUFS 거짓실패 방지).
  `package.json` 은 `readJsonFile`(UTF-8 BOM 제거)로 읽어 PowerShell `Set-Content -Encoding utf8` BOM 에도 안 죽고,
  손상 시에도 게이트 skip 후 **증거(latest.json)는 항상 기록**(계약 유지).
- **기존 시그니처 호환** — `--json` 옵션만 추가, `verify()` 무인자 호출(자연어 라우터) 그대로 동작.
  `HARD_STOP` 존재 시 거부 + exit 1. 규격: `docs/rfc/0038-vhk-spec.md`(`reports/` 도입). 테스트 599 pass.

## [1.6.6] - 2026-06-02

> **비대화형 가드 P2 (#14 Goal 12) + `.vhk` 규격 RFC (#38).** Goal 11 이 깐 3버킷 계약을
> 잔여 대화형 명령(theme/sync/ship/design)으로 확장하고, `save` push 정책을 확정.
> 철학 유지: 절대 안 멈춤 + 위험작업 무단실행 0 + 비-TTY 면 stdin 미접근(MCP RPC 보호).

### Added

- **`vhk theme --yes` (`-y`)** — 기존 파일 덮어쓰기 확인을 스킵(비대화형 자동 덮어쓰기). 충돌 확인은
  `promptOrDefault`(stdin SoT)로 마이그 → 비-TTY·미승인이면 inquirer 미호출·기본 보존(① auto-default).
- **`docs/rfc/0038-vhk-spec.md`** — `.vhk/` 규격 v1.1 제안(#38). 누락 항목(`.synced`·`backups/`·
  `config.json`) 정합 + `reports/` 서브디렉토리(Goal 13 verify 증거화) 도입. 코드 아님(스펙/토론).

### Fixed

- **`vhk sync` 확인 축 정정 (stdout → stdin, E8/R1)** — drift 덮어쓰기 확인이 stdout TTY 로 판단해
  MCP 불변식(비-TTY=stdin 미접근)과 어긋나던 문제. 이제 `isInteractive`/`promptOrDefault`(stdin 축)로
  통일. 비-TTY/`--yes` → 자동 덮어쓰기(백업 먼저라 손실 0), 동작 보존.
- **`vhk ship` 비-TTY 크래시 가드** — 배포 체크리스트·회고는 본질적 대화형(② refuse-essential) →
  진입부 `ensureInteractive()` 로 비-TTY 에서 friendly 거부 + `exit 1`(멈춤/EOF 크래시 제거).

### Note

- **`save` push 정책 결정(S5) = `strict-extra` 유지.** commit 은 로컬·되돌리기 가능(undo), push 는
  사용자 자기 remote 대상이라 deploy/publish(외부 배포=high-risk)와 등급이 다름 → `save` 를 HIGH_RISK
  로 승격하지 않는다. push 차단을 원하면 `strict` 모드(이미 비-TTY·미승인 save 차단)가 탈출구.
  회귀 테스트로 계약 고정(`tests/safety-guard.test.ts`).
- **동작 변경:** 비-TTY(파이프/CI/MCP)에서 `vhk ship` 은 `--yes` 가 아니라 **TTY 환경**이 필요합니다
  (자동답 불가한 본질적 대화형). 테스트 585 → 596(신규 11), 회귀 0.

## [1.6.5] - 2026-06-02

> **핫픽스 — `vhk save` 취소 동작.** v1.6.4 의 `promptOrDefault` 가 대화형에서도
> 프롬프트 abort(Ctrl+C/ESC)를 삼켜 fallback 으로 바꾸는 버그. `vhk save` 커밋 메시지
> 입력 중 취소하면 취소가 무시되고 기본 메시지로 **원치 않는 커밋**이 발생했다.

### Fixed

- **`promptOrDefault` 가 대화형 취소(Ctrl+C/ESC)를 삼키던 버그** (`src/lib/interactive.ts`) —
  비대화형은 이미 early-return 하므로 abort 는 항상 "사용자 취소". 이제 fallback 으로
  바꾸지 않고 그대로 전파 → 전역 핸들러가 깔끔히 취소. `vhk save` 커밋 메시지 취소 시
  더 이상 원치 않는 커밋이 생기지 않는다.

## [1.6.4] - 2026-06-02

> **대화형/비대화형 통합 가드 (MCP·CI 안전, #14 Goal 11).** inquirer 쓰는 명령이
> 비-TTY(CI·파이프·MCP stdio)에서 멈추거나 RPC 파이프를 훼손하던 문제를 단일 계약으로 정리.
> 철학: 절대 안 멈춤 + 위험작업 무단실행 0 + MCP면 stdin 미접근.

### Added

- **감지 단일출처 `isInteractive` + `promptOrDefault`** (`src/lib/interactive.ts`) — 모든 명령이
  같은 기준(stdin TTY + `--yes`)으로 프롬프트 여부 판단. 비대화형이면 stdin 미접근(MCP RPC 보호).
- **`VHK_FORCE_INTERACTIVE=1`** — Git Bash/MinTTY 처럼 TTY 오감지 환경용 탈출구.
- **`vhk restore --yes`** — 비대화형 명시 승인 플래그.

### Fixed

- **lite 모드 안전 구멍** — lite 여도 비대화형+미승인이면 위험작업(undo/publish/restore 등) 중단
  (경고 볼 사람 없는 환경서 무단 실행 방지).
- **`restore` 가드 누락** — HIGH_RISK 로 분류 + CLI/자연어 양쪽 `runGuarded` 경유 (백업 덮어쓰기 보호).
- **`vhk gate` 비-TTY 크래시** — 대화형 필수 명령은 깔끔히 거부(멈춤/EOF 크래시 제거).
- **`vhk init` 비대화형 일관화** — stdout 파이프가 프롬프트를 막던 오판 제거(stdin 축 통일).
- **`vhk save`** — 비대화형 커밋 메시지 기본값 + 시크릿 발견 시 비대화형 자동진행 금지(안전 중단).

### Note

- 동작 변경(E11): 비대화형에서 `vhk restore <id>`/`vhk undo` 등 위험작업은 `--yes` 없이 **중단**됩니다.
  자동화는 `--yes` 로 명시 승인하세요.

## [1.6.3] - 2026-06-01

> **VHK 자기개선 배치 + 도그푸딩 이슈 정리.** 카페 A/B 해커톤(`vhk-project-`)에서
> 나온 마찰을 VHK 자체 수정으로 등록(goal 7~10), 2-리뷰(Codex + 다중에이전트)로
> 결함 8건 잡아 수정, OPEN 이슈 #82·#80 해결.

### Added

- **`vhk goal sync`** — `goals/*.md` 를 SoT 로 누락된 `scripts/check-goal-<id>.mjs`
  게이트 스크립트를 자동 백필(idempotent, 자체완결·cross-platform). `.sh` 만 있는
  legacy goal 에도 `.mjs` 를 백필해 Windows 1급 보장.
- **`vhk context` 발견성** — 세션 진입 명령(`status`) 끝에 복원/생성/갱신 한 줄 안내
  (`printContextResumeHint`, 검증된 `checkContextDrift` 재사용).
- **goal 파일 스키마 문서화** — `vhk goal init` 의 `_meta.md` 에 필수 필드/템플릿 명시(VHK-021).

### Fixed

- **`vhk init -y` 완전 비대화형** — `-y`/비-TTY(stdin·stdout) 자동 감지로 모든 프롬프트
  (타입·confirmStack·adopt·overwrite) skip, 기본 타입(webapp) 폴백. CI/파이프 멈춤 제거.
- **Windows/PowerShell 1급** — goal 게이트가 bash 없이 `.mjs`(node)로 동작.
- **`vhk goal list` silent skip 제거** — `type: goal` 누락·비숫자 `id` 로 무시된 파일을
  경고로 노출(VHK-021).
- **`.vhk/cloud.json` gitignore** — secret gist 포인터가 공개 repo 에 노출되던 문제 수정.
  `.vhk/.gitignore` 템플릿 + `cloud push` 시 자동 보장(VHK-022).

## [1.6.1] - 2026-05-30

> **드리프트 정밀화 패치.** v1.6.0 의 맥락 드리프트 판정이 너무 거칠어 README 오타 같은
> 무관 커밋에도 경고가 떴던 노이즈를 잡는다. 기능 추가 없음 — 정확성 수정.

### Fixed

- **맥락 드리프트(`vhk doctor`) 오경보 제거** — `context.md` 의 stale 판정을
  단순 `HEAD sha` 변동에서 **file-change 기반**으로 정밀화. 이제 `context.md` 가 실제로
  반영하는 소스(`package.json`·`goals/`·`docs/state/learnings.md` 내용변경 또는 추적트리
  파일 추가/삭제/이름변경)가 바뀐 경우에만 stale 로 본다. README 오타·`src/` 내용수정
  같은 무관 커밋은 더 이상 경고하지 않는다(`git diff --name-only`, `--diff-filter=ADR`).
  매직넘버 없음, `ContextDriftResult` 시그니처·CRLF 정규화 불변.

## [1.6.0] - 2026-05-30

> **L2 첫 삽 — 드리프트 감지 + 견고성.** sync 한 규칙·맥락이 원본과 조용히
> 어긋나는 걸 vhk doctor 가 스스로 잡아낸다. cloud·publish·exec 견고성 보강 동반.

### Added

- **드리프트 감지 (`vhk doctor`)** — 규칙 드리프트(생성 파일이 RULES.md와 어긋남)와
  맥락 드리프트(`context.md` 가 코드보다 낡음)를 자동 경고. **읽기전용**(자동수정 X),
  `--check` 플래그 아닌 passive(이미 쓰는 doctor 안에서). CRLF 정규화로 거짓경보 방지.
  sync 출력 대상은 `SYNC_TARGETS` 단일 레지스트리로 통합(목록 하드코딩 제거).

### Changed

- **exec timeout backstop** — `safeExecFile` 에 기본 10분 timeout(정상 build/test 무영향),
  네트워크 호출 30초. 스트리밍(deploy·publish 2FA)은 면제(opt-in만). hang 방지.

### Fixed

- **cloud purge 원자화** — `vhk cloud push` 가 과거 gist 에 남은 제외 대상
  (`memory.json`·`refs.json`)을 제거. 백업 파일 우선 반영 + PATCH 후 재검증. 프라이버시 보강.
- **publish git 가드** — npm publish 후처리(add→commit→tag→push)를 단계별로 가드,
  중간 실패 시 중단·안내(반쪽 릴리즈 방지).

## [1.5.1] - 2026-05-30

> **메타데이터 패치.** 기능 변화 없음 — npm 페이지 안내문을 포지셔닝에 맞춰 즉시 반영하기 위한 재게시.

### Changed

- npm `description`/`keywords` 를 포터빌리티 포지셔닝으로 갱신
  ("풀사이클 CLI" → "도구·기기를 바꿔도 규칙·맥락이 따라가는 포터빌리티 CLI",
  keywords 에 portability·cursor·claude·windsurf·copilot·context-sync 추가).
  _(코드 변경은 #39 에서 머지됨, 본 릴리즈는 버전 범프만.)_

## [1.5.0] - 2026-05-30

> **포터빌리티 확장 릴리즈.** v1.4.0 게시 이후 누적분 — 특히 `vhk sync` 대상이
> 3종 → 5종으로 늘었다. v1.4.0 npm 패키지는 3종(Cursor·Claude·Windsurf)만 담고
> 있어 README 의 5종 약속과 어긋났는데, 이 릴리즈로 일치시킨다.

### Added

- **`vhk sync` 대상 확대 — GitHub Copilot + Antigravity** (3종 → 5종).
  `RULES.md` → `.cursorrules` + `CLAUDE.md` + `.windsurfrules` +
  `.github/copilot-instructions.md` + `.agents/rules/vhk-rules.md`.
  경로·포맷은 각 도구 공식 문서 기준. Antigravity 는 파일당 12,000자 제한이 있어
  UTF-8 바이트 기준으로 안전 절삭(구조 경계 + 마커), 전체는 `RULES.md` 에 남는다.
- **GitHub Actions CI** — PR·main 푸시마다 빌드+테스트 자동 검증.
- **`.vhk/` RFC 0001 초안** (`docs/rfc/`) + **포터빌리티 Pain 블로그 초안** (`docs/blog/`) — 둘 다 draft.

### Fixed

- **goal 엣지케이스** — ① 중복 `id` 감지 시 `vhk goal list` 가 경고 출력
  (조용한 누락 방지) ② 없는 `--id` 에 `check`/`done` 이 `goal id N 없음` 으로
  메시지 통일 ③ title 의 콜론 보존 특성화 테스트(회귀 가드).

### Docs

- README 포지셔닝 전면 교체 — "올인원 CLI" → "도구·기기를 옮겨도 규칙·맥락이 따라간다"(포터빌리티). 과장 방지 단서(자동 아님·개인메모 제외·git clone) 명시.

## [1.4.0] - 2026-05-29

> **포터빌리티 릴리즈.** AI 도구·컴퓨터가 바뀌어도 프로젝트 맥락이 따라온다.
> `.vhk/` 표준화 + 멀티 IDE 규칙 동기화 + 클라우드 백업.

### Added

- **`vhk cloud push` / `vhk cloud pull`** — GitHub secret gist 로 `.vhk/` 백업·복원.
  컴퓨터를 바꿔도 `vhk cloud pull` 로 맥락 복원. 인증은 `gh` CLI(코드에 토큰 0),
  개인 메모(`memory.json`)·참고링크(`refs.json`)·`HARD_STOP` 은 기본 제외.
  추가 제외는 루트 `.vhkignore`. 한국어 별칭 `클라우드`/`올리기`/`내리기`.
- **`docs/spec.md`** (spec_version 1.0) — `.vhk/` 디렉토리 공식 규격서.
  파일별 트래킹 정책 + `memory`/`refs` JSON 스키마 + `HARD_STOP` 규칙.
- **`vhk init` 프리셋 씨앗** — 프로젝트 유형별로 `.vhk/README.md`, `.vhk/context.md`,
  `.vhk/.gitignore`, 루트 `.vhkignore` 를 자동 생성.
- **`vhk sync` Windsurf 지원** — `RULES.md` → `.cursorrules` + `CLAUDE.md` +
  **`.windsurfrules`** (3개). IDE 가 바뀌어도 규칙이 따라온다.

### Fixed

- **`vhk init` 루트 `.gitignore` 생성** — 없으면 생성, 있으면 누락 항목만 append
  (기존 내용 보존). `.env`·`node_modules`·`dist` 노출 방지.

### Security

- `cloud` 백업은 secret gist + 개인 메모 기본 제외로 프라이버시 보호.
- `.vhk/memory.json`·`refs.json` 로컬 전용(`.gitignore`).

## [1.3.1] - 2026-05-28

> **Windows 릴리즈 품질 패치.** 1.3.0 publish 직후 발견된 4 publish-blocker + 2 잔여 리스크 + DX polish.
> 기능 변화 없음 — 모두 fix / refactor / docs.

### Fixed

- **bash 의존성 제거** — `vhk goal check` 가 Windows 기본 환경에서 깨지던 문제 해결
  - `src/commands/goal.ts`: `findGateScript(id)` — `.mjs` 우선, `.sh` fallback. runner (node/bash) 동적 선택
  - 신규 `scripts/_lib.mjs` + `scripts/check-meta.mjs` + `scripts/check-goal-{0,1,2}.mjs` (cross-platform)
  - 기존 `.sh` 4 개는 1줄 wrapper 로 축소 (`exec node ../check-*.mjs "$@"`) — dual-maintenance 부담 0
- **vhk secure 자기 레포 fail** — 테스트의 fake AWS key literal 이 자체 스캔에 걸리던 문제
  - `tests/scan-secrets.test.ts` / `scan-files.test.ts` / `secure.test.ts`: literal `"AKIAIOSFODNN7EXAMPLE"` → `'AKIA' + 'IOSFODNN7EXAMPLE'` 조각합성
  - scanner regex (`/AKIA[0-9A-Z]{16}/`) 는 contiguous 매칭만 잡으므로 무해. 런타임 값/테스트 의미 무변경
- **MCP SERVER_VERSION 하드코드 제거** — package.json 과 정합
  - `src/mcp/server.ts`: `const SERVER_VERSION = '1.3.0'` → `getVhkVersion()` (lib/version SoT)
  - 신규 회귀 테스트 — server.version 이 package.json 과 자동 일치

### Changed

- **README MCP 섹션 일관성** — v0.6.0 historical 섹션을 "(당시 8개) → 현재 v1.3 기준 24개" 명시
- **SDK private 멤버 접근 격리** — `tests/helpers/mcp-introspect.ts` 에 `getServerVersion / getServerName` 추가
  - `_registeredTools` + `_serverInfo` 모두 헬퍼 1 파일에 격리 → SDK 메이저 업그레이드 시 1 곳만 패치

### DX

- `printNextStep()` 누락 5 커맨드 추가 (status / update / save / undo / mcp-init)
- `docs/ARCHITECTURE.md` 신규 — 실제 구조 반영
- `--help` 출력 24 명령 최신화
- `README.md` Getting Started 섹션 강화
- `.gitignore` 에 `.env` 추가

## [1.3.0] - 2026-05-28

> **Goal 0 + Goal 1 + Goal 2 모두 DONE.** Phase 3~5 (MCP 풀 커버리지 / vhk goal 명령어 / 자율 루프) 누적 릴리즈.
> 마지막 publish (v1.0.2) 이후 모든 v1.1 / v1.2 / v1.3 기능 + tsc 블로커 해결 + 코덱스 리뷰 cleanup 포함.

### Added

- **자율 루프 (v1.3 Phase 5 / Goal 2 DONE)** — `context → goal next → 작업 → check → done` 사이클 + 트립와이어:
  - `vhk blocker <설명>` — `docs/state/blockers.md` 에 [date goal-N] tag + append-only. 3건 누적 시 `.vhk/HARD_STOP` 자동 생성 + exit 2
  - `vhk learn <교훈>` — `docs/state/learnings.md` 에 append-only. **memory.json 과 분리된 SoT** (Forbidden 이중 기록 금지)
  - `vhk resume --confirm` — `.vhk/HARD_STOP` 해제. `--confirm` 없으면 거부 (Forbidden 자동 호출 금지)
  - `vhk context` 출력 확장: `## Active Goal` (id/title/status/priority/file) + `## Recent Learnings` (최근 3건) + `## ⚠️ HARD_STOP 활성` (트립 시)
  - `AGENTS.md` 신규 — 자율 루프 에이전트 작동 규약 (Working Principles 5 + Loop Protocol + Forbidden Actions)
  - `src/lib/state-files.ts` — appendBlocker/appendLearning/getRecentLearnings/writeHardStop/clearHardStop + HARD_STOP_BLOCKER_THRESHOLD=3
  - 한국어 alias: `블로커` / `교훈` / `재개`
  - 테스트: state-files 15 + agent 8 + context-loop 3 = 26 신규. 전체 293/293
  - `scripts/check-goal-2.sh` — G2.1~G2.5 게이트
  - Dogfooding: `vhk goal done --id 2` 로 자기 자신 DONE 마킹. `vhk learn` 으로 Goal 2 교훈 기록

- **`vhk goal` 명령어 (v1.2 Phase 4 / Goal 1)** — vspec/vooster goals/ 체계를 사용자 CLI 로 노출:
  - `vhk goal init` — 현재 프로젝트에 `goals/_meta.md` + `docs/state/{next-task,blockers,learnings}.md` 스캐폴딩 (기존 파일 보존)
  - `vhk goal list` — `goals/*.md` frontmatter 파싱 → id 순 목록 (status icon + priority + version + title)
  - `vhk goal next` — active goal 자동 선택 (IN_PROGRESS 우선 → 첫 NOT_STARTED) → `docs/state/next-task.md` 멱등 갱신
  - `vhk goal check [--id N]` — `scripts/check-goal-<id>.sh` 실행, exit code passthrough
  - `vhk goal done [--id N]` — 게이트 재검증 → 통과 시 frontmatter `status: DONE` + `completed: YYYY-MM-DD`. **실패 시 frontmatter 무변경** (Forbidden: 실패 = 보존)
  - `vhk check --goal N` — 기존 `check` 의 optional 옵션 추가, goal-aware 게이트 위임
  - YAML frontmatter 파서: `src/lib/goal-frontmatter.ts` — 정규식 기반 (gray-matter 의존성 X)
  - NLP 한국어 4 규칙: "다음 목표" / "목표 점검" / "목표 완료" / "목표 목록"
  - 한국어 alias: `목표`, 서브: `목록/다음/초기화/검증/완료`
  - 테스트 23 (parser 10 + goal 13). 전체 267 → 280 (예정)
  - `scripts/check-goal-1.sh` — Goal 1 게이트 (G1.1 ~ G1.5)

### Internal

- **PR #17 follow-up — D**: `tests/helpers/mcp-introspect.ts` 추출 — SDK private `_registeredTools` 캐스팅 1 곳 격리. SDK 변경 시 패치 표면 최소.

- **MCP 풀 커버리지 완료 (v1.1 Phase 3 / Goal 0 DONE)** — MCP tool 16 → 24:
  - 신규 8 tool:
    - `deploy`, `publish`, `migrate`, `update` — dry-info 핸들러 (인터랙티브 본질이라 실제 실행 미수행, 진단/안내만)
    - `ref-list`, `memory-list`, `context-show`, `mcp-init` — `runVhkCli()` 서브프로세스 위임
  - **G0.1**: registerTool 24 개 도달 (Goal 0 목표 달성)
  - **G0.2**: server.ts inquirer import 0 (MCP 모드 안전성)
  - **G0.3**: server.ts execSync 0 (safeExecFile 통일)
  - `_meta` 게이트 통과 (typecheck/tests/build 모두 ✓)
  - 대화형 본질 4 커맨드 (`gate`, `init`, `design palette`, `theme`, `start`) 는 MCP 제외 확정
  - 테스트: 244/244 pass (mcp-server.test.ts 4 → 5 테스트, 24+ 단언 추가)

### Fixed

- **사전존재 typecheck 4 건 해결** (`_meta` M.1 영구 블로커):
  - `src/commands/start.ts` + `src/lib/git.ts`: `import simpleGit` default → named export `{ simpleGit }` 로 전환 (simple-git 3.x dual export 호환)
  - `src/lib/git.ts:83`: `DiffResult.files` union 정규화 — binary/name-status 항목 insertions/deletions 0 fallback
  - `src/lib/notion-import.ts:79`: `BlockObjectResponse` discriminated union 인덱싱 시 `Record<string, ...>` 캐스팅

- **MCP 풀 커버리지 1차 (v1.1 Phase 3 / Goal 0 진행 중)** — MCP tool 10 → 16:
  - 신규 6 tool: `sync`, `secure`, `audit`, `harness`, `context`, `brief`
  - 모두 비대화형. `runVhkCli()` 헬퍼로 `vhk` CLI 서브프로세스 위임 (MCP 모드에서 inquirer/ora 차단)
  - `audit` 는 fix 프롬프트 비활성화 (MCP non-interactive 보장)
  - 기존 10 tool 시그니처 무변경 (v1.0 GA 안정성 약속 유지)
  - `tests/mcp-server.test.ts` — 등록 tool 개수 + 이름 단언 (`_registeredTools` introspection)
  - MCP 서버 버전 0.7.1 → 1.1.0
  - 남은 후보 (다음 iteration): `gate`/`init`/`start` (대화형 → MCP OUT 또는 비대화형 wrap), `deploy`, `env-sync`, `publish`, `design`, `theme`, `ref`, `migrate`, `update`, `memory`
- **goals/ 구조 (v1.1 Phase 2.5)** — vspec/vooster 패턴 dogfooding:
  - `goals/_meta.md` — 공통 게이트 (typecheck/tests/build) 정의
  - `goals/0-mcp-full-coverage.md` — MCP 풀 커버리지 (10→24 tool) 미션 명세
  - `goals/1-goal-command.md` — v1.2 `vhk goal init/list/next/check/done` 명세
  - `goals/2-agent-loop.md` — v1.3 자율 루프 (`blocker/learn/resume`) 명세
  - `scripts/check-meta.sh` + `scripts/check-goal-0.sh` — 게이트 검증
  - `docs/state/{next-task,blockers,learnings}.md` — 상태 머신 SoT
  - `.vhk/HARD_STOP` 안전장치 규칙 + `CLAUDE.md` Safety 섹션
- `vhk start` (한국어 alias `시작`, `새프로젝트`) — 새 프로젝트 시작 올인원 마법사. 4단계 자동 진행:
  1. `git init` — 이미 repo면 스킵
  2. `vhk init` — `--skip-gate` 자동 적용, 문서/하네스 파일 생성
  3. `vhk mcp-init` — `.cursor/mcp.json` 생성/갱신
  4. `vhk context` — `.vhk/context.md` 생성

  명령어 4개를 외울 필요 없이 `vhk start` 하나로 끝. 옵션은 init 패스스루: `--yes`, `--from-notion <url>`, `--name`, `--description`, `--type`.
- 자연어 라우팅에 "시작", "새 프로젝트", "마법사", "프로젝트 만들고 싶어", "기획 끝났어요 바로 시작" 등 키워드 → `start`로 라우팅
- 기본 메뉴(`vhk` 단독 실행)의 "프로젝트 시작" 선택지가 `start` 마법사로 전환
- `start` 진입 시 안전 가드: `CLAUDE.md`/`.cursor/mcp.json`/`.vhk/context.md` 중 하나라도 있으면 "이미 VHK 설치 흔적 감지" 경고 + 진행 여부 재확인 (init의 파일별 overwrite 프롬프트와 별개)

### Changed (Breaking — 한국어 alias 재배치)

- `vhk 시작` 한국어 alias가 `init` → `start` 마법사로 이동
  - **기존**: `vhk 시작` ≡ `vhk init` (문서/하네스 파일만 생성)
  - **신규**: `vhk 시작` ≡ `vhk start` (git init + 문서 + MCP + context 일괄)
  - 새 동작은 기존 init의 superset. 새 프로젝트에서는 무해. **다만 이미 `.cursor/mcp.json` / `.vhk/context.md`가 있는 프로젝트에서 재실행 시 갱신/덮어쓰기 발생** (안전 가드로 1차 차단)
- `init` 명령에 한국어 alias `초기화` 추가 (`만들기`는 유지). `vhk init`, `vhk 초기화`, `vhk 만들기`는 기존 init 동작 그대로 유지
- NLP 라우팅 규칙 갱신
  - "시작", "프로젝트 만들고 싶어", "기획 끝났어요 바로 시작", "노션…가져와 시작" 등은 `start`로 라우팅
  - `init`은 명시적 키워드(`init`, `초기화`, `하네스 만`, `init만`)만 매칭

### Migration

- **`vhk 시작` 사용자**: 새 프로젝트라면 그대로 사용 권장 (오히려 git/MCP/context까지 자동). 기존 프로젝트에서 init만 다시 돌리고 싶으면 `vhk init`(또는 `vhk 초기화`, `vhk 만들기`) 호출
- **CI/스크립트**: `vhk 시작 --skip-gate` 같은 코드가 있다면 `vhk init --skip-gate`로 명시적 호출로 교체 (start는 `--skip-gate` 옵션 없음 — 마법사 내부에서 자동 적용)

### Compatibility note vs v1.0 GA 약속

- v1.0 GA 안정성 약속은 **명령어 이름·CLI 인자·`.vhk/` 파일 포맷**을 대상으로 함. 한국어 alias는 보조 UX 레이어로 재배치 가능. 그래도 사용자 충격이 있어 마이너 버전(1.1.0) 권장
- 영문 명령어 `vhk init` 및 그 옵션/동작은 그대로 유지 — 약속 무위반

---

## [1.0.1] — 2026-05-24 — Hotfix

### Fixed

- `vhk mcp-init` — pnpm 글로벌 설치 환경에서 `import.meta.resolve` 실패 시 `<cwd>/node_modules/@byh3071/vhk/dist/mcp/index.js` (존재하지 않는 경로)로 fallback해 깨진 `.cursor/mcp.json` 생성하던 회귀. 자기 파일 위치(`dist/commands/mcp-init.js → ../mcp/index.js`) 기반 해석을 1순위로 사용하고 모든 후보 경로에 `existsSync` 검증 추가. 진입점 못 찾으면 PATH의 `vhk-mcp` shim으로 fallback. (영향: Cursor 사용자 모두)
- `vhk harness` — Windows PowerShell의 `Out-File -Encoding utf8`이 생성하는 UTF-8 BOM 포함 `package.json`에서 `JSON.parse` throw → silent catch → "실행할 수 있는 스크립트가 없습니다" 잘못된 메시지. `readJsonFile` helper (BOM strip 포함)로 교체. 같은 패턴 7개 파일(`doctor`, `init`, `mcp-init`, `publish`, `update`, `mcp/server.ts` 2곳, `ref`)도 일괄 정리.
- `vhk recap` — 신규 git 레포에서 커밋이 0개일 때 `simple-git`이 `GitError: fatal: your current branch 'master' does not have any commits yet`를 던지고 프로세스 크래시. recap 진입부에 `hasAnyCommits()` 가드 추가, lib/git의 `getSessionDiff` / `getRecentCommits`에도 try/catch 안전망 추가. 첫 커밋 만들도록 안내.

### Internal

- `src/lib/git.ts` — `hasAnyCommits(): Promise<boolean>` helper 신설
- `src/lib/read-json.ts` 헬퍼 일관 적용 (이미 존재하던 helper를 그동안 호출자들이 안 쓰던 상태였음)

---

## [1.0.0] — 2026-05-24 — GA 🎉

### Added
- `vhk context` — 프로젝트 디렉토리 트리(3-depth) + 기술 스택 자동 감지(Next/Nuxt/React/Vue/Svelte/TS/Tailwind/tsup/Vite/webpack/vitest/jest/commander/inquirer + pnpm/yarn/npm) + VHK 명령어 목록을 `.vhk/context.md` 마크다운으로 자동 생성. AI 어시스턴트의 프로젝트 맥락 파악용
- `vhk context-show` — 현재 컨텍스트 파일 내용 출력
- `vhk memory add|list|remove` — `.vhk/memory.json` 기반 결정사항 기억 관리. `--tags` 옵션으로 태그 지원. NL은 list만 (add/remove는 인자 필수 → commander 전용)
- `vhk brief` — 프로젝트 정보 + git 상태(브랜치·마지막 커밋·미커밋 변경) + 최근 결정사항 5건 + 레퍼런스 3건 통합 보고서 `.vhk/brief.md` 생성 + 콘솔 출력. `safeExecFile` 기반 (Windows .cmd shim 안전)
- 자연어 라우터에 context/context-show/memory(list)/brief 키워드 추가 — `"맥락 만들어줘"`, `"컨텍스트 보여줘"`, `"기억 목록"`, `"프로젝트 브리핑 만들어줘"`, `"상태 요약 보여줘"` 등 9건
- README에 v1.0 GA 정책 섹션 + 전체 30+ 명령어 한국어 별칭 표

### Changed
- 버전: 0.9.1 → 1.0.0 (GA)
- `nlp-router` init 룰에 v1.0 신규 키워드 negation guard 추가 (`브리핑|brief|컨텍스트|context|맥락|기억|memory`) — `"프로젝트 브리핑 만들어줘"`가 init에 잘못 매칭되던 문제 차단

### Stability — v1.0 GA 공개 API 약속
- 명령어 이름, CLI 인자, `.vhk/` 파일 포맷은 v2.0까지 breaking change 없음
- 신규 명령 추가는 마이너 버전(1.x.0)으로 진행
- deprecation은 제거 전 1개 마이너 버전에서 경고
- i18n 키(`ko.ts`)는 누적만, 기존 키 미제거
- MCP 도구 8개 인터페이스 안정

---

## [0.9.0] — 2026-05-24

### Added
- `vhk harness` — `package.json` scripts 자동 감지 후 lint / type-check / test / build 순차 실행 + 통합 리포트. 일부 실패해도 끝까지 진행
- `vhk audit` — `npm audit --json` 래핑, 심각도별 요약, `Critical`/`High` 발견 시 자동 fix 옵션 (`--fix`). Windows PowerShell 호환 (shell stderr redirect 미사용, `err.stdout` 안전 파싱)
- `vhk migrate [npm|yarn|pnpm]` — 패키지 매니저 전환. 대상 CLI 존재 확인 → 확인 프롬프트 → 기존 lockfile + node_modules 정리 → `<pm> install`
- `vhk update` — npm registry 최신 버전 조회 → semver 비교 → `npm update -g @byh3071/vhk` 실행. 현재 ≥ 최신이면 스킵
- 자연어 라우터에 harness/audit/migrate/update 키워드 추가 — `"품질 점검해줘"`, `"보안 감사"`, `"취약점 확인"`, `"패키지 매니저 전환"`, `"vhk 업데이트 해줘"` 등

### Fixed
- `update` 명령이 tsup 번들 후 `package.json` 경로를 잘못 해석해 항상 `v0.0.0`을 출력하던 버그. `dist/index.js` / `src/commands/update.ts` 두 위치 모두에서 동작하도록 `getVersion` 다중 경로 탐색 적용
- `update` 명령이 현재 버전이 publish 된 최신보다 높을 때 다운그레이드를 시도하던 버그. `isUpToDate(current, latest)` semver 비교로 `current >= latest`면 "이미 최신" 처리

### Changed
- 버전: 0.8.1 → 0.9.0
- 키워드 충돌 가드: `harness` 별칭 `하네스` (`점검`은 기존 `check` 유지), `audit` 별칭 `감사` (`보안`은 기존 `secure` 유지)

---

## [0.8.0] — 2026-05-24

### Added
- `vhk design` — 컬러 팔레트 프리셋 4종(Minimal/Vibrant/Corporate/Pastel) 선택 + Tailwind config 또는 CSS 변수 토큰 파일 생성
- `vhk design-palette` — design과 동일 (별칭 진입점)
- `vhk theme` — 다크/라이트 모드 CSS + 토글 유틸리티(`getTheme`/`setTheme`/`toggleTheme`/`initTheme`) 생성
- `vhk ref add|list|open` — `.vhk/refs.json` 기반 레퍼런스 URL 관리. 브라우저 자동 오픈 (Windows/macOS/Linux)
- 자연어 라우터에 design/design-palette/theme/ref 키워드 추가 — `"디자인 토큰 만들어줘"`, `"다크 모드 적용"`, `"레퍼런스 보여줘"` 등
- `ref add` / `ref open`은 인자 추출 인프라가 없어 NL 진입점에서 의도적으로 배제 — commander 서브커맨드로만 노출

### Changed
- 버전: 0.7.1 → 0.8.0

---

## [0.7.1] — 2026-05-24

### Added
- MCP 도구로 `env` + `env-check` 노출 — Cursor 채팅에서 자연어로 환경변수 동기화/누락 검사 가능

### Notes
- `deploy` / `publish` MCP 노출은 stdio 충돌 (`safeExecFileStream` + ora spinner) 및 inquirer 프롬프트 의존성으로 v0.8에서 별도 refactor (skipConfirm 옵션 + 출력 캡처)

---

## [0.7.0] — 2026-05-24

### Added
- `vhk deploy` — Vercel / Netlify / Cloudflare Workers 자동 감지 + 프로덕션 배포
- `vhk env` — `.env` 키만 추출해 `.env.example` 생성, `.gitignore`에 `.env` 자동 추가
- `vhk env-check` — `.env.example` 기준 누락 환경변수 검사
- `vhk publish` — semver 범프(patch/minor/major) + 빌드 + 테스트 + `npm publish` + git tag
- `src/lib/exec.ts` — `safeExecFile` 공유 헬퍼 분리 (MCP 서버 + v0.7 신규 명령 재사용)
- 자연어 라우팅: `'환경변수 점검'`, `'vercel 배포'`, `'npm 출시'` 등 신규 패턴

### Changed
- `ship` 별칭: `'배포'` → `'출하'` (`deploy`와 의미 분리)
- `ship` NLP 룰: `'배포 체크/준비/점검'` 또는 `'출하'` 단독으로만 매칭. `'배포'` 단독은 `deploy`로 양보
- 버전: 0.6.0 → 0.7.0

---

## [0.6.0] — 2026-05-24

### Added
- **MCP 서버 (`vhk mcp`)** — 8개 도구(save/undo/status/diff/ship/doctor/check/recap) stdio 노출. Cursor 등 MCP 클라이언트에서 자연어로 호출
- **`vhk mcp-init`** — Cursor `.cursor/mcp.json` 자동 생성. 재시작 한 번으로 연동 완료
- 자연어 라우팅에 `mcp설정` → `mcp-init` 키워드 추가
- `package.json` `bin`에 `vhk-mcp` 별도 엔트리 추가
- v0.5.x → v0.6.0 버전 업

### Security
- MCP `save` 도구의 shell injection 취약점 차단 — 모든 git 호출에 `execFileSync` 사용 ([aed5b47](https://github.com/byh3071-cpu/vhk/commit/aed5b47))

---

## [0.5.3] — 2026-05-23

### Added
- `CHANGELOG.md` 신설 — 릴리즈마다 자동 갱신
- `doctor` 명령에 npm 최신 버전 비교 — 새 버전 안내 한 줄
- VHK 자체 부트스트랩 (`vhk init`으로 vhk-cli 레포 docs/ 생성)

### Fixed
- `vhk init --skip-gate --name X --type Y` 같은 옵션값 포함 명령이 자연어로 오인되어 gate로 잘못 라우팅되던 버그 ([cli-args.ts](src/lib/cli-args.ts))
- `enhancePackageScripts`가 사용자가 정의한 동명 스크립트(예: `check: eslint`)를 덮어쓰던 문제 — 이제 사용자 정의가 우선 ([init.ts](src/commands/init.ts))

---

## [0.5.2] — 2026-05-23

### Fixed
- 자연어 CLI 인자가 Commander 파싱 전에 잡히도록 분리 — `vhk 보안 확인` 같은 입력이 `too many arguments` 에러 없이 동작
- UTF-8 BOM이 붙은 `package.json` 파싱 처리 (`stripBom`, `readJsonFile`)

---

## [0.5.1] — 2026-05-23

### Changed
- npm 첫 publish 준비 — `@byh3071/vhk` 스코프 패키지

---

## [0.5.0] — 2026-05-23

### Added
- **`vhk save`** — `git add . → commit → push` 한 번에. 원격 없으면 로컬만 커밋
- **`vhk undo`** — 최근 1~5커밋 `soft reset`, 원격 push 상태면 경고·확인 후 진행
- **`vhk diff`** — staged / unstaged / 새 파일 분리 요약. HEAD 대비 줄 수 표시
- **`vhk status`** — 브랜치·변경 개수·최근 커밋·upstream 동기화 대시보드
- 보안 경고 강화 — `save` / `init` / `recap` 전에 `.env`·민감 파일 노출 사전 안내
- Codex 2차 리뷰 반영: `secure scan` 정확도 개선, `save` push 안정화, git porcelain 파싱 견고화

---

## [0.4.0] — 2026-05-23

### Added
- 시작 메뉴 — `vhk`만 입력해도 인터랙티브 메뉴
- 한국어 별칭 — `vhk 검증`, `vhk 시작`, `vhk 정리` 등
- 자연어 라우팅 — `vhk "프로젝트 만들고 싶어"` → `init`
- **`vhk doctor`** — Node / npm / pnpm / Git + 프로젝트 파일 점검
- **`vhk ship`** — 배포 체크리스트 + 회고 + `docs/build-log/` 생성
- **`vhk check`** — `RULES.md` 위반 린트
- **`vhk secure scan`** — 시크릿/키 패턴 스캔. **CRITICAL/HIGH 발견 시 exit code 1** (CI용)
- 각 명령 끝에 "다음에 이것만 하세요" 복붙 명령 + Cursor 힌트

---

## [0.2.0] — 2026-05-23

### Added
- **`vhk recap`** — Git 변경 → `docs/log/` 세션 로그 자동 생성. ADR/트러블슈팅 분리
- **`vhk sync`** — `RULES.md` → `.cursorrules` + `CLAUDE.md` 동기화
- **`vhk init --from-notion <url>`** — Notion PRD 페이지 import → 로컬 `docs/PRD.md` 채우기

---

## [0.1.0] — 2026-05-23

### Added
- 첫 MVP 릴리즈
- **`vhk gate`** — 아이디어 검증 (퀵 5문항 / 풀 13문항 / 스킵)
- **`vhk init`** — 프로젝트 시작. 하네스 파일 생성 (`CLAUDE.md`, `.cursorrules`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, ADR/log 폴더)

[Unreleased]: https://github.com/byh3071-cpu/vhk/compare/v2.15.0...HEAD
[2.15.0]: https://github.com/byh3071-cpu/vhk/compare/v2.14.1...v2.15.0
[2.14.1]: https://github.com/byh3071-cpu/vhk/compare/v2.14.0...v2.14.1
[2.14.0]: https://github.com/byh3071-cpu/vhk/compare/v2.13.0...v2.14.0
[2.13.0]: https://github.com/byh3071-cpu/vhk/compare/v2.12.0...v2.13.0
[2.12.0]: https://github.com/byh3071-cpu/vhk/compare/v2.11.0...v2.12.0
[2.3.0]: https://github.com/byh3071-cpu/vhk/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/byh3071-cpu/vhk/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/byh3071-cpu/vhk/compare/v2.0.2...v2.1.0
[2.0.2]: https://github.com/byh3071-cpu/vhk/compare/v2.0.1...v2.0.2
[2.0.1]: https://github.com/byh3071-cpu/vhk/compare/v1.9.0...v2.0.1
[1.0.0]: https://github.com/byh3071-cpu/vhk/compare/v0.9.1...v1.0.0
[0.9.0]: https://github.com/byh3071-cpu/vhk/compare/v0.8.1...v0.9.0
[0.8.0]: https://github.com/byh3071-cpu/vhk/compare/v0.7.1...v0.8.0
[0.7.1]: https://github.com/byh3071-cpu/vhk/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/byh3071-cpu/vhk/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/byh3071-cpu/vhk/compare/v0.5.3...v0.6.0
[0.5.3]: https://github.com/byh3071-cpu/vhk/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/byh3071-cpu/vhk/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/byh3071-cpu/vhk/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/byh3071-cpu/vhk/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/byh3071-cpu/vhk/compare/v0.2.0...v0.4.0
[0.2.0]: https://github.com/byh3071-cpu/vhk/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/byh3071-cpu/vhk/releases/tag/v0.1.0
