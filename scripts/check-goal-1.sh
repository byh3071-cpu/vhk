#!/usr/bin/env bash
# Thin POSIX wrapper — 실제 로직은 check-goal-1.mjs (cross-platform).
# 게이트 로직 변경은 .mjs 에서.
exec node "$(dirname "$0")/check-goal-1.mjs" "$@"
