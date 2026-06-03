#requires -Version 5.1
# Atlas 샘플 데이터 시드 — 테스트 풍부도 확보용. dev backend (:5200) 가 실행 중일 때 사용.

$ErrorActionPreference = 'Stop'
$base = 'http://localhost:5200/api'
$actorHeader = @{ 'X-Atlas-Actor' = [System.Net.WebUtility]::UrlEncode('seed-loader') }

function Post($path, $body) {
  $json = ConvertTo-Json $body -Depth 10 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  return Invoke-RestMethod -Uri "$base$path" -Method Post -Headers $actorHeader -ContentType 'application/json; charset=utf-8' -Body $bytes
}
function Put($path, $body) {
  $json = ConvertTo-Json $body -Depth 10 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  return Invoke-RestMethod -Uri "$base$path" -Method Put -Headers $actorHeader -ContentType 'application/json; charset=utf-8' -Body $bytes
}

function Iso($d) { return $d.ToString('yyyy-MM-dd') }

$today = [datetime]::Today
$weekStart = $today.AddDays(- ([int]$today.DayOfWeek)) # Sunday-based
$mondayThisWeek = if ($today.DayOfWeek -eq [DayOfWeek]::Sunday) { $today.AddDays(-6) } else { $today.AddDays(1 - [int]$today.DayOfWeek) }

Write-Host '== 1) Resources ==' -ForegroundColor Cyan
$resourceData = @(
  @{ name='김민준'; type='Person';    department='백엔드';     email='minjun.k@atlas.test';  phone='010-1111-2222'; notes='Spring/Java 10년차' }
  @{ name='이서연'; type='Person';    department='프론트엔드'; email='seoyeon.l@atlas.test'; phone='010-3333-4444'; notes='React/TS, 시니어' }
  @{ name='박지훈'; type='Person';    department='백엔드';     email='jihoon.p@atlas.test';  phone='010-5555-6666'; notes='.NET / EF Core' }
  @{ name='최유나'; type='Person';    department='디자인';     email='yuna.c@atlas.test';    phone='010-7777-8888'; notes='UX 리드' }
  @{ name='정도현'; type='Person';    department='QA';         email='dohyun.j@atlas.test';  phone='010-9999-0000'; notes='자동화 테스트' }
  @{ name='강하늘'; type='Person';    department='DevOps';     email='haneul.k@atlas.test';  phone='010-1212-3434'; notes='K8s / GitOps' }
  @{ name='윤서아'; type='Person';    department='기획';       email='seoa.y@atlas.test';    phone='010-5656-7878'; notes='PM, 데이터 기반' }
  @{ name='개발 노트북 A'; type='Equipment'; department='IT'; email=''; phone=''; notes='Dell XPS 15, 회의실 대여용' }
  @{ name='발표용 빔';   type='Equipment'; department='IT'; email=''; phone=''; notes='4K 프로젝터' }
  @{ name='맥북 Pro M3'; type='Equipment'; department='IT'; email=''; phone=''; notes='디자인팀 공용' }
)
$resources = @()
foreach ($r in $resourceData) {
  $created = Post '/resources' $r
  $resources += $created
  Write-Host "  + $($created.name) #$($created.id)"
}

Write-Host '== 2) Projects ==' -ForegroundColor Cyan
$projectData = @(
  @{
    name='Atlas v1.5 릴리즈'
    category='내부'
    description="UI/UX 로드맵 P0~P8 완료 + 백엔드 안정화. 다중 사용자 공유 폴더 베타 진입."
    goal='2026년 6월 v1.5 GA. 로컬 모드 안정성 + 라이트 모드 동등 가독성 + 다중 사용자 락 인프라.'
    status='InProgress'
    startDate=(Iso $today.AddDays(-30))
    endDate=(Iso $today.AddDays(45))
    budget=50000000
    participants='김민준, 이서연, 박지훈, 정도현'
    deliverables='Atlas-Desktop-1.5.exe, 운영 가이드, 마이그레이션 스크립트'
    relatedLinks="https://github.com/example/atlas/milestone/15`nhttps://docs.atlas.test/release/1.5"
  }
  @{
    name='데이터 분석 파이프라인'
    category='사업'
    description='고객 행동 로그를 실시간으로 수집·집계해 BI 대시보드에 노출. Kafka + ClickHouse + Grafana.'
    goal='1초 latency 안에서 10K events/s 처리. 분석가 셀프서비스 5건 출시.'
    status='InProgress'
    startDate=(Iso $today.AddDays(-60))
    endDate=(Iso $today.AddDays(20))
    budget=120000000
    participants='박지훈, 강하늘, 윤서아'
    deliverables='Kafka 클러스터, ClickHouse 운영, Grafana 대시보드 12종'
    relatedLinks="https://wiki.atlas.test/data/pipeline"
  }
  @{
    name='모바일 앱 MVP'
    category='과제'
    description='Atlas 의 핵심 워크플로 (이슈/회의록) 를 모바일 친화 UI 로. iOS + Android.'
    goal='3개월 안 MVP 출시 — 이슈 조회/작성, 회의록 읽기, push 알림.'
    status='Waiting'
    startDate=(Iso $today.AddDays(7))
    endDate=(Iso $today.AddDays(100))
    budget=80000000
    participants='이서연, 최유나, 윤서아'
    deliverables='iOS TestFlight, Android Internal Track, 사용자 가이드'
    relatedLinks=''
  }
)
$projects = @()
foreach ($p in $projectData) {
  $created = Post '/projects' $p
  $projects += $created
  Write-Host "  + $($created.name) #$($created.id)"
}

