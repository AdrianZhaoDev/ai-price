#!/usr/bin/env bash
set -euo pipefail

# The API gateway is managed separately and shares the certificate's ai SAN.
# Run this before changing the main vhost and again after reloading Nginx.
verify_api_gateway() (
  set -euo pipefail
  local api_domain="ai.lowpriceradar.com"
  local challenge_dir="/var/www/html/.well-known/acme-challenge"
  local challenge_file challenge_name expected actual nginx_check
  test -r /etc/nginx/conf.d/00-ai-lowpriceradar.conf || {
    echo "Install the independent API gateway vhost before deploying the main site." >&2
    exit 1
  }
  nginx_check="$(nginx -t 2>&1)" || { printf '%s\n' "$nginx_check" >&2; exit 1; }
  if [[ "$nginx_check" == *'conflicting server name "ai.lowpriceradar.com"'* ]]; then
    printf '%s\n' "$nginx_check" >&2
    exit 1
  fi
  test -d "$challenge_dir"
  challenge_file="$(mktemp "$challenge_dir/newapi-check.XXXXXXXX")"
  trap 'rm -f -- "$challenge_file"' EXIT
  challenge_name="${challenge_file##*/}"
  expected="api-gateway-$challenge_name"
  printf '%s' "$expected" > "$challenge_file"
  chmod 644 "$challenge_file"
  for target in origin public; do
    local resolve=()
    if [[ "$target" == origin ]]; then
      resolve=(--resolve "$api_domain:80:127.0.0.1" --resolve "$api_domain:443:127.0.0.1")
    fi
    actual="$(curl -fsS --max-time 20 "${resolve[@]}" "http://$api_domain/.well-known/acme-challenge/$challenge_name")"
    [[ "$actual" == "$expected" ]] || { echo "API ACME webroot check failed ($target)." >&2; exit 1; }
    curl -fsS --max-time 20 "${resolve[@]}" "https://$api_domain/api/status" |
      python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("success") is True and d.get("data", {}).get("version"), "Not a healthy New API response"'
    actual="$(curl -sS --max-time 20 "${resolve[@]}" -o /dev/null -w '%{http_code}' "https://$api_domain/")"
    [[ "$actual" == 200 ]] || { echo "API UI check failed ($target)." >&2; exit 1; }
    actual="$(curl -sS --max-time 20 "${resolve[@]}" -o /dev/null -w '%{http_code} %{redirect_url}' "http://$api_domain/")"
    [[ "$actual" == "308 https://$api_domain/" ]] || { echo "API HTTP redirect check failed ($target)." >&2; exit 1; }
    printf 'api-gateway-%s=ok\n' "$target"
  done
)

# Explicit one-time transition for a predecessor main vhost. Preserve its other
# settings and restore the exact file if Nginx or gateway acceptance fails.
migrate_api_domain() (
  set -euo pipefail
  local site=/etc/nginx/sites-available/ai-price backup candidate
  test -r /etc/nginx/conf.d/00-ai-lowpriceradar.conf
  test -f "$site"
  install -d /opt/ai-price /var/backups/ai-price
  exec 9>/opt/ai-price/.deploy.lock
  flock 9
  backup="$(mktemp /var/backups/ai-price/api-domain-before.XXXXXXXX)"
  cp --preserve=mode,ownership,timestamps "$site" "$backup"
  candidate="$(mktemp /etc/nginx/sites-available/.ai-price-migrate.XXXXXXXX)"
  trap 'rm -f -- "$candidate"' EXIT
  cp --preserve=mode,ownership "$site" "$candidate"
  python3 - "$candidate" <<'PY_MIGRATE'
import pathlib,re,sys
p=pathlib.Path(sys.argv[1]); text=p.read_text()
def migrate(match):
    names=match.group(2).split()
    if "ai.lowpriceradar.com" not in names:
        return match.group(0)
    if not {"lowpriceradar.com", "www.lowpriceradar.com"}.intersection(names):
        raise SystemExit("Refusing to change a standalone API server_name")
    return match.group(1)+" ".join(n for n in names if n != "ai.lowpriceradar.com")+";"
p.write_text(re.sub(r"(?m)^(\s*server_name\s+)([^;\n]+);",migrate,text))
PY_MIGRATE
  mv -f -- "$candidate" "$site"
  if nginx -t && systemctl reload nginx && bash "$0" --verify-api-gateway; then
    printf 'API_DOMAIN_MIGRATED=1 backup=%s\n' "$backup"
  else
    cp --preserve=mode,ownership,timestamps "$backup" "$candidate"
    mv -f -- "$candidate" "$site"
    nginx -t && systemctl reload nginx
    echo "API domain migration failed; prior main vhost restored: $backup" >&2
    exit 1
  fi
)

