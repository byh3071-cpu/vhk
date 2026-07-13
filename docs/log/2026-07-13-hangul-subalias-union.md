# 2026-07-13 — 전 컨테이너 한글 서브별칭 R1 가드 합류

## 배경 (실증 2회 결함 클래스)
`CONTAINER_SUBCOMMANDS` 가 영문 서브명만 담아, 한글 서브별칭 경로(`목표 다음`, `진화 제안` 등)가
`isRealSubcommandPath`(cli-args) 대조를 못 통과 → NL 라우터가 가로채 **서브커맨드·인자 유실**.
- 2026-07-01 선재버그: evolve 한글 서브별칭 전부 차단
- 2026-07-13 #457 적대검증 중대-1: `보안 스캔 <파일>` 인자 유실 → 유출 파일 "깨끗" 오보고

#457 수정에서 `CONTAINER_SUBCOMMAND_ALIASES` + `resolveSubcommandAlias` 가 신설됐지만
secure({스캔:'scan'}) 만 합류된 상태였다 — 이번 작업으로 전 컨테이너 확장.

## 한 일 (TDD)
1. **드리프트 가드 먼저(red)**: tests/command-registry.test.ts 에 commander 실등록(introspect)
   ↔ `CONTAINER_SUBCOMMAND_ALIASES` 양방향 대조 테스트 3종 추가.
   - 순방향: commander 의 모든 서브커맨드 `.alias()` 가 registry 에서 정규화됨 (누락 = R1 재발)
   - 역방향: registry 의 모든 별칭이 commander 실등록과 1:1 (유령·발명 별칭 0)
   - shadow 가드: 별칭 키가 같은 컨테이너 영문 서브명과 충돌 금지
   → red 실행이 누락 34건을 전수 열거 (수동 수집표와 교차검증됨).
2. **green**: 열거된 34건 전수 등재 — cloud(2)·ref(2)·worktree(2)·memory(7)·work(1)·
   goal(9)·pattern(3)·evolve(8) + 기존 secure(1). 별칭 없는 컨테이너
   (mission/seo/config/bootstrap/cost/mode)는 등재하지 않음(발명 금지, commander 가 SoT).
3. **동작 테스트**: tests/cli-args.test.ts 에 한글 경로 위임 8종 + 회귀 2종
   (`목표 점검` NL 유지 — '점검' 은 worktree 것, cross-container 오염 금지 / `보안 확인` NL 유지).
4. isRealSubcommandPath 등 로직 변경 0 — 데이터(레지스트리)만 추가 (보수적 접근).

## 실측 (dist 빌드, 임시 디렉토리)
- `vhk 목표 다음` ≡ `vhk goal next` (출력 동일 = 같은 핸들러)
- `vhk 진화 제안` ≡ `vhk evolve suggest` (동일)
- `vhk 기억 목록` ≡ `vhk memory list` (동일)
- 인자 보존: `vhk 진화 반영 r1` → evolve apply 핸들러의 TTY_REQUIRED 도달 (NL 가로채기 없음)
- 회귀: `보안 확인`·`보안 xyz` → NL→secure 유지 / `뭐 바뀌었어` → NL→diff 유지

## 교훈
- 별칭 계열 레지스트리는 "일부만 우선 합류" 상태가 제일 위험 — 가드가 있다는 착시를 만든다.
  드리프트 가드(introspect 전수 대조)를 데이터와 같은 커밋에 넣어야 재발 원천 차단.
- commander 등록이 SoT: 레지스트리를 손으로 수집하지 말고, 가드 테스트의 red 출력으로
  전수 열거시켜 등재하면 수집 누락·발명이 구조적으로 불가능.