Write-Host '== 3) Per-project data ==' -ForegroundColor Cyan
$pAtlas = $projects[0]
$pData  = $projects[1]
$pMobile = $projects[2]

function MakeWbs($project, $items) {
  $created = @()
  foreach ($it in $items) {
    $parentId = $null
    if ($it.parentKey) {
      $parent = $created | Where-Object { $_._key -eq $it.parentKey } | Select-Object -First 1
      if ($parent) { $parentId = $parent.id }
    }
    $body = @{
      projectId   = $project.id
      versionId   = $null
      parentId    = $parentId
      name        = $it.name
      assignee    = if ($it.assignee) { $it.assignee } else { '' }
      startDate   = $it.startDate
      endDate     = $it.endDate
      status      = $it.status
      isMilestone = [bool]$it.milestone
      order       = if ($null -ne $it.order) { $it.order } else { 2 }
      notes       = if ($it.notes) { $it.notes } else { '' }
    }
    $resp = Post "/projects/$($project.id)/wbs" $body
    $resp | Add-Member NoteProperty _key $it.key -Force
    $created += $resp
    Write-Host "    + WBS [$($project.name)] $($it.name) #$($resp.id)"
  }
  return $created
}

# Atlas v1.5 WBS
$atlasWbs = MakeWbs $pAtlas @(
  @{ key='ux';        name='UI/UX 로드맵 P0~P8';            assignee='이서연';            startDate=(Iso $today.AddDays(-30)); endDate=(Iso $today.AddDays(-1));  status='Done';       order=3; milestone=$true; notes='30개 항목 완료, 6개 deferred' }
  @{ key='ux-a';      name='P0 디자인 시스템 토대';          assignee='이서연';            startDate=(Iso $today.AddDays(-30)); endDate=(Iso $today.AddDays(-25)); status='Done';       order=3; parentKey='ux' }
  @{ key='ux-b';      name='P1 IA·네비게이션';                assignee='이서연';            startDate=(Iso $today.AddDays(-24)); endDate=(Iso $today.AddDays(-18)); status='Done';       order=2; parentKey='ux' }
  @{ key='ux-c';      name='P2~P4 모달·표·대시보드';          assignee='이서연, 최유나';    startDate=(Iso $today.AddDays(-17)); endDate=(Iso $today.AddDays(-8));  status='Done';       order=3; parentKey='ux' }
  @{ key='ux-d';      name='P5~P8 후속 (deferred 포함)';      assignee='이서연';            startDate=(Iso $today.AddDays(-7));  endDate=(Iso $today.AddDays(-1));  status='Done';       order=2; parentKey='ux' }
  @{ key='multi';     name='다중 사용자 공유 폴더 베타';       assignee='박지훈, 김민준';    startDate=(Iso $today.AddDays(0));   endDate=(Iso $today.AddDays(30)); status='InProgress'; order=3; milestone=$true; notes='SMB 락 + DB 마이그 가드' }
  @{ key='multi-lock';name='파일 락 (.atlas.lock + 사이드카)'; assignee='박지훈';            startDate=(Iso $today.AddDays(0));   endDate=(Iso $today.AddDays(10)); status='InProgress'; order=3; parentKey='multi' }
  @{ key='multi-mig'; name='DB 마이그 버전 가드';              assignee='김민준';            startDate=(Iso $today.AddDays(8));   endDate=(Iso $today.AddDays(20)); status='Planned';    order=2; parentKey='multi' }
  @{ key='multi-cloud';name='클라우드 동기화 폴더 경고';        assignee='박지훈';            startDate=(Iso $today.AddDays(18));  endDate=(Iso $today.AddDays(25)); status='Planned';    order=1; parentKey='multi' }
  @{ key='light';     name='라이트 모드 가독성 동등화';         assignee='이서연';            startDate=(Iso $today.AddDays(5));   endDate=(Iso $today.AddDays(25)); status='Planned';    order=2; notes='P7 잔재 확산 + ProjectMap 톤 점검' }
  @{ key='rel-ga';    name='v1.5 GA 릴리즈';                   assignee='정도현';            startDate=(Iso $today.AddDays(40));  endDate=(Iso $today.AddDays(45)); status='Planned';    order=3; milestone=$true; notes='회귀 테스트 후 publish + 배포' }
  @{ key='overdue';   name='1.4 핫픽스 (지연됨)';              assignee='김민준';            startDate=(Iso $today.AddDays(-15)); endDate=(Iso $today.AddDays(-3));  status='InProgress'; order=3; notes='Critical 회귀 — 다음 패치로 미룸' }
  @{ key='soon';      name='주간 회고 정리';                   assignee='윤서아';            startDate=(Iso $today.AddDays(0));   endDate=(Iso $today.AddDays(3));  status='InProgress'; order=1 }
)

