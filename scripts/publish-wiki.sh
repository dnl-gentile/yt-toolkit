#!/usr/bin/env bash
#
# Publish docs/wiki/ to the GitHub wiki.
#
# The wiki is a separate git repository. GitHub refuses a push to one that has never
# been initialised, so the first page must be created once in the web UI:
#
#     https://github.com/dnl-gentile/yt-toolkit/wiki  ->  "Create the first page"
#
# Content does not matter — this script overwrites it. After that, this is the only
# way pages should ever change. Editing in the wiki UI gets overwritten.
#
set -euo pipefail

cd "$(dirname "$0")/.."

SRC="docs/wiki"
IMG="docs/media"
WIKI_URL="${WIKI_URL:-https://github.com/dnl-gentile/yt-toolkit.wiki.git}"
WORK=".wiki-publish"

[ -d "$SRC" ] || { echo "missing $SRC" >&2; exit 1; }

if ! ls "$SRC"/*.md >/dev/null 2>&1; then
  echo "no pages in $SRC" >&2
  exit 1
fi

rm -rf "$WORK"

if ! git clone --quiet --depth 1 "$WIKI_URL" "$WORK" 2>/dev/null; then
  cat >&2 <<MSG
Could not clone the wiki repository.

If this is the first publish, the wiki has to be initialised by hand once:

  1. Open https://github.com/dnl-gentile/yt-toolkit/wiki
  2. Click "Create the first page"
  3. Save anything at all — this script overwrites it

Then run this again. (Also check that the wiki is enabled in repository settings.)
MSG
  exit 1
fi

# Wipe tracked pages and images, then copy ours. Removals in the source propagate.
( cd "$WORK" && git rm -rq --ignore-unmatch '*.md' '*.png' )
cp "$SRC"/*.md "$WORK/"

# Images live in docs/media/ (one source of truth, shared with the README) and are
# copied flat into the wiki root, so pages can reference them relatively. A wiki that
# depends on raw.githubusercontent.com/main renders broken until the branch is merged.
if ls "$IMG"/*.png >/dev/null 2>&1; then
  cp "$IMG"/*.png "$WORK/"
fi

cd "$WORK"
git add -A

if git diff --cached --quiet; then
  echo "wiki already up to date"
  cd ..
  rm -rf "$WORK"
  exit 0
fi

echo "Publishing:"
git diff --cached --name-status | sed 's/^/  /'

SHA="$(cd .. && git rev-parse --short HEAD)"
git commit -qm "docs: sync wiki from docs/wiki @ ${SHA}"
git push --quiet origin HEAD

cd ..
rm -rf "$WORK"

echo
echo "Published -> https://github.com/dnl-gentile/yt-toolkit/wiki"
