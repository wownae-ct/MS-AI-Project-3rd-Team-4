using '../main.bicep'

param location = 'koreacentral'
// namePrefix는 폴백 기본값을 일부러 안 둔다(readEnvironmentVariable 2번째 인자 없음) — NAME_PREFIX가
// 환경변수에 없으면 여기서 바로 빌드 에러로 죽는다. scripts/deploy-infra.sh가 실행 시 대화형으로 물어봐서
// 항상 채워주므로, 이 스크립트를 거치지 않고 실수로 값 없이 배포되는 걸 막기 위한 안전장치.
param namePrefix = readEnvironmentVariable('NAME_PREFIX')
param environment = readEnvironmentVariable('DEPLOY_ENVIRONMENT', 'dev')
// postgresAdminLogin/Password 둘 다 여기 안 적음 — 로컬은 infra/.env(scripts/deploy-infra.sh가 로드),
// CI(infra-deploy.yml)는 GitHub Secrets에서 주입. 둘 다 없으면 아래 기본값(dev 전용, 프로덕션 배포 금지)으로 폴백.
param postgresAdminLogin = readEnvironmentVariable('POSTGRES_ADMIN_LOGIN', 'pgadmin')
param postgresAdminPassword = readEnvironmentVariable('POSTGRES_ADMIN_PASSWORD', 'CHANGE_ME_LOCAL_ONLY')

// kubectl AAD RBAC 클러스터 관리자 오브젝트 ID(쉼표구분, GUID). 빈 문자열이면 빈 배열 — 아무도 없어도
// az aks get-credentials --admin(구독 Owner/Contributor)으로는 항상 접근 가능하니 배포 자체는 안 막힘
param clusterAdminPrincipalIds = !empty(readEnvironmentVariable('CLUSTER_ADMIN_OBJECT_IDS', '')) ? split(readEnvironmentVariable('CLUSTER_ADMIN_OBJECT_IDS', ''), ',') : []
