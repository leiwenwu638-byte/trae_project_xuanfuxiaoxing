param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$startupDir = [Environment]::GetFolderPath('Startup')
$launcherPath = Join-Path $startupDir 'DesktopHealthAssistant.vbs'
$electronPath = Join-Path $ProjectRoot 'node_modules\electron\dist\electron.exe'
$entryPath = Join-Path $ProjectRoot 'dist\main\index.cjs'

if (-not (Test-Path -LiteralPath $electronPath)) {
  throw "Electron executable not found: $electronPath"
}

if (-not (Test-Path -LiteralPath $entryPath)) {
  throw "Built app entry not found: $entryPath. Run npm run build first."
}

$runCommand = '"""' + $electronPath + '"" ""' + $entryPath + '"""'

$vbs = @"
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "$ProjectRoot"
On Error Resume Next
shell.Environment("PROCESS").Remove("ELECTRON_RUN_AS_NODE")
shell.Run "taskkill /IM electron.exe /F", 0, True
On Error GoTo 0
shell.Run $runCommand, 0, False
"@

Set-Content -LiteralPath $launcherPath -Value $vbs -Encoding ASCII

Write-Output "Startup launcher repaired: $launcherPath"
Write-Output "Electron path: $electronPath"
Write-Output "App entry: $entryPath"
