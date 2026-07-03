---
패턴명: Bash 툴에서 PowerShell here-string @'...'@ 사용 → 명령 인자 오염
카테고리: env
출처프로젝트: VHK (vhk-cli)
태그: [bash, PowerShell, here-string, heredoc, git-commit, shell, AI-agent]
발견일: 2026-06-03
출처DevLog: Notion Dev Log `vhk-til-bash-tool-pwsh-heredoc`
---

# 패턴: 셸 종류와 쿼팅 문법 불일치 — bash 에서 PowerShell here-string 쓰면 인자 오염

## 증상

Windows(PowerShell 기본 환경)에서 작업하던 흐름대로 멀티라인 `git commit` 을 **bash 셸**에 PowerShell here-string `@'...'@` 로 넣었더니, 커밋 메시지가 깨졌다.

```text
$ git log -1 --format='%B'
@                       ← subject 가 @ 한 글자
fix(cli): 글로벌/심링크 ...
...본문...
@                       ← 끝에 @ 또 붙음
```

`git log --oneline` 에 `@ fix(cli): ...` 처럼 보이고, 실제 의도한 제목은 본문으로 밀린다.

## 원인

**환경이 "PowerShell"이라도, 에이전트의 Bash 툴은 실제 `bash` 를 실행한다.** PowerShell here-string `@'...'@` 는 PowerShell 전용 문법 — bash 에는 그런 구문이 없다.

```bash
# bash 입장에서 이건 here-string 이 아니라:
git commit -m @'
fix(cli): ...
'@
#   -m 의 값 = "@\nfix(cli): ...\n"  (@ 는 그냥 리터럴 문자)
#   끝의 '@ = 닫는 작은따옴표(@'...') + 리터럴 @
```

→ 커밋 subject 가 `@`, 본문 끝에 `@` 가 붙는다.

## 해결

**셸 종류에 맞는 쿼팅을 쓴다.**

- **Bash 툴** 멀티라인 커밋 → 다중 `-m` 플래그(heredoc 회피가 글로벌 규칙일 때):

```bash
git commit -m "fix(cli): isMainModule realpath 정규화" \
           -m "심링크/글로벌 실행에서 main 미동작 픽스. 761 pass." \
           -m "Co-Authored-By: ..."
```

- **진짜 PowerShell here-string** 이 필요하면 → **PowerShell 툴**로 실행:

```powershell
git commit -m @'
fix(cli): ...
본문 ...
'@
```

## 핵심 원리

**도구(셸 실행기)와 문법은 짝이다.** "내 환경은 PowerShell"이라는 사실과 "지금 호출하는 툴이 무엇을 실행하는가"는 다른 차원 — 후자가 인자 파싱을 결정한다. 멀티라인/특수문자 인자를 넘기기 전에 *이 호출이 bash 인가 pwsh 인가*부터 확인.

## 적용 조건

- ✅ Windows + AI 에이전트(Claude Code 등)에서 bash 툴과 PowerShell 툴을 둘 다 쓰는 경우
- ✅ 커밋 메시지·PR 본문 등 멀티라인 문자열을 native 명령에 넘길 때
- ❌ 단일 라인 + 특수문자 없는 인자(셸 무관하게 안전)
- ⚠️ 이미 잘못 커밋했고 **머지된 히스토리**면, subject 의 `@` 같은 cosmetic 결함은 `force-push` 위험(발산) > 이득 → 방치가 정답. 머지 전이면 `git commit --amend` 로 정정.

## 검증

커밋 직후 `git log -1 --format='%s'`(subject 만) 로 의도한 제목이 첫 줄인지 확인. `@` 나 따옴표 잔재가 보이면 amend(미머지 한정).

## 참고

- VHK v2.0.1 잔재 정리 중 커밋 2건(`c2796ee`·`c588f06`) subject 오염 — 이미 main 머지돼 방치(코드/CHANGELOG 내용은 정상).
- 관련 패턴: [env-windows-cmd-shim-node20.md](./env-windows-cmd-shim-node20.md) — Windows 셸/실행 호환 시리즈
