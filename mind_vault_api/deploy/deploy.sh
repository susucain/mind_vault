#!/usr/bin/env bash
set -Eeuo pipefail

API_TAG="${1:?API image tag is required}"
ES_TAG="${2:?Elasticsearch image tag is required}"
cd "$(dirname "$0")"

if [[ "$(sysctl -n vm.max_map_count)" -lt 262144 ]]; then
  echo "vm.max_map_count must be at least 262144 for Elasticsearch" >&2
  exit 1
fi

sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=${API_TAG}/" .env
sed -i "s/^ES_IMAGE_TAG=.*/ES_IMAGE_TAG=${ES_TAG}/" .env

docker compose --project-name mind-vault \
  --env-file .env \
  -f compose.prod.yml pull api worker es

docker compose --project-name mind-vault \
  --env-file .env \
  -f compose.prod.yml up -d --remove-orphans

docker image prune -f

curl --fail --retry 20 --retry-delay 3 \
  http://127.0.0.1:${API_HOST_PORT:-13000}/v1/health
