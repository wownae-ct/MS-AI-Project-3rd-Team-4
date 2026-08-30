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

@description('''chat(gpt-5.4) 배포 용량(1000 TPM 단위) — AI상담의 generate+verify가 쓴다.
2026-08-31 실측 기반 상향(250 → 500): 온보딩과 달리 챗은 1인당 LLM 2~3회라 부하가 훨씬 가볍지만,
25명이 동시에 상담을 열면 250(=250K TPM)에 근접한다. Standard/GlobalStandard는 실사용량만큼만
과금이라 안 쓰면 비용 영향이 없고, 유일한 리스크는 구독 쿼터 초과로 배포가 실패하는 것뿐이다(그땐 낮춘다).''')
param chatDeploymentCapacity int = 500

@description('''chat-mini(gpt-5.4-mini) 배포 용량(1000 TPM 단위) — 개인화 에이전트가 쓴다. **여기가 병목이다.**

2026-08-31 staging 실측: 온보딩 1건이 **LLM 19회 / 34,333 토큰**(입력 23,817 + 출력 10,516),
벽시계 14.4초. PR #152로 CHECKLIST·TIMELINE 양쪽이 카테고리 단위로 쪼개지면서 1인당 동시 호출이
최대 18건까지 늘어난 결과다.

25명이 1분 안에 몰리면 34,333 × 25 = **858,325 TPM** — 종전 한도 250(=250K)의 **343%**라 429가 난다.
5분에 걸쳐 분산되면 약 172K로 안전하지만, "다같이 지금 눌러보세요" 식 진행이면 반드시 터진다.
그래서 1000(=1M TPM)으로 올려 **동시 25명 최악 케이스(86%)까지 커버**한다.

개인화가 429로 실패하면 정적 카탈로그로 폴백하므로(체크리스트 95 / 타임라인 87항목) 화면이 비지는
않지만, 데모에서 보여주려는 것이 바로 그 개인화라 의미가 없어진다.''')
param chatMiniDeploymentCapacity int = 1000

@description('''embedding 배포 용량 — RAG 인덱싱(배치)+쿼리 임베딩이라 chat보다 저빈도지만 여유 있게 상향.
2026-08-31에 100 → 300. 쿼리 임베딩은 질문당 1회(재검색 시 2회)라 25명이 몰려도 수십 K TPM 수준이지만,
같은 시간대에 rag-reindex(213청크 배치, 색인당 API 14회)가 겹칠 수 있어 여유를 둔다.''')
param embeddingDeploymentCapacity int = 300

param logAnalyticsWorkspaceId string

@description('backend 워크로드용 Managed Identity principal ID — API 키 대신 이 identity로만 접근하게 함(disableLocalAuth)')
param backendIdentityPrincipalId string

@description('openai-endpoint 시크릿을 써넣을 대상 Key Vault 이름 — keyvault.bicep이 이 모듈보다 먼저 배포되므로(main.bicep 순서 4번→6번) 여기서 existing으로 참조 가능')
param keyVaultName string

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

// 재현성: 배포 한 번으로 K8s SecretProviderClass가 기대하는 openai-endpoint까지 채워지게 함(수동 az keyvault
// secret set 단계를 없앰). endpoint는 disableLocalAuth라서 API 키가 아니라 URL일 뿐이라 시크릿치곤 민감하지
// 않지만, backend가 다른 시크릿(pg-connstr 등)과 동일한 방식(KV CSI 마운트)으로 읽게 해 일관성을 유지함.
resource keyVault 'Microsoft.KeyVault/vaults@2026-03-01-preview' existing = {
  name: keyVaultName
}

// deployer(로컬 사용자/CI OIDC SP)에게 Key Vault 시크릿 쓰기 권한(Secrets Officer)을 부여하는
// roleAssignment는 modules/keyvault.bicep 한 곳에서만 선언한다(이 모듈과 postgres.bicep 둘 다 같은
// Vault에 시크릿을 쓰는데, 서로 의존관계 없이 병렬 배포될 수 있어 각자 선언하면 같은 GUID 리소스를
// 두 번 선언하는 경합이 생길 수 있음). keyVaultName 파라미터를 받는 것만으로 main.bicep의 모듈 간
// 암묵적 dependsOn이 keyvault 모듈(role assignment 포함) 완료를 보장한다.
resource openAiEndpointSecret 'Microsoft.KeyVault/vaults/secrets@2026-03-01-preview' = {
  parent: keyVault
  name: 'openai-endpoint'
  properties: {
    value: openai.properties.endpoint
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
    // chat과 용량을 분리한다(2026-08-31) — 개인화가 chat-mini만 쓰고 그쪽이 병목이라,
    // 하나의 param을 공유하면 chat까지 불필요하게 같이 올려야 한다.
    capacity: chatMiniDeploymentCapacity
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
