# TS-005 — rmSync(파일)이 silent exit 127 (이 Node 환경)

> 출처: #353 resume exit 127 런타임 디버깅(2026-06-23).

## 증상
`rmSync(파일경로, …)` 가 이 환경(Windows/Node)에서 **에러도 stderr 도 없이 exit 127** 로 프로세스를 즉시 죽인다. `unlinkSync` 는 정상 동작.

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
- ❓ **디렉토리 rmSync**(backup.ts:148·migrate.ts:87, `{recursive,force}`): rmdir 계열이라 별개일 수 있음 — 미검증, 후속 확인.

## 패턴 (회귀 방지)
- **파일 삭제 = `unlinkSync`**(존재 불확실하면 `existsSync` 가드). 디렉토리 = `rmSync(dir,{recursive})` (검증 후).
- 신규 `rmSync(<파일>)` 금지.