if [[ "${1:-}" == --migrate-api-domain ]]; then
  migrate_api_domain
  exit 0
fi

if [[ "${1:-}" == --verify-api-gateway ]]; then
  verify_api_gateway
  exit 0
fi

PUBLIC_IP="${1:?public IP is required}"
SOURCE_ARCHIVE="${2:-/tmp/ai-price.tar.gz}"
LOCK_FILE="${3:-/tmp/ai-price-package-lock.json}"
APP_ROOT="/opt/ai-price"
ENV_FILE="/etc/ai-price.env"
SERVICE_USER="ai-price"
PRIMARY_DOMAIN="lowpriceradar.com"
CERTIFICATE_DIR="/etc/letsencrypt/live/${PRIMARY_DOMAIN}"

verify_api_gateway

install -d "${APP_ROOT}"
exec 9>"${APP_ROOT}/.deploy.lock"
flock 9
RELEASE_ID="$(date -u +%Y%m%d%H%M%S%N)"
RELEASE_DIR="${APP_ROOT}/releases/${RELEASE_ID}"
release_ready=false

cleanup_incomplete_release() {
  if [[ "${release_ready}" == "true" ]] || [[ ! -d "${RELEASE_DIR}" ]]; then
    return
  fi
  if [[ "$(readlink -f -- "${APP_ROOT}/current" 2>/dev/null || true)" == "${RELEASE_DIR}" ]]; then
    return
  fi
  find -P "${RELEASE_DIR}" -xdev -depth -delete
}

trap cleanup_incomplete_release EXIT

export DEBIAN_FRONTEND=noninteractive
MISSING_PACKAGES=()
for package_name in \
  postgresql nginx ca-certificates certbot python3-certbot-nginx; do
  if ! dpkg-query -W -f='${Status}' "${package_name}" 2>/dev/null |
    grep -q "install ok installed"; then
    MISSING_PACKAGES+=("${package_name}")
  fi
done
if [[ "${#MISSING_PACKAGES[@]}" -gt 0 ]]; then
  apt-get update
  apt-get install -y --no-install-recommends "${MISSING_PACKAGES[@]}"
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js >=20.9 and npm are required before deployment." >&2
  exit 1
fi

NODE_VERSION="$(node --version | sed 's/^v//')"
if [[ "$(printf '%s\n' "20.9.0" "${NODE_VERSION}" | sort -V | head -n1)" != "20.9.0" ]]; then
  echo "Node.js >=20.9 is required; found ${NODE_VERSION}." >&2
  exit 1
fi

if ! id "${SERVICE_USER}" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "/var/lib/${SERVICE_USER}" \
    --shell /usr/sbin/nologin "${SERVICE_USER}"
fi

install -d -o "${SERVICE_USER}" -g "${SERVICE_USER}" "${APP_ROOT}/releases"
install -d -o "${SERVICE_USER}" -g "${SERVICE_USER}" \
  "${APP_ROOT}/shared/dependencies"

PREVIOUS_RELEASE="$(readlink -f -- "${APP_ROOT}/current" 2>/dev/null || true)"
if [[ "$(dirname -- "${PREVIOUS_RELEASE}")" == "${APP_ROOT}/releases" ]] &&
  [[ "$(basename -- "${PREVIOUS_RELEASE}")" =~ ^[0-9]{14,23}$ ]] &&
  [[ -d "${PREVIOUS_RELEASE}" ]] && [[ ! -L "${PREVIOUS_RELEASE}" ]]; then
  install -m 0644 -o "${SERVICE_USER}" -g "${SERVICE_USER}" /dev/null \
    "${PREVIOUS_RELEASE}/.release-ready"
