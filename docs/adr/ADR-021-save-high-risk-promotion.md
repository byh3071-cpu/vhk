# ADR-021 — save 를 high-risk 로 승격 (CLI·자연어 채널 일관화)

- 상태: Accepted
- 날짜: 2026-08-29
- 관련: #611(실측 재현), ADR-005(MCP 고위험 옵트인 — 같은 독트린의 MCP 선행 적용), Goal 12/S5(본 ADR 이 번복하는 결정), R13(비대화형 destructive 모드 무관 중단)

## 맥락

Goal 12/S5(2026-06)는 save 를 high-risk 로 승격하지 않고 strict-extra 로 유지하기로 결정했다. 근거는 ① commit 은 로컬·되돌리기 가능 ② push 는 자기 remote 대상이라 deploy/publish 와 등급이 다름 ③ 가장 빈번한 명령을 standard 에서 막으면 UX 파괴 — 였고, `tests/safety-guard.test.ts` 가 이 계약을 잠갔다.

그 후 두 가지가 바뀌었다.

1. **ADR-005(goal 70)** 가 MCP 채널의 save 를 "바깥행동(원격 push)" 으로 규정하고 기본 미리보기 + `confirm:true` 옵트인으로 승격했다. 그 결과 채널별 등급이 갈라졌다: MCP=preview, CLI/NL=allow. 같은 에이전트 실행 채널인 자연어와 비-TTY CLI 만 무가드로 남는 자기모순.
2. **전수 도그푸딩 감사(2026-08-29, #611)** 가 그 모순의 실해를 실측했다: 비-TTY 에서 자연어 `vhk "저장해줘"` 한 마디가 확인·미리보기 없이 자동 커밋 + 공개 remote push 까지 완주. Safety Mode standard 의 자기 선언("위험 작업은 CLI 확인·MCP/자연어 미리보기")이 save 에서 거짓이 됐다.

## 결정

**save 를 `HIGH_RISK_ACTIONS` 11번째 액션으로 승격**하고(`STRICT_EXTRA_ACTIONS` 에서는 제거), CLI 배선은 **`guardSave` 한 곳**으로 모은다 — strict 는 기존 y/N 확인(guardCli)을 유지하고, 그 외 모드는 `guardCliDefer`(save 자체 프롬프트가 확인 역할, 이중 프롬프트 없음)로 위임한다.

| 채널·환경 | 승격 후 동작 |
| --- | --- |
| CLI + TTY (standard) | **기존 흐름 그대로** — defer 가 통과시키고 save 자체 프롬프트(파일 목록 + 메시지 입력)가 확인 역할. `-m` 지정 시 프롬프트가 없는 것도 승격 전과 동일 |
| CLI + TTY (strict) | **기존 y/N 확인 유지**(guardCli) — 승격 전 strict 사용자가 갖던 push 방어를 잃지 않는다 |
| CLI + 비-TTY | `--yes` 또는 `--no-push` 없으면 차단 + 안내 + **exit 1** (에이전트 성공 오판 방지) |
| 자연어 ("저장해줘") | 미리보기만, 기본 비실행 + **exit 1** (ADR-005 의 MCP 동작과 동일 등급) |
| MCP | 변화 없음 (ADR-005 그대로 — 네이티브 핸들러의 confirm:true 옵트인이 집행 지점) |
| lite 모드 | warn — 대화형은 경고 후 진행, 비대화형 미승인은 차단(R13) |

추가로 **`--no-push` 옵션**을 신설해 기록(커밋)과 반출(push)을 분리한다 — 에이전트 권장 경로는 `vhk save --yes -m "메시지" --no-push`. **반출이 없는 `--no-push` 는 가드 승인으로 인정한다** — 로컬 커밋은 undo 로 되돌릴 수 있어 Goal 12/S5 의 원 논거가 그대로 유효한 부분이고, HARD_STOP 차단은 여전히 적용된다.

**대화형 판정 축 (env ≠ consent)**: 가드의 대화형 판정은 **stdin TTY 단일 축**이다 — stdout 축을 섞으면 `vhk save | tee` 가 "취소됨"으로 오판된다(cost.ts 가 이미 제거한 비대칭). `VHK_FORCE_INTERACTIVE` 탈출구는 **가드 게이트에 반영하지 않는다**: 승인 축에 넣으면 환경변수 한 줄이 y 응답을 대신해 #611 이 재발하고, 탈출구 경로에서 프롬프트를 시도하면 stdin 파이프 에이전트에서 행(unsettled await, exit 13)이 된다 — 둘 다 실측. Git Bash/MinTTY 사용자는 차단 안내가 알려주는 명시 플래그(`vhk save --yes`)로 승인하며, 그 뒤의 save 자체 프롬프트는 탈출구가 정상 적용되는 promptOrDefault 경로라 그대로 동작한다. warn(lite) 분기도 같은 이유로 stdin TTY 만 인정한다(R13 유지).

부수 동작 변화(명시): strict 의 y/N 에서 **No** 를 답하면 이제 exit 1 로 끝난다(이전 exit 0) — "실행 안 됨"을 스크립트 체인에도 실패로 알리는 의도된 변화다.

## Goal 12/S5 번복 근거 (steelman 후 각개 반박)

1. "빈번 명령 UX 파괴" — 당시 논거는 guardCli(y/N) 전제. guardCliDefer 배선으로 TTY 사용자 체감 변화 0. 논거 소멸.
2. "자기 remote 라 등급이 다름" — 공개 remote 면 push=외부 반출이며 #611 이 실증. ADR-005 도 이미 push 를 "바깥행동" 으로 재규정.
3. "strict 가 탈출구" — 탈출구는 사람이 미리 알고 켜야 작동한다. 감사에서 기본값(standard) 사용자가 무방비였음이 실측됨. 기본값이 안전해야 한다(safe-by-default). 이미 strict 를 켠 사용자의 y/N 확인은 guardCli 분기로 그대로 유지해, 승격이 기존 보호를 하향하지 않는다.

## 대안 (기각)

- **NL 라우터에서 save 만 특례 차단**: 분산 결정점 신설 — risk-policy 단일 SoT 원칙 위반. 정책표 승격이 3채널을 한 번에 정합화.
- **비-TTY 감지 시 save 내부에서 자체 차단**: 가드 chokepoint(runGuarded) 우회 로직 중복. 완전성 테스트(safety-coverage)가 지키는 "무바이패스" 구조 훼손.
- **기본 push 제거(save=commit only)**: 기존 사용자 계약(add→commit→push) 파괴 — breaking change 는 major 에서만. `--no-push` 옵트인으로 대체.

## 결과

- 행동 변화(의도된 것): 비-TTY save 는 `--yes` 또는 `--no-push` 필수(차단 시 exit 1), 자연어 "저장해줘" 는 미리보기 + exit 1. TTY 는 standard·strict 모두 승격 전과 동일한 확인 경험(standard=자체 프롬프트, strict=y/N).
- **semver 예외 근거(명시)**: 비-TTY `vhk save` 의 "무확인 실행 → 차단" 은 행동 변화지만, 저장소 코딩 규칙("질문이 필요한 명령은 비-TTY 면 안내 후 실패")과 Safety Mode standard 의 공표된 계약("위험 작업은 CLI 확인·MCP/자연어 미리보기")을 **코드가 위반하던 것을 계약대로 복구하는 보안 수정**이다. 따라서 "공개 API breaking change 는 major 에서만" 규칙의 예외로 minor 에 싣고, CHANGELOG `Security` 절로 고지한다. (선례: ADR-005 도 MCP save 기본값을 즉시실행→미리보기로 minor 에서 바꿨다.)
- 기존 자동화 영향: 비-TTY 로 `vhk save` 를 호출하던 에이전트 스크립트는 `--yes` (권장: `--yes -m "메시지" --no-push`) 로 갱신 필요. vhk-auto/overnight 스킬 문서의 권장 경로 갱신은 이 PR 머지 직후 후속으로 진행한다(스킬 파일은 동시 진행 중인 Agent Skills 정비(139)와 충돌 회피 — 그때까지 해당 스킬의 비-TTY save 는 차단+안내로 동작하며 조용히 push 하지 않는다).
- 회귀 가드: `tests/safety-guard.test.ts` 의 새 계약 블록("ADR-021 / #611")과 `tests/save-guard.e2e.test.ts`(실 CLI 배선 — 차단 exit·`--no-push` 환원)가 승격을 잠근다. 되돌리려면 이 ADR 을 supersede 하는 새 ADR 필요.
