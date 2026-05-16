namespace ProjectManager.Core.Domain;

public enum DevInfoType { Markdown, File, Link }

// File 타입 항목의 파일 저장 방식.
// Copy: 업로드된 파일을 데이터 폴더의 DevFiles 로 카피, FilePath 는 카피본 경로.
// Reference: 카피하지 않고 사용자가 지정한 원본 경로를 FilePath 에 저장. 백업 zip 에 포함 안 됨.
public enum DevInfoStorageMode { Copy, Reference }

public class DevInfoItem : IAuditable
{
    public int Id { get; set; }
    public int ProjectId { get; set; }
    public string Title { get; set; } = string.Empty;
    public DevInfoType Type { get; set; }
    public DevInfoStorageMode StorageMode { get; set; } = DevInfoStorageMode.Copy;
    public string Content { get; set; } = string.Empty;
    public string FilePath { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public string Tags { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string CreatedBy { get; set; } = string.Empty;
    public string UpdatedBy { get; set; } = string.Empty;

    public Project Project { get; set; } = null!;
}
