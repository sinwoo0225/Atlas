namespace ProjectManager.Application;

// 프로젝트 백업 import 가 진행 중인 스코프 표시.
// 인터셉터(ActivityLog / Search) 가 import 1건당 자식 수백~수천 행에 폭주하지 않도록 가드 플래그.
// AsyncLocal 이라 한 요청 스코프 안의 모든 SaveChanges 에서 동일한 값이 보인다.
public static class ImportContext
{
    private static readonly AsyncLocal<bool> _isImporting = new();
    public static bool IsImporting
    {
        get => _isImporting.Value;
        set => _isImporting.Value = value;
    }
}