# 데이터 파이프라인 WBS
$dataWbs = MakeWbs $pData @(
  @{ key='kafka';   name='Kafka 클러스터 구축';      assignee='강하늘';        startDate=(Iso $today.AddDays(-60)); endDate=(Iso $today.AddDays(-40)); status='Done';       order=3; milestone=$true }
  @{ key='ch';      name='ClickHouse 운영 환경';     assignee='강하늘';        startDate=(Iso $today.AddDays(-39)); endDate=(Iso $today.AddDays(-15)); status='Done';       order=3; milestone=$true }
  @{ key='ingest';  name='Ingest 서비스 (Spring)';   assignee='박지훈';        startDate=(Iso $today.AddDays(-30)); endDate=(Iso $today.AddDays(-5));  status='Done';       order=2 }
  @{ key='etl';     name='ETL 잡 12종';              assignee='박지훈';        startDate=(Iso $today.AddDays(-14)); endDate=(Iso $today.AddDays(7));   status='InProgress'; order=2 }
  @{ key='dash';    name='Grafana 대시보드 12종';    assignee='윤서아';        startDate=(Iso $today.AddDays(-7));  endDate=(Iso $today.AddDays(14));  status='InProgress'; order=2 }
  @{ key='dash-a';  name='실시간 KPI 대시';          assignee='윤서아';        startDate=(Iso $today.AddDays(-7));  endDate=(Iso $today.AddDays(2));   status='InProgress'; order=2; parentKey='dash' }
  @{ key='dash-b';  name='이상 탐지 대시';           assignee='윤서아';        startDate=(Iso $today.AddDays(3));   endDate=(Iso $today.AddDays(10));  status='Planned';    order=1; parentKey='dash' }
  @{ key='oncall';  name='oncall 런북 작성';         assignee='강하늘';        startDate=(Iso $today.AddDays(0));   endDate=(Iso $today.AddDays(5));   status='InProgress'; order=2 }
  @{ key='loadtest';name='Load test 10K events/s';   assignee='박지훈, 강하늘';startDate=(Iso $today.AddDays(8));   endDate=(Iso $today.AddDays(18));  status='Planned';    order=3; milestone=$true }
  @{ key='cutover'; name='Prod cutover';             assignee='박지훈';        startDate=(Iso $today.AddDays(15));  endDate=(Iso $today.AddDays(20));  status='Planned';    order=3; milestone=$true }
)

# 모바일 MVP WBS
$mobileWbs = MakeWbs $pMobile @(
  @{ key='spec';    name='제품 명세서 (이슈/회의록)'; assignee='윤서아';        startDate=(Iso $today.AddDays(7));   endDate=(Iso $today.AddDays(14)); status='Planned'; order=3 }
  @{ key='design';  name='Figma 디자인 시스템 모바일'; assignee='최유나';       startDate=(Iso $today.AddDays(10));  endDate=(Iso $today.AddDays(25)); status='Planned'; order=2 }
  @{ key='ios';     name='iOS 앱 개발';                assignee='이서연';        startDate=(Iso $today.AddDays(20));  endDate=(Iso $today.AddDays(75)); status='Planned'; order=3 }
  @{ key='ios-auth';name='iOS 인증 흐름';              assignee='이서연';        startDate=(Iso $today.AddDays(20));  endDate=(Iso $today.AddDays(30)); status='Planned'; order=2; parentKey='ios' }
  @{ key='ios-issue';name='iOS 이슈 CRUD';             assignee='이서연';        startDate=(Iso $today.AddDays(30));  endDate=(Iso $today.AddDays(50)); status='Planned'; order=2; parentKey='ios' }
  @{ key='ios-mtg';  name='iOS 회의록 뷰어';           assignee='이서연';        startDate=(Iso $today.AddDays(50));  endDate=(Iso $today.AddDays(65)); status='Planned'; order=1; parentKey='ios' }
  @{ key='android';  name='Android 앱 개발';           assignee='이서연';        startDate=(Iso $today.AddDays(25));  endDate=(Iso $today.AddDays(80)); status='Planned'; order=3 }
  @{ key='push';     name='Push 알림 인프라';          assignee='강하늘';        startDate=(Iso $today.AddDays(40));  endDate=(Iso $today.AddDays(60)); status='Planned'; order=2 }
  @{ key='testflight';name='TestFlight 베타 출시';     assignee='정도현';        startDate=(Iso $today.AddDays(80));  endDate=(Iso $today.AddDays(85)); status='Planned'; order=3; milestone=$true }
  @{ key='launch';   name='MVP 출시';                  assignee='윤서아';        startDate=(Iso $today.AddDays(95));  endDate=(Iso $today.AddDays(100));status='Planned'; order=3; milestone=$true }
)

