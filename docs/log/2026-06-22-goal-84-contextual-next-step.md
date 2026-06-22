# 2026-06-22 — Goal 84: doctor/status next-step 맥락 인지 (신규 vs 기존 레포 분기)

> append-only. 추가만, 수정·삭제 금지.

## 한 일
- **Goal 84 DONE** — `vhk doctor`/`status` 의 "다음에 이것만 하세요"가 레포 성숙도(신규 vs 기존)를 보고 맥락에 맞게 분기(RFC 0053 §4 D9). 396커밋 활성 레포에서도 "이제 프로젝트를 시작하세요" 온보딩이 뜨던 거짓 안내 해소.

## 선조사 (카드 부분 정정)
- 진짜 D9 = **doctor**: `ko.doctor.nextOkMessage`="이제 프로젝트를 시작하세요" + `vhk 시작` 이 활성 레포에도 노출.
- **status 는 과장**: clean 시 이미 `vhk goal next`("다음 미션") — 온보딩 아님. 단 신규(초기) 레포엔 `vhk goal next`(goal 없음)보다 온보딩이 나아 그 케이스만 보강.

## 변경 (산출물 포인터)
- `src/lib/project-maturity.ts` (신규) — `classifyMaturity`(순수: .vhk/context 존재 OR 커밋수≥`ESTABLISHED_COMMIT_THRESHOLD`=5 → established) + `gatherMaturitySignals`(IO, gitOut 재사용) + `projectMaturity`(래퍼).
- `src/commands/doctor.ts` — `selectDoctorOkNextStep(maturity)`(순수 분기). established → `vhk work`("이어서 작업"), new → `vhk 시작`(온보딩 유지). all-OK 분기가 `projectMaturity(cwd)` 로 선택.
- `src/commands/status.ts` — `selectStatusNextStep(hasChanges, maturity='established')`. clean+new → `vhk 시작`. 호출부가 `projectMaturity(gitRoot)` 전달. (기본값 established = 하위호환).
- `src/i18n/ko.ts` — `status.nextNewRepoMessage`·`nextNewRepoCursor`(신규 레포 온보딩).
- `tests/project-maturity.test.ts` — 분류 3 + doctor 2 + status 4(established/new/diff/하위호환 9케이스).
- `scripts/check-goal-84.mjs` · `goals/84` DONE · `goals/README.md` 재생성.

## 검증
- 라이브: 이 레포(396+커밋) `vhk doctor` → "환경 점검 통과 — 이어서 작업하세요 / vhk work"(구 "프로젝트를 시작하세요" 제거).
- `pnpm build` OK · 전체 **1791 pass**(신규 9) · check-goal-84 고유검증 16 ✓.
- 진단 항목 자체 변경 0(next-step 분기만 — Forbidden) · 신규 레포 온보딩 보존(퇴행 0).

## 교훈
- **맥락 판정은 순수함수로 분리**: `classifyMaturity`(신호→분류)를 IO(`gatherMaturitySignals`)에서 떼니 신규/기존/경계를 git 없이 단위 테스트로 고정 가능. 출력 선택도 `selectDoctorOkNextStep`/`selectStatusNextStep` 순수화 → 분기 회귀를 콘솔 캡처 없이 단언.
- **게이트 스크립트 regex 는 주석 단어에 오탐**: `!/execSync/` 가 "신규 execSync 없음" 주석을 호출로 오인 → `execSync\(`(실제 호출)로 좁힘. 문자열 매칭 게이트는 단어 경계·구두점까지 봐야.
- **카드 premise 검증**: status 가 D9 라던 카드는 과장(실제 `goal next`) — 선조사로 doctor 핵심·status 보강으로 정확히 범위 잡음(goal 81/82/83 선례 일관).

## 적대 리뷰 반영 (12-에이전트, 3렌즈+반증, 에이전트 read-only 명시)
- D9 핵심(396커밋 온보딩) 견고 확인 — 임계=5·parseInt 엣지·Forbidden 전부 반증 통과. confirmed 2 = 일관성.
- **minor 반영(앵커 통일)**: doctor=`projectMaturity(cwd)`, status=`projectMaturity(gitRoot)` 였음 → 서브디렉터리(루트 context.md + 커밋<5)에서 두 명령이 신규/기존 다르게 판정. **status 도 cwd 로 통일**(context.md 가 cwd 기준 기록 + status.ts 의 기존 주석도 cwd 권장). commitCount 는 git 이 루트 해석이라 무관.
- **nit 반영(i18n)**: doctor established 멘트가 하드코딩(status 는 t() 사용)이라 헌법 "ko.ts 메시지 필수"와 어긋남 → `ko.doctor.nextEstablishedMessage`·`nextEstablishedCursor` 키로 추출.
- 결과: 전체 1791 pass · check-goal-84 16 ✓ · `vhk doctor` 라이브 동일("이어서 작업하세요 / vhk work").

## 다음
- P2 도그푸딩(goal 82~84) 완료. 남은 미완: goal 62(docs-diff)·65(precommit-l2)·73(check --evals). 우선순위 2 measure-first(recall@5 라벨링·diff-cover 누적) 대기. 우선순위 1 publish v2.6.0(사용자 2FA).
