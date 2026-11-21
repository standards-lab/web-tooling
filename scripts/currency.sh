#!/usr/bin/env bash
# Adapted from spike-html-apps-tooling (d77877b): scripts/currency.sh, action pins only with a workflow, DejaVu by its assets.
# From spike-html-apps-foundation (9c15b8d): scripts/currency.sh.
# Prints `<where>: <item> <pin> -> <latest>` for each mise tool, package.json dependency, and GitHub
# Actions pin behind its latest, and exits 1 if any; prints nothing when all are current. Reads the
# network.
# See docs/development.md
set -euo pipefail
cd "$(dirname "$0")/.."

trailing_mise_tools_but_dejavu() {
  local outdated
  outdated=$(MISE_LOG_LEVEL=error mise outdated --bump --local --json) || return
  node -p '
    Object.entries(JSON.parse(process.argv[1]))
      .filter(([tool]) => tool !== "http:dejavu-fonts")
      .map(([tool, { requested, bump }]) => "mise.toml: " + [tool, requested, "->", bump].join(" "))
      .join("\n")
  ' "$outdated"
}

trailing_dejavu_by_release_assets() {
  local dejavu latest
  dejavu=$(mise config get 'tools."http:dejavu-fonts".version') || return
  latest=$(gh api --paginate repos/dejavu-fonts/dejavu-fonts/releases --jq '.[].assets[].name' |
    sed -n 's/^dejavu-fonts-ttf-\([0-9.]*\)\.tar\.bz2$/\1/p' | sort -V | tail -n 1) || return
  if [[ $dejavu != "$latest" ]]; then
    echo "mise.toml: http:dejavu-fonts $dejavu -> $latest"
  fi
}

newest_typescript_for_typescript_eslint() {
  local typescript_eslint range accepted
  typescript_eslint=$(node -p 'require("./package.json").devDependencies["typescript-eslint"]') ||
    return
  range=$(pnpm view "typescript-eslint@$typescript_eslint" peerDependencies.typescript) || return
  accepted=$(pnpm view "typescript@$range" version --json) || return
  node -p '[].concat(JSON.parse(process.argv[1])).join("\n")' "$accepted" | sort -V | tail -n 1
}

trailing_packages() {
  local pins package pin latest
  pins=$(node -p '
    const { dependencies, devDependencies } = require("./package.json");
    Object.entries({ ...dependencies, ...devDependencies })
      .map(([name, pin]) => name + " " + pin)
      .join("\n")
  ') || return
  while read -r package pin; do
    if [[ $package == typescript ]]; then
      latest=$(newest_typescript_for_typescript_eslint) || return
    else
      latest=$(pnpm view "$package" version) || return
    fi
    if [[ $pin != "$latest" ]]; then
      echo "package.json: $package $pin -> $latest"
    fi
  done <<<"$pins"
}

trailing_actions() {
  local uses action repo latest
  compgen -G '.github/workflows/*.yml' >/dev/null || return 0
  uses=$(grep -ho 'uses: *[^ ]*@[^ ]*' .github/workflows/*.yml | sed 's/uses: *//' | sort -u) ||
    return
  while read -r action; do
    [[ -n $action ]] || continue
    repo=$(cut -d/ -f1,2 <<<"${action%@*}") || return
    latest=$(gh api "repos/$repo/releases/latest" --jq .tag_name) || return
    if [[ ${action#*@} != "$latest" ]]; then
      echo ".github/workflows: ${action%@*} ${action#*@} -> $latest"
    fi
  done <<<"$uses"
}

trailing=$(trailing_mise_tools_but_dejavu)
trailing+=$'\n'$(trailing_dejavu_by_release_assets)
trailing+=$'\n'$(trailing_packages)
trailing+=$'\n'$(trailing_actions)

if [[ -n ${trailing//$'\n'/} ]]; then
  sed '/^$/d' <<<"$trailing"
  exit 1
fi
