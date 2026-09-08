#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${AI_PRICE_APP_ROOT:-/opt/ai-price}"
RELEASES_ROOT="${APP_ROOT}/releases"
DEPENDENCIES_ROOT="${APP_ROOT}/shared/dependencies"
STATIC_ROOT="${APP_ROOT}/shared/next-static-releases"
STATIC_LINK="${APP_ROOT}/shared/next-static-current"
SERVICE_USER="ai-price"
KEEP="${AI_PRICE_RELEASES_TO_KEEP:-2}"
STATIC_TREE_KEEP=2
APPLY=true
LOCK_HELD=false
TARGET_RELEASE=""
ROLLBACK_RELEASES=()

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --keep)
      KEEP="${2:?--keep requires a value}"
      shift 2
      ;;
    --apply)
      APPLY=true
      shift
      ;;
    --dry-run)
      APPLY=false
      shift
      ;;
    --lock-held)
      LOCK_HELD=true
      shift
      ;;
    --current)
      TARGET_RELEASE="${2:?--current requires a release path}"
      shift 2
      ;;
    --rollback)
      ROLLBACK_RELEASES+=("${2:?--rollback requires a release path}")
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [[ ! "${KEEP}" =~ ^[2-9][0-9]*$ ]]; then
  echo "--keep must be an integer of at least 2." >&2
  exit 2
fi
if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi
if [[ "${LOCK_HELD}" != "true" ]]; then
  exec 9>"${APP_ROOT}/.deploy.lock"
  flock 9
fi

LINKED_CURRENT="$(readlink -f "${APP_ROOT}/current" 2>/dev/null || true)"
CURRENT_RELEASE="${TARGET_RELEASE:-${LINKED_CURRENT}}"
if [[ "${CURRENT_RELEASE}" != "${RELEASES_ROOT}/"* ]] ||
  [[ ! -d "${CURRENT_RELEASE}" ]]; then
  echo "Current release is outside ${RELEASES_ROOT}: ${CURRENT_RELEASE}" >&2
  exit 1
fi

mapfile -t RELEASES < <(
  find -P "${RELEASES_ROOT}" -mindepth 1 -maxdepth 1 -type d -printf '%p\n' |
    sort -r
)
RETAINED=("${CURRENT_RELEASE}")
for candidate in "${ROLLBACK_RELEASES[@]}"; do
  if [[ "${candidate}" != "${RELEASES_ROOT}/"* ]] ||
    [[ ! -d "${candidate}" ]]; then
    echo "Rollback release is outside ${RELEASES_ROOT}: ${candidate}" >&2
    exit 1
  fi
  [[ "${candidate}" == "${CURRENT_RELEASE}" ]] && continue
  RETAINED+=("${candidate}")
done
if [[ "${#RETAINED[@]}" -gt "${KEEP}" ]]; then
  echo "Explicit current and rollback releases exceed --keep." >&2
  exit 2
fi
for candidate in "${RELEASES[@]}"; do
  [[ "${#RETAINED[@]}" -ge "${KEEP}" ]] && break
  [[ "${candidate}" == "${CURRENT_RELEASE}" ]] && continue
  if [[ ! -f "${candidate}/.deploy-success" ]] &&
    [[ ! -f "${candidate}/.release-ready" ]]; then
    continue
  fi
  already_retained=false
  for retained_release in "${RETAINED[@]}"; do
    [[ "${retained_release}" == "${candidate}" ]] && already_retained=true
  done
  [[ "${already_retained}" == "true" ]] && continue
  RETAINED+=("${candidate}")
done

is_retained() {
  local needle="$1"
  local retained_release
  for retained_release in "${RETAINED[@]}"; do
    [[ "${retained_release}" == "${needle}" ]] && return 0
  done
  return 1
}

echo "Current release: ${CURRENT_RELEASE}"
printf 'Retain release: %s\n' "${RETAINED[@]}"
if [[ "${APPLY}" != "true" ]]; then
  for candidate in "${RELEASES[@]}"; do
    if ! is_retained "${candidate}"; then
      echo "Would remove release: ${candidate}"
    fi
  done
  exit 0
fi