# Issues
function MakeIssues($project, $items) {
  foreach ($it in $items) {
    $body = @{
      projectId           = $project.id
      title               = $it.title
      description         = $it.desc
      status              = $it.status
      priority            = $it.priority
      assigneeResourceId  = $it.assigneeId
      dueDate             = $it.dueDate
    }
    $resp = Post "/projects/$($project.id)/issues" $body
    Write-Host "    + Issue [$($project.name)] $($resp.title) #$($resp.id)"
  }
}
function FindResId($name) {
  $r = $resources | Where-Object { $_.name -eq $name } | Select-Object -First 1
  if ($r) { return $r.id } else { return $null }
}

MakeIssues $pAtlas @(
  @{ title='라이트 모드 ProjectMap 노드 라벨 가독성';        desc='legacy override 가 카테고리 색은 잡지만 노드 텍스트 contrast 약함.'; status='Open';       priority='High';   assigneeId=(FindResId '이서연'); dueDate=(Iso $today.AddDays(3)) }
  @{ title='Ctrl+B 사이드바 collapsed 상태에서 ProjectSwitcher 안 보임';  desc='의도된 동작이나 collapsed 시 빠르게 프로젝트 전환할 방법 검토.';     status='Open';       priority='Medium'; assigneeId=(FindResId '이서연'); dueDate=(Iso $today.AddDays(7)) }
  @{ title='Modal dirty 비교가 deep object 폼에서 잘못 detect';            desc='JSON.stringify 가 key 순서에 민감. WbsItemForm 등 큰 폼 검증 필요.';  status='InProgress'; priority='High';   assigneeId=(FindResId '박지훈'); dueDate=(Iso $today.AddDays(5)) }
  @{ title='Resource 삭제 시 WBS assignee 문자열 남음';                   desc='Resource.name 이 WBS.assignee 콤마 토큰으로 들어있어 cascade 안 됨.'; status='Open';       priority='Medium'; assigneeId=(FindResId '박지훈'); dueDate=(Iso $today.AddDays(14)) }
  @{ title='Issue 행 옵티미스틱 롤백 시 빨강 outline 시각 신호 없음';     desc='P3-3 후속 — 실패 표시 더 강조.';                                       status='Open';       priority='Low';    assigneeId=(FindResId '이서연'); dueDate=$null }
  @{ title='WBS drag-and-drop 미구현';                                    desc='P8-4 deferred. dnd-kit 도입 필요.';                                    status='Open';       priority='Low';    assigneeId=(FindResId '김민준'); dueDate=$null }
  @{ title='ChangeLog 검색 결과 highlight 가 동적 컨텐츠에서 fade out 안 됨'; desc='outline 펄스 1.6s 가 한 번만. 재 highlight 시 stale.';              status='Resolved';   priority='Medium'; assigneeId=(FindResId '이서연'); dueDate=(Iso $today.AddDays(-2)) }
  @{ title='1.4 핫픽스 — 다크 모드 ProjectMap 노드 panel 톤 회귀';         desc='워크로그 토글 후 panel 배경이 라이트 톤으로 잘못 나옴. 재현 빈도 낮음.'; status='Closed';     priority='High';   assigneeId=(FindResId '김민준'); dueDate=(Iso $today.AddDays(-7)) }
)

MakeIssues $pData @(
  @{ title='Kafka consumer lag spike (오전 트래픽)';                       desc='ingest 서비스가 9:00-10:00 사이 lag 30s 까지 상승. consumer 증설 검토.'; status='InProgress'; priority='High';   assigneeId=(FindResId '강하늘'); dueDate=(Iso $today.AddDays(2)) }
  @{ title='ClickHouse merge 충돌 — 대용량 일배치';                       desc='daily ETL 가 partition merge 와 충돌해 쿼리 latency 증가.';            status='Open';       priority='High';   assigneeId=(FindResId '박지훈'); dueDate=(Iso $today.AddDays(5)) }
  @{ title='Grafana 대시보드 자동 refresh 가 panel 일부 stale';            desc='cache control 문제로 일부 panel 5초 늦게 갱신.';                       status='Open';       priority='Medium'; assigneeId=(FindResId '윤서아'); dueDate=(Iso $today.AddDays(10)) }
  @{ title='ETL 잡 1건이 schema 변경 후 silently fail';                    desc='alert 안 떴음. failure detection 보강 필요.';                          status='Resolved';   priority='High';   assigneeId=(FindResId '박지훈'); dueDate=(Iso $today.AddDays(-3)) }
  @{ title='cutover 일정 — DR 환경 검증 누락';                            desc='cutover 전 DR 사이트에서 hot standby 검증 필수.';                      status='Open';       priority='Medium'; assigneeId=(FindResId '강하늘'); dueDate=(Iso $today.AddDays(12)) }
  @{ title='oncall 페이지가 모바일에서 안 열림';                          desc='Grafana 인증 redirect 가 모바일에서 무한 루프.';                       status='Open';       priority='Low';    assigneeId=(FindResId '강하늘'); dueDate=$null }
)

