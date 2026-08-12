using '../main.bicep'

param location = 'koreacentral'
param namePrefix = 'aicoach'
param environment = 'dev'
// postgresAdminLogin/Password 둘 다 여기 안 적음 — 로컬은 infra/.env(scripts/deploy-infra.sh가 로드),
// CI(infra-deploy.yml)는 GitHub Secrets에서 주입. 둘 다 없으면 아래 기본값(dev 전용, 프로덕션 배포 금지)으로 폴백.
param postgresAdminLogin = readEnvironmentVariable('POSTGRES_ADMIN_LOGIN', 'pgadmin')
param postgresAdminPassword = readEnvironmentVariable('POSTGRES_ADMIN_PASSWORD', 'CHANGE_ME_LOCAL_ONLY')

// kubectl AAD RBAC 클러스터 관리자 오브젝트 ID(쉼표구분, GUID). 빈 문자열이면 빈 배열 — 아무도 없어도
// az aks get-credentials --admin(구독 Owner/Contributor)으로는 항상 접근 가능하니 배포 자체는 안 막힘
param clusterAdminPrincipalIds = !empty(readEnvironmentVariable('CLUSTER_ADMIN_OBJECT_IDS', '')) ? split(readEnvironmentVariable('CLUSTER_ADMIN_OBJECT_IDS', ''), ',') : []
