using ProjectManager.Core.Domain;

namespace ProjectManager.Application.Services;

// 리프(Task)에 첫 자식이 붙을 때 그 부모를 Group 으로 자동 승격할지 — 정책 단일 스위치.
//
// 기본 ON 인 이유: 도입 전 Atlas 는 '자식이 생기면 곧 그루핑 노드' 로 동작했다. 승격을 안 하면
// 기존 사용자가 자식을 추가하는 순간 부모가 Task 로 남아 완료율 분모·잔여·용량이 갑자기 부풀어 오른다.
// 승격은 그 동작을 보존하고, '상위 작업' 으로 쓰고 싶은 사용자는 토스트의 되돌리기(또는 행 토글) 한 번이면 된다.
//
// 되돌아오는(Group → Task) 자동 강등은 일부러 없다. 마지막 자식이 사라졌다고 조용히 Task 가 되면
// 그 항목이 모든 지표에 갑자기 부활한다. 대신 UI 가 '빈 그룹' 경고 배지를 단다.
public static class WbsKindPolicy
{
    // parent 가 지금 막 첫 자식을 얻는 참이다. Group 으로 승격할까?
    // project 가 null 이면(조회 실패 등) 보수적으로 승격 — 도입 전 동작을 기본값으로.
    public static bool ShouldAutoPromoteToGroup(WbsItem parent, Project? project) =>
        parent.Kind == WbsKind.Task && (project?.AutoGroupParents ?? true);
}
