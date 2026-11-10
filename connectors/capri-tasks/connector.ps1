# Capri tasks and GitHub watcher. Local only, except GitHub when gh is logged in.
$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$logPath = Join-Path $dir 'connector.log'
$statePath = Join-Path $dir 'state.json'
$docs = [Environment]::GetFolderPath('MyDocuments')
$taskFile = Join-Path $docs 'Capri\tarefas.txt'
$utf8 = New-Object System.Text.UTF8Encoding $false

$mutex = New-Object Threading.Mutex($false, 'Local\CapriTasks')
$gotMutex = $false
try { $gotMutex = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $gotMutex = $true }
if (-not $gotMutex) { exit 0 }

function Log($msg) {
  $line = '{0} {1}{2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg, [Environment]::NewLine
  [IO.File]::AppendAllText($logPath, $line, $utf8)
}

function To-Map($obj) {
  $map = @{}
  if (-not $obj) { return $map }
  foreach ($p in $obj.PSObject.Properties) { $map[$p.Name] = $true }
  return $map
}

function Load-State {
  if (-not (Test-Path $statePath)) {
    return @{ open = @{}; reminded = @{}; celebrated = @{}; githubSeen = @{}; githubReady = $false }
  }
  $obj = [IO.File]::ReadAllText($statePath, $utf8) | ConvertFrom-Json
  return @{
    open = (To-Map $obj.open)
    reminded = (To-Map $obj.reminded)
    celebrated = (To-Map $obj.celebrated)
    githubSeen = (To-Map $obj.githubSeen)
    githubReady = [bool]$obj.githubReady
  }
}

function Save-State($state) {
  $json = $state | ConvertTo-Json -Depth 6
  [IO.File]::WriteAllText($statePath, $json, $utf8)
}

function Ensure-TaskFile {
  $folder = Split-Path -Parent $taskFile
  if (-not (Test-Path $folder)) { New-Item -ItemType Directory -Path $folder | Out-Null }
  if (Test-Path $taskFile) { return }
  $text = @"
# Tarefas da Capri. Uma por linha. A hora é opcional.
# [ ] estudar | 21:00
# [ ] entregar o trabalho | 28/10 18:00
# Quando terminar, troca o espaço por x:
# [x] estudar | 21:00
#
# Na hora ela fala: Você disse que ia estudar.
# Quando marca [x], ela fala: Boa. estudar, feito.

"@
  [IO.File]::WriteAllText($taskFile, $text.Replace("`n", "`r`n"), (New-Object System.Text.UTF8Encoding $true))
}

function Get-TaskId([string]$title, [string]$when) {
  $raw = ($title.Trim().ToLowerInvariant() + '|' + $when.Trim().ToLowerInvariant())
  $sha = [Security.Cryptography.SHA1]::Create()
  try {
    $hash = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($raw))).Replace('-', '')
    return $hash.Substring(0, 12)
  } finally {
    $sha.Dispose()
  }
}

function Parse-When([string]$raw) {
  if (-not $raw) { return $null }
  $t = $raw.Trim() -replace '^(hoje|today)\s+', ''
  if ($t -match '^(\d{1,2}):(\d{2})$') {
    $now = Get-Date
    return Get-Date -Year $now.Year -Month $now.Month -Day $now.Day -Hour ([int]$Matches[1]) -Minute ([int]$Matches[2]) -Second 0
  }
  if ($t -match '^(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\s+(\d{1,2}):(\d{2})$') {
    $year = if ($Matches[3]) { [int]$Matches[3] } else { (Get-Date).Year }
    if ($year -lt 100) { $year += 2000 }
    return Get-Date -Year $year -Month ([int]$Matches[2]) -Day ([int]$Matches[1]) -Hour ([int]$Matches[4]) -Minute ([int]$Matches[5]) -Second 0
  }
  if ($t -match '^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$') {
    $hour = if ($Matches[4]) { [int]$Matches[4] } else { 9 }
    $minute = if ($Matches[5]) { [int]$Matches[5] } else { 0 }
    return Get-Date -Year ([int]$Matches[1]) -Month ([int]$Matches[2]) -Day ([int]$Matches[3]) -Hour $hour -Minute $minute -Second 0
  }
  return $null
}

