using System.Linq.Expressions;

namespace ProjectManager.Core.Domain;

// WBS 필터 술어의 단일 정의처. 도입 전에는 이 두 술어가 백엔드 곳곳에 복붙돼 있었다 —
// 종료상태 판정(`Status != Done && Status != Suspended`)이 9개 파일 26회, 부모 제외가 7개 서비스에 각자 재구현.
// 새 종료 상태(Suspended)를 추가할 때 20군데를 다시 찾아야 했고, 빠뜨려도 컴파일은 통과했다.
//
// EF(IQueryable) 경로는 Expression 필드를, 인메모리(LINQ-to-objects) 경로는 그것을 Compile() 한 Func 를 쓴다.
// 한 정의에서 둘 다 나오므로 drift 가 원천 차단된다.
//
// ⚠️ Func 버전(IsTask/IsOpen)을 EF 람다 '본문 안에서' 호출하면 번역에 실패해 런타임에 터진다.
//    IQueryable 에는 반드시 WbsQueryExtensions 의 확장 메서드나 Expression 필드를 쓸 것.
public static class WbsPredicates
{
    // 집계 대상 = 그룹이 아닌 항목. Group 은 순수 그루핑 노드라 모든 지표·목록·알림에서 제외된다.
    // `== Task` 가 아니라 `!= Group` 인 이유: 훗날 Kind 가 늘어도 새 값이 조용히 지표에서 사라지지 않도록(fail-open).
    public static readonly Expression<Func<WbsItem, bool>> TaskExpr = w => w.Kind != WbsKind.Group;

    // 미완(잔여) = 종료 상태가 아닌 것. 종료 = 완료(Done) + 중단(Suspended).
    // 중단은 종료지만 '완료'는 아니다 — 완료 카운트는 Status == Done 만.
    public static readonly Expression<Func<WbsItem, bool>> OpenExpr =
        w => w.Status != WbsStatus.Done && w.Status != WbsStatus.Suspended;

    private static readonly Func<WbsItem, bool> TaskFn = TaskExpr.Compile();
    private static readonly Func<WbsItem, bool> OpenFn = OpenExpr.Compile();

    public static bool IsTask(WbsItem w) => TaskFn(w);
    public static bool IsGroup(WbsItem w) => !TaskFn(w);
    public static bool IsOpen(WbsItem w) => OpenFn(w);
    public static bool IsClosed(WbsItem w) => !OpenFn(w);
}
