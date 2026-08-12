@description('Azure OpenAI — coach/safety/planner 에이전트 공용 LLM + RAG 임베딩. 전 리소스와 동일 리전(koreacentral) 유지 — gpt-5.4는 koreacentral에서 Standard/GlobalStandard 둘 다 지원됨(2026-08-13 확인)')
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
  kind: 'OpenAI'
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
    name: 'Standard'
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
