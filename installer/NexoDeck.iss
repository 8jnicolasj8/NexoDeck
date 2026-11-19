#define MyAppName "NexoDeck"
#ifndef MyAppVersion
  #define MyAppVersion "1.0.2"
#endif
#define MyAppPublisher "NexoDeck"
#define MyAppExeName "NexoDeck.Server.exe"
#define MyPublishDir "..\server\src\NexoDeck.Server\bin\Release\net8.0-windows10.0.19041.0\win-x64\publish"

[Setup]
AppId={{E6D59A60-24B1-4A59-86BC-97BD3D10A380}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
LicenseFile=..\LICENSE
OutputDir=..\dist
OutputBaseFilename=NexoDeck-Setup-{#MyAppVersion}
SetupIconFile=app.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
ArchitecturesAllowed=x64compatible
CloseApplications=yes
RestartApplications=no
UsePreviousAppDir=yes
DisableDirPage=auto
DisableProgramGroupPage=auto

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "startwithwindows"; Description: "Iniciar con Windows (tarea programada sin UAC)"; GroupDescription: "Opciones de inicio:"

[Files]
Source: "{#MyPublishDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\app.ico"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon; IconFilename: "{app}\app.ico"

[Run]
Filename: "netsh.exe"; Parameters: "advfirewall firewall add rule name=""NexoDeck"" dir=in action=allow protocol=TCP localport=47800,47801 profile=private program=""{app}\{#MyAppExeName}"""; Flags: runhidden
Filename: "netsh.exe"; Parameters: "advfirewall firewall add rule name=""NexoDeck mDNS"" dir=in action=allow protocol=UDP localport=5353 profile=private program=""{app}\{#MyAppExeName}"""; Flags: runhidden
Filename: "schtasks.exe"; Parameters: "/create /tn ""NexoDeck"" /tr ""\""{app}\{#MyAppExeName}\"" --background"" /sc onlogon /rl limited /f"; Flags: runhidden; Tasks: startwithwindows
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent runasoriginaluser

[UninstallRun]
Filename: "taskkill.exe"; Parameters: "/im {#MyAppExeName} /f"; Flags: runhidden; RunOnceId: "KillNexoDeck"
Filename: "schtasks.exe"; Parameters: "/delete /tn ""NexoDeck"" /f"; Flags: runhidden; RunOnceId: "DeleteNexoDeckTask"
Filename: "netsh.exe"; Parameters: "advfirewall firewall delete rule name=""NexoDeck"""; Flags: runhidden; RunOnceId: "DeleteNexoDeckFirewall"
Filename: "netsh.exe"; Parameters: "advfirewall firewall delete rule name=""NexoDeck mDNS"""; Flags: runhidden; RunOnceId: "DeleteNexoDeckMdnsFirewall"

[Code]
var
  DataDirPage: TInputDirWizardPage;

function IsAppInstalled(): Boolean;
begin
  Result := RegKeyExists(HKLM64, 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{#SetupSetting("AppId")}_is1') or
            RegKeyExists(HKLM32, 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{#SetupSetting("AppId")}_is1') or
            RegKeyExists(HKCU64, 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{#SetupSetting("AppId")}_is1') or
            RegKeyExists(HKCU32, 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{#SetupSetting("AppId")}_is1') or
            FileExists(ExpandConstant('{app}\{#MyAppExeName}'));
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  // Terminar el servidor NexoDeck si está en ejecución antes de actualizar los archivos binarios
  Exec('taskkill.exe', '/im {#MyAppExeName} /f', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := '';
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  // Si la aplicación ya está instalada, saltar la página de selección de carpeta de datos para preservar la configuración existente
  if (PageID = DataDirPage.ID) and IsAppInstalled() then
    Result := True;
end;

procedure InitializeWizard;
begin
  DataDirPage := CreateInputDirPage(wpSelectDir,
    'Carpeta de datos (DataDir)',
    'Elegí dónde querés guardar tu configuración, certificados y registros.',
    'Se guardarán tu configuración (config.json), certificados de seguridad local, íconos de aplicaciones y scripts autorizados.'#13#10 +
    'Recomendado: mantener la ubicación predeterminada en tu carpeta de usuario (%AppData%\NexoDeck).',
    False, '');
  DataDirPage.Add('');
  DataDirPage.Values[0] := ExpandConstant('{userappdata}\NexoDeck');
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  AppDataDir: string;
  ChosenDir: string;
  BootstrapPath: string;
  JsonContent: string;
begin
  if CurStep = ssPostInstall then
  begin
    AppDataDir := ExpandConstant('{userappdata}\NexoDeck');
    BootstrapPath := AppDataDir + '\bootstrap.json';

    // Solo creamos bootstrap.json en instalaciones nuevas; en actualizaciones preservamos la configuración
    if not FileExists(BootstrapPath) then
    begin
      ChosenDir := DataDirPage.Values[0];
      if ChosenDir = '' then
        ChosenDir := ExpandConstant('{userappdata}\NexoDeck');
        
      ForceDirectories(ChosenDir);
      ForceDirectories(AppDataDir);
      
      StringChangeEx(ChosenDir, '\', '\\', True);
      JsonContent := '{"dataDir":"' + ChosenDir + '"}';
      SaveStringToFile(BootstrapPath, JsonContent, False);
    end;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  DataDir: string;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    DataDir := ExpandConstant('{userappdata}\NexoDeck');
    if DirExists(DataDir) then
    begin
      if MsgBox('¿Deseás eliminar también la carpeta de datos y configuraciones personales?'#13#10#13#10 +
                'Ubicación: ' + DataDir, mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
      begin
        DelTree(DataDir, True, True, True);
      end;
    end;
  end;
end;
