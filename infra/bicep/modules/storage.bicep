@description('ML 모델 아티팩트(.onnx) Blob 저장소. ml 레포가 az storage blob upload로 올리고, AKS Init Container가 내려받는다.')
param location string
@minLength(3)
param namePrefix string
param tags object = {}

@description('Storage Blob Data Reader 권한을 부여할 principal ID (AKS backend workload identity)')
param backendIdentityPrincipalId string

param logAnalyticsWorkspaceId string

resource storage 'Microsoft.Storage/storageAccounts@2026-04-01' = {
  name: take(replace('${namePrefix}stg', '-', ''), 24)
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
    accessTier: 'Hot'
    // ml 레포가 az storage blob upload 시 계정 키로 인증하므로 유지(비활성화하면 --auth-mode login +
    // Storage Blob Data Contributor RBAC 부여로 전환 작업이 별도로 필요해서 지금은 계정키 유지로 결정)
    allowSharedKeyAccess: true
    // networkAcls 미설정 = 완전 공개(ACR/OpenAI/KeyVault와 동일 패턴). IP 화이트리스트는 AKS 고정
    // 아웃바운드 IP가 선행되어야 해서(안 하면 앱 자체가 막힘) 이번엔 보류하고 RBAC로만 접근 통제.
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2026-04-01' = {
  parent: storage
  name: 'default'
  // Blob soft delete/버전관리는 의도적으로 off — ml 레포가 원본(학습 코드·체크포인트)을 갖고 있어
  // 여긴 재생성 가능한 산출물 저장소일 뿐이라 복구 안전장치의 실익이 적음
}

// 어느 버전 모델을 언제 다운로드했는지 추적 — blob 단위 진단 로그는 storageAccounts가 아니라
// blobServices 하위 리소스에 붙여야 함(Storage 진단 설정의 스코프 규칙)
resource diagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: blobService
  name: 'send-to-log-analytics'
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'Transaction'
        enabled: true
      }
    ]
  }
}

resource modelsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2026-04-01' = {
  parent: blobService
  name: 'models'
  properties: {
    publicAccess: 'None'
  }
}

resource storageBlobReaderRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, backendIdentityPrincipalId, 'StorageBlobDataReader')
  scope: storage
  properties: {
    principalId: backendIdentityPrincipalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1') // Storage Blob Data Reader
    principalType: 'ServicePrincipal'
  }
}

output storageAccountId string = storage.id
output storageAccountName string = storage.name
output blobEndpoint string = storage.properties.primaryEndpoints.blob
