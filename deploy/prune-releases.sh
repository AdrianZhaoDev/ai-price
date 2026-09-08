#!/usr/bin/env bash
set -euo pipefail

readonly app_root="${AI_PRICE_APP_ROOT:-/opt/ai-price}"
readonly releases_root="${app_root}/releases"
readonly dependencies_root="${app_root}/shared/dependencies"
readonly current_link="${app_root}/current"
readonly keep_count="${AI_PRICE_RELEASES_TO_KEEP:-5}"

if [[ ! "${keep_count}" =~ ^[0-9]+$ ]] || ((keep_count < 2)); then
  echo "AI_PRICE_RELEASES_TO_KEEP must be an integer of at least 2." >&2
  exit 2
fi

for required_directory in "${app_root}" "${releases_root}" "${dependencies_root}"; do
  if [[ ! -d "${required_directory}" ]] || [[ -L "${required_directory}" ]]; then
    echo "Refusing cleanup: unsafe directory: ${required_directory}" >&2
    exit 1
  fi
done

exec 9>"${app_root}/.deploy.lock"
flock 9

current_release="$(readlink -f -- "${current_link}")"
if [[ "$(dirname -- "${current_release}")" != "${releases_root}" ]] ||
  [[ ! "$(basename -- "${current_release}")" =~ ^[0-9]{14,23}$ ]] ||
  [[ ! -d "${current_release}" ]] || [[ -L "${current_release}" ]]; then
  echo "Refusing cleanup: unexpected current release: ${current_release}" >&2
  exit 1
fi

mapfile -t release_names < <(
  find "${releases_root}" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' |
    LC_ALL=C sort -r
)

declare -A kept_releases=(["${current_release}"]=1)
kept=1
removed_releases=0

for release_name in "${release_names[@]}"; do
  release_path="${releases_root}/${release_name}"
  if [[ ! "${release_name}" =~ ^[0-9]{14,23}$ ]] ||
    [[ "$(readlink -f -- "${release_path}")" != "${release_path}" ]]; then
    echo "Skipping unrecognized release directory: ${release_path}" >&2
    continue
  fi
  if [[ -n "${kept_releases[${release_path}]:-}" ]]; then
    continue
  fi
  if [[ ! -f "${release_path}/.release-ready" ]] ||
    [[ -L "${release_path}/.release-ready" ]]; then
    find -P "${release_path}" -xdev -depth -delete
    echo "Removed incomplete release: ${release_path}"
    ((removed_releases += 1))
    continue
  fi
  if ((kept < keep_count)); then
    kept_releases["${release_path}"]=1
    ((kept += 1))
    continue
  fi

  find -P "${release_path}" -xdev -depth -delete
  echo "Removed release: ${release_path}"
  ((removed_releases += 1))
done

declare -A referenced_dependencies=()
while IFS= read -r -d '' release_path; do
  node_modules_link="${release_path}/node_modules"
  if [[ ! -L "${node_modules_link}" ]]; then
    continue
  fi
  node_modules_target="$(readlink -f -- "${node_modules_link}")"
  dependency_path="$(dirname -- "${node_modules_target}")"
  dependency_name="$(basename -- "${dependency_path}")"
  if [[ "$(dirname -- "${dependency_path}")" == "${dependencies_root}" ]] &&
    [[ "${dependency_name}" =~ ^[0-9a-f]{64}$ ]] &&
    [[ "${node_modules_target}" == "${dependency_path}/node_modules" ]]; then
    referenced_dependencies["${dependency_path}"]=1
  fi
done < <(find "${releases_root}" -mindepth 1 -maxdepth 1 -type d -print0)

removed_dependencies=0
while IFS= read -r -d '' dependency_path; do
  dependency_name="$(basename -- "${dependency_path}")"
  if [[ ! "${dependency_name}" =~ ^[0-9a-f]{64}$ ]] ||
    [[ "$(readlink -f -- "${dependency_path}")" != "${dependency_path}" ]]; then
    echo "Skipping unrecognized dependency directory: ${dependency_path}" >&2
    continue
  fi
  if [[ -n "${referenced_dependencies[${dependency_path}]:-}" ]]; then
    continue
  fi

  find -P "${dependency_path}" -xdev -depth -delete
  echo "Removed unreferenced dependencies: ${dependency_path}"
  ((removed_dependencies += 1))
done < <(find "${dependencies_root}" -mindepth 1 -maxdepth 1 -type d -print0)

echo "Cleanup complete: kept ${kept} release(s), removed ${removed_releases} release(s) and ${removed_dependencies} dependency set(s)."