MakeIssues $pMobile @(
  @{ title='iOS 인증 흐름 — biometric 의 fallback UX';                     desc='Face ID 실패 시 PIN fallback. 디자인 확정 필요.';                      status='Open';       priority='High';   assigneeId=(FindResId '최유나'); dueDate=(Iso $today.AddDays(15)) }
  @{ title='오프라인 모드 정책 결정';                                     desc='MVP 범위에 오프라인 캐시 포함할지 결정 필요.';                          status='Open';       priority='Medium'; assigneeId=(FindResId '윤서아'); dueDate=(Iso $today.AddDays(8)) }
  @{ title='Push 알림 — 백엔드 endpoint 명세 미정';                       desc='Atlas 서버에 모바일 push 발송 API 추가 필요.';                          status='Open';       priority='Medium'; assigneeId=(FindResId '강하늘'); dueDate=(Iso $today.AddDays(30)) }
  @{ title='Android 디자인 시스템 — Material You 추종 여부';              desc='iOS 디자인과 비주얼 일관성 vs 플랫폼 컨벤션 절충.';                    status='Open';       priority='Low';    assigneeId=(FindResId '최유나'); dueDate=$null }
)

# ChangeLogs
function MakeChangeLogs($project, $items) {
  foreach ($it in $items) {
    $body = @{
      projectId        = $project.id
      date             = $it.date
      content          = $it.content
      impact           = $it.impact
      relatedDocLinks  = if ($it.links) { $it.links } else { '' }
      sourceIssueId    = $null
      sourceWbsItemId  = $null
    }
    $resp = Post "/projects/$($project.id)/changelogs" $body
    Write-Host "    + ChangeLog [$($project.name)] #$($resp.id)"
  }
}

MakeChangeLogs $pAtlas @(
  @{ date=(Iso $today.AddDays(-21)); content="Button primary 토큰화 + --accent-hover/--text-on-accent 신규 (P0-1).`n다크 모드 가독성 정정 — 흰 글씨 대비 미달 fix."; impact='Medium' }
  @{ date=(Iso $today.AddDays(-18)); content='Modal 컴포넌트 추출 + 8 사이트 일괄 마이그 (P0-2). focus-trap / ESC / overlay / scroll-lock 일괄.'; impact='High' }
  @{ date=(Iso $today.AddDays(-15)); content='Input/Select/Textarea 컴포넌트 + leadingIcon Search 마이그 (P0-3).'; impact='Low' }
  @{ date=(Iso $today.AddDays(-12)); content='사이드바 접기 + Ctrl+B + settings persist (P1-3). collapsed=w-14 + 아이콘만.'; impact='Medium' }
  @{ date=(Iso $today.AddDays(-9));  content='Dashboard KPI 카드 상단 분리 (P4-1). D-day/업무일지/지연/임박 4 KPI.'; impact='Medium' }
  @{ date=(Iso $today.AddDays(-5));  content='ShortcutsModal (?), Toast theme 동기화, ProjectMap hex 토큰화 (P6-4 / P7-1 / P7-3).'; impact='Low' }
  @{ date=(Iso $today.AddDays(-2));  content='1.4 핫픽스 — 다크 모드 ProjectMap 패널 톤 회귀 수정.'; impact='Critical' }
)

MakeChangeLogs $pData @(
  @{ date=(Iso $today.AddDays(-45)); content='Kafka 3-broker 클러스터 운영 환경 확정. replication factor 3.'; impact='High' }
  @{ date=(Iso $today.AddDays(-30)); content='ClickHouse 16-node 클러스터 + Replicated MergeTree 도입.'; impact='High' }
  @{ date=(Iso $today.AddDays(-18)); content='Ingest 서비스 v1 배포. peak 7K events/s 처리 검증.'; impact='Medium' }
  @{ date=(Iso $today.AddDays(-10)); content='ETL 잡 12종 중 9건 가동. 3건 schema 변경 대기.'; impact='Medium' }
  @{ date=(Iso $today.AddDays(-5));  content='Grafana 대시보드 6종 출시. 분석가 self-service 시작.'; impact='Low' }
  @{ date=(Iso $today.AddDays(-1));  content='consumer lag spike 임시 완화 — partition 재배치.'; impact='Medium' }
)

