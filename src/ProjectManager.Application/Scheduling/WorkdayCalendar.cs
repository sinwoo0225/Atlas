namespace ProjectManager.Application.Scheduling;

// 영업일(월–금) 계산 공용 헬퍼. WbsTemplateService(템플릿 적용), SchedulingService(CPM·리스케줄),
// CapacityService(수요 분배) 가 같은 주말 정의를 공유하기 위해 단일화. 휴일(ResourceAvailability)은
// 자원별이라 여기서 다루지 않는다 — 순수 주말 기준만.
public static class WorkdayCalendar
{
    public static bool IsWeekend(DateTime d) =>
        d.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday;

    // skipWeekends=true 면 토·일 제외하고 days 영업일 전진(음수면 후진). 앵커가 주말이면 먼저 평일로 정규화.
    public static DateTime Advance(DateTime from, int days, bool skipWeekends)
    {
        if (!skipWeekends) return from.AddDays(days);
        var d = from;
        while (IsWeekend(d)) d = d.AddDays(1);
        var step = days >= 0 ? 1 : -1;
        var remaining = Math.Abs(days);
        while (remaining > 0)
        {
            d = d.AddDays(step);
            if (!IsWeekend(d)) remaining--;
        }
        return d;
    }

    // [startInclusive, endInclusive] 구간의 영업일 수(주말 제외). 역구간이면 0.
    public static int WorkingDaysInclusive(DateTime startInclusive, DateTime endInclusive)
    {
        var s = startInclusive.Date;
        var e = endInclusive.Date;
        if (e < s) return 0;
        var count = 0;
        for (var d = s; d <= e; d = d.AddDays(1))
            if (!IsWeekend(d)) count++;
        return count;
    }

    // [startInclusive, endInclusive] 안에서 주어진 주(weekStart..weekStart+6) 에 떨어지는 영업일 수.
    // CapacityService 가 작업 기간의 공수를 주별로 분배할 때 사용.
    public static int WorkingDaysInWeek(DateTime startInclusive, DateTime endInclusive, DateTime weekStart)
    {
        var weekEnd = weekStart.Date.AddDays(6);
        var s = startInclusive.Date > weekStart.Date ? startInclusive.Date : weekStart.Date;
        var e = endInclusive.Date < weekEnd ? endInclusive.Date : weekEnd;
        return WorkingDaysInclusive(s, e);
    }
}
