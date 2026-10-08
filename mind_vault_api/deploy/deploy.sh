#!/usr/bin/env bash
set -Eeuo pipefail

API_TAG="${1:?API image tag is required}"
ES_TAG="${2:?Elasticsearch image tag is required}"
ACR_REGISTRY="${3:?ACR registry is required}"
ACR_NAMESPACE="${4:?ACR namespace is required}"
API_REPOSITORY="${5:?API repository is required}"
ES_REPOSITORY="${6:?Elasticsearch repository is required}"
cd "$(dirname "$0")"

if [[ "$(sysctl -n vm.max_map_count)" -lt 262144 ]]; then
  echo "vm.max_map_count must be at least 262144 for Elasticsearch" >&2
  exit 1
fi

if [[ "$ACR_REGISTRY" == *replace-me* ]]; then
  echo "ACR_REGISTRY is still a placeholder: ${ACR_REGISTRY}" >&2
  exit 1
fi

set_env_value() {
  local key="$1"
  local value="$2"

  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}

set_env_value ACR_REGISTRY "$ACR_REGISTRY"
set_env_value ACR_NAMESPACE "$ACR_NAMESPACE"
set_env_value API_REPOSITORY "$API_REPOSITORY"
set_env_value ES_REPOSITORY "$ES_REPOSITORY"
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=${API_TAG}/" .env
sed -i "s/^ES_IMAGE_TAG=.*/ES_IMAGE_TAG=${ES_TAG}/" .env

DATA_ROOT="$(sed -n 's/^DATA_DIR=//p' .env | tail -1)"
DATA_ROOT="${DATA_ROOT:-/opt/mind-vault/volumes}"
ES_IMAGE="${ACR_REGISTRY}/${ACR_NAMESPACE}/${ES_REPOSITORY}:${ES_TAG}"

docker compose --project-name mind-vault \
  --env-file .env \
  -f compose.prod.yml pull api worker es

mkdir -p "${DATA_ROOT}/elasticsearch"
docker run --rm \
  --user 0 \
  --entrypoint chown \
  --volume "${DATA_ROOT}/elasticsearch:/usr/share/elasticsearch/data" \
  "${ES_IMAGE}" \
  -R 1000:0 /usr/share/elasticsearch/data

docker compose --project-name mind-vault \
  --env-file .env \
  -f compose.prod.yml up -d --remove-orphans

docker image prune -f

curl --fail --retry 20 --retry-delay 3 \
  http://127.0.0.1:${API_HOST_PORT:-13000}/v1/health