MakeChangeLogs $pMobile @(
  @{ date=(Iso $today.AddDays(-3)); content='제품 명세서 v0.1 작성 시작. 이슈/회의록 흐름 와이어프레임 30 페이지.'; impact='Low' }
)

# Meetings
function MakeMeetings($project, $items) {
  foreach ($it in $items) {
    $attendeesJson = ConvertTo-Json $it.attendees -Depth 5 -Compress
    $decisionsJson = ConvertTo-Json $it.decisions -Depth 5 -Compress
    $actionsJson   = ConvertTo-Json $it.actions   -Depth 5 -Compress
    $body = @{
      projectId    = $project.id
      date         = $it.date
      startTime    = $it.startTime
      endTime      = $it.endTime
      attendees    = $attendeesJson
      topic        = $it.topic
      decisions    = $decisionsJson
      discussion   = $it.discussion
      actionItems  = $actionsJson
    }
    $resp = Post "/projects/$($project.id)/meetings" $body
    Write-Host "    + Meeting [$($project.name)] $($resp.topic) #$($resp.id)"
  }
}

MakeMeetings $pAtlas @(
  @{ date=(Iso $today.AddDays(-20)); startTime='10:00'; endTime='11:30'; topic='UI/UX 로드맵 킥오프';
     attendees=@( @{ org='제품'; members=@('이서연','윤서아') }, @{ org='엔지니어링'; members=@('김민준','박지훈') } );
     decisions=@('P0 디자인 시스템 토대를 P1~P8 의 전제로 둠','각 사이클 = 1 commit + publish GUI 검증');
     discussion="### 의제`n- P0~P8 phase 별 추진 순서`n- iteration 단위 합의`n- publish GUI 검증의 비용 vs 안정성 trade-off`n`n### 합의`n- P0 토큰화 / Modal 추출 / Input 컴포넌트화 가 후속의 토대";
     actions=@( @{ id=[guid]::NewGuid().ToString(); content='P0-1 Button 토큰화 PR'; assignee='이서연'; deadline=(Iso $today.AddDays(-17)); promotedIssueId=$null; promotedWbsItemId=$null }, @{ id=[guid]::NewGuid().ToString(); content='Modal API 초안 작성'; assignee='이서연'; deadline=(Iso $today.AddDays(-15)); promotedIssueId=$null; promotedWbsItemId=$null } ) }
  @{ date=(Iso $today.AddDays(-10)); startTime='14:00'; endTime='15:00'; topic='다중 사용자 베타 — 락 설계 리뷰';
     attendees=@( @{ org='엔지니어링'; members=@('박지훈','김민준') }, @{ org='QA'; members=@('정도현') } );
     decisions=@('파일 락 (.atlas.lock) + 사이드카 JSON 으로 보유자 표시','클라우드 동기화 폴더 (OneDrive/SharePoint) 감지 시 경고');
     discussion="### 락 메커니즘`n- OS 파일 락 vs DB row 락 trade-off`n- 락 충돌 시 대기 화면 + 재시도`n`n### 미결`n- 클라우드 폴더 자동 감지 규칙";
     actions=@( @{ id=[guid]::NewGuid().ToString(); content='.atlas.lock 프로토타입'; assignee='박지훈'; deadline=(Iso $today.AddDays(0)); promotedIssueId=$null; promotedWbsItemId=$null }, @{ id=[guid]::NewGuid().ToString(); content='DB 마이그 가드 PoC'; assignee='김민준'; deadline=(Iso $today.AddDays(5)); promotedIssueId=$null; promotedWbsItemId=$null } ) }
  @{ date=(Iso $today.AddDays(-3)); startTime='09:30'; endTime='10:00'; topic='1.4 핫픽스 회고';
     attendees=@( @{ org='엔지니어링'; members=@('김민준') }, @{ org='QA'; members=@('정도현') } );
     decisions=@('회귀 테스트 시나리오에 ProjectMap 톤 케이스 추가');
     discussion="ProjectMap 패널 톤 회귀의 원인은 toggle 시 markdown-body 클래스가 동적으로 추가되며 cascading 우선순위 변화. legacy override 보완으로 해결.";
     actions=@( @{ id=[guid]::NewGuid().ToString(); content='회귀 테스트 시나리오 추가'; assignee='정도현'; deadline=(Iso $today.AddDays(7)); promotedIssueId=$null; promotedWbsItemId=$null } ) }
  @{ date=(Iso $today.AddDays(2));  startTime='15:00'; endTime='16:00'; topic='주간 정기 — 1.5 GA 진행 점검';
     attendees=@( @{ org='제품'; members=@('윤서아') }, @{ org='엔지니어링'; members=@('이서연','박지훈','김민준') }, @{ org='QA'; members=@('정도현') } );
     decisions=@();
     discussion="라이트 모드 잔여 점검 / 다중 사용자 베타 일정 확정";
     actions=@() }
)

