#!/usr/bin/env bash
# scripts/check-goal-1.sh — Goal 1 (vhk goal 명령어) gate.
#
# Mirrors goals/1-goal-command.md "Completion Check".
# Pre-conditions:
#   - goals/_meta.md gates pass (delegated to scripts/check-meta.sh)
# Goal-local claims:
#   G1.1  src/commands/goal.ts exports init/list/next/check/done
#   G1.2  src/lib/goal-frontmatter.ts present + tests
#   G1.3  vhk goal list 실행 시 본 레포의 goals/ 4 항목 (id 0/1/2 + _meta 제외) 출력
#   G1.4  check --goal <id> 옵션이 src/index.ts 에 등록됨
#   G1.5  COMMANDS.md + README.md 에 goal 명령어 반영

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f ".vhk/HARD_STOP" ]; then
  echo "🛑 .vhk/HARD_STOP detected — refusing to run goal 1 gate."
  exit 1
fi

echo "[goal 1] running _meta gate first"
if ! bash "$ROOT/scripts/check-meta.sh"; then
  echo "    ✗ _meta failed — fix cross-cutting gates first"
  exit 1
fi

PASS=true
GOAL_FILE="src/commands/goal.ts"
LIB_FILE="src/lib/goal-frontmatter.ts"
TEST_FILES=("tests/goal.test.ts" "tests/goal-frontmatter.test.ts")

# ─── G1.1 goal.ts exports ───────────────────────────────────────────────
echo "[G1.1] src/commands/goal.ts exports init/list/next/check/done"
if [ ! -f "$GOAL_FILE" ]; then
  echo "    ✗ $GOAL_FILE missing"
  PASS=false
else
  MISSING=()
  for fn in goalInit goalList goalNext goalCheck goalDone; do
    if ! grep -E "^export (async )?function $fn\b" "$GOAL_FILE" >/dev/null 2>&1; then
      MISSING+=("$fn")
    fi
  done
  if [ "${#MISSING[@]}" -eq 0 ]; then
    echo "    ✓ pass (5 functions exported)"
  else
    echo "    ✗ missing exports: ${MISSING[*]}"
    PASS=false
  fi
fi

# ─── G1.2 frontmatter parser + tests ────────────────────────────────────
echo "[G1.2] src/lib/goal-frontmatter.ts + tests present"
if [ ! -f "$LIB_FILE" ]; then
  echo "    ✗ $LIB_FILE missing"
  PASS=false
else
  MISSING_TESTS=()
  for tf in "${TEST_FILES[@]}"; do
    if [ ! -f "$tf" ]; then MISSING_TESTS+=("$tf"); fi
  done
  if [ "${#MISSING_TESTS[@]}" -eq 0 ]; then
    echo "    ✓ pass (lib + 2 test files)"
  else
    echo "    ✗ missing tests: ${MISSING_TESTS[*]}"
    PASS=false
  fi
fi

# ─── G1.3 goal list smoke (본 레포 goals/ id 0/1/2 출력) ────────────────
echo "[G1.3] node dist/index.js goal list 가 id 0/1/2 출력"
if [ ! -f "dist/index.js" ]; then
  echo "    ⊘ skipped (dist/ 없음 — _meta build 단계에서 생성됨)"
else
  OUT=$(node dist/index.js goal list 2>&1 || true)
  if echo "$OUT" | grep -q "\[ 0\]" && echo "$OUT" | grep -q "\[ 1\]" && echo "$OUT" | grep -q "\[ 2\]"; then
    echo "    ✓ pass (id 0/1/2 모두 출력)"
  else
    echo "    ✗ fail — goal list 출력에 id 0/1/2 누락"
    PASS=false
  fi
fi

# ─── G1.4 check --goal 옵션 등록 ────────────────────────────────────────
echo "[G1.4] src/index.ts 에 check --goal 옵션 등록"
if grep -E "option\('--goal" src/index.ts >/dev/null 2>&1; then
  echo "    ✓ pass"
else
  echo "    ✗ fail — check --goal 옵션 미등록"
  PASS=false
fi

# ─── G1.5 문서 반영 ─────────────────────────────────────────────────────
echo "[G1.5] COMMANDS.md + README.md 에 goal 명령 반영"
DOC_FAIL=()
if [ -f "COMMANDS.md" ] && ! grep -E "vhk goal" COMMANDS.md >/dev/null 2>&1; then
  DOC_FAIL+=("COMMANDS.md")
fi
if [ -f "README.md" ] && ! grep -E "vhk goal" README.md >/dev/null 2>&1; then
  DOC_FAIL+=("README.md")
fi
if [ "${#DOC_FAIL[@]}" -eq 0 ]; then
  echo "    ✓ pass"
else
  echo "    ✗ fail — 문서 누락: ${DOC_FAIL[*]}"
  PASS=false
fi

if [ "$PASS" = true ]; then
  echo "✅ goal 1 gate passes"
  exit 0
fi

echo "❌ goal 1 gate failed"
exit 1
