# TIL (Today I Learned)

- [2026-05-23] 프로젝트 시작
- [2026-05-24] Node 20.12+ CVE-2024-27980로 Windows `.cmd` shim은 `execFileSync` 직접 호출 거부 — `cmd.exe /d /s /c` 래핑 필요
- [2026-05-24] CLI 도구 버전은 `commander.version('x.y.z')` 리터럴 대신 런타임 `package.json` read로 single source of truth 유지
- [2026-05-24] npm 2FA OTP/Web 인증은 `stdio: inherit` 필수 — spinner는 stdin 점유로 충돌, 인터랙티브 단계 직전 끄기
- [2026-05-24] subagent-driven-development로 11 task v0.8.0 출시 — fresh subagent + 2단계 review가 quality gate로 효과적