MakeMeetings $pData @(
  @{ date=(Iso $today.AddDays(-30)); startTime='10:00'; endTime='12:00'; topic='아키텍처 결정 회의';
     attendees=@( @{ org='데이터'; members=@('박지훈','윤서아') }, @{ org='인프라'; members=@('강하늘') } );
     decisions=@('Kafka + ClickHouse + Grafana stack 채택','ETL 은 Airflow 가 아닌 cron + Python 으로 시작 — 추후 평가');
     discussion="### 검토 후보`n- Flink vs Spark Streaming`n- ClickHouse vs Druid`n`n### 결론`n- 단순성 + 운영 비용 고려해 Kafka+CH 채택. Flink 는 차후.";
     actions=@( @{ id=[guid]::NewGuid().ToString(); content='Kafka 클러스터 구축'; assignee='강하늘'; deadline=(Iso $today.AddDays(-15)); promotedIssueId=$null; promotedWbsItemId=$null } ) }
  @{ date=(Iso $today.AddDays(-7)); startTime='14:00'; endTime='15:00'; topic='Load test 계획';
     attendees=@( @{ org='데이터'; members=@('박지훈') }, @{ org='인프라'; members=@('강하늘') } );
     decisions=@('10K events/s 24h 지속 부하 테스트 진행');
     discussion="Locust + 자체 producer 결합. Kafka broker / ClickHouse insert latency 측정.";
     actions=@( @{ id=[guid]::NewGuid().ToString(); content='Load test 환경 준비'; assignee='강하늘'; deadline=(Iso $today.AddDays(7)); promotedIssueId=$null; promotedWbsItemId=$null } ) }
)

MakeMeetings $pMobile @(
  @{ date=(Iso $today.AddDays(0)); startTime='11:00'; endTime='12:00'; topic='모바일 MVP 킥오프';
     attendees=@( @{ org='제품'; members=@('윤서아') }, @{ org='엔지니어링'; members=@('이서연') }, @{ org='디자인'; members=@('최유나') } );
     decisions=@('MVP 범위: 이슈 CRUD + 회의록 읽기 + push 알림','iOS 우선 — TestFlight 베타 후 Android 평행');
     discussion="### 범위 합의`n- 이슈 / 회의록 / push 만 MVP`n- 오프라인은 v2`n`n### 일정`n- iOS 80일, Android 70일 (overlap)";
     actions=@( @{ id=[guid]::NewGuid().ToString(); content='제품 명세서 v1 작성'; assignee='윤서아'; deadline=(Iso $today.AddDays(14)); promotedIssueId=$null; promotedWbsItemId=$null }, @{ id=[guid]::NewGuid().ToString(); content='디자인 시스템 모바일 어댑테이션'; assignee='최유나'; deadline=(Iso $today.AddDays(25)); promotedIssueId=$null; promotedWbsItemId=$null } ) }
)

# DevInfo
function MakeDevInfo($project, $items) {
  foreach ($it in $items) {
    $body = @{
      projectId   = $project.id
      title       = $it.title
      type        = $it.type
      storageMode = if ($it.storage) { $it.storage } else { 'Copy' }
      content     = if ($it.content) { $it.content } else { '' }
      filePath    = if ($it.filePath) { $it.filePath } else { '' }
      url         = if ($it.url) { $it.url } else { '' }
      tags        = if ($it.tags) { $it.tags } else { '' }
    }
    $resp = Post "/projects/$($project.id)/devinfo" $body
    Write-Host "    + DevInfo [$($project.name)] $($resp.title) #$($resp.id)"
  }
}

MakeDevInfo $pAtlas @(
  @{ title='UI 디자인 토큰 가이드'; type='Markdown'; tags='design, tokens, ui'; content="# Atlas Design Tokens`n`n## Accent`n- ``--accent`` dark #9eb2ce / light #5b7299`n- ``--accent-hover`` dark #b2c2d8 / light #6b82a8`n- ``--text-on-accent`` dark #0f172a / light #ffffff`n`n## 사용`n``<Button>`` 의 primary variant 가 자동 사용. raw 클래스는 ``bg-accent`` / ``hover:bg-accent-hover`` / ``text-on-accent``." }
  @{ title='Modal 컴포넌트 사용법'; type='Markdown'; tags='ui, modal, components'; content="# Modal API`n`n``open / onClose / title / size('sm'~'wide') / fixedHeight / footer / initialFocusRef / showCloseButton / closeOnOverlayClick / closeOnEsc / dirty``" }
  @{ title='Atlas 키보드 단축키';   type='Markdown'; tags='shortcuts, ux';        content="# 단축키`n- Ctrl+K 검색 팔레트`n- Ctrl+B 사이드바 접기`n- ? 도움말`n- Esc 모달/팔레트 닫기" }
  @{ title='Lucide 아이콘 카탈로그'; type='Link';     tags='design, icons, link';  url='https://lucide.dev' }
  @{ title='WebView2 focus race 노트'; type='Markdown'; tags='webview2, focus, pitfall'; content="# WebView2 focus race`n`n``setTimeout(0)`` 또는 ``requestAnimationFrame`` 로 ``ref.focus()`` 호출. 동기 ``autoFocus`` 만으로는 portal mount 직후 안 잡힘." }
)

