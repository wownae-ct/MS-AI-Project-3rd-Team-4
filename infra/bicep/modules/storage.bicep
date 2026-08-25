@description('범용 Blob 저장소. 이전엔 ml 레포가 올리는 ONNX 모델 아티팩트용이었으나(TCN 제거로 사용 종료), 브리프코치에서 답변 오디오 저장 용도로 재사용할 계획이었음 — 메리맵 피벗(2026-08-20)으로 답변 녹음 기능 자체가 없어져 그 용도도 무효화됨. 2026-08-25, 영수증 OCR 자동채움 기능(payments)의 원본 이미지 저장 용도로 첫 실사용처가 확정됨 — 아래 receipts 컨테이너/Contributor RBAC 참고.')
param location string
param namePrefix string
param tags object = {}

@description('Storage Blob Data Contributor 권한을 부여할 principal ID (AKS backend workload identity) — 영수증 이미지 업로드가 실사용처가 되면서 Reader에서 승격(TODO 해소)')
param backendIdentityPrincipalId string

param logAnalyticsWorkspaceId string

@description('storage-blob-endpoint 시크릿을 써넣을 대상 Key Vault 이름 — keyvault.bicep이 이 모듈보다 먼저 배포되므로 여기서 existing으로 참조 가능 (openai.bicep의 openai-endpoint와 동일 패턴)')
param keyVaultName string

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

// 영수증 OCR 자동채움(2026-08-25 결정, payments) 원본 이미지 저장용 컨테이너. publicAccess
// 'None' — 위 allowBlobPublicAccess: false와 이중으로 비공개 강제(계정 레벨 스위치가 꺼져
//있으면 이 값은 사실 무의미하지만, 계정 설정이 나중에 바뀌어도 컨테이너 자체가 안전하도록 명시).
resource receiptsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2026-04-01' = {
  parent: blobService
  name: 'receipts'
  properties: {
    publicAccess: 'None'
  }
}

// 재현성: 배포 한 번으로 K8s SecretProviderClass가 기대하는 storage-blob-endpoint까지 채워지게
// 함(openai.bicep의 openai-endpoint와 동일 이유·동일 패턴 — endpoint는 disableLocalAuth라
// API 키가 아니라 URL일 뿐이라 시크릿치곤 민감하지 않지만, backend가 다른 시크릿과 동일한
// 방식(KV CSI 마운트)으로 읽게 해 일관성을 유지함).
resource keyVault 'Microsoft.KeyVault/vaults@2026-03-01-preview' existing = {
  name: keyVaultName
}

resource storageBlobEndpointSecret 'Microsoft.KeyVault/vaults/secrets@2026-03-01-preview' = {
  parent: keyVault
  name: 'storage-blob-endpoint'
  properties: {
    value: storage.properties.primaryEndpoints.blob
  }
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

// 영수증 이미지 업로드(쓰기)가 실사용처가 되면서 Reader→Contributor로 승격(위 TODO 해소,
// 2026-08-25). guid() 시드에 role 이름 문자열이 들어있어 기존 Reader roleAssignment와는
// 별개의 리소스 이름이 나오므로, 배포 시 기존 Reader 할당은 자동으로 제거되고 이 Contributor
// 할당이 새로 생성된다(Bicep의 기존 리소스 정리 동작 — 템플릿에서 사라진 리소스는 삭제됨).
resource storageBlobContributorRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, backendIdentityPrincipalId, 'StorageBlobDataContributor')
  scope: storage
  properties: {
    principalId: backendIdentityPrincipalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe') // Storage Blob Data Contributor
    principalType: 'ServicePrincipal'
  }
}

output storageAccountId string = storage.id
output storageAccountName string = storage.name
output blobEndpoint string = storage.properties.primaryEndpoints.blob
