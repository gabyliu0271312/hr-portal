#!/usr/bin/env sh
set -eu

repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"

archive_root=$(dirname "$repo_root")/hr-portal-runtime-artifacts
stamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$archive_root/$stamp"
apply=0

if [ "${1:-}" = "--apply" ]; then
  apply=1
elif [ "${1:-}" != "" ] && [ "${1:-}" != "--dry-run" ]; then
  echo "Usage: $0 [--dry-run|--apply]" >&2
  exit 2
fi

move_if_present() {
  source_path=$1
  if [ ! -e "$source_path" ]; then
    return 0
  fi
  if [ "$apply" -eq 0 ]; then
    printf 'Would archive: %s\n' "$source_path"
    return 0
  fi
  relative_path=${source_path#./}
  mkdir -p "$target/$(dirname "$relative_path")"
  mv -- "$source_path" "$target/$relative_path"
  printf 'Archived: %s -> %s\n' "$source_path" "$target/$relative_path"
}

for file in ./.env.backup* ./.env.bak* ./.env.before* ./.env.corrupt* ./backup_*.sql ./_backup_*.sql; do
  [ -e "$file" ] || continue
  move_if_present "$file"
done

for file in ./-c ./psql ./0054_data_compare_tasks, ./0056_warehouse_ucp_integration,; do
  move_if_present "$file"
done

if [ "$apply" -eq 0 ]; then
  echo 'Dry run only. Re-run with --apply to archive the listed files.'
else
  echo "Runtime artifacts are isolated under: $target"
fi

echo 'The following runtime paths stay in place and are ignored by Git:'
printf '%s\n' './backend/data' './backend/pg_hba.conf*' './data/pg' './releases'

git status --short --untracked-files=all