#!/usr/bin/env bash
# scripts/check-goal-2.sh — Goal 2 (자율 루프) gate.
#
# Mirrors goals/2-agent-loop.md "Completion Check".
# Pre-conditions:
#   - goals/_meta.md gates pass (delegated to scripts/check-meta.sh)
# Goal-local claims:
#   G2.1  src/commands/agent.ts exports blocker / learn / resume
#   G2.2  src/lib/state-files.ts + tests/state-files.test.ts + tests/agent.test.ts 존재
#   G2.3  vhk context 가 active goal + recent learnings 섹션 포함
#         (tests/context-loop.test.ts 가 검증)
#   G2.4  src/index.ts 에 3 명령 (blocker / learn / resume) 등록 + --confirm 옵션
#   G2.5  AGENTS.md 작성 + Loop Protocol 섹션 포함

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f ".vhk/HARD_STOP" ]; then
  echo "🛑 .vhk/HARD_STOP detected — refusing to run goal 2 gate."
  exit 1
fi

echo "[goal 2] running _meta gate first"
if ! bash "$ROOT/scripts/check-meta.sh"; then
  echo "    ✗ _meta failed — fix cross-cutting gates first"
  exit 1
fi

PASS=true
AGENT_FILE="src/commands/agent.ts"
LIB_FILE="src/lib/state-files.ts"

# ─── G2.1 agent.ts exports ──────────────────────────────────────────────
echo "[G2.1] src/commands/agent.ts exports blocker / learn / resume"
if [ ! -f "$AGENT_FILE" ]; then
  echo "    ✗ $AGENT_FILE missing"
  PASS=false
else
  MISSING=()
  for fn in blocker learn resume; do
    if ! grep -E "^export (async )?function $fn\b" "$AGENT_FILE" >/dev/null 2>&1; then
      MISSING+=("$fn")
    fi
  done
  if [ "${#MISSING[@]}" -eq 0 ]; then
    echo "    ✓ pass (3 functions exported)"
  else
    echo "    ✗ missing exports: ${MISSING[*]}"
    PASS=false
  fi
fi

# ─── G2.2 lib + tests 존재 ──────────────────────────────────────────────
echo "[G2.2] src/lib/state-files.ts + 관련 테스트 존재"
MISSING=()
[ -f "$LIB_FILE" ] || MISSING+=("$LIB_FILE")
[ -f "tests/state-files.test.ts" ] || MISSING+=("tests/state-files.test.ts")
[ -f "tests/agent.test.ts" ] || MISSING+=("tests/agent.test.ts")
[ -f "tests/context-loop.test.ts" ] || MISSING+=("tests/context-loop.test.ts")
if [ "${#MISSING[@]}" -eq 0 ]; then
  echo "    ✓ pass (lib + 3 tests)"
else
  echo "    ✗ missing: ${MISSING[*]}"
  PASS=false
fi

# ─── G2.3 context 확장 ──────────────────────────────────────────────────
echo "[G2.3] src/commands/context.ts 가 Active Goal + Recent Learnings 출력"
if grep -E "Active Goal" src/commands/context.ts >/dev/null 2>&1 \
   && grep -E "Recent Learnings" src/commands/context.ts >/dev/null 2>&1; then
  echo "    ✓ pass"
else
  echo "    ✗ fail — context.ts 에 두 섹션 키워드 미존재"
  PASS=false
fi

# ─── G2.4 CLI 등록 + --confirm ──────────────────────────────────────────
echo "[G2.4] src/index.ts 에 blocker/learn/resume 등록 + --confirm 옵션"
NEED=()
grep -E "\.command\('blocker " src/index.ts >/dev/null 2>&1 || NEED+=("blocker cmd")
grep -E "\.command\('learn " src/index.ts >/dev/null 2>&1 || NEED+=("learn cmd")
grep -E "\.command\('resume'" src/index.ts >/dev/null 2>&1 || NEED+=("resume cmd")
grep -E "option\('--confirm'" src/index.ts >/dev/null 2>&1 || NEED+=("--confirm option")
if [ "${#NEED[@]}" -eq 0 ]; then
  echo "    ✓ pass"
else
  echo "    ✗ fail — missing: ${NEED[*]}"
  PASS=false
fi

# ─── G2.5 AGENTS.md ─────────────────────────────────────────────────────
echo "[G2.5] AGENTS.md 작성 + Loop Protocol 섹션"
if [ ! -f "AGENTS.md" ]; then
  echo "    ✗ AGENTS.md missing"
  PASS=false
elif ! grep -E "Loop Protocol" AGENTS.md >/dev/null 2>&1; then
  echo "    ✗ AGENTS.md 에 Loop Protocol 섹션 없음"
  PASS=false
else
  echo "    ✓ pass"
fi

if [ "$PASS" = true ]; then
  echo "✅ goal 2 gate passes"
  exit 0
fi

echo "❌ goal 2 gate failed"
exit 1
