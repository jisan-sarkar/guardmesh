#!/usr/bin/env sh
set -eu

if command -v opa >/dev/null 2>&1; then
  opa test packages/guardmesh-policy/policy
elif [ -x /tmp/guardmesh-opa ]; then
  /tmp/guardmesh-opa test packages/guardmesh-policy/policy
else
  echo "OPA CLI is required; install pinned OPA v1.22.2 or set up /tmp/guardmesh-opa" >&2
  exit 1
fi
