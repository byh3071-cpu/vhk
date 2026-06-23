# 2026-06-23 — 레지스트리/라우터 드리프트 3건 수정 (#314 #344 #345)

> worktree `vhk-fix-registry-drift` / 브랜치 `fix/314-344-345-registry-drift`. TDD.
> 세 이슈 공통 = 등록 4지점(index·command-registry·cli-args·ko) 드리프트.

## 문제 (도그푸딩 6-22 격리재현)
- **#314** 컨테이너+무효서브 cross-misroute: `vhk memory "왜 안 되나"` → NL 라우터가 문장 전체를 가로채 **doctor** 가 조용히 실행(exit 0). `goal "뭐 해야 하나"`→help, `goal "어떻게 진행"`→status. 같은 무효서브라도 트리거 단어 없으면(`memory zzz`) commander raw 에러 → 비일관.
- **#344** 유령 서브커맨드: `env check`·`design palette` 가 raw `too many arguments`(exit 1). env·design 은 leaf 인데 registry 가 `env:[check]`·`design:[palette]` 거짓 선언 → R1 가드가 "실제 경로" 오판 → commander 가 leaf 의 추가인자 거부. (정답은 별도 top-level `env-check`·`design-palette`)
- **#345** 유령 KNOWN 토큰: `현황`·`스캔`·`scan`·`help` 가 미지 단어(`우주선엔진`=친절 ❓)보다 나쁜 raw 에러. KNOWN_COMMAND_TOKENS 에 등록됐으나 실제 commander 명령/별칭 미배선 → 단일토큰 분기에서 `return null` → commander raw 에러.

## 근본 원인 = 양방향 드리프트
- KNOWN_COMMAND_TOKENS ⊄ 실제 명령/별칭 (유령 토큰 4종)
- CONTAINER_SUBCOMMANDS ⊃ 실제 commander 서브 (유령 서브 env/design) — 기존 드리프트 가드는 commander→registry 방향만 검사해 역방향 유령을 못 잡음
- NL 라우터가 컨테이너+무효서브를 **다른** 명령으로 라우팅하는 걸 막는 가드 부재

## 수정 (src + tests)
- `cli-args.ts`:
  - #345 KNOWN_COMMAND_TOKENS 에서 `scan`·`스캔`·`현황`·`help` 제거 → NL 로 흘러 친절 처리(현황→status, help→help, 스캔/scan→친절 ❓ 폴백).
  - #314 cross-misroute 차단: `detectNaturalLanguageInput` 에 컨테이너+무효서브일 때 NL 라우트가 **컨테이너 자기 명령**일 때만 가로채기 허용(`isContainerOwnRoute`). 보안 확인→secure(자기)=허용, memory 왜안되나→doctor(타)=차단.
  - 신규 `detectInvalidCommandUsage(argv)`: 등록 명령의 잘못된 인자 조합을 raw 영어 에러 대신 한국어 친절 안내로. (#344 leaf+추가인자→형제명령 유도 `LEAF_ARG_SUGGEST`, #314 컨테이너+무효서브→유효 서브 목록 안내). index.ts 에서 NL 감지보다 먼저 호출 + exit 1.
- `command-registry.ts`: #344 `CONTAINER_SUBCOMMANDS` 에서 env·design 제거 + `CONTAINER_ALIASES` 에서 환경변수·디자인 제거(무효 컨테이너 가리킴 방지).
- `index.ts`: `detectInvalidCommandUsage` 배선(친절 안내 + exit 1).
- `command-registry.test.ts`: #344 **역방향 유령 서브 가드** 추가(registry 컨테이너 = commander 서브 또는 positional 인자 보유 강제).
- `registry-drift-usage.test.ts`(신규): 세 이슈 재현 케이스 + 회귀 가드 18건.

## 검증
- E2E(격리 temp): #314 memory/goal 무효서브 → 친절 invalid-subcommand(doctor/help/status 오라우팅 0). #344 env check/design palette(+한글 별칭) → "env-check/design-palette 실행하세요". #345 현황→status, help→help, scan/스캔→친절 ❓. raw `too many arguments` 0.
- 회귀: 보안 확인→secure NL, secure scan/memory list/goal check→commander, 클라우드 백업→cloud-push, env-check/env 단독 정상.
- `pnpm test` 1916 pass · `tsc --noEmit` 0 · `eslint src` 0 · `secure scan` CRITICAL 0.
- 드리프트 가드: KNOWN ⊆ 실제명령 + registry ⊆ 실제서브(양방향) 테스트로 재발 차단.
- COMMANDS.md 의 stale 표기(`design palette = 서브커맨드`) 정정.
