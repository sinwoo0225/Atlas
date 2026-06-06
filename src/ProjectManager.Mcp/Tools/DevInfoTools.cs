using System.ComponentModel;
using ModelContextProtocol.Server;
using ProjectManager.Application.Services;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;

namespace ProjectManager.Mcp.Tools;

[McpServerToolType]
public static class DevInfoTools
{
    [McpServerTool(Name = "atlas_devinfo_list"),
     Description("프로젝트 업무 정보 (DevInfo) 조회 → JSON 배열")]
    public static async Task<string> List(DevInfoService svc, int projectId) =>
        McpJson.Serialize(await svc.GetByProjectAsync(projectId));

    [McpServerTool(Name = "atlas_devinfo_get"), Description("단일 업무 정보 조회")]
    public static async Task<string> Get(DevInfoService svc, int id)
    {
        var dto = await svc.GetByIdAsync(id)
            ?? throw new InvalidOperationException($"DevInfoItem {id} 없음");
        return McpJson.Serialize(dto);
    }

    [McpServerTool(Name = "atlas_devinfo_create"),
     Description("업무 정보 생성. type 은 Markdown|File|Link|GitRepo. Markdown 은 디스크에 .md 자동 export. GitRepo 는 filePath 에 로컬 저장소 절대경로(이력은 우측 패널에 표시, .md export 없음)")]
    public static async Task<string> Create(
        DevInfoService svc,
        [Description("프로젝트 ID")] int projectId,
        [Description("제목")] string title,
        [Description("타입 Markdown|File|Link|GitRepo")] DevInfoType type,
        [Description("저장 모드 Copy(기본)|Reference — File 타입에만 의미")] DevInfoStorageMode? storageMode = null,
        [Description("내용 (markdown) — Markdown 타입")] string? content = null,
        [Description("파일 경로 — File 타입 / GitRepo 타입은 로컬 저장소 절대경로")] string? filePath = null,
        [Description("URL — Link 타입")] string? url = null,
        [Description("콤마 구분 태그 (예: \"api, auth\")")] string? tags = null) =>
        McpJson.Serialize(await svc.CreateAsync(new CreateDevInfoItemDto(
            ProjectId: projectId,
            Title: title,
            Type: type,
            StorageMode: storageMode ?? DevInfoStorageMode.Copy,
            Content: content ?? string.Empty,
            FilePath: filePath ?? string.Empty,
            Url: url ?? string.Empty,
            Tags: tags ?? string.Empty)));

    [McpServerTool(Name = "atlas_devinfo_update"),
     Description("업무 정보 부분 갱신 — null 인 필드는 기존 값 유지")]
    public static async Task<string> Update(
        DevInfoService svc, int id,
        string? title = null, DevInfoType? type = null, DevInfoStorageMode? storageMode = null,
        string? content = null, string? filePath = null, string? url = null, string? tags = null)
    {
        var existing = await svc.GetByIdAsync(id)
            ?? throw new InvalidOperationException($"DevInfoItem {id} 없음");
        var updated = await svc.UpdateAsync(id, new UpdateDevInfoItemDto(
            Title: title ?? existing.Title,
            Type: type ?? existing.Type,
            StorageMode: storageMode ?? existing.StorageMode,
            Content: content ?? existing.Content,
            FilePath: filePath ?? existing.FilePath,
            Url: url ?? existing.Url,
            Tags: tags ?? existing.Tags));
        return McpJson.Serialize(updated);
    }

    [McpServerTool(Name = "atlas_devinfo_delete"),
     Description("업무 정보 삭제 (Markdown / Copy 모드는 디스크 파일도 함께 제거)")]
    public static async Task<string> Delete(DevInfoService svc, int id)
    {
        if (!await svc.DeleteAsync(id))
            throw new InvalidOperationException($"DevInfoItem {id} 없음");
        return McpJson.Serialize(new { deleted = true, id });
    }

    [McpServerTool(Name = "atlas_devinfo_tags"),
     Description("프로젝트 DevInfo 의 distinct 태그 list. sort=alpha(기본) 또는 freq")]
    public static async Task<string> Tags(
        DevInfoService svc,
        [Description("프로젝트 ID")] int projectId,
        [Description("alpha(기본) | freq")] string? sort = null) =>
        McpJson.Serialize(await svc.GetDistinctTagsAsync(projectId, sort));
}
