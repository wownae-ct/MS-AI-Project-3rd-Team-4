#!/usr/bin/env bash
# infra/.env를 읽어서 Bicep 문법검증 -> what-if -> (확인 후) 실배포까지 한 번에 실행한다.
# 리소스그룹 자체(az group create)는 최초 1회 수동 생성 필요 — infra/README.md 배포 순서 1번 참고.
# 사용법: ./scripts/deploy-infra.sh [--yes]   (--yes면 what-if 확인 없이 바로 배포)
set -euo pipefail

cd "$(dirname "$0")/.."

# Windows + 한글 로케일(cp949)에서 az CLI가 Bicep description의 em-dash(—) 같은 문자를 콘솔에 출력하려다
# UnicodeEncodeError로 죽는 걸 방지 (what-if/실배포 출력에 파라미터 description이 섞여 나올 수 있음).
export PYTHONIOENCODING=utf-8

ENV_FILE="infra/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "infra/.env가 없습니다. infra/.env.example을 복사해서 값을 채우세요." >&2
  exit 1
fi
set -a
source "$ENV_FILE"
set +a

: "${AZURE_RG:?AZURE_RG가 infra/.env에 없습니다 (리소스그룹 이름)}"
: "${POSTGRES_ADMIN_LOGIN:?POSTGRES_ADMIN_LOGIN이 infra/.env에 없습니다}"
: "${POSTGRES_ADMIN_PASSWORD:?POSTGRES_ADMIN_PASSWORD가 infra/.env에 없습니다}"

if [ -z "${CLUSTER_ADMIN_OBJECT_IDS:-}" ]; then
  echo "경고: CLUSTER_ADMIN_OBJECT_IDS가 비어있습니다 — 배포는 되지만 배포 직후 아무도 AAD RBAC로" >&2
  echo "      kubectl 접근을 못 합니다(az aks get-credentials --admin은 구독 Owner/Contributor면 항상 가능)." >&2
fi

# NAME_PREFIX가 infra/.env에 없으면 대화형으로 물어본다 — 모든 리소스 이름(AKS/ACR/Key Vault/Storage 등)이
# 이 값에서 파생되므로, 이미 이 프리픽스로 한 번 배포한 뒤에 값을 바꾸면 "이름 변경"이 아니라 완전히 새
# 리소스 세트가 만들어진다(기존 리소스는 그대로 남음, 지우려면 따로 az resource delete 필요).
if [ -z "${NAME_PREFIX:-}" ]; then
  echo ""
  echo "리소스 이름에 쓸 프리픽스가 정해져 있지 않습니다(예: aicoach, team4ai)."
  echo "영문 소문자+숫자만, 3~12자 — Key Vault 이름 규칙(24자 제한) 기준으로 넉넉하게 잡은 상한입니다."
  while :; do
    read -r -p "프리픽스 입력: " NAME_PREFIX
    case "$NAME_PREFIX" in
      *[!a-z0-9]*)
        echo "영문 소문자+숫자만 쓸 수 있습니다. 다시 입력하세요."
        continue
        ;;
    esac
    len=${#NAME_PREFIX}
    if [ "$len" -lt 3 ] || [ "$len" -gt 12 ]; then
      echo "3~12자여야 합니다(지금 ${len}자). 다시 입력하세요."
      continue
    fi
    break
  done
  export NAME_PREFIX
  echo "다음부터 다시 안 물어보려면 infra/.env에 NAME_PREFIX=$NAME_PREFIX 를 추가하세요."
  echo ""
fi

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