install -d -o "${SERVICE_USER}" -g "${SERVICE_USER}" "${STATIC_ROOT}"
STATIC_STAGE="$(mktemp -d "${STATIC_ROOT}/.stage.XXXXXXXX")"
STATIC_PUBLISHED=false
cleanup_stage() {
  LIVE_STATIC_RELEASE="$(readlink -f "${STATIC_LINK}" 2>/dev/null || true)"
  if [[ "${STATIC_PUBLISHED}" != "true" ]] &&
    [[ "${LIVE_STATIC_RELEASE}" != "${STATIC_STAGE}" ]] &&
    [[ -d "${STATIC_STAGE}" ]]; then
    rm -rf -- "${STATIC_STAGE}"
  fi
}
trap cleanup_stage EXIT

# Build an unpublished union. Current-release files win on the extremely
# unlikely event that two builds use the same path with different contents.
for candidate in "${RETAINED[@]}"; do
  STATIC_SOURCE="${candidate}/.next/static-native"
  if [[ ! -d "${STATIC_SOURCE}" ]]; then
    STATIC_SOURCE="${candidate}/.next/static"
  fi
  if [[ -d "${STATIC_SOURCE}" ]]; then
    cp -an "${STATIC_SOURCE}/." "${STATIC_STAGE}/"
  fi
done
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${STATIC_STAGE}"
find -P "${STATIC_STAGE}" -type d -exec chmod 0755 {} +
find -P "${STATIC_STAGE}" -type f -exec chmod 0644 {} +
STATIC_RELEASE="${STATIC_ROOT}/$(date -u +%Y%m%d%H%M%S%N)"
mv "${STATIC_STAGE}" "${STATIC_RELEASE}"
STATIC_STAGE="${STATIC_RELEASE}"
STATIC_LINK_TMP="${STATIC_LINK}.new.$$"
ln -s "${STATIC_RELEASE}" "${STATIC_LINK_TMP}"
mv -Tf "${STATIC_LINK_TMP}" "${STATIC_LINK}"
STATIC_PUBLISHED=true

for candidate in "${RELEASES[@]}"; do
  if is_retained "${candidate}"; then
    continue
  fi
  if [[ "${candidate}" != "${RELEASES_ROOT}/"* ]] ||
    [[ "${candidate}" == "${CURRENT_RELEASE}" ]] ||
    [[ "${candidate}" == "${LINKED_CURRENT}" ]]; then
    echo "Refusing to remove unexpected release: ${candidate}" >&2
    exit 1
  fi
  rm -rf -- "${candidate}"
done

declare -A REFERENCED_DEPENDENCIES=()
while IFS= read -r -d '' release_path; do
  node_modules_link="${release_path}/node_modules"
  [[ -L "${node_modules_link}" ]] || continue
  node_modules_target="$(readlink -f -- "${node_modules_link}")"
  dependency_path="$(dirname -- "${node_modules_target}")"
  dependency_name="$(basename -- "${dependency_path}")"
  if [[ "$(dirname -- "${dependency_path}")" == "${DEPENDENCIES_ROOT}" ]] &&
    [[ "${dependency_name}" =~ ^[0-9a-f]{64}$ ]] &&
    [[ "${node_modules_target}" == "${dependency_path}/node_modules" ]]; then
    REFERENCED_DEPENDENCIES["${dependency_path}"]=1
  fi
done < <(find -P "${RELEASES_ROOT}" -mindepth 1 -maxdepth 1 -type d -print0)

while IFS= read -r -d '' dependency_path; do
  dependency_name="$(basename -- "${dependency_path}")"
  if [[ ! "${dependency_name}" =~ ^[0-9a-f]{64}$ ]] ||
    [[ "$(readlink -f -- "${dependency_path}")" != "${dependency_path}" ]]; then
    echo "Skipping unrecognized dependency directory: ${dependency_path}" >&2
    continue
  fi
  [[ -n "${REFERENCED_DEPENDENCIES[${dependency_path}]:-}" ]] && continue
  rm -rf -- "${dependency_path}"
done < <(find -P "${DEPENDENCIES_ROOT}" -mindepth 1 -maxdepth 1 -type d -print0)

mapfile -t STATIC_RELEASES < <(
  find -P "${STATIC_ROOT}" -mindepth 1 -maxdepth 1 -type d -printf '%p\n' |
    sort -r
)
STATIC_TREES_RETAINED=1
for candidate in "${STATIC_RELEASES[@]}"; do
  [[ "${candidate}" == "${STATIC_RELEASE}" ]] && continue
  if [[ "${STATIC_TREES_RETAINED}" -lt "${STATIC_TREE_KEEP}" ]]; then
    STATIC_TREES_RETAINED=$((STATIC_TREES_RETAINED + 1))
    continue
  fi
  rm -rf -- "${candidate}"
done

echo "Static release: ${STATIC_RELEASE}"
