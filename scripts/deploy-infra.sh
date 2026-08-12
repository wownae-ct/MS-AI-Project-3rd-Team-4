#!/usr/bin/env bash
# infra/.env를 읽어서 Bicep 문법검증 -> what-if -> (확인 후) 실배포까지 한 번에 실행한다.
# 리소스그룹 자체(az group create)는 최초 1회 수동 생성 필요 — infra/README.md 배포 순서 1번 참고.
# 사용법: ./scripts/deploy-infra.sh [--yes]   (--yes면 what-if 확인 없이 바로 배포)
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="infra/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "infra/.env가 없습니다. infra/.env.example을 복사해서 값을 채우세요." >&2
  exit 1
fi
set -a
source "$ENV_FILE"
set +a

: "${AZURE_RG:?AZURE_RG가 infra/.env에 없습니다 (리소스그룹 이름)}"
: "${POSTGRES_ADMIN_PASSWORD:?POSTGRES_ADMIN_PASSWORD가 infra/.env에 없습니다}"

if [ -n "${AZURE_SUBSCRIPTION:-}" ]; then
  echo "1) 구독 전환: $AZURE_SUBSCRIPTION"
  az account set --subscription "$AZURE_SUBSCRIPTION"
fi

echo "2) Bicep 문법 검증"
az bicep build --file infra/bicep/main.bicep

echo "3) what-if (미리보기, 실제 변경 없음)"
az deployment group what-if \
  --resource-group "$AZURE_RG" \
  --template-file infra/bicep/main.bicep \
  --parameters infra/bicep/params/dev.bicepparam

if [ "${1:-}" = "--yes" ]; then
  CONFIRM=yes
else
  read -r -p "위 변경사항대로 실제 배포할까요? (yes 입력 시에만 진행) " CONFIRM
fi

if [ "$CONFIRM" = "yes" ]; then
  echo "4) 실배포"
  az deployment group create \
    --resource-group "$AZURE_RG" \
    --template-file infra/bicep/main.bicep \
    --parameters infra/bicep/params/dev.bicepparam
else
  echo "취소됨 — what-if까지만 실행했습니다."
fi
