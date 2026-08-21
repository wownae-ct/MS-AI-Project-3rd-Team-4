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
    // enablePurgeProtection 프로퍼티 자체를 명시 안 함(2026-08-13 수정) — 원래 "20일짜리 프로젝트라 개발 편의
    // 우선, false로 명시"였는데, 실배포 중 같은 이름의 soft-delete된 Vault가 purge protection true인 채로
    // 남아있어서 false로 덮어쓰려다 "cannot be set to false"(불가역 속성이라) 배포 실패함. 이 프로퍼티를 아예
    // 안 적으면 soft-delete 복구 시 기존 값을 그대로 유지하고, 신규 생성 시엔 플랫폼 기본값을 따라가서
    // 이런 충돌 자체가 안 생김.
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

// 이 배포를 실행하는 주체(로컬 사용자 또는 CI OIDC SP)에게 Key Vault 시크릿 쓰기 권한 부여 — RBAC 인증
// 모드에서는 Contributor 역할만으론 시크릿 데이터 평면에 접근 못 함(Key Vault 특유의 제약). openai.bicep/
// postgres.bicep 둘 다 이 Vault에 시크릿을 쓰기 전에 필요 — 두 모듈은 서로 의존관계가 없어 병렬로 배포될
// 수 있으므로, 각 모듈이 따로 같은 GUID의 roleAssignment를 선언하면 경합이 생길 수 있다. 그래서 여기
// keyvault 모듈 한 곳에서만 선언하고, openai/postgres는 keyVaultName 파라미터를 받는 것만으로(main.bicep의
// 모듈 간 암묵적 dependsOn) 이 role assignment가 끝난 뒤에 실행되도록 보장한다.
resource deployerSecretsOfficerRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, deployer().objectId, 'KeyVaultSecretsOfficer')
  scope: keyVault
  properties: {
    principalId: deployer().objectId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7') // Key Vault Secrets Officer
    // deployer()는 principalType을 안 알려줌 — userPrincipalName이 있으면 사람 계정, 없으면 SP/관리 ID로 판단
    principalType: empty(deployer().userPrincipalName) ? 'ServicePrincipal' : 'User'
  }
}

output keyVaultId string = keyVault.id
output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
