using System.CommandLine;

namespace ProjectManager.Cli.Commands;

internal static class CommandFactory
{
    public static RootCommand BuildRoot(IServiceProvider services)
    {
        var root = new RootCommand(
            "Atlas CLI — 외부 프로세스/자동화 (Claude Code 세션 등) 에서 Atlas 데이터 입력/조회. " +
            "ATLAS-CLI-USAGE.md 참조. 데이터는 Atlas 와 같은 DB(%LOCALAPPDATA%\\Atlas\\config.json 의 dataFolder) 자동 발견.");

        root.AddCommand(ProjectCommands.Build(services));
        root.AddCommand(IssueCommands.Build(services));
        root.AddCommand(WbsCommands.Build(services));
        root.AddCommand(TemplateCommands.Build(services));
        root.AddCommand(MeetingCommands.Build(services));
        root.AddCommand(ChangeLogCommands.Build(services));
        root.AddCommand(WorkLogCommands.Build(services));
        root.AddCommand(DevInfoCommands.Build(services));
        root.AddCommand(ResourceCommands.Build(services));
        root.AddCommand(SearchCommands.Build(services));
        root.AddCommand(SkillCommands.Build(services));
        return root;
    }
}
