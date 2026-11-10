# Installs this Capri onto a PC that already has, or is about to get, the official app.
# Does not rewrite config.json. Does not start gh auth. Does not download a voice model.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$exe = Join-Path $env:LOCALAPPDATA 'Programs\capri-desktop\Capri.exe'
$asar = Join-Path $env:LOCALAPPDATA 'Programs\capri-desktop\resources\app.asar'
$setup = Join-Path $env:TEMP 'Capri-Setup-0.5.1.exe'
$url = 'https://github.com/mochiiwuff/capri-desktop/releases/download/v0.5.1/Capri-Setup-0.5.1.exe'

if (-not (Test-Path -LiteralPath $exe)) {
  Write-Output 'Capri ainda nao esta instalada. Baixando o instalador oficial 0.5.1.'
  Invoke-WebRequest -Uri $url -OutFile $setup
  Start-Process -FilePath $setup
  Write-Output 'Termine o instalador (SmartScreen: Mais informacoes, Executar mesmo assim) e rode este script de novo.'
  exit 0
}

Write-Output 'Parando a Capri para trocar o app.asar.'
Get-CimInstance Win32_Process -Filter "Name = 'Capri.exe'" | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2

$bak = $asar + '.bak-before-leo'
if (-not (Test-Path -LiteralPath $bak)) {
  Copy-Item -LiteralPath $asar -Destination $bak
}

python (Join-Path $here 'pack.py') $asar
if ($LASTEXITCODE -ne 0) { throw 'pack.py falhou' }

$cache = Join-Path $env:APPDATA 'capri-desktop\Code Cache\js'
if (Test-Path -LiteralPath $cache) {
  Remove-Item -LiteralPath $cache -Recurse -Force -ErrorAction SilentlyContinue
}

# windows.ps1 stays unpacked (PowerShell reads it). It is not inside app.asar.
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" | ForEach-Object {
  if ($_.CommandLine -and $_.CommandLine -like '*windows.ps1*') {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
}
Start-Sleep -Milliseconds 400
$helperSrc = Join-Path $here 'host\windows.ps1'
$helperDst = Join-Path $env:LOCALAPPDATA 'Programs\capri-desktop\resources\app.asar.unpacked\src\main\windows.ps1'
if (Test-Path -LiteralPath $helperSrc) {
  Copy-Item -LiteralPath $helperSrc -Destination $helperDst -Force
  Write-Output 'windows.ps1 dos icones copiado'
}

function Copy-Connector($name) {
  $from = Join-Path $here (Join-Path 'connectors' $name)
  if (-not (Test-Path -LiteralPath $from)) { return }
  $dest = Join-Path $env:APPDATA $name
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item -LiteralPath (Join-Path $from 'connector.ps1') -Destination (Join-Path $dest 'connector.ps1') -Force
  $startup = [Environment]::GetFolderPath('Startup')
  $lnkPath = Join-Path $startup ($name + '.lnk')
  $shell = New-Object -ComObject WScript.Shell
  $lnk = $shell.CreateShortcut($lnkPath)
  $lnk.TargetPath = 'powershell.exe'
  $lnk.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $dest 'connector.ps1') + '"'
  $lnk.WorkingDirectory = $dest
  $lnk.Save()
  Write-Output ('conector ' + $name)
}

Copy-Connector 'capri-spotify'
Copy-Connector 'capri-voice'
Copy-Connector 'capri-tasks'
$spotifyCfg = Join-Path $env:APPDATA 'capri-spotify\config.json'
if (-not (Test-Path -LiteralPath $spotifyCfg)) {
  Set-Content -LiteralPath $spotifyCfg -Value '{"clientId":""}' -Encoding ASCII
}

$quoted = '"' + $exe + '"'
$started = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $quoted }
Write-Output ('Capri iniciada, pid ' + $started.ProcessId)
Write-Output 'config.json nao foi reescrito.'
