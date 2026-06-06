# devinfo — 업무 정보 (Work info)

공통 규약: [`common.md`](./common.md). (식별자는 호환성 위해 `devinfo` 유지 — 화면 표기만 "업무 정보 / Work info".)

## list — 조회 (필터 + 셰이핑)

```
atlas-cli devinfo list --project N
  [--type Markdown,File,Link,GitRepo]    # 다중
  [--tag api --tag auth]                 # 태그 부분일치, 다중 = 모두 포함(AND)
  [--updated-from YYYY-MM-DD] [--updated-to YYYY-MM-DD]
  [--keyword "..."]                      # 제목·내용 부분일치
  [--count|--limit N|--brief|--fields a,b,c]
```
`--brief` 필드: `id, projectId, title, type, tags, updatedAt`.

예:
```powershell
atlas-cli devinfo list --project 1 --type GitRepo            # 등록된 깃 저장소
atlas-cli devinfo list --project 1 --tag api,auth            # api AND auth
```

## get / create / update / delete / tags

```
atlas-cli devinfo get --id N
atlas-cli devinfo create --project N --title "..." --type Markdown|File|Link|GitRepo
  [--storage Copy|Reference        # File 타입에만 의미
   --content "md" | --content-file PATH|-   # Markdown
   --file-path "..."                         # File / GitRepo (로컬 절대경로)
   --url "https://..."                       # Link
   --tags "api, auth"]
atlas-cli devinfo update --id N [...]
atlas-cli devinfo delete --id N
atlas-cli devinfo tags --project N [--sort alpha|freq]    # distinct 태그 list
atlas-cli devinfo wbs-links --id N                        # 이 업무 정보에 연결된 WBS 항목 목록
```

WBS↔업무정보 연결/해제는 `wbs link-devinfo`/`wbs unlink-devinfo` ([`wbs.md`](./wbs.md)).

> **GitRepo 타입**: `--file-path` 에 로컬 git 저장소 절대경로. 한 프로젝트에 여러 개 등록 가능, GUI 우측 패널에 커밋 이력 그래프. `.md` export·파일 카피 없음(StorageMode=Reference 고정).