function Read-Tasks {
  if (-not (Test-Path $taskFile)) { return @() }
  $lines = [IO.File]::ReadAllLines($taskFile, $utf8)
  $tasks = @()
  foreach ($line in $lines) {
    $trim = $line.Trim()
    if ($trim -notmatch '^\[([ xX])\]\s*(.+)$') { continue }
    $done = $Matches[1] -ne ' '
    $body = $Matches[2].Trim()
    $title = $body
    $whenRaw = ''
    $pipe = $body.IndexOf('|')
    if ($pipe -ge 0) {
      $title = $body.Substring(0, $pipe).Trim()
      $whenRaw = $body.Substring($pipe + 1).Trim()
    }
    if (-not $title) { continue }
    $tasks += [pscustomobject]@{
      Done = $done
      Title = $title
      When = $whenRaw
      Due = (Parse-When $whenRaw)
      Id = (Get-TaskId $title $whenRaw)
    }
  }
  return $tasks
}

function Send-Capri($evt) {
  $evt.demo = $true
  if (-not $evt.session_id) { $evt.session_id = 'capri-tarefas' }
  $json = $evt | ConvertTo-Json -Compress -Depth 5
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  Invoke-RestMethod -Method POST -Uri 'http://127.0.0.1:47823/event' -Body $bytes -ContentType 'application/json; charset=utf-8' -TimeoutSec 5 | Out-Null
}

function Send-Note([string]$message) {
  Send-Capri @{ hook_event_name = 'Notification'; notification_type = 'info'; message = $message }
}

function Send-Done([string]$message) {
  Send-Capri @{
    hook_event_name = 'PreToolUse'
    tool_name = 'Edit'
    tool_input = @{ file_path = 'tarefa' }
  }
  Start-Sleep -Milliseconds 350
  Send-Capri @{ hook_event_name = 'Stop'; last_assistant_message = $message }
}

function Find-Gh {
  $cmd = Get-Command gh -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $hit = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Filter gh.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($hit) { return $hit.FullName }
  return $null
}

function Invoke-Gh([string]$gh, [string[]]$argList) {
  $prev = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'SilentlyContinue'
    $out = & $gh @argList 2>$null
    return @{ Code = $LASTEXITCODE; Out = $out }
  } finally {
    $ErrorActionPreference = $prev
  }
}

function Test-GhAuth([string]$gh) {
  $r = Invoke-Gh $gh @('auth', 'status')
  return ($r.Code -eq 0)
}

function Get-GhConclusion([string]$gh, [string]$url) {
  if (-not $url) { return '' }
  $path = ([Uri]$url).PathAndQuery
  $r = Invoke-Gh $gh @('api', '-H', 'Accept: application/vnd.github+json', $path, '--jq', '.conclusion // .state // empty')
  if ($r.Code -ne 0 -or -not $r.Out) { return '' }
  return ([string]$r.Out).Trim().ToLowerInvariant()
}