fi
install -d -o root -g root -m 0755 "${RELEASE_DIR}"
tar -xzf "${SOURCE_ARCHIVE}" -C "${RELEASE_DIR}"
install -m 0644 "${LOCK_FILE}" "${RELEASE_DIR}/package-lock.json"
if [[ ! -f "${RELEASE_DIR}/deploy/prune-releases.sh" ]] ||
  [[ -L "${RELEASE_DIR}/deploy/prune-releases.sh" ]]; then
  echo "Verified release is missing a regular prune helper." >&2
  exit 1
fi
PRUNE_HELPER_STAGED="$(mktemp /run/ai-price-prune.XXXXXXXX)"
install -m 0700 -o root -g root \
  "${RELEASE_DIR}/deploy/prune-releases.sh" "${PRUNE_HELPER_STAGED}"
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${RELEASE_DIR}"

if [[ ! -f "${ENV_FILE}" ]]; then
  DB_PASSWORD="$(openssl rand -hex 24)"
  CRON_SECRET="$(openssl rand -hex 32)"
  EMAIL_TOKEN_SECRET="$(openssl rand -hex 32)"
  install -m 0640 -o root -g "${SERVICE_USER}" /dev/null "${ENV_FILE}"
  cat >"${ENV_FILE}" <<EOF
DATABASE_URL=postgresql://ai_price:${DB_PASSWORD}@127.0.0.1:5432/ai_price
DIRECT_DATABASE_URL=postgresql://ai_price:${DB_PASSWORD}@127.0.0.1:5432/ai_price
LOCAL_DATABASE_URL=postgresql://ai_price:${DB_PASSWORD}@127.0.0.1:5432/ai_price
REMOTE_DATABASE_URL=
DATABASE_READ_TARGET=local
DATABASE_WRITE_TARGET=local
DATA_SYNC_ENABLED=false
DATA_SYNC_CHANNEL=neon
DATA_SYNC_TARGET=neondb
DATA_SYNC_TARGET_URL=
APP_URL=https://${PRIMARY_DOMAIN}
CONTACT_EMAIL=adriandev555@gmail.com
CRON_SECRET=${CRON_SECRET}
EMAIL_TOKEN_SECRET=${EMAIL_TOKEN_SECRET}
SMTP_HOST=
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM="AI Price Atlas <price@example.com>"
ADMIN_EMAIL=
COLLECTOR_CONCURRENCY=3
COLLECTOR_PROXY_URL=
NEXT_TELEMETRY_DISABLED=1
EOF
  NEW_ENVIRONMENT=1
else
  NEW_ENVIRONMENT=0
fi

chown root:"${SERVICE_USER}" "${ENV_FILE}"
chmod 0640 "${ENV_FILE}"

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

for required_name in \
  DATABASE_URL DIRECT_DATABASE_URL APP_URL CRON_SECRET EMAIL_TOKEN_SECRET; do
  if [[ -z "${!required_name:-}" ]]; then
    echo "${required_name} is missing from ${ENV_FILE}." >&2
    exit 1
  fi
done
if [[ "${APP_URL}" != "https://${PRIMARY_DOMAIN}" ]]; then
  echo "APP_URL must be https://${PRIMARY_DOMAIN} in ${ENV_FILE}." >&2
  exit 1
fi
for certificate_file in fullchain.pem privkey.pem; do
  if [[ ! -s "${CERTIFICATE_DIR}/${certificate_file}" ]]; then
    echo "Missing ${CERTIFICATE_DIR}/${certificate_file}; provision the origin certificate first." >&2
    exit 1
  fi
done
if ! openssl x509 -checkend 1209600 \
  -noout -in "${CERTIFICATE_DIR}/fullchain.pem"; then
  echo "The origin certificate expires in less than 14 days." >&2
  exit 1
fi

systemctl enable --now postgresql

