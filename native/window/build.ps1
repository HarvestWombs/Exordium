$ErrorActionPreference = "Stop"

# 64-bit, unlike the loader: it is loaded into the desktop app (deno), not the game.

$out = Join-Path $PSScriptRoot "build"
$obj = Join-Path $out "obj"
New-Item -ItemType Directory -Force -Path $out, $obj | Out-Null

$vcvars = "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
if (!(Test-Path $vcvars)) {
  throw "Visual Studio 2022 vcvars64.bat was not found at $vcvars"
}

$source = Join-Path $PSScriptRoot "src\window.cpp"
$dll = Join-Path $out "exordium-window.dll"
$cmd = "call ""$vcvars"" >nul && cl /nologo /std:c++17 /EHsc /W4 /WX /O2 /LD /Fo""$obj\\"" /Fe""$dll"" ""$source"" user32.lib /link /NOIMPLIB /NOEXP"

cmd /d /s /c $cmd
if ($LASTEXITCODE -ne 0) {
  throw "cl failed with exit code $LASTEXITCODE"
}
if (!(Test-Path $dll)) {
  throw "cl completed but did not create $dll"
}
Write-Host "Built $dll"
