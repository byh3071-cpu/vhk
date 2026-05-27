#!/usr/bin/env bash
# scripts/check-meta.sh — VHK cross-cutting meta gate.
#
# Mirrors goals/_meta.md. Runs the universal claims that apply to every
# numeric goal:
#   M.1  tsc --noEmit clean
#   M.2  pnpm test:run passes
#   M.3  pnpm build produces dist/index.js + dist/mcp/index.js
#
# Env:
#   VHK_GATES_SKIP_DEEP=1   skip M.2 (tests) + M.3 (build) for fast iter
#   VHK_GATES_SKIP_META=1   skip the entire suite (CI runs steps explicitly)

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ "${VHK_GATES_SKIP_META:-}" = "1" ]; then
  echo "[meta] skipped (VHK_GATES_SKIP_META=1)"
  exit 0
fi

# Hard stop short-circuit. If a previous run tripped HARD_STOP, refuse to
# pretend gates are green.
if [ -f ".vhk/HARD_STOP" ]; then
  echo "🛑 .vhk/HARD_STOP detected — run 'vhk resume --confirm' before re-checking."
  exit 1
fi

PASS=true
LOG_DIR="$(mktemp -d 2>/dev/null || echo .vhk-meta-logs)"
mkdir -p "$LOG_DIR"

# ─── M.1 TypeScript clean ───────────────────────────────────────────────
echo "[M.1] tsc --noEmit"
TSC_LOG="$LOG_DIR/tsc.log"
if pnpm exec tsc --noEmit >"$TSC_LOG" 2>&1; then
  echo "    ✓ pass"
else
  echo "    ✗ fail — see $TSC_LOG"
  PASS=false
fi

# ─── M.2 vitest ────────────────────────────────────────────────────────
echo "[M.2] pnpm test:run"
if [ "${VHK_GATES_SKIP_DEEP:-}" = "1" ]; then
  echo "    ⊘ skipped (VHK_GATES_SKIP_DEEP=1)"
else
  TEST_LOG="$LOG_DIR/vitest.log"
  if pnpm test:run >"$TEST_LOG" 2>&1; then
    echo "    ✓ pass"
  else
    echo "    ✗ fail — see $TEST_LOG"
    PASS=false
  fi
fi

# ─── M.3 tsup build ────────────────────────────────────────────────────
echo "[M.3] pnpm build"
if [ "${VHK_GATES_SKIP_DEEP:-}" = "1" ]; then
  echo "    ⊘ skipped (VHK_GATES_SKIP_DEEP=1)"
else
  BUILD_LOG="$LOG_DIR/build.log"
  if pnpm build >"$BUILD_LOG" 2>&1; then
    if [ -f "dist/index.js" ] && [ -f "dist/mcp/index.js" ]; then
      echo "    ✓ pass"
    else
      echo "    ✗ fail — dist artifacts missing"
      PASS=false
    fi
  else
    echo "    ✗ fail — see $BUILD_LOG"
    PASS=false
  fi
fi

if [ "$PASS" = true ]; then
  echo "✅ _meta gates pass"
  exit 0
fi

echo "❌ _meta gates failed — logs in $LOG_DIR"
exit 1
