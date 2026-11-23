#!/bin/sh
set -eu

repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "origin remote is required" >&2
  exit 1
fi

if ! git subtree --help >/dev/null 2>&1; then
  echo "git subtree is required to publish the site" >&2
  exit 1
fi

git subtree push --prefix site origin gh-pages
