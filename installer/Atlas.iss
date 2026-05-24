; Atlas 인스톨러 (Inno Setup 6)
; publish.ps1 -Installer 가 publish/ 빌드 후 ISCC 로 컴파일한다.
;   ISCC.exe /DMyAppVersion=1.5.0 installer\Atlas.iss
; per-user 설치(관리자 불필요). 데이터 폴더(%LOCALAPPDATA%\Atlas, Documents\ProjectManager)는 건드리지 않는다.

#ifndef MyAppVersion
  #define MyAppVersion "0.0.0"
#endif

#define MyAppName "Atlas"
#define MyAppPublisher "SlnU"
#define MyAppExeName "Atlas.exe"

[Setup]
; AppId 는 고정 — 업그레이드 시 같은 항목을 갱신(중복 설치 방지). 절대 변경 금지.
AppId={{B7E9A4C2-3F8D-4A1E-9C5B-2D6F8A0E1C34}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
VersionInfoVersion={#MyAppVersion}
DefaultDirName={localappdata}\Programs\Atlas
DefaultGroupName=Atlas
DisableProgramGroupPage=yes
; 관리자 권한 불필요 — %LOCALAPPDATA% 하위에 설치.
PrivilegesRequired=lowest
; 실행 중 Atlas / Atlas-Mcp / Atlas-Cli 를 Restart Manager 로 감지·종료 후 교체.
; AppMutex 는 App.xaml.cs 의 named mutex 와 동일해야 한다.
AppMutex=Atlas-SingleInstance
CloseApplications=yes
RestartApplications=no
WizardStyle=modern
Compression=lzma2/max
SolidCompression=yes
; 산출물: 레포 루트의 Atlas-Setup-<버전>.exe
OutputDir=..
OutputBaseFilename=Atlas-Setup-{#MyAppVersion}
UninstallDisplayIcon={app}\{#MyAppExeName}
SetupIconFile=..\src\ProjectManager.DesktopApp\Resources\atlas.ico

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "..\publish\Atlas.exe";          DestDir: "{app}"; Flags: ignoreversion
Source: "..\publish\Atlas-Cli.exe";      DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "..\publish\Atlas-Mcp.exe";      DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "..\publish\ATLAS-CLI-USAGE.md"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "..\publish\wwwroot\*";          DestDir: "{app}\wwwroot"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
; AppUserModelID 는 App.xaml.cs 의 SetCurrentProcessExplicitAppUserModelID 와 동일해야 한다 —
; 바로가기와 실행 프로세스의 작업표시줄 정체성을 일치시켜 핀 고정·아이콘 갱신이 일관되게 동작.
Name: "{group}\Atlas";                       Filename: "{app}\{#MyAppExeName}"; AppUserModelID: "SlnU.Atlas"
Name: "{group}\{cm:UninstallProgram,Atlas}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Atlas";                 Filename: "{app}\{#MyAppExeName}"; AppUserModelID: "SlnU.Atlas"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,Atlas}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; 설치한 정적 자산만 정리. config.json·데이터 폴더는 보존(다른 위치라 자동 보존).
Type: filesandordirs; Name: "{app}\wwwroot"
