#!/usr/bin/env bash
set -euo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: jalankan script ini dari dalam repository git."
  exit 1
fi

if [[ -z "$(git config user.name || true)" || -z "$(git config user.email || true)" ]]; then
  echo "Error: user.name / user.email belum diset."
  echo "Set dulu:"
  echo "  git config user.name \"Nama Kamu\""
  echo "  git config user.email \"email@domain.com\""
  exit 1
fi

branch="$(git rev-parse --abbrev-ref HEAD)"
message="${*:-chore: update $(date '+%Y-%m-%d %H:%M:%S')}"

git add -A

# Jangan ikutkan backup hasil extract lokal
while IFS= read -r file; do
  git restore --staged -- "$file" || true
done < <(git diff --cached --name-only | grep -E '^krb-scoring-system_[0-9]{8}_[0-9]{6}(/|\.zip$)' || true)

if [[ -z "$(git diff --cached --name-only)" ]]; then
  echo "Tidak ada perubahan untuk di-commit."
  exit 0
fi

git commit -m "$message"
git push origin "$branch"

echo "Selesai push ke origin/$branch"
