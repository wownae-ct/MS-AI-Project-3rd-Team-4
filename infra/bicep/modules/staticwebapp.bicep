@description('프론트엔드 정적 호스팅 — GitHub Actions(frontend-ci.yml)가 별도로 빌드/배포, 여기선 리소스만 생성')
param location string = 'eastus2'   // SWA는 일부 리전만 지원, 메인 배포 리전과 다를 수 있음
param namePrefix string
param tags object = {}
@allowed(['Free', 'Standard'])
param sku string = 'Free'

resource staticWebApp 'Microsoft.Web/staticSites@2025-03-01' = {
  name: '${namePrefix}-swa'
  location: location
  tags: tags
  sku: {
    name: sku
    tier: sku
  }
  properties: {
    provider: 'GitHub'
    // repositoryUrl/branch/repositoryToken은 의도적으로 미설정 — 채우면 SWA가 자체 GitHub Actions
    // 워크플로를 자동생성해서 이미 손으로 짠 frontend-ci.yml(빌드는 러너에서, 배포는 업로드만)과 충돌함
    stagingEnvironmentPolicy: 'Enabled' // frontend-ci.yml이 PR마다 프리뷰 배포 + 닫히면 정리(close_pull_request)까지 실제로 씀
  }
}

output defaultHostname string = staticWebApp.properties.defaultHostname
output staticWebAppName string = staticWebApp.name
