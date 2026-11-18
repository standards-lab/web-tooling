#!/usr/bin/env bash
# Adapted from spike-html-apps-tooling (d77877b): scripts/currency.sh, its action pins checked only
# when a workflow exists, and DejaVu's pin read from its release assets in version order.
# Prints `<where>: <item> <pin> -> <latest>` for each mise tool, package.json dependency, and GitHub
# Actions pin behind its latest, and exits 1 if any; prints nothing when all are current. Reads the
# network.
# From spike-html-apps-foundation (9c15b8d): scripts/currency.sh.
set -euo pipefail
cd "$(dirname "$0")/.."

# Errors only: mise warns on every run that a GitHub release has no assets. DejaVu is read below
# instead: mise keeps its version list in the GitHub API's newest-first order, unsorted, so its
# latest is whichever release the API lists last.
outdated=$(MISE_LOG_LEVEL=error mise outdated --bump --local --json)
trailing=$(node -p '
  Object.entries(JSON.parse(process.argv[1]))
    .filter(([tool]) => tool !== "http:dejavu-fonts")
    .map(([tool, { requested, bump }]) => "mise.toml: " + [tool, requested, "->", bump].join(" "))
    .join("\n")
' "$outdated")

# DejaVu's latest is the newest version among its releases' dejavu-fonts-ttf-X.Y.tar.bz2 assets,
# the archive mise.toml's pin downloads.
dejavu=$(mise config get 'tools."http:dejavu-fonts".version')
dejavu_latest=$(gh api --paginate repos/dejavu-fonts/dejavu-fonts/releases --jq '.[].assets[].name' |
  sed -n 's/^dejavu-fonts-ttf-\([0-9.]*\)\.tar\.bz2$/\1/p' | sort -V | tail -n 1)
if [[ $dejavu != "$dejavu_latest" ]]; then
  trailing+=$'\n'"mise.toml: http:dejavu-fonts $dejavu -> $dejavu_latest"
fi

pins=$(node -p '
  const { dependencies, devDependencies } = require("./package.json");
  Object.entries({ ...dependencies, ...devDependencies })
    .map(([name, pin]) => name + " " + pin)
    .join("\n")
')
typescript_eslint=$(node -p 'require("./package.json").devDependencies["typescript-eslint"]')
while read -r package pin; do
  latest=$(pnpm view "$package" version)
  # typescript is held to the newest version typescript-eslint's peer range accepts.
  if [[ $package == typescript ]]; then
    range=$(pnpm view "typescript-eslint@$typescript_eslint" peerDependencies.typescript)
    accepted=$(pnpm view "typescript@$range" version --json)
    latest=$(node -p '[].concat(JSON.parse(process.argv[1])).join("\n")' "$accepted" |
      sort -V | tail -n 1)
  fi
  if [[ $pin != "$latest" ]]; then
    trailing+=$'\n'"package.json: $package $pin -> $latest"
  fi
done <<<"$pins"

# Each action a workflow uses, against its repository's latest release; none while there is no
# workflow.
uses=""
if compgen -G '.github/workflows/*.yml' >/dev/null; then
  uses=$(grep -ho 'uses: *[^ ]*@[^ ]*' .github/workflows/*.yml | sed 's/uses: *//' | sort -u)
fi
while read -r action; do
  [[ -n $action ]] || continue
  repo=$(cut -d/ -f1,2 <<<"${action%@*}")
  latest=$(gh api "repos/$repo/releases/latest" --jq .tag_name)
  if [[ ${action#*@} != "$latest" ]]; then
    trailing+=$'\n'".github/workflows: ${action%@*} ${action#*@} -> $latest"
  fi
done <<<"$uses"

if [[ -n ${trailing//$'\n'/} ]]; then
  sed '/^$/d' <<<"$trailing"
  exit 1
fi
