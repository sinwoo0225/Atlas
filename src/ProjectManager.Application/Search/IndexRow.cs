namespace ProjectManager.Application.Search;

// search_index 한 행에 대응. Title 은 검색 결과의 표제, Body 는 본문 검색·스니펫 대상.
internal record IndexRow(
    string Type,
    int Id,
    int? ProjectId,
    string Title,
    string Body,
    DateTime UpdatedAt
);
