#!/usr/bin/env bash
# Run EnclosureIQ locally: wraps index.html (written for the claude.ai artifact host, which adds
# the <html>/<head> skeleton) into dev.html and serves the folder at http://localhost:8765/dev.html
set -euo pipefail
cd "$(dirname "$0")/.."
{
  printf '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
  printf '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui}img{max-width:100%%}[hidden]{display:none!important}</style></head><body>'
  cat index.html
  printf '</body></html>'
} > dev.html
echo "Serving on http://localhost:${PORT:-8765}/dev.html"
python3 -m http.server "${PORT:-8765}"