if [[ "${NEW_ENVIRONMENT}" -eq 1 ]]; then
  if ! runuser -u postgres -- psql -tAc \
    "SELECT 1 FROM pg_roles WHERE rolname = 'ai_price'" | grep -q 1; then
    runuser -u postgres -- psql -v ON_ERROR_STOP=1 \
      -c "CREATE ROLE ai_price LOGIN PASSWORD '${DB_PASSWORD}'"
  else
    runuser -u postgres -- psql -v ON_ERROR_STOP=1 \
      -c "ALTER ROLE ai_price PASSWORD '${DB_PASSWORD}'"
  fi
fi

if ! runuser -u postgres -- psql -tAc \
  "SELECT 1 FROM pg_database WHERE datname = 'ai_price'" | grep -q 1; then
  runuser -u postgres -- createdb --owner=ai_price ai_price
fi

run_as_app() {
  runuser -u "${SERVICE_USER}" -- env HOME="/var/lib/${SERVICE_USER}" \
    bash -c '
      set -a
      source /etc/ai-price.env
      set +a
      cd "$1"
      shift
      exec "$@"
    ' bash "${RELEASE_DIR}" "$@"
}

LOCK_HASH="$(sha256sum "${LOCK_FILE}" | awk '{print $1}')"
DEPENDENCY_DIR="${APP_ROOT}/shared/dependencies/${LOCK_HASH}"
if [[ -d "${DEPENDENCY_DIR}/node_modules" ]]; then
  ln -s "${DEPENDENCY_DIR}/node_modules" "${RELEASE_DIR}/node_modules"
  echo "DEPENDENCIES_REUSED=1"
else
  run_as_app npm ci --no-audit --no-fund
  install -d -o "${SERVICE_USER}" -g "${SERVICE_USER}" "${DEPENDENCY_DIR}"
  mv "${RELEASE_DIR}/node_modules" "${DEPENDENCY_DIR}/node_modules"
  ln -s "${DEPENDENCY_DIR}/node_modules" "${RELEASE_DIR}/node_modules"
  echo "DEPENDENCIES_REUSED=0"
fi

if [[ -f "${RELEASE_DIR}/.next/BUILD_ID" ]]; then
  echo "PREBUILT_BUILD=1"
else
  if [[ -d "${APP_ROOT}/current/.next/cache" ]]; then
    install -d -o "${SERVICE_USER}" -g "${SERVICE_USER}" \
      "${RELEASE_DIR}/.next"
    cp -a "${APP_ROOT}/current/.next/cache" "${RELEASE_DIR}/.next/cache"
    chown -R "${SERVICE_USER}:${SERVICE_USER}" "${RELEASE_DIR}/.next"
  fi
  run_as_app ./node_modules/.bin/next build --webpack
  echo "PREBUILT_BUILD=0"
fi

run_as_app npm run db:migrate
run_as_app bash -c '
  remote_required=false
  if [[ "${DATA_SYNC_ENABLED:-false}" == "true" ]] ||
    [[ "${DATABASE_READ_TARGET:-local}" == "remote" ]] ||
    [[ "${DATABASE_WRITE_TARGET:-local}" == "remote" ]]; then
    remote_required=true
  fi
  if [[ "${remote_required}" == "true" ]]; then
    remote_url="${REMOTE_DATABASE_URL:-${DATA_SYNC_TARGET_URL:-}}"
    if [[ -z "${remote_url}" ]]; then
      echo "Remote database URL is required by the database target configuration." >&2
      exit 1
    fi
    export DATABASE_URL="${remote_url}"
    export DIRECT_DATABASE_URL="${remote_url}"
    npm run db:migrate
  fi
'
run_as_app npm run seed

cp -a "${RELEASE_DIR}/.next/static" "${RELEASE_DIR}/.next/static-native"
install -m 0755 "${PRUNE_HELPER_STAGED}" \
  /usr/local/sbin/ai-price-prune-releases
