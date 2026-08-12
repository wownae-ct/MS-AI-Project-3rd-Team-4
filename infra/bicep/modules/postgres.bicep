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

// backend Managed Identity를 AAD 관리자로 등록 — 앱이 비밀번호 없이 접속 가능(설계 문서 "AAD 인증 병행" 반영)
resource backendAadAdmin 'Microsoft.DBforPostgreSQL/flexibleServers/administrators@2026-04-01-preview' = {
  parent: postgres
  name: backendIdentityPrincipalId
  properties: {
    principalType: 'ServicePrincipal'
    principalName: '${namePrefix}-backend-id'
    tenantId: subscription().tenantId
  }
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

output postgresFqdn string = postgres.properties.fullyQualifiedDomainName
output postgresName string = postgres.name
