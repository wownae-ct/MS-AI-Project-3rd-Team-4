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
// 2026-08-26 발견 — 폴백 기본값이 postgres(서버 기본 DB)였는데 CI(infra-deploy.yml)에
// DATABASE_NAME env var가 실제로는 연결돼 있지 않아 실배포마다 이 폴백으로 조용히 되돌아가던
// 버그(로그인 500 "relation users does not exist", modules/postgres.bicep 머리말 참고).
param postgresDatabaseName = readEnvironmentVariable('DATABASE_NAME', 'team4db-wd')

// kubectl AAD RBAC 클러스터 관리자 오브젝트 ID(쉼표구분, GUID). 빈 문자열이면 빈 배열 — 아무도 없어도
// az aks get-credentials --admin(구독 Owner/Contributor)으로는 항상 접근 가능하니 배포 자체는 안 막힘
param clusterAdminPrincipalIds = !empty(readEnvironmentVariable('CLUSTER_ADMIN_OBJECT_IDS', '')) ? split(readEnvironmentVariable('CLUSTER_ADMIN_OBJECT_IDS', ''), ',') : []

// 소셜 로그인(구글/네이버, 00_BASELINE.md §0-2 Should) — postgresAdminPassword와 동일 패턴.
// 로컬은 infra/.env(scripts/deploy-infra.sh가 로드), CI(infra-deploy.yml)는 GitHub Secrets에서
// 주입. 둘 다 없으면 아래 기본값(dev 전용 플레이스홀더)으로 폴백 — 실제 로그인은 안 되지만
// 파드는 정상 부팅한다(app/core/config.py의 필수 필드가 채워지기만 하면 됨).
param googleClientId = readEnvironmentVariable('GOOGLE_CLIENT_ID', 'CHANGE_ME_LOCAL_ONLY')
param googleClientSecret = readEnvironmentVariable('GOOGLE_CLIENT_SECRET', 'CHANGE_ME_LOCAL_ONLY')
param naverClientId = readEnvironmentVariable('NAVER_CLIENT_ID', 'CHANGE_ME_LOCAL_ONLY')
param naverClientSecret = readEnvironmentVariable('NAVER_CLIENT_SECRET', 'CHANGE_ME_LOCAL_ONLY')

// Langfuse(14_langfuse_tracing_design.md) — 위와 동일 패턴. 주의: 이 값은 이미 라이브로 쓰이고
// 있어서(PR #42), CHANGE_ME_LOCAL_ONLY 폴백으로 실배포하면 기존 정상 트레이싱을 깨뜨린다 —
// 실배포 전엔 반드시 infra/.env에 실제 값을 채울 것(로컬 검증은 what-if로, 값 노출 없이 가능).
param langfusePublicKey = readEnvironmentVariable('LANGFUSE_PUBLIC_KEY', 'CHANGE_ME_LOCAL_ONLY')
param langfuseSecretKey = readEnvironmentVariable('LANGFUSE_SECRET_KEY', 'CHANGE_ME_LOCAL_ONLY')