rm -f -- "${PRUNE_HELPER_STAGED}"
PREVIOUS_RELEASE="$(readlink -f "${APP_ROOT}/current" 2>/dev/null || true)"
PRUNE_ARGS=(
  --keep 2 --apply --lock-held
  --current "${RELEASE_DIR}"
)
if [[ "${PREVIOUS_RELEASE}" == "${APP_ROOT}/releases/"* ]] &&
  [[ -d "${PREVIOUS_RELEASE}" ]]; then
  if [[ ! -f "${PREVIOUS_RELEASE}/.deploy-success" ]]; then
    PREVIOUS_PID="$(systemctl show ai-price.service -p MainPID --value 2>/dev/null || true)"
    RUNNING_RELEASE=""
    if [[ "${PREVIOUS_PID}" =~ ^[1-9][0-9]*$ ]] &&
      [[ -d "/proc/${PREVIOUS_PID}" ]]; then
      RUNNING_RELEASE="$(readlink -f "/proc/${PREVIOUS_PID}/cwd" 2>/dev/null || true)"
    fi
    if [[ "${RUNNING_RELEASE}" != "${PREVIOUS_RELEASE}" ]] ||
      ! systemctl is-active --quiet ai-price.service ||
      ! curl -fsS --max-time 15 http://127.0.0.1:3100/ >/dev/null; then
      echo "Previous current release is not verified healthy: ${PREVIOUS_RELEASE}" >&2
      exit 1
    fi
    touch "${PREVIOUS_RELEASE}/.deploy-success"
  fi
  PRUNE_ARGS+=(--rollback "${PREVIOUS_RELEASE}")
fi
/usr/local/sbin/ai-price-prune-releases "${PRUNE_ARGS[@]}"
cp -an "${APP_ROOT}/shared/next-static-current/." \
  "${RELEASE_DIR}/.next/static/"
find -P "${RELEASE_DIR}/.next/static" -type d -exec chmod 0755 {} +
find -P "${RELEASE_DIR}/.next/static" -type f -exec chmod 0644 {} +
ln -sfn "${RELEASE_DIR}" "${APP_ROOT}/current"
chown -h "${SERVICE_USER}:${SERVICE_USER}" "${APP_ROOT}/current"

cat >/etc/systemd/system/ai-price.service <<'EOF'
[Unit]
Description=AI Price Atlas web application
After=network-online.target postgresql.service
Wants=network-online.target
Requires=postgresql.service

[Service]
Type=simple
User=ai-price
Group=ai-price
WorkingDirectory=/opt/ai-price/current
EnvironmentFile=/etc/ai-price.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start:local -- -H 127.0.0.1
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

cat >/etc/systemd/system/ai-price-collect.service <<'EOF'
[Unit]
Description=Collect AI Price Atlas prices
After=network-online.target postgresql.service
Wants=network-online.target
Requires=postgresql.service

[Service]
Type=oneshot
User=ai-price
Group=ai-price
WorkingDirectory=/opt/ai-price/current
EnvironmentFile=/etc/ai-price.env
Environment=NODE_ENV=production
RuntimeDirectory=ai-price-collect
RuntimeDirectoryMode=0750
ExecStart=/usr/bin/flock --exclusive /run/ai-price-collect/collector.lock /usr/bin/npm run collect
NoNewPrivileges=true
PrivateTmp=true
EOF

cat >/etc/systemd/system/ai-price-collect-scheduled.service <<'EOF'
[Unit]
Description=Collect AI Price Atlas prices on schedule
After=network-online.target postgresql.service
Wants=network-online.target
Requires=postgresql.service

[Service]
Type=oneshot
User=ai-price
Group=ai-price
WorkingDirectory=/opt/ai-price/current
EnvironmentFile=/etc/ai-price.env
Environment=NODE_ENV=production
RuntimeDirectory=ai-price-collect
RuntimeDirectoryMode=0750
ExecStart=/usr/bin/flock --exclusive /run/ai-price-collect/collector.lock /usr/bin/npm run collect -- --trigger=scheduled
NoNewPrivileges=true
PrivateTmp=true
EOF

cat >/etc/systemd/system/ai-price-collect.timer <<'EOF'
[Unit]
Description=Collect AI Price Atlas prices every four hours

[Timer]
OnCalendar=*-*-* 00/4:00:00
RandomizedDelaySec=300
Persistent=true
Unit=ai-price-collect-scheduled.service

[Install]
WantedBy=timers.target
EOF

