@description('범용 Blob 저장소. 이전엔 ml 레포가 올리는 ONNX 모델 아티팩트용이었으나(TCN 제거로 사용 종료), 브리프코치에서는 답변 오디오 저장 용도로 재사용 예정 — 실제 컨테이너/RBAC는 오디오 업로드 구현 시 추가.')
param location string
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
    allowSharedKeyAccess: true
    // networkAcls 미설정 = 완전 공개(ACR/OpenAI/KeyVault와 동일 패턴). IP 화이트리스트는 AKS 고정
    // 아웃바운드 IP가 선행되어야 해서(안 하면 앱 자체가 막힘) 이번엔 보류하고 RBAC로만 접근 통제.
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2026-04-01' = {
  parent: storage
  name: 'default'
}

// blob 단위 진단 로그는 storageAccounts가 아니라 blobServices 하위 리소스에 붙여야 함
// (Storage 진단 설정의 스코프 규칙)
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

// TODO(오디오 업로드 구현 시): 답변 오디오용 컨테이너(예: 'answers')를 여기 추가하고, 업로드까지
// 하려면 아래 역할을 Reader가 아니라 Storage Blob Data Contributor로 올려야 한다.

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
