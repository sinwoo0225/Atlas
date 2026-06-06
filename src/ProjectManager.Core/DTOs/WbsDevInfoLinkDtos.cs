using ProjectManager.Core.Domain;

namespace ProjectManager.Core.DTOs;

// by-wbs 조회 결과는 DevInfo 측 정보(Title·Type)를, by-devinfo 조회 결과는 WBS 측 정보(Name)를 채운다.
public record WbsDevInfoLinkDto(
    int Id, int WbsItemId, int DevInfoItemId,
    string? WbsItemName, string? DevInfoTitle, DevInfoType? DevInfoType,
    DateTime CreatedAt, string CreatedBy);

public record CreateWbsDevInfoLinkDto(int WbsItemId, int DevInfoItemId);

// by-project 일괄 조회용 경량 DTO — 카운트 배지·dedupe 만 필요.
public record WbsDevInfoLinkLite(int WbsItemId, int DevInfoItemId);