cat >/etc/systemd/system/ai-price-prune-releases.service <<'EOF'
[Unit]
Description=Prune old AI Price Atlas releases and dependencies

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/ai-price-prune-releases
Nice=10
IOSchedulingClass=idle
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/opt/ai-price/.deploy.lock /opt/ai-price/releases /opt/ai-price/shared/dependencies /opt/ai-price/shared/next-static-releases /opt/ai-price/shared/next-static-current
EOF

cat >/etc/systemd/system/ai-price-prune-releases.timer <<'EOF'
[Unit]
Description=Daily pruning of old AI Price Atlas releases and dependencies

[Timer]
OnCalendar=*-*-* 03:30:00 UTC
RandomizedDelaySec=15m
Persistent=true
Unit=ai-price-prune-releases.service

[Install]
WantedBy=timers.target
EOF

install -d -o root -g root -m 0755 /var/www/html/.well-known/acme-challenge

if [ -L /var/cache/nginx/ai-price-public ]; then
  echo "Refusing to use a symlink as the public Nginx cache directory." >&2
  exit 1
fi
install -d -o www-data -g www-data -m 0750 /var/cache/nginx/ai-price-public

cat >/etc/nginx/sites-available/ai-price <<'EOF'
map $http_referer $ai_price_referer {
    ~^(?<ai_price_referer_without_query>[^?]*) $ai_price_referer_without_query;
    default "-";
}

map $request_method $ai_price_skip_cache_method {
    default 1;
    GET 0;
    HEAD 0;
}

map $args $ai_price_skip_cache_query {
    default 1;
    "" 0;
}

map $http_cookie $ai_price_skip_cache_cookie {
    default 1;
    "" 0;
}

map $http_authorization $ai_price_skip_cache_authorization {
    default 1;
    "" 0;
}

proxy_cache_path /var/cache/nginx/ai-price-public
    levels=1:2
    keys_zone=ai_price_public:20m
    max_size=512m
    inactive=1h
    use_temp_path=off;

log_format ai_price escape=json
    '{"time":"$time_iso8601",'
    '"remote_addr":"$remote_addr",'
    '"method":"$request_method",'
    '"uri":"$uri",'
    '"status":$status,'
    '"bytes":$body_bytes_sent,'
    '"referer":"$ai_price_referer",'
    '"user_agent":"$http_user_agent",'
    '"request_time":$request_time,'
    '"upstream_response_time":"$upstream_response_time",'
    '"upstream_status":"$upstream_status",'
    '"cache_status":"$upstream_cache_status",'
    '"cf_ray":"$http_cf_ray",'
    '"request_id":"$request_id"}';

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    access_log /var/log/nginx/access.log ai_price;

    return 444;
}

server {
    listen 80;
    listen [::]:80;
    server_name lowpriceradar.com www.lowpriceradar.com;
    access_log /var/log/nginx/access.log ai_price;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/html;
        default_type text/plain;
        try_files $uri =404;
    }

    location / {
        return 301 https://lowpriceradar.com$request_uri;
    }
}

