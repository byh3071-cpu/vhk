# 2026-07-13 — #457 외부 발행물 secure 게이트 (report-mode)

## 결론
발행물 초안을 파일 단위로 스캔하는 `vhk secure scan <파일...>` + 뒷단 3종(content/launch/sell) 프롬프트의 "게시 전 스캔" 치명 규칙 + 스캔 이벤트 원장(`.vhk/events/secure-scan-log.jsonl`)으로 #457 을 report-mode 구현.

## 스코프 정직화 (이슈 완료기준 재해석)
이슈 원문 "통과 후에만 발행 가능/미통과 차단"은 **기계 차단이 구조적으로 불가** — 뒷단 명령은 프롬프트만 emit 하고 초안 작성·게시가 전부 코드 밖(RFC 0054 자문형 헌법, 발행 명령 자체가 없음). 정직한 구현면 3개:
1. **도구**: 경로 지정 스캔. 전체 스캔의 확장자 필터가 `.md` 를 제외해 발행물이 사각이었음 — 명시 경로는 확장자 무관 스캔. CRITICAL/HIGH 시 exit 1(CI/스크립트 합류 가능).
2. **의례**: content/launch/sell 프롬프트에 치명 규칙 1줄 — 초안을 파일로 저장 → 스캔 → CRITICAL/HIGH 0 확인 후에만 게시.
3. **계측**: 스캔 실행·적발 이력을 이벤트 원장에 append — 차단 전환(로드맵 Phase 4 판정)의 measure-first 데이터. 로그 실패는 스캔 결과에 영향 없음(정직 안내만).
ops 는 게시물이 아니라(회고·제안) 제외.

## 구현
- `src/lib/scan-secrets.ts` — `scanFilesForSecrets(paths, cwd)`: 파일만(디렉터리·부재·512KB 초과는 errors 로 정직 보고), `findSecretsInLine` 재사용, 상대경로 cwd 해석.
- `src/lib/secure-scan-log.ts` — append-only JSONL 원장(receipt-log 패턴).
- `src/commands/secure.ts` — `secure(paths?)` 경로 모드 분기(무인자 동작 완전 불변 — GA). `src/index.ts` — `scan [paths...]` 인자(additive).
- 프롬프트 3종 치명 규칙 + `ko.ts` 3키 + COMMANDS.md.

## 검증 (critic 적대 루프 2라운드)
- **라운드 1 불통과** — 전부 라이브 재현된 "안전하다고 거짓 보고" 결함: [치명] 4000자 초과 줄 속 시크릿 조용한 통과(exit 0 "깨끗") / [중대] 한글 별칭 `보안 스캔 <파일>` 이 NL 라우터에 삼켜져 인자 유실 → 유출 파일 "깨끗" 오보고 / [중대] 부재 파일 0개 스캔인데 exit 0(`scan && 게시` 체인 우회) + 원장이 no-op 과 clean 을 구별 못 함.
- **수정**: 초장문 줄 errors 표면화 / `CONTAINER_SUBCOMMAND_ALIASES`+`resolveSubcommandAlias`(secure 한정 — 전 컨테이너 합류는 선재버그 별도 PR) / scannedFiles 0·errors>0 → exit 1 + draftIncomplete 안내 / 원장 scannedFiles·errorCount / .vhk 없는 cwd 계측 스킵 / 200건 캡+표면화 / 경로 dedup.
- **라운드 2 통과** — 원 결함 6건 라이브 해소 확인 + 신규 구멍 3관점(별칭 정규화 회귀 0·MEDIUM-only exit 0 유지·캡 도달 fail-closed) 클린. 라우팅 계열 168 테스트 green.
- TDD `tests/secure-scan-drafts.test.ts` 12종. 전체 게이트: build ✅ · 2399/2399 ✅ · lint ✅.
- 라이브: 오염 exit 1(영문·한글 별칭 모두)·부재 1·긴줄 1·MEDIUM-only 0·청정 0·원장 스키마 실측.

## 교훈
- 컨테이너 서브커맨드에 인자 추가 = 한글 서브별칭 라우팅을 반드시 실측(영문만 테스트하면 NL 가로채기로 인자 유실) — 프로젝트 메모리 등재.

## 한계 (정직)
- 게시 행위 차단은 불가(사람 행위) — 의례+exit code 가 집행면. AI 가 게시 전 스캔을 건너뛰면 잡을 수 없음(프롬프트 규칙 + handoff 수확이 백스톱).
- 디렉터리 인자 미지원(v1) · LLM 가드레일 스캔은 코드 대상이라 초안 모드에선 미실행.
