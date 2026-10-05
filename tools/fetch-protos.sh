#!/usr/bin/env bash
#
# Vendor the Polycentric v2 protobuf definitions from the Harbor monorepo.
#
# The definitions are vendored rather than fetched at build time so a checkout builds offline
# and so a change upstream shows up as a reviewable diff instead of silently altering the
# generated client. Run this to refresh them, then `npm run generate` and read the diff.
#
# The commit is pinned in PINNED_REF below. Pass a ref to fetch a different one:
#
#   ./tools/fetch-protos.sh                  # the pinned commit
#   ./tools/fetch-protos.sh develop          # upstream's default branch, and repin to its head
#
set -euo pipefail

# Pinned so a refresh is reproducible. Upstream's default branch is `develop`, not `main`.
PINNED_REF='4af47ffac79d6153b1843e06fed772df104fc44d'

REPO="${HARBOR_REPO:-futo-org/Harbor}"
REF="${1:-$PINNED_REF}"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dest="$root/proto/polycentric/v2"

if ! command -v gh >/dev/null 2>&1; then
  echo "fetch-protos: needs the GitHub CLI (gh) to list and read the upstream directory." >&2
  exit 1
fi

# Resolve a branch or tag to the commit actually fetched, so PINNED_REF names an immutable
# object. Fetching "develop" twice a week apart otherwise yields two different trees under one
# recorded ref.
sha="$(gh api "repos/$REPO/commits/$REF" --jq '.sha')"
echo "fetch-protos: $REPO at $sha"

names="$(gh api "repos/$REPO/contents/protos/polycentric/v2?ref=$sha" --jq '.[] | select(.type == "file") | .name')"

if [[ -z "$names" ]]; then
  echo "fetch-protos: upstream listed no files under protos/polycentric/v2 — refusing to wipe the vendored copy." >&2
  exit 1
fi

staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT

while IFS= read -r name; do
  [[ "$name" == *.proto ]] || continue
  gh api "repos/$REPO/contents/protos/polycentric/v2/$name?ref=$sha" --jq '.content' | base64 -d >"$staging/$name"
  # A truncated download is still valid base64, so check the content says what it should.
  grep -q '^package polycentric.v2;' "$staging/$name" || {
    echo "fetch-protos: $name does not declare package polycentric.v2 — upstream layout changed." >&2
    exit 1
  }
done <<<"$names"

mkdir -p "$dest"
rm -f "$dest"/*.proto
mv "$staging"/*.proto "$dest/"

cat >"$root/proto/SOURCE.md" <<EOF
# Where these came from

Vendored by \`tools/fetch-protos.sh\` from [$REPO](https://github.com/$REPO), path
\`protos/polycentric/v2/\`, at commit
[\`${sha:0:12}\`](https://github.com/$REPO/tree/$sha/protos/polycentric/v2).

Do not edit them here. Change them upstream, then re-run the script and regenerate.
EOF

echo "fetch-protos: wrote $(find "$dest" -name '*.proto' | wc -l | tr -d ' ') files to proto/polycentric/v2/"

if [[ "$REF" != "$PINNED_REF" ]]; then
  echo "fetch-protos: PINNED_REF is still $PINNED_REF — update it to $sha to pin what you just fetched."
fi