server {
    listen 443 ssl http2 default_server;
    listen [::]:443 ssl http2 default_server;
    server_name _;
    access_log /var/log/nginx/access.log ai_price;

    ssl_reject_handshake on;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name lowpriceradar.com;
    access_log /var/log/nginx/access.log ai_price;

    ssl_certificate /etc/letsencrypt/live/lowpriceradar.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/lowpriceradar.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    server_tokens off;

    add_header Strict-Transport-Security "max-age=15552000; includeSubDomains" always;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/html;
        default_type text/plain;
        try_files $uri =404;
    }

    location ~ ^/(?:admin|api|subscription)(?:/|$)|^/en/subscription(?:/|$) {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_read_timeout 60s;

        proxy_hide_header Cache-Control;
        add_header Cache-Control "private, no-store, max-age=0" always;
        add_header X-Robots-Tag "noindex, nofollow, noarchive" always;
        add_header Strict-Transport-Security "max-age=15552000; includeSubDomains" always;
    }

    location ^~ /pricing-data/ {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_read_timeout 60s;
    }

    location ^~ /_next/static/ {
        alias /opt/ai-price/shared/next-static-current/;
        access_log off;
        gzip on;
        gzip_vary on;
        gzip_types text/css application/javascript application/json application/wasm;
        add_header Cache-Control "public, max-age=31536000, immutable";
        add_header Strict-Transport-Security "max-age=15552000; includeSubDomains" always;
        add_header Content-Security-Policy "base-uri 'self'; frame-ancestors 'none'; object-src 'none'" always;
        add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "DENY" always;
    }

    location ~* \.(?:avif|css|gif|ico|jpe?g|js|png|svg|webp|woff2?)$ {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_read_timeout 60s;
    }

    client_max_body_size 1m;

    location / {
        proxy_cache ai_price_public;
        proxy_cache_key "$scheme|$host|$request_uri|$http_accept_language";
        proxy_cache_methods GET HEAD;
        proxy_cache_valid 200 15m;
        proxy_cache_lock on;
        proxy_cache_lock_timeout 10s;
        proxy_cache_lock_age 30s;
        proxy_cache_background_update on;
        proxy_cache_use_stale updating error timeout invalid_header http_500 http_502 http_503 http_504;
        proxy_ignore_headers Cache-Control Expires;
        proxy_cache_bypass
            $ai_price_skip_cache_method
            $ai_price_skip_cache_query
            $ai_price_skip_cache_cookie
            $ai_price_skip_cache_authorization;
        proxy_no_cache
            $ai_price_skip_cache_method
            $ai_price_skip_cache_query
            $ai_price_skip_cache_cookie
            $ai_price_skip_cache_authorization
            $upstream_http_set_cookie;
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_read_timeout 60s;

        proxy_hide_header Cache-Control;
        add_header Cache-Control "private, no-cache, no-store, max-age=0, must-revalidate" always;
        add_header X-Cache-Status $upstream_cache_status always;
        add_header Strict-Transport-Security "max-age=15552000; includeSubDomains" always;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name www.lowpriceradar.com;
    access_log /var/log/nginx/access.log ai_price;

    ssl_certificate /etc/letsencrypt/live/lowpriceradar.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/lowpriceradar.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    server_tokens off;

    add_header Strict-Transport-Security "max-age=15552000; includeSubDomains" always;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/html;
        default_type text/plain;
        try_files $uri =404;
    }

    location / {
        return 301 https://lowpriceradar.com$request_uri;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sfn /etc/nginx/sites-available/ai-price /etc/nginx/sites-enabled/ai-price
nginx -t

systemctl daemon-reload
systemctl enable --now \
  ai-price.service ai-price-collect.timer ai-price-prune-releases.timer \
  nginx certbot.timer
systemctl restart ai-price.service
systemctl reload nginx
verify_api_gateway
find -P /var/cache/nginx/ai-price-public -mindepth 1 -delete

sleep 3
curl -fsS --max-time 15 http://127.0.0.1:3100/ >/dev/null
curl -fsS --max-time 15 -o /dev/null \
  -H "Host: ${PRIMARY_DOMAIN}" http://127.0.0.1/
curl -fsS --max-time 15 --resolve "${PRIMARY_DOMAIN}:443:127.0.0.1" \
  "https://${PRIMARY_DOMAIN}/" >/dev/null
touch "${RELEASE_DIR}/.deploy-success"

install -m 0644 -o "${SERVICE_USER}" -g "${SERVICE_USER}" /dev/null \
  "${RELEASE_DIR}/.release-ready"
release_ready=true
trap - EXIT

OBSERVATION_COUNT="$(
  runuser -u postgres -- psql -d ai_price -Atc \
    'SELECT count(*) FROM price_observations'
)"
if [[ "${OBSERVATION_COUNT}" -gt 0 ]]; then
  echo "INITIAL_COLLECTION_SKIPPED=1"
elif ! systemctl start ai-price-collect.service; then
  echo "INITIAL_COLLECTION_FAILED=1"
else
  echo "INITIAL_COLLECTION_FAILED=0"
fi

echo "DEPLOYED_URL=https://${PRIMARY_DOMAIN}"
echo "RELEASE_DIR=${RELEASE_DIR}"
