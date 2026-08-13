@description('Microsoft Foundry(구 Azure OpenAI) — coach/safety/planner 에이전트 공용 LLM + RAG 임베딩. 전 리소스와 동일 리전(koreacentral) 유지 — gpt-5.4는 koreacentral에서 Standard/GlobalStandard 둘 다 지원됨(2026-08-13 확인).\nkind: AIServices(+ allowProjectManagement)로 처음부터 Foundry 리소스로 배포 — Azure OpenAI 전용 kind와 같은 리소스 타입이고 요금도 동일(실사용량만 과금), 다만 Speech/Vision/Language, Agent Service, 더 넓은 모델 카탈로그가 같은 리소스 밑에서 바로 열림(2026-08-13, Microsoft Learn "Upgrade Azure OpenAI to Microsoft Foundry" 확인 후 결정 — 굳이 나중에 kind를 바꾸는 마이그레이션을 거칠 이유가 없음).')
param location string
param namePrefix string
param tags object = {}
@allowed(['S0'])
param sku string = 'S0'
param chatModelName string = 'gpt-5.4'
param chatModelVersion string = '2026-03-05'
@description('gpt-5.4-mini — 가볍고 빠른 응답이 필요한 경로(T2 코칭 스트리밍 등)에 chat 대신 붙일 수 있는 저지연/저비용 대안. koreacentral GlobalStandard 지원 확인됨(2026-08-13)')
param chatMiniModelName string = 'gpt-5.4-mini'
param chatMiniModelVersion string = '2026-03-17'
@description('gpt-5.4처럼 최근 출시된 플래그십 모델은 리전 Standard 용량 제약이 잦아 GlobalStandard를 기본값으로 둠')
param chatDeploymentSkuName string = 'GlobalStandard'
param embeddingModelName string = 'text-embedding-3-small'
param embeddingModelVersion string = '1'

@description('chat/chat-mini 배포 공통 용량(1000 TPM 단위). 발표일 최대 25명 동시접속 대비 여유있게 잡음 — Standard/GlobalStandard는\n실사용량만큼만 과금이라 안 쓰면 비용 영향 없고, 유일한 리스크는 구독 쿼터 초과로 배포 실패뿐(그땐 낮추면 됨)')
param chatDeploymentCapacity int = 250

@description('embedding 배포 용량 — RAG 인덱싱(배치)+쿼리 임베딩이라 chat보다 저빈도지만 여유 있게 상향')
param embeddingDeploymentCapacity int = 100

param logAnalyticsWorkspaceId string

@description('backend 워크로드용 Managed Identity principal ID — API 키 대신 이 identity로만 접근하게 함(disableLocalAuth)')
param backendIdentityPrincipalId string

resource openai 'Microsoft.CognitiveServices/accounts@2026-05-15-preview' = {
  name: '${namePrefix}-aoai'
  location: location
  tags: tags
  // AIServices = Foundry 리소스(Azure OpenAI의 상위집합, 같은 리소스 타입·같은 요금). 나중에 Speech/Agent Service가
  // 필요해지면 kind 마이그레이션 없이 이 리소스에서 바로 확장 가능 — Azure OpenAI 전용(kind: 'OpenAI')으로
  // 시작했다가 나중에 옮기는 것과 비용/설정 차이가 없어서 처음부터 Foundry로 배포함.
  kind: 'AIServices'
  identity: {
    // Foundry 프로젝트 관리(allowProjectManagement)에 필요 — backend가 이 리소스를 호출할 때 쓰는
    // backendIdentity(User-Assigned)와는 별개, 리소스 자체의 identity
    type: 'SystemAssigned'
  }
  sku: {
    name: sku
  }
  properties: {
    customSubDomainName: '${namePrefix}-aoai'
    // 공개+RBAC 유지 — Storage IP 화이트리스트 검토 때와 동일 결론(AKS 고정 아웃바운드 IP 없인 앱 자체가 막힘)
    publicNetworkAccess: 'Enabled'
    // API 키를 아예 비활성화 — 이 리소스는 backend만 쓰고(Storage처럼 외부 도구가 정적 키로 접근할 필요 없음),
    // Postgres AAD/Key Vault RBAC-only와 같은 "정적 비밀 없이 Managed Identity로만" 패턴을 여기도 적용
    disableLocalAuth: true
    // Foundry 기능(프로젝트/Agent Service 등)을 쓰려면 필수 — kind: AIServices와 짝
    allowProjectManagement: true
  }
}

// backend Managed Identity에 "Cognitive Services OpenAI User" 부여 — API 키 없이 chat/embedding 호출 가능
resource openaiUserRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(openai.id, backendIdentityPrincipalId, 'CognitiveServicesOpenAIUser')
  scope: openai
  properties: {
    principalId: backendIdentityPrincipalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd') // Cognitive Services OpenAI User
    principalType: 'ServicePrincipal'
  }
}

resource diagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: openai
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
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

resource chatDeployment 'Microsoft.CognitiveServices/accounts/deployments@2026-05-15-preview' = {
  parent: openai
  name: 'chat'
  sku: {
    name: chatDeploymentSkuName
    capacity: chatDeploymentCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: chatModelName
      version: chatModelVersion
    }
  }
}

resource chatMiniDeployment 'Microsoft.CognitiveServices/accounts/deployments@2026-05-15-preview' = {
  parent: openai
  name: 'chat-mini'
  sku: {
    name: chatDeploymentSkuName
    capacity: chatDeploymentCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: chatMiniModelName
      version: chatMiniModelVersion
    }
  }
  dependsOn: [
    chatDeployment
  ]
}

resource embeddingDeployment 'Microsoft.CognitiveServices/accounts/deployments@2026-05-15-preview' = {
  parent: openai
  name: 'embedding'
  sku: {
    // 'Standard'는 koreacentral에서 text-embedding-3-small을 지원 안 함(실배포 확인, 2026-08-13) — chat/chat-mini와
    // 동일하게 GlobalStandard로 통일.
    name: 'GlobalStandard'
    capacity: embeddingDeploymentCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: embeddingModelName
      version: embeddingModelVersion
    }
  }
  dependsOn: [
    chatMiniDeployment
  ]
}

output openAiEndpoint string = openai.properties.endpoint
output openAiName string = openai.name
