targetScope = 'resourceGroup'

@description('배포 리전 (Static Web Apps는 modules/staticwebapp.bicep에서 별도 리전 사용)')
param location string = resourceGroup().location

@minLength(3)
@maxLength(12)
@description('리소스 이름 프리픽스(팀/프로젝트 식별용, 영문 소문자+숫자만). 3~12자 제한은 가장 타이트한 하위 리소스인 Key Vault 이름 규칙(뒤에 -kv 붙는 형태로 24자 제한)에서 역산한 여유값. 기본값 없음(의도적) — infra/bicep/params/dev.bicepparam이 infra/.env의 NAME_PREFIX를 강제로 읽게 돼 있고, scripts/deploy-infra.sh가 실행 시 대화형으로 물어봐서 항상 채움')
param namePrefix string

@description('환경 태그(dev/staging 등). infra/.env의 DEPLOY_ENVIRONMENT로 채움')
param environment string = 'dev'

@description('Postgres 관리자 로그인 아이디')
param postgresAdminLogin string = 'pgadmin'

@secure()
@description('Postgres 관리자 비밀번호. CI에서는 secrets.POSTGRES_ADMIN_PASSWORD로 주입')
param postgresAdminPassword string

@description('kubectl AAD RBAC 클러스터 관리자로 등록할 AAD 오브젝트 ID들. 이메일이 아니라 GUID 필요 —\ndev.bicepparam에서 infra/.env의 CLUSTER_ADMIN_OBJECT_IDS(쉼표구분)로 채움')
param clusterAdminPrincipalIds array = []

var tags = {
  project: namePrefix
  environment: environment
}

// 1) 관측성 먼저 — AKS Container Insights가 이 워크스페이스 ID를 필요로 함
module monitor 'modules/monitor.bicep' = {
  name: 'monitor'
  params: {
    location: location
    namePrefix: namePrefix
    tags: tags
  }
}

// 2) 이미지 레지스트리 — AKS가 여기에 AcrPull 권한을 부여받음
module acr 'modules/acr.bicep' = {
  name: 'acr'
  params: {
    location: location
    namePrefix: namePrefix
    tags: tags
    logAnalyticsWorkspaceId: monitor.outputs.logAnalyticsId
  }
}

// 3) AKS — Workload Identity(OIDC) + Container Insights + ACR pull 권한 + backend용 User-Assigned Identity
module aks 'modules/aks.bicep' = {
  name: 'aks'
  params: {
    location: location
    namePrefix: namePrefix
    tags: tags
    acrName: acr.outputs.acrName
    logAnalyticsWorkspaceId: monitor.outputs.logAnalyticsId
    clusterAdminPrincipalIds: clusterAdminPrincipalIds
  }
}

// 4) 시크릿 저장소 — backend 워크로드 identity에 "Key Vault Secrets User"만 부여(최소 권한, 모듈 내부에서 처리)
module keyvault 'modules/keyvault.bicep' = {
  name: 'keyvault'
  params: {
    location: location
    namePrefix: namePrefix
    tags: tags
    backendIdentityPrincipalId: aks.outputs.backendIdentityPrincipalId
  }
}

// 5) DB — PostgreSQL Flexible Server + pgvector (RAG 벡터 검색)
module postgres 'modules/postgres.bicep' = {
  name: 'postgres'
  params: {
    location: location
    namePrefix: namePrefix
    tags: tags
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    backendIdentityPrincipalId: aks.outputs.backendIdentityPrincipalId
  }
}

// 6) LLM — coach/safety/planner가 호출하는 chat 모델 + retriever가 쓰는 embedding 모델
module openai 'modules/openai.bicep' = {
  name: 'openai'
  params: {
    location: location
    namePrefix: namePrefix
    tags: tags
    logAnalyticsWorkspaceId: monitor.outputs.logAnalyticsId
    backendIdentityPrincipalId: aks.outputs.backendIdentityPrincipalId
  }
}

// 7) 프론트엔드 정적 호스팅 (배포 자체는 frontend-ci.yml GitHub Action이 담당)
module staticwebapp 'modules/staticwebapp.bicep' = {
  name: 'staticwebapp'
  params: {
    namePrefix: namePrefix
    tags: tags
  }
}

// 8) ML 모델 아티팩트 Blob 저장소 — ml 레포가 업로드, AKS Init Container가 다운로드(ConfigMap의 버전 태그 기준). 읽기 권한도 모듈 내부에서 처리
module storage 'modules/storage.bicep' = {
  name: 'storage'
  params: {
    location: location
    namePrefix: namePrefix
    tags: tags
    backendIdentityPrincipalId: aks.outputs.backendIdentityPrincipalId
    logAnalyticsWorkspaceId: monitor.outputs.logAnalyticsId
  }
}

output aksName string = aks.outputs.aksName
output oidcIssuerUrl string = aks.outputs.oidcIssuerUrl
output backendIdentityClientId string = aks.outputs.backendIdentityClientId
output imageUpdaterIdentityClientId string = aks.outputs.imageUpdaterIdentityClientId
output acrLoginServer string = acr.outputs.acrLoginServer
output keyVaultUri string = keyvault.outputs.keyVaultUri
output postgresFqdn string = postgres.outputs.postgresFqdn
output openAiEndpoint string = openai.outputs.openAiEndpoint
output staticWebAppDefaultHostname string = staticwebapp.outputs.defaultHostname
output appInsightsConnectionString string = monitor.outputs.appInsightsConnectionString
output storageAccountName string = storage.outputs.storageAccountName
output blobEndpoint string = storage.outputs.blobEndpoint
