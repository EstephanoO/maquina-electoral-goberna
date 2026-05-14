#!/bin/sh
# Render the chosen nginx template into /etc/nginx/conf.d/default.conf.
# Selected via NGINX_TEMPLATE env (default: default.http.conf.template).
set -e

TEMPLATE="${NGINX_TEMPLATE:-default.http.conf.template}"
SRC="/etc/nginx/templates/${TEMPLATE}"

if [ ! -f "$SRC" ]; then
  echo "FATAL: nginx template not found at $SRC" >&2
  exit 1
fi

envsubst '${API_DOMAIN} ${BACKEND_PORT}' < "$SRC" > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
