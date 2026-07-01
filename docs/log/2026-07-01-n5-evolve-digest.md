# 2026-07-01 — N5 vhk evolve digest (ⓓ)

## 무엇·왜
- ⓓ: evolve apply 수동 → **자동 apply 배제(철칙)**. 대신 pending 룰 후보를 **신뢰도별 묶음 초안**으로 출력해 사람 PR 검토 비용↓. RULES.md 미변경.

## 구현
- `evolve.ts`: `buildDigest(pending, patterns)` 순수 — patternId→pattern.count 조인으로 **신뢰도(5+=high·3~4=med·<3=low)** 부여, 빈도 내림차순(동률 id 오름차순). `evolveDigest` 핸들러 = readQueue + loadForMutation(비영속·읽기전용, loop 계약 동일) → 신뢰도 그룹 렌더.
- **철칙**: 자동 apply 0, RULES 미변경 — digest 는 PR 초안 복사용. 반영은 `evolve apply` 사람 승인.
- 등록: index evolve **서브명령** `digest` + command-registry **CONTAINER allowlist**(digest) + ko evolve.digest* + COMMANDS.

## 검증
- TDD: evolve-digest.test.ts 5(신뢰도 매핑·경계 5/4/2·패턴미상 0·정렬·빈입력).
- **스모크가 CONTAINER 드리프트 포획**: `vhk evolve digest` 실행 시 "서브커맨드 아님"(command-registry allowlist 누락) → 추가 후 실동작. (N1 KNOWN 교훈과 동형 — 통합 스모크 필수.)
- 전체 2138 green · typecheck 무에러.

## 적대리뷰 반영 (Workflow 3다이멘션: 6발견 → 4반증·1확정·1유보. 철칙 위반 0)
- **[확정 med→low] digest 한글 별칭 누락**: 형제 6개(제안/부정예시/목록/반영/기각/되돌리기)는 `.alias()` 있는데 digest만 없음 → CLAUDE.md "한글 별칭 필수" 위반 + 드리프트 가드 미포착. → **`.alias('묶음')` 추가**(형제 대칭).
- **[유보 low] tie-break 사전순**: 동률 시 `localeCompare`가 e10을 e2보다 앞에 → `{numeric:true}`로 숫자순 수정 + 회귀가드 테스트.
- **철칙 검증 통과**: 자동 apply 0·RULES 미변경·읽기전용(loadForMutation 비영속) 전부 확인.

### 🔧 선재 버그 발견 (N5 무관·별도 후속)
- **evolve 한글 서브별칭 전부 CLI 차단**: CONTAINER 가드(`cli-args.ts:259`)가 command-registry 영문 allowlist만 검사 → `vhk evolve 제안`·`묶음` 등 **모든** 한글 서브별칭이 "서브커맨드 아님"으로 거부(스모크 확인). 형제도 동일하게 죽어있는 선재 결함. digest 추가와 무관하나 발견 기록 — 후속 수정 시 전 컨테이너(goal·evolve·seo) allowlist에 한글 별칭 합류 필요(광범위 영향이라 별도 PR).

## 다음
- **복리 척추 5개(N2·N7·N6·N1·N4) 완성 + N5(ⓓ) 마감.** 후속 후보: ⚠️evolve 한글 서브별칭 가드 수정(선재)·N11 evolve-nudge hook·measure-first(Recall@5)·v2.8.0 발행.
