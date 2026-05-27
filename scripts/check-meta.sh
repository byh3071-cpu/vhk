#!/usr/bin/env bash
# Thin POSIX wrapper — 실제 로직은 cross-platform 인 check-meta.mjs 에 있음.
# 이 파일을 직접 편집하지 말 것. 게이트 로직 변경은 check-meta.mjs 에서.
exec node "$(dirname "$0")/check-meta.mjs" "$@"
