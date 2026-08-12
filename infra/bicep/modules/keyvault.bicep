@description('시크릿 저장소 — RBAC 인증 사용(액세스 정책 대신). 앱은 AKS Workload Identity로 직접 조회')
param location string
param namePrefix string
param tags object = {}
param tenantId string = subscription().tenantId

@description('Key Vault Secrets User 권한을 부여할 principal ID (AKS backend workload identity). 같은 모듈 안에서 처리해야 BCP120(모듈 출력값으로 만든 existing 참조를 roleAssignment scope/name에 못 씀) 오류를 피할 수 있다.')
param backendIdentityPrincipalId string

resource keyVault 'Microsoft.KeyVault/vaults@2026-03-01-preview' = {
  name: take('${namePrefix}-kv', 24)
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    // 20일짜리 프로젝트, 08-31 이후 리소스그룹 자체를 지울 예정이라 개발 편의(같은 이름으로 즉시 재배포) 우선 — 의도적으로 off
    enablePurgeProtection: false
    // networkAcls 미설정 = 완전 공개(ACR/OpenAI와 동일 패턴). VNet 미도입 결정에 따라 RBAC+Managed Identity로만 접근 통제.
    // 아래 3개(포털 "액세스 구성" 탭의 레거시 리소스 액세스 체크박스)는 이 아키텍처에 해당 없어 명시적으로 off:
    // VM 없음(AKS는 관리형) / 시크릿은 GitHub Secret→env var로 주입(ARM 템플릿에서 KV 직접 참조 안 함) / 디스크 암호화 키소스로 KV 미사용
    enabledForDeployment: false
    enabledForTemplateDeployment: false
    enabledForDiskEncryption: false
  }
}

resource kvSecretsUserRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, backendIdentityPrincipalId, 'KeyVaultSecretsUser')
  scope: keyVault
  properties: {
    principalId: backendIdentityPrincipalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6') // Key Vault Secrets User
    principalType: 'ServicePrincipal'
  }
}

output keyVaultId string = keyVault.id
output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