function Poll-Tasks($state) {
  $tasks = @(Read-Tasks)
  $now = Get-Date
  $stillOpen = @{}
  foreach ($task in $tasks) {
    if ($task.Done) { continue }
    $stillOpen[$task.Id] = $true
    $due = $task.Due -and ($task.Due -le $now) -and (-not $state.reminded.ContainsKey($task.Id))
    if (-not $due) { continue }
    try {
      Send-Note ('Você disse que ia ' + $task.Title + '.')
      $state.reminded[$task.Id] = $true
      Log ('reminded ' + $task.Title)
    } catch {
      Log ('remind failed ' + $_.Exception.Message)
    }
  }
  $keepOpen = @{}
  foreach ($task in $tasks) {
    if (-not $task.Done) { continue }
    if ($state.celebrated.ContainsKey($task.Id)) { continue }
    if (-not $state.open.ContainsKey($task.Id)) { continue }
    try {
      Send-Done ('Boa. ' + $task.Title + ', feito.')
      $state.celebrated[$task.Id] = $true
      Log ('celebrated ' + $task.Title)
    } catch {
      $keepOpen[$task.Id] = $true
      Log ('celebrate failed ' + $_.Exception.Message)
    }
  }
  foreach ($id in @($keepOpen.Keys)) { $stillOpen[$id] = $true }
  $state.open = $stillOpen
}

function Poll-Github($state, [string]$gh) {
  if (-not $gh) { return }
  if (-not (Test-GhAuth $gh)) {
    if (-not $script:ghNoted) { Log 'github aguardando login do gh'; $script:ghNoted = $true }
    return
  }
  $r = Invoke-Gh $gh @('api', '-H', 'Accept: application/vnd.github+json', '/notifications?per_page=30&all=false')
  $json = (@($r.Out) -join "`n").Trim()
  if ($r.Code -ne 0 -or -not $json) { Log 'github poll failed'; return }
  $parsed = $json | ConvertFrom-Json
  $items = @()
  if ($null -ne $parsed) { $items = @($parsed) }
  if (-not $state.githubReady) {
    foreach ($item in $items) { if ($item.id) { $state.githubSeen[[string]$item.id] = $true } }
    $state.githubReady = $true
    Log ('github baseline ' + @($items).Count)
    return
  }
  foreach ($item in $items) {
    $id = [string]$item.id
    if (-not $id -or $state.githubSeen.ContainsKey($id)) { continue }
    $type = [string]$item.subject.type
    $reason = [string]$item.reason
    $title = [string]$item.subject.title
    if ($title.Length -gt 80) { $title = $title.Substring(0, 80) }
    $spoken = $false
    $ok = $true
    try {
      if ($type -eq 'PullRequest') {
        if ($reason -in @('mention', 'comment', 'review_requested', 'team_mention')) {
          Send-Note ('Tão falando contigo: ' + $title)
        } else {
          Send-Note ('Chegou um PR: ' + $title)
        }
        $spoken = $true
      } elseif ($type -eq 'Issue' -and $reason -in @('mention', 'comment', 'team_mention', 'assign')) {
        Send-Note ('Tão falando contigo: ' + $title)
        $spoken = $true
      } elseif ($type -in @('CheckSuite', 'CheckRun', 'Deployment')) {
        $conclusion = Get-GhConclusion $gh ([string]$item.subject.url)
        if ($conclusion -in @('failure', 'cancelled', 'timed_out', 'error')) {
          Send-Note ('O build falhou: ' + $title)
          $spoken = $true
        } elseif ($type -eq 'Deployment' -and $conclusion -eq 'success') {
          Send-Done ('Deploy pronto: ' + $title)
          $spoken = $true
        }
      }
    } catch {
      $ok = $false
      Log ('github speak failed ' + $_.Exception.Message)
    }
    if ($ok) {
      $state.githubSeen[$id] = $true
      if ($spoken) { Log ('github ' + $type + ' ' + $title) }
    }
  }
}

Ensure-TaskFile
$state = Load-State
$gh = Find-Gh
Log ('listening tasks=' + $taskFile)
$tick = 0
try {
  while ($true) {
    try { Poll-Tasks $state } catch { Log $_.Exception.Message }
    $tick++
    if ($tick % 12 -eq 1) {
      if (-not $gh) { $gh = Find-Gh }
      try { Poll-Github $state $gh } catch { Log $_.Exception.Message }
    }
    Save-State $state
    Start-Sleep -Seconds 10
  }
} finally {
  $mutex.ReleaseMutex()
}
