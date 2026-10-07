$ErrorActionPreference = "Stop"

$out = Join-Path $PSScriptRoot "build"
$obj = Join-Path $out "obj"
New-Item -ItemType Directory -Force -Path $out, $obj | Out-Null

$vcvars = "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars32.bat"
if (!(Test-Path $vcvars)) {
  throw "Visual Studio 2022 vcvars32.bat was not found at $vcvars"
}

$source = Join-Path $PSScriptRoot "src\main.cpp"
$resource = Join-Path $PSScriptRoot "src\loader.rc"
$res = Join-Path $obj "loader.res"
$exe = Join-Path $out "exordium-game.exe"
$stormDef = Join-Path $PSScriptRoot "src\storm.def"
$stormLib = Join-Path $obj "storm.lib"
$cmd = "call ""$vcvars"" >nul && rc /nologo /fo ""$res"" ""$resource"" && lib /nologo /machine:x86 /def:""$stormDef"" /out:""$stormLib"" >nul && cl /nologo /std:c++17 /EHsc /W4 /WX /Fo""$obj\\"" /Fe""$exe"" ""$source"" ""$res"" ""$stormLib"" advapi32.lib user32.lib gdi32.lib shell32.lib /link /SUBSYSTEM:WINDOWS /NXCOMPAT:NO /DYNAMICBASE:NO"

# Link flags match Game.exe and D2SE.exe, neither of which is NX-compatible: D2Mod plugins such as
# NewTxt.dll execute code from data pages, which faults with DEP on. /DYNAMICBASE:NO keeps the exe at
# 0x400000 like Game.exe. /SUBSYSTEM:WINDOWS starts it without a console window.

cmd /d /s /c $cmd
if ($LASTEXITCODE -ne 0) {
  throw "cl failed with exit code $LASTEXITCODE"
}
if (!(Test-Path $exe)) {
  throw "cl completed but did not create $exe"
}
Write-Host "Built $exe"

Remove-Item -Force -ErrorAction SilentlyContinue `
  (Join-Path $out "exordium-launch.exe"), `
  (Join-Path $out "exordium-launch-nodiscord.exe"), `
  (Join-Path $out "exordium-hook.dll"), `
  (Join-Path $out "exordium-presence.exe")
Write-Host "Release-safe loader build: launch/hook/presence are not built."
