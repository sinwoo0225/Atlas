namespace ProjectManager.Core.Domain;

// IQueryable 확장 — 람다 '바깥'에서 Where(Expression) 을 붙이는 것뿐이라 EF 가 그대로 SQL WHERE 로 내린다.
// Where 를 체이닝하면 EF 가 AND 로 합쳐주므로 Expression 합성 코드가 필요 없다.
//
// 주의 1: MonitoringService 의 다수 쿼리가 `db.WbsItems.Where(...).Join(db.Projects, ...)` 형태다.
//         이 확장은 IQueryable<WbsItem> 에만 붙으므로 반드시 Join **이전에** 적용할 것.
//         → db.WbsItems.OnlyTasks().OnlyOpen().Where(추가조건).Join(...)
//
// 주의 2: 인메모리(List<WbsItem>) 경로용 동명 오버로드는 일부러 만들지 않는다. IQueryable 은 IEnumerable 이기도 해서
//         변수의 정적 타입에 따라 조용히 클라이언트 평가로 떨어질 수 있다. 인메모리에서는
//         `.Where(WbsPredicates.IsTask)` 처럼 Func 를 직접 넘길 것.
public static class WbsQueryExtensions
{
    // 집계 대상만 — 그룹(그루핑 노드) 제외.
    public static IQueryable<WbsItem> OnlyTasks(this IQueryable<WbsItem> q) => q.Where(WbsPredicates.TaskExpr);

    // 미완(잔여)만 — 완료·중단 제외.
    public static IQueryable<WbsItem> OnlyOpen(this IQueryable<WbsItem> q) => q.Where(WbsPredicates.OpenExpr);
}
