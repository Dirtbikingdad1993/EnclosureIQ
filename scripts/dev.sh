#!/usr/bin/env bash
# Run EnclosureIQ locally at http://localhost:8765/ (same build the website uses).
set -euo pipefail
cd "$(dirname "$0")/.."
./scripts/build-site.sh
echo "Serving on http://localhost:${PORT:-8765}/"
cd _site && python3 -m http.server "${PORT:-8765}"