MakeDevInfo $pData @(
  @{ title='Kafka 운영 가이드';     type='Markdown'; tags='kafka, ops';      content="# Kafka 운영`n`n## 모니터링`n- consumer lag`n- broker disk usage`n- ISR" }
  @{ title='ClickHouse 쿼리 패턴';   type='Markdown'; tags='clickhouse, sql'; content="# CH Patterns`n`n- ``SAMPLE`` 절로 대용량 빠른 추정`n- ``PREWHERE`` 로 인덱스 효율" }
  @{ title='Grafana 대시보드 표준';  type='Link';     tags='grafana, link';   url='https://grafana.internal/d/standards' }
  @{ title='Airflow 사용 검토 노트'; type='Markdown'; tags='airflow, decision'; content="# 검토`n`n현재 cron+Python 으로 충분. 잡 수 50 넘으면 Airflow 도입." }
)

MakeDevInfo $pMobile @(
  @{ title='iOS 인증 흐름 와이어';   type='Markdown'; tags='ios, design'; content="# iOS Auth`n`n1. Splash → 자동 로그인 시도`n2. 실패 시 Face ID`n3. Face ID 실패 시 PIN" }
  @{ title='React Native vs Native — 결정 노트'; type='Markdown'; tags='mobile, decision'; content="# 결정`n`n네이티브 채택 — 알림/biometric 안정성 우선." }
  @{ title='모바일 와이어 Figma';    type='Link';     tags='figma, design'; url='https://figma.com/file/example-mobile' }
)

# WorkLog — 이번 주 (월~금)
function MakeWorkLog($project, $offsetFromMon, $done, $plan, $issues) {
  $date = Iso $mondayThisWeek.AddDays($offsetFromMon)
  $body = @{ done = $done; plan = $plan; issues = $issues }
  $resp = Put "/projects/$($project.id)/worklogs/$date" $body
  Write-Host "    + WorkLog [$($project.name)] $date"
}

# Atlas 이번 주 5일
MakeWorkLog $pAtlas 0 "- P5~P8 배치 사이클 마무리`n- ShortcutsModal 신규" "- 다중 사용자 베타 락 PoC 시작`n- 회귀 테스트 시나리오 정리" "- ProjectMap 노드 라벨 가독성 (이슈 #등록 예정)"
MakeWorkLog $pAtlas 1 "- 다중 사용자 .atlas.lock 프로토타입`n- 사이드카 JSON 포맷 합의" "- DB 마이그 가드 설계" "- SMB 공유 환경에서 락 동시성 케이스 정리 필요"
MakeWorkLog $pAtlas 2 "- DB 마이그 버전 가드 PoC`n- 이전 빌드가 신 DB 열지 못하게 EF Core 마이그 history 검사 추가" "- 클라우드 동기화 폴더 감지 PoC" ""
MakeWorkLog $pAtlas 3 "- 라이트 모드 잔여 hex 점검`n- ProjectMap 토큰화 마무리" "- v1.5 GA 회귀 테스트 시나리오" ""
MakeWorkLog $pAtlas 4 "- 주간 회고 정리`n- v1.5 release notes 초안" "- 다음 주 락 프로토타입 통합" ""

# Data 이번 주 3일
MakeWorkLog $pData 0 "- consumer lag spike 분석`n- partition 재배치 진행" "- consumer 증설 검토" "- 오전 9-10시 lag 30s 까지 상승"
MakeWorkLog $pData 1 "- ClickHouse merge 충돌 reproducibility 확인" "- daily ETL 스케줄 분산" ""
MakeWorkLog $pData 2 "- Grafana 대시보드 2종 추가" "- 이상 탐지 대시 디자인" ""

# Mobile 이번 주 1일 (킥오프만)
MakeWorkLog $pMobile 0 "- 킥오프 회의 진행`n- 제품 명세서 v0.1 작성 시작" "- 디자인 시스템 모바일 어댑테이션 가이드 확보" "- 오프라인 모드 정책 미결"

Write-Host '== DONE ==' -ForegroundColor Green
Write-Host "Created:"
Write-Host "  Resources: $($resources.Count)"
Write-Host "  Projects:  $($projects.Count)"
Write-Host "  Atlas WBS: $($atlasWbs.Count) / Data WBS: $($dataWbs.Count) / Mobile WBS: $($mobileWbs.Count)"
Write-Host "  Issues / ChangeLogs / Meetings / DevInfo / WorkLogs across 3 projects"
