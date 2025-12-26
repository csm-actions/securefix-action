#!/usr/bin/env bash

set -euo pipefail

mkdir -p changelogs

gh release list --exclude-pre-releases --json tagName -q ".[].tagName" -L 1000 | while read -r tag; do
    file=changelogs/${tag}.md
    if [ -f "$file" ]; then
        continue
    fi
    {
        echo "# $tag"
        echo ""
        gh release view "$tag" --json body -q ".body"
        echo ""
    } > "$file"
    nllint -f -s -S "$file"
done
