#!/usr/bin/env bash
# Build the standalone website into _site/.
# index.html is written for the claude.ai artifact host, which supplies the <html>/<head> skeleton;
# this wraps it in a full document for the website (Vercel, or any static host) and copies the assets.
# The AI server (api/) is not part of _site: Vercel deploys it as a function from the project root.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf _site && mkdir -p _site
{
  printf '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">\n'
  printf '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
  printf '<meta name="description" content="Design subwoofer enclosures for your car or truck: sub, amp and vehicle libraries, acoustic simulation, 360-degree box view and build plans.">\n'
  printf '<link rel="icon" href="data:image/svg+xml,%%3Csvg xmlns=%%27http://www.w3.org/2000/svg%%27 viewBox=%%270 0 32 32%%27%%3E%%3Crect x=%%273%%27 y=%%275%%27 width=%%2726%%27 height=%%2722%%27 rx=%%272%%27 fill=%%27none%%27 stroke=%%27%%23222%%27 stroke-width=%%272.4%%27/%%3E%%3Ccircle cx=%%2714%%27 cy=%%2716%%27 r=%%277%%27 fill=%%27none%%27 stroke=%%27%%23d9480f%%27 stroke-width=%%272.4%%27/%%3E%%3C/svg%%3E">\n'
  printf '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui}img{max-width:100%%}[hidden]{display:none!important}</style>\n'
  printf '</head><body>\n'
  cat index.html
  printf '\n</body></html>\n'
} > _site/index.html
cp -R js data img _site/
touch _site/.nojekyll
echo "Built _site/ ($(find _site -type f | wc -l | tr -d ' ') files)"
