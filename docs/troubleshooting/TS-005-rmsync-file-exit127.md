# TS-005 — rmSync(파일)이 silent exit 127 (이 Node 환경)

> 출처: #353 resume exit 127 런타임 디버깅(2026-06-23). 확장: 노트북 재현(2026-07-02).

## 증상
`rmSync(파일경로, …)` 가 이 환경(Windows/Node)에서 **에러도 stderr 도 없이 exit 127** 로 프로세스를 즉시 죽인다. `unlinkSync` 는 정상 동작.

**확장(2026-07-02, 노트북 · Node v24.13.0)**: 파일뿐 아니라 **디렉토리 `rmSync(dir,{recursive,force})` 도 동일 재현** — `node -e` 한 줄로 결정적, Claude Code 샌드박스 해제 여부 무관. 이 때문에 tmp+rmSync cleanup 패턴을 쓰는 **vitest 테스트의 워커가 즉사**("Worker exited unexpectedly", 이 머신에서 기존 스위트 실행 불가 — CI 로 검증). 우회 = unlink+rmdir 재귀(`tests/watch.test.ts` `rmTree()` 참조).

## 발견 경로
`vhk resume --confirm` 이 `▶️ HARD_STOP 해제` 출력 후 exit 127, HARD_STOP 미해제(#353). 정적 분석 실패 → tsx 격리 디버깅:
1. resume() 직접 호출 → `📋 사유`(L88) 후 죽음 → `clearHardStop`(L102) 의심
2. clearHardStop 격리 → `B about to clearHardStop` 후 exit 127 → 내부 `rmSync` 의심
3. rmSync 옵션별 격리 → `unlinkSync` OK · `rmSync(file)` (옵션 없음·`{force}`·`{recursive,force}` 모두) **exit 127**

## 원인
미상(Node 코어 rmSync 의 파일 삭제 경로가 이 환경에서 silent 127). 재현은 결정적: `rmSync(<파일>)` 한 줄로 즉사.

## 조치
- ✅ **clearHardStop**(state-files.ts:115): `rmSync` → `unlinkSync` (#353 — resume 해제 복구).
- ⚠️ **파일 rmSync 잔여(후속 점검)**: `atomic-write.ts:24` `rmSync(tmp,{force})`(atomicWriteFile 실패 cleanup — 평소 미실행이나 탈 시 exit 127 위험) · `mission.ts:234` `rmSync(p)`(mission clear). 둘 다 `unlinkSync` 권장.
- ⚠️ **디렉토리 rmSync**(backup.ts:148·migrate.ts:87, `{recursive,force}`): 2026-07-02 노트북에서 **재현 확인** — 별개 아님. 해당 경로 밟는 머신에선 exit 127 위험 → unlink+rmdir 재귀 교체 후속 권장.

## 패턴 (회귀 방지)
- **파일 삭제 = `unlinkSync`**(존재 불확실하면 `existsSync` 가드). **디렉토리 = unlink+rmdir 재귀**(2026-07-02 확장 재현으로 rmSync 디렉토리도 금지 대상 — `tests/watch.test.ts` `rmTree()` 패턴).
- 신규 `rmSync` 금지(파일·디렉토리 모두).
