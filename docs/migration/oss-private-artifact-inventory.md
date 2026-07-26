# OSS 공개 경계 이전 목록

> 2026-07-27 점검 결과. 이 문서는 공개 HEAD에서 제거한 개인 운영 산출물과 공개 유지 대상을 구분한다.

## 비공개 보존 후 공개 HEAD에서 제거 완료

| 경로 | 이유 | 처리 결과 |
|---|---|---|
| `.agents/SOUL.md` | 개인 정체성, 일하는 방식, 개인 생태계 비전과 역할 분담을 포함 | 비공개 백업 후 공개 HEAD 제거 |
| `.vhk/config.json` | 이 저장소의 로컬 실행 모드 상태 | 비공개 백업 후 공개 HEAD 제거 |
| `.vhk/events/*.jsonl` | 에이전트 실행·검증·드리프트 이력 | 3개 파일 비공개 백업 후 공개 HEAD 제거 |
| `.vhk/ledger.jsonl` | 로컬 게이트 원장 | 비공개 백업 후 공개 HEAD 제거 |

원문과 SHA-256 매니페스트는 비공개 `yohan-brain/archive/vhk-public-boundary-2026-07-27/`에 보존했다. 같은 경로가 다시 추적되지 않도록 이 저장소의 `.gitignore`에 개인 런타임 파일을 추가했다. `.vhk/.gitattributes`, `.vhk/.gitignore`, `.vhk/README.md`는 공개 제품의 스캐폴드 계약이므로 유지한다.

## 사람 검토 후 선택적으로 이전할 후보

- `docs/state/next-task.md`, `docs/state/blockers.md`: 현재 작업 위치와 운영 블로커를 노출한다. 공개 로드맵으로 필요한 항목만 이슈·CHANGELOG로 승격한 뒤 비공개 운영 상태로 옮기는 편이 안전하다.
- `docs/log/2026-06-30-subagent-policy-critic-probe.md`
- `docs/log/2026-07-01-critic-writehole-confirmed.md`
- `docs/log/2026-07-04-rfc0057-track1-ecosystem-mdc.md`
- `docs/log/2026-07-07-rsi-decision-and-next-phase-audit.md`
- `docs/log/2026-07-08-wave1-4-merge-closure.md`
- `docs/log/2026-07-13-next-task-archive.md`
- `docs/log/2026-07-16-orca-tab-scroll-session.md`
- `docs/log/2026-07-18-human-queue.md`

위 파일은 개인 생태계·다른 저장소·로컬 운영 맥락을 포함한다. 다만 제품 결함과 설계 근거도 섞여 있으므로 일괄 삭제 대신 공개 가치가 있는 결론을 ADR/RFC에 남긴 뒤 원문을 비공개로 옮긴다.

## 공개 유지

- 작성자·저장소·사이트 브랜드: `byh3071-cpu`, `@byh3071/vhk`, `yohanstudio.co`
- 제품 동작을 설명하는 ADR, RFC, CHANGELOG, 테스트, 완료 Goal
- 범용화된 `RULES.md`와 sync/bootstrap 파생 산출물
- 공개 사용자가 재현할 수 있는 문제 해결 기록

## Git 이력·보안 설정 점검

- 628개 커밋의 private-key, GitHub/npm/OpenAI/AWS/Bearer 형태를 값 미출력 방식으로 재검사했다.
- 의심 경로는 `CHANGELOG.md`와 보안 스캐너 테스트 3개뿐이었고 모두 명시적인 fixture/example이었다. 실제 자격증명은 0건이므로 이력 재작성 조건은 충족되지 않았다.
- GitHub 저장소는 public이며 Secret scanning, Push protection, Dependabot alerts/security updates를 활성화했다.
- Validity checks와 non-provider/generic patterns는 개인 계정 소유 무료 public 저장소에서 사용할 수 없는 GitHub Team/Enterprise Secret Protection 기능이라 API 요청 후에도 비활성으로 유지됐다.
