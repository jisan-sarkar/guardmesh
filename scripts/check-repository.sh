#!/usr/bin/env sh
set -eu

git diff --cached --name-only | while IFS= read -r file; do
  case "$file" in
    ".env.example") ;;
    ".env"|*/.env|.env.*|*/.env.*|*secret*|*credential*|*private-key*|*private_key*)
      echo "refusing staged file that looks like a secret: $file" >&2
      exit 1
      ;;
  esac
done

git diff --cached --check
