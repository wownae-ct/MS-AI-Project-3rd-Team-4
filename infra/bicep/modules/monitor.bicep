@description('Log Analytics workspace + Application Insights (AKS Container Insights, ACR/Storage 진단 로그, 앱 관측성 공용)')
param location string
param namePrefix string
param tags object = {}

@description('일일 수집 한도(GB) — 로그 폭주로 인한 예산 초과를 막는 안전장치. 이 규모 프로젝트의 정상 운영 중엔 안 걸리는 여유값')
param dailyQuotaGb int = 2

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2025-07-01' = {
  name: '${namePrefix}-law'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    workspaceCapping: {
      dailyQuotaGb: dailyQuotaGb
    }
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${namePrefix}-appi'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

output logAnalyticsId string = logAnalytics.id
output logAnalyticsCustomerId string = logAnalytics.properties.customerId
output appInsightsConnectionString string = appInsights.properties.ConnectionString
