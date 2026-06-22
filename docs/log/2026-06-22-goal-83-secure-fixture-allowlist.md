# 2026-06-22 — Goal 83: 보안 scan 테스트 픽스처 false positive (MEDIUM→INFO 강등)

> append-only. 추가만, 수정·삭제 금지.

## 한 일
- **Goal 83 DONE** — `vhk secure` 가 테스트 픽스처(가짜 토큰)의 MEDIUM 발견을 **INFO 로 강등**해 false positive 노이즈 제거(RFC 0053 §4 D7). 비개발자가 "유출됐나?" 놀라던 거짓 경보 해소.

## 변경 (산출물 포인터)
- `src/lib/secret-patterns.ts` — `SecretSeverity` 에 `'info'` 추가(컨텍스트 강등 신호).
- `src/lib/scan-secrets.ts`
  - `isTestFixturePath(file)` — tests?/·__tests__·__mocks__·fixtures?/·__fixtures__·*.test.*·*.spec.* 식별(Windows 역슬래시 정규화, 'latest' 부분문자열 오탐 방지 경계).
  - `downgradeTestFixtureFindings(findings)` — 순수함수. 픽스처 경로 + `medium` 만 → `info`. critical/high 위치 무관 유지(약화 금지). **제거가 아닌 강등**(INFO 로 노출 = 신호 보존).
- `src/commands/secure.ts` — 강등 적용 + INFO 그룹 렌더("테스트 픽스처/예시 토큰 — 유출 아님") + 요약 INFO 카운트.
- `tests/scan-secrets.test.ts` — Goal 83 6케이스(경로식별/MEDIUM→info/소스 MEDIUM 유지/CRITICAL 유지/제거안함/filterSevere 불변).
- `scripts/check-goal-83.mjs` · `goals/83` DONE · `goals/README.md` 재생성.

## 검증
- `vhk secure` 라이브: 원래 false positive(`tests/property-parsers.test.ts:31 JWT`)가 `· INFO — 1건 (테스트 픽스처 — 유출 아님)`, CRITICAL/HIGH/MEDIUM 0.
- `pnpm build` OK · 전체 **1782 pass**(신규 6) · check-goal-83 고유검증 13 ✓.
- **게이팅 불변 확인**: verify·save·mcp 는 `filterSevereFindings`(critical/high)만 사용 → medium/info 무시. preflight·check 는 자체 severity 타입(무관). 즉 `info` 추가가 exit/차단 로직에 영향 0.

## 교훈
- **false positive 강등은 "제거" 아니라 "INFO 노출"**: 숨기면(allowlist 제거) 진짜 유출을 가릴 위험(Forbidden). INFO 로 라벨링해 노출하면 신호는 보존하되 경보는 끈다 — 비개발자에게 "유출 아님"을 분명히.
- **컨텍스트 강등은 medium 한정**: critical/high(AWS·private key·gh token)는 픽스처여도 약화 안 함 — 그런 포맷은 테스트에도 두면 안 되니까. 강등 범위를 medium 으로 좁혀 Forbidden(약화 0) 충족.
- **새 enum 값 추가 전 게이팅 소비처 전수 확인**: `filterSevereFindings`(critical/high)가 단일 게이팅 통로라 `info` 추가가 안전했음 — 추가 전 grep 으로 medium 을 직접 보는 소비처 0 확인.

## 적대 리뷰 반영 (10-에이전트, 3렌즈+반증, 에이전트 read-only 명시)
- **보안 약화 0**(security 렌즈 findings 전부 반증 기각 — 강등 medium 한정·게이팅(filterSevereFindings) 무관·강등=제거 아님). confirmed 3 = 문서 2 + UX 1.
- **minor(핵심 UX) 반영**: 전부 INFO여도 요약 "총 N건 감지"가 빨강 + "유출 키 즉시 폐기" 조치안내가 떠 카드가 없애려던 *놀람*이 잔존 → 진짜 신호(critical/high/medium) 0이고 info만이면 **회색 총계 + "✅ 실제 유출 신호 없음 — INFO는 테스트 픽스처" + 조치안내 생략**. 라이브 확인됨.
- **nit 반영**: JSDoc "JWT·generic 등" 오기(generic-api-key 는 high라 강등 안 됨) → "현재 medium 패턴은 JWT 단 하나" 정정. + 카드에 픽스처 실범위(fixtures/·__mocks__가 tests/**보다 넓음, 의도적) 명시.
- 결과: 전체 1782 pass · check-goal-83 ✓ · `vhk secure` 픽스처 결과가 회색·안심 톤.
- 운영 노트: 이번 리뷰 워크플로는 에이전트에 **READ-ONLY 명시**(git/vhk save 금지) — goal 82 때 리뷰 에이전트가 `vhk save` 정크 커밋 만든 사고 재발 방지.

## 다음
- P2 마지막: goal 84(doctor/status next-step 맥락 인지 — 신규 vs 기존 레포 분기).
