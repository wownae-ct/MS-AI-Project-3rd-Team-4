@description('PostgreSQL Flexible Server + pgvector — MVP: public access + Azure 서비스 허용(VNet 미사용, 시간 촉박 시 트레이드오프). AAD(Entra ID) 인증을 비밀번호 인증과 병행 — backend Managed Identity가 비밀번호 없이 접속 가능')
param location string
param namePrefix string
param tags object = {}
param administratorLogin string = 'pgadmin'
@secure()
param administratorLoginPassword string
@allowed(['Standard_B1ms', 'Standard_B2s'])
param skuName string = 'Standard_B2s'
param postgresVersion string = '16'

@description('backend 워크로드용 User Assigned Managed Identity의 principal ID(objectId, aks.bicep의 backendIdentity 출력값) — Postgres AAD 관리자로 등록됨')
param backendIdentityPrincipalId string

@description('pg-connstr 시크릿을 써넣을 대상 Key Vault 이름 — keyvault.bicep이 이 모듈보다 먼저 배포되므로(main.bicep 순서 4번→5번) 여기서 existing으로 참조 가능')
param keyVaultName string

@description('RAG 스키마(speech_guide_doc/chunk 등)가 들어갈 데이터베이스 이름. infra/.env의 DATABASE_NAME으로 채움')
param databaseName string = 'postgres'

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2026-04-01-preview' = {
  name: '${namePrefix}-pg'
  location: location
  tags: tags
  sku: {
    name: skuName
    tier: 'Burstable'
  }
  properties: {
    version: postgresVersion
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorLoginPassword
    // 명시 안 하면 최신 API 버전에서 기본값이 Disabled로 나옴(2026-08-13, 실배포에서 발견 — AAD 관리자 등록이
    // 계속 실패한 진짜 원인. VNet 없는 이 아키텍처는 공개+방화벽 규칙 방식이 전제라 명시적으로 켜야 함).
    network: {
      publicNetworkAccess: 'Enabled'
    }
    authConfig: {
      activeDirectoryAuth: 'Enabled'
      passwordAuth: 'Enabled'
    }
    storage: {
      storageSizeGB: 32
      autoGrow: 'Enabled' // 예상보다 빨리 차도(agent_trace 등) 서비스 중단 없이 넘어가게, 안 늘어나면 비용 영향 없음
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    // rag-cronjob과 동일하게 매주 일요일 03:00(조용한 시간대)으로 고정 — 데모/작업 시간과 안 겹치게
    maintenanceWindow: {
      customWindow: 'Enabled'
      dayOfWeek: 0
      startHour: 3
      startMinute: 0
    }
  }
}

// 서버가 ARM상 Succeeded로 찍힌 직후에도 내부 AAD 인증 서브시스템은 아직 준비 안 된 상태일 수 있어서
// (AadAuthOperationCannotBePerformedWhenServerIsNotAccessible — Azure/azure-postgresql#127, 미해결로
// 남아있는 알려진 이슈) 네이티브 Microsoft.DBforPostgreSQL/flexibleServers/administrators 리소스 선언
// 하나로는 안정적으로 안 됨(고정 시간 sleep도 "얼마나 기다려야 충분한지" 모르는 추측이라 근본 해결이 아님).
// 그래서 실제로 그 명령을 반복 시도해서 "진짜 성공했는지"를 확인하는 스크립트로 대체한다 — 성공하면 즉시
// 끝나고, 실패하면 30초 간격으로 최대 20번(10분)까지 재시도, 그래도 안 되면 스크립트 자체가 실패해서
// 배포가 명확하게 실패로 끝난다(2026-08-13, sleep 180으로도 재현되어 이 방식으로 교체).

// 스크립트가 실제로 az postgres flexible-server ad-admin create를 호출해야 해서 이번엔 identity가 필요함 —
// 이 postgres 리소스에만 국한된 최소 권한(Contributor)만 부여.
resource pgAdminScriptIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2025-05-31-preview' = {
  name: '${namePrefix}-pg-admin-script-id'
  location: location
  tags: tags
}

resource pgAdminScriptRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(postgres.id, pgAdminScriptIdentity.id, 'Contributor')
  scope: postgres
  properties: {
    principalId: pgAdminScriptIdentity.properties.principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b24988ac-6180-42a0-ab88-20f7382dd24c') // Contributor
    principalType: 'ServicePrincipal'
  }
}

resource backendAadAdminScript 'Microsoft.Resources/deploymentScripts@2023-08-01' = {
  name: '${namePrefix}-pg-aad-admin-script'
  location: location
  kind: 'AzureCLI'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${pgAdminScriptIdentity.id}': {}
    }
  }
  properties: {
    azCliVersion: '2.60.0'
    retentionInterval: 'PT1H'
    timeout: 'PT15M'
    cleanupPreference: 'OnExpiration'
    arguments: '${resourceGroup().name} ${postgres.name} ${backendIdentityPrincipalId} ${namePrefix}-backend-id'
    scriptContent: '''
      #!/bin/bash
      set -euo pipefail
      RG="$1"
      SERVER="$2"
      PRINCIPAL_ID="$3"
      DISPLAY_NAME="$4"
      for i in $(seq 1 20); do
        if az postgres flexible-server ad-admin create \
          --resource-group "$RG" --server-name "$SERVER" \
          --object-id "$PRINCIPAL_ID" --display-name "$DISPLAY_NAME" --type ServicePrincipal; then
          echo "AAD admin 등록 성공 (시도 $i번째)"
          exit 0
        fi
        echo "시도 $i 실패 — 30초 후 재시도"
        sleep 30
      done
      echo "20번 다 실패 — 서버가 계속 AAD 작업을 못 받는 상태"
      exit 1
    '''
  }
  dependsOn: [
    pgAdminScriptRoleAssignment
  ]
}

// pgvector 확장 허용 (RAG용 벡터 인덱스)
resource pgExtensions 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2026-04-01-preview' = {
  parent: postgres
  name: 'azure.extensions'
  properties: {
    value: 'VECTOR'
    source: 'user-override'
  }
}

resource allowAzureServices 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2026-04-01-preview' = {
  parent: postgres
  name: 'AllowAllAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2026-03-01-preview' existing = {
  name: keyVaultName
}

// backend가 speech_guide_doc/chunk 등을 upsert/검색할 때 쓰는 연결정보. 비밀번호 없는 DSN —
// AAD 인증(authConfig.activeDirectoryAuth) 전제라 앱이 연결 시점에 AAD 토큰을 password로 넘긴다
// (backend/app/db/__init__.py, database_auth_mode="aad"). "${namePrefix}-backend-id"는
// backendAadAdminScript가 이미 등록하는 이름 그대로 재사용 — 새 output을 만들지 않는다.
resource pgConnstrSecret 'Microsoft.KeyVault/vaults/secrets@2026-03-01-preview' = {
  parent: keyVault
  name: 'pg-connstr'
  properties: {
    value: 'postgresql://${namePrefix}-backend-id@${postgres.properties.fullyQualifiedDomainName}:5432/${databaseName}?sslmode=require'
  }
}

output postgresFqdn string = postgres.properties.fullyQualifiedDomainName
output postgresName string = postgres.name
