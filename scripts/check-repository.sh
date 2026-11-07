#!/usr/bin/env sh
set -eu

if git diff --cached --name-only | grep -E '(^|/)(\.env($|\.)|.*(secret|credential|private[-_]?key).*)' >/dev/null 2>&1; then
  echo "refusing staged files that look like secrets" >&2
  exit 1
fi

git diff --cached --check
