# TS-005 — rmSync 가 비ASCII 경로에서 프로세스를 죽이거나 조용히 건너뛴다

> 출처: #353 resume exit 127 런타임 디버깅(2026-06-23). 확장: 노트북 재현(2026-07-02).
> **원인 규명: 2026-08-16** — 그전까지 "원인 미상 · 이 머신 특정"으로 남아 있던 것을 비ASCII 경로로 특정.

## 증상

`rmSync` 가 에러도 stderr 도 없이 프로세스를 즉사시킨다. Git Bash 는 exit 127 로 보고하지만
실제 종료 코드는 `0xC0000409`(STATUS_STACK_BUFFER_OVERRUN, 네이티브 fast-fail)다.
try-catch 로 잡히지 않는다 — 프로세스 자체가 사라진다.

tmp 디렉터리 + rmSync cleanup 패턴을 쓰는 vitest 테스트에서는 워커가 통째로 죽어
`Worker exited unexpectedly` 로 나타났고, 이 머신에서 스위트 실행 자체가 불가능했다(TS-004 와 같은 뿌리).

## 원인 — 경로의 비ASCII 문자

Windows + Node v24.13.0 에서 `fs.rmSync` 는 경로에 비ASCII(예: 한글) 문자가 있으면 두 갈래로 깨진다.
argv 인코딩을 배제한 실측(경로 리터럴을 UTF-8 파일에 박아 자식 프로세스로 실행):

| 경로 | `rmSync(recursive)` | `fs.promises.rm(recursive)` |
|---|---|---|
| 전 구간 ASCII | exit 0 · 삭제됨 | 삭제됨 |
| 이름에만 비ASCII | exit 0 · **삭제 안 됨**(조용한 실패) | 삭제됨 |
| 상위 경로에 비ASCII | **exit 0xC0000409 즉사** | 삭제됨 |
| `os.tmpdir()`(한글 사용자명) | **exit 0xC0000409 즉사** | 삭제됨 |

`unlinkSync`·`rmdirSync`(비재귀)는 같은 경로에서 정상이다. 비동기 `fs.promises.rm` 도 정상이다.
즉 동기 재귀 삭제 경로만의 문제다.

**사용자 영향:** Windows 사용자명이 한글이면 홈·임시 디렉터리 경로가 전부 여기 해당한다.
그런 사용자에게는 VHK 가 아무 메시지 없이 죽는다. CI 는 경로가 전부 ASCII 라 초록으로 남아
증상이 "로컬만 빨강"으로 오해됐다.

## 발견 경로

1. `vhk resume --confirm` 이 `▶️ HARD_STOP 해제` 출력 후 exit 127(#353) → `clearHardStop` 내부 `rmSync` 로 좁힘
2. 2026-07-02 디렉터리 `rmSync` 도 동일 재현 확인, 원인은 미상으로 남김
3. 2026-08-16 Git Bash 의 exit 127 이 실제로는 `0xC0000409` 임을 PowerShell 로 확인 →
   ASCII/비ASCII 경로 대조 매트릭스로 트리거 특정 → 임시 디렉터리를 ASCII 로 바꾸자 스위트 3,000+ 건 통과

## 조치

- ✅ 공용 헬퍼 `src/lib/fs-remove.ts` — `removeFileSync`(unlink) · `removeDirSync`(unlink+rmdir 재귀)
- ✅ 제품 코드 교체: `backup.ts`(pruneBackups) · `migrate.ts`(node_modules 정리) ·
  `atomic-write.ts`(실패 cleanup) · `mission.ts`(mission clear) · `test-support/isolated-home.ts`
- ✅ 회귀 가드 `scripts/check-rule-no-rm-sync.mjs` — RULES.md 규칙에 `vhk:check=no-rm-sync` 로 연결
- ✅ `clearHardStop`(state-files.ts): `rmSync` → `unlinkSync` (#353, 2026-06-23)

## 패턴 (회귀 방지)

- **`fs.rmSync` 신규 사용 금지**(파일·디렉터리 모두). 파일은 `removeFileSync`, 디렉터리는 `removeDirSync`.
- 새 코드가 경로를 만들 때 사용자 홈·임시 경로에 비ASCII 가 섞일 수 있다고 가정한다. ASCII 를 전제하지 않는다.
- **로컬 개발 우회**: 임시 디렉터리를 ASCII 경로로 지정하면 스위트가 정상 동작한다.
  PowerShell 기준 `$env:TEMP='C:\vhk-test-tmp'; $env:TMP='C:\vhk-test-tmp'` 후 `pnpm test:run`.
