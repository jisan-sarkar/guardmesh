#!/usr/bin/env sh
set -eu

base_url="${BASE_URL:-http://127.0.0.1:${TRAEFIK_PORT:-80}}"

command -v curl >/dev/null 2>&1 || { echo "required command not found: curl" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "required command not found: node" >&2; exit 1; }

for service in orders inventory security; do
  body="$(curl --connect-timeout 2 --max-time 10 -fsS "$base_url/api/$service/docs/openapi.json")"
  printf '%s' "$body" | node -e '
    let input = "";
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      const document = JSON.parse(input);
      if (typeof document.openapi !== "string" || Object.keys(document.paths ?? {}).length === 0) {
        process.exit(1);
      }
      console.log(`${document.info.title}: ${Object.keys(document.paths).length} paths`);
    });
  '
done
