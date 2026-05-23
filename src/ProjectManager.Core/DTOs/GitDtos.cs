namespace ProjectManager.Core.DTOs;

// 프로젝트에 연결된 소스 저장소(.git)의 현재 상태.
// Configured=false: 프로젝트에 GitRepoPath 미설정.
// IsValidRepo=false: 경로는 있으나 git 저장소가 아니거나 git 미설치 — Error 에 사유.
public record GitStatusDto(
    bool Configured,
    string? RepoPath,
    bool IsValidRepo,
    string? CurrentBranch,
    bool HasUpstream,
    int Ahead,
    int Behind,
    bool IsDirty,
    string? Error);

// 커밋 한 건. Parents 는 그래프(DAG) 레인 배치용 부모 해시들(머지면 2개 이상).
// Refs 는 이 커밋을 가리키는 브랜치/태그 decoration. OnRemote=true 면 원격에 push 된 커밋.
public record GitCommitDto(
    string Hash,
    string ShortHash,
    string[] Parents,
    string Author,
    string AuthorEmail,
    DateTime Date,
    string Subject,
    string[] Refs,
    bool OnRemote);

public record GitLogDto(
    IReadOnlyList<GitCommitDto> Commits,
    bool HasMore);
