#!/usr/bin/env bash
set -euo pipefail

PUBLIC_IP="${1:?public IP is required}"
SOURCE_ARCHIVE="${2:-/tmp/ai-price.tar.gz}"
LOCK_FILE="${3:-/tmp/ai-price-package-lock.json}"
APP_ROOT="/opt/ai-price"
ENV_FILE="/etc/ai-price.env"
SERVICE_USER="ai-price"
PRIMARY_DOMAIN="lowpriceradar.com"
CERTIFICATE_DIR="/etc/letsencrypt/live/${PRIMARY_DOMAIN}"

install -d "${APP_ROOT}"
exec 9>"${APP_ROOT}/.deploy.lock"
flock 9
RELEASE_ID="$(date -u +%Y%m%d%H%M%S%N)"
RELEASE_DIR="${APP_ROOT}/releases/${RELEASE_ID}"

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
install -d -o "${SERVICE_USER}" -g "${SERVICE_USER}" "${RELEASE_DIR}"
tar -xzf "${SOURCE_ARCHIVE}" -C "${RELEASE_DIR}"
install -m 0644 "${LOCK_FILE}" "${RELEASE_DIR}/package-lock.json"
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
CONTACT_EMAIL=price@example.com
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
ExecStart=/usr/bin/npm run collect
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
Unit=ai-price-collect.service

[Install]
WantedBy=timers.target
EOF

install -d -o root -g root -m 0755 /var/www/html/.well-known/acme-challenge

cat >/etc/nginx/sites-available/ai-price <<'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    return 444;
}

server {
    listen 80;
    listen [::]:80;
    server_name lowpriceradar.com www.lowpriceradar.com ai.lowpriceradar.com;

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

    ssl_reject_handshake on;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name lowpriceradar.com;

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

    location ~ ^/(?:admin|api|subscription)(?:/|$) {
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

    client_max_body_size 1m;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_read_timeout 60s;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name www.lowpriceradar.com ai.lowpriceradar.com;

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
  ai-price.service ai-price-collect.timer nginx certbot.timer
systemctl restart ai-price.service
systemctl reload nginx

sleep 3
curl -fsS --max-time 15 http://127.0.0.1:3100/ >/dev/null
curl -fsS --max-time 15 -o /dev/null \
  -H "Host: ${PRIMARY_DOMAIN}" http://127.0.0.1/
curl -fsS --max-time 15 --resolve "${PRIMARY_DOMAIN}:443:127.0.0.1" \
  "https://${PRIMARY_DOMAIN}/" >/dev/null

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
