#!/usr/bin/env bash
# Sync the PUD map into the static site repo and preview it before pushing.
#
#   tools/deploy_site.sh          # sync + preview server
#   tools/deploy_site.sh --push   # sync, commit and push
#
# The map is plain static files, so it lives at <site>/pudmap/ and is served
# at https://<domain>/pudmap/ with no build step. data/us_counties.geojson is
# a 3 MB build input for the territory generator and is deliberately excluded —
# the site only needs the generated boundaries.geojson (112 KB).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE="${PUD_SITE_REPO:-$HOME/dev/yucombinator.github.io}"
DEST="$SITE/pudmap"
PORT="${PUD_SITE_PORT:-8849}"

if [[ ! -d "$SITE/.git" ]]; then
  echo "site repo not found at $SITE" >&2
  exit 1
fi

mkdir -p "$DEST"
rsync -a --delete \
  --exclude '.git/' \
  --exclude '__pycache__/' \
  --exclude 'data/us_counties.geojson' \
  --exclude 'tools/deploy_site.sh' \
  "$HERE/" "$DEST/"

echo "synced $(du -sh "$DEST" | cut -f1) -> $DEST"

# the calling card links to /pudmap/; make sure it is still there
if ! grep -q 'href="/pudmap/"' "$SITE/index.html"; then
  echo "note: $SITE/index.html has no /pudmap/ link — add one to the calling card"
fi

if [[ "${1:-}" == "--push" ]]; then
  git -C "$SITE" add pudmap index.html
  git -C "$SITE" commit -m "Add WA electric rate map at /pudmap/"
  git -C "$SITE" push origin "$(git -C "$SITE" branch --show-current)"
  echo "pushed"
else
  echo "preview: python3 -m http.server $PORT --directory $SITE"
  echo "  http://127.0.0.1:$PORT/        (calling card)"
  echo "  http://127.0.0.1:$PORT/pudmap/ (the map)"
fi
