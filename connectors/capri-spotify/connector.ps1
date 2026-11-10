# Capri Spotify connector. Listens on 127.0.0.1:47824.
# Premium account, Authorization Code + PKCE. Client ID lives in config.json.
$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $dir 'config.json'
$tokenPath = Join-Path $dir 'token.json'
$logPath = Join-Path $dir 'connector.log'
$port = 47824
$redirectPort = 47825
$redirectUri = "http://127.0.0.1:${redirectPort}/callback"
$scope = 'user-modify-playback-state user-read-playback-state'

$mutex = New-Object Threading.Mutex($false, 'Local\CapriSpotifyConnector')
$gotMutex = $false
try {
  $gotMutex = $mutex.WaitOne(0)
} catch [Threading.AbandonedMutexException] {
  $gotMutex = $true
}
if (-not $gotMutex) { exit 0 }

function Log($msg) {
  $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Add-Content -Path $logPath -Value $line -Encoding UTF8
}

function Read-JsonFile($path) {
  if (-not (Test-Path $path)) { return $null }
  $raw = [IO.File]::ReadAllText($path)
  if (-not $raw.Trim()) { return $null }
  return $raw | ConvertFrom-Json
}

function Write-JsonFile($path, $obj) {
  $json = $obj | ConvertTo-Json -Depth 6 -Compress
  [IO.File]::WriteAllText($path, $json)
}

function To-B64Url([byte[]]$bytes) {
  [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Encode($s) { [Uri]::EscapeDataString([string]$s) }

function Send-Http($stream, $status, $obj) {
  $reason = @{ 200 = 'OK'; 400 = 'Bad Request'; 500 = 'Error'; 503 = 'Unavailable' }[[int]$status]
  if (-not $reason) { $reason = 'OK' }
  $json = $obj | ConvertTo-Json -Depth 6 -Compress
  $body = [Text.Encoding]::UTF8.GetBytes($json)
  $head = "HTTP/1.1 $status $reason`r`nContent-Type: application/json; charset=utf-8`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
  $hb = [Text.Encoding]::ASCII.GetBytes($head)
  $stream.Write($hb, 0, $hb.Length)
  $stream.Write($body, 0, $body.Length)
  $stream.Flush()
}

function Read-Request($client) {
  $client.ReceiveTimeout = 20000
  $stream = $client.GetStream()
  $ms = New-Object IO.MemoryStream
  $buf = New-Object byte[] 4096
  $headerEnd = -1
  while ($headerEnd -lt 0 -and $ms.Length -lt 16384) {
    $n = $stream.Read($buf, 0, $buf.Length)
    if ($n -le 0) { break }
    $ms.Write($buf, 0, $n)
    $tmp = [Text.Encoding]::ASCII.GetString($ms.ToArray())
    $headerEnd = $tmp.IndexOf("`r`n`r`n")
  }
  $raw = [Text.Encoding]::UTF8.GetString($ms.ToArray())
  $headerEnd = $raw.IndexOf("`r`n`r`n")
  if ($headerEnd -lt 0) { return $null }
  $head = $raw.Substring(0, $headerEnd)
  $rest = $raw.Substring($headerEnd + 4)
  $len = 0
  foreach ($line in ($head -split "`r`n")) {
    if ($line -match '^Content-Length:\s*(\d+)') { $len = [int]$Matches[1] }
  }
  while ($rest.Length -lt $len -and $ms.Length -lt 32768) {
    $n = $stream.Read($buf, 0, $buf.Length)
    if ($n -le 0) { break }
    $rest += [Text.Encoding]::UTF8.GetString($buf, 0, $n)
  }
  $first = ($head -split "`r`n")[0]
  $parts = $first -split ' '
  $body = ''
  if ($len -gt 0 -and $rest.Length -ge $len) { $body = $rest.Substring(0, $len) }
  return @{ Method = $parts[0]; Path = $parts[1]; Body = $body; Stream = $stream }
}

function Get-ClientId {
  $cfg = Read-JsonFile $configPath
  $id = [string]$cfg.clientId
  if ($id) { return $id.Trim() }
  return [string]$env:CAPRI_SPOTIFY_CLIENT_ID
}

function Update-Token($token) {
  $token | Add-Member -NotePropertyName expires_at -NotePropertyValue ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() + [int]$token.expires_in - 30) -Force
  $saved = Read-JsonFile $tokenPath
  if (-not $token.refresh_token -and $saved.refresh_token) {
    $token | Add-Member -NotePropertyName refresh_token -NotePropertyValue $saved.refresh_token -Force
  }
  Write-JsonFile $tokenPath $token
  return $token
}

function Get-AccessToken {
  $saved = Read-JsonFile $tokenPath
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  if ($saved.access_token -and [int64]$saved.expires_at -gt $now) { return [string]$saved.access_token }
  if (-not $saved.refresh_token) { return $null }
  $clientId = Get-ClientId
  if (-not $clientId) { return $null }
  $form = @{
    grant_type = 'refresh_token'
    refresh_token = [string]$saved.refresh_token
    client_id = $clientId
  }
  $fresh = Invoke-RestMethod -Method POST -Uri 'https://accounts.spotify.com/api/token' -Body $form -ContentType 'application/x-www-form-urlencoded' -TimeoutSec 20
  return [string](Update-Token $fresh).access_token
}

function Wait-AuthCode($state) {
  $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $redirectPort)
  $listener.Start()
  try {
    $deadline = (Get-Date).AddMinutes(3)
    while ((Get-Date) -lt $deadline) {
      if (-not $listener.Pending()) { Start-Sleep -Milliseconds 200; continue }
      $client = $listener.AcceptTcpClient()
      try {
        $req = Read-Request $client
        $uri = [Uri]("http://127.0.0.1$($req.Path)")
        $q = [System.Web.HttpUtility]::ParseQueryString($uri.Query)
        $html = '<html><body style="font-family:sans-serif;background:#111;color:#eee"><p>Pode voltar para a Capri.</p></body></html>'
        $bytes = [Text.Encoding]::UTF8.GetBytes($html)
        $head = "HTTP/1.1 200 OK`r`nContent-Type: text/html; charset=utf-8`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
        $hb = [Text.Encoding]::ASCII.GetBytes($head)
        $req.Stream.Write($hb, 0, $hb.Length)
        $req.Stream.Write($bytes, 0, $bytes.Length)
        if ($q['state'] -ne $state) { return $null }
        if ($q['error']) { return $null }
        return [string]$q['code']
      } finally { $client.Close() }
    }
  } finally { $listener.Stop() }
  return $null
}

function Start-Login {
  $clientId = Get-ClientId
  if (-not $clientId) { return $null }
  $verifierBytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($verifierBytes)
  $verifier = To-B64Url $verifierBytes
  $sha = [Security.Cryptography.SHA256]::Create()
  $challenge = To-B64Url ($sha.ComputeHash([Text.Encoding]::ASCII.GetBytes($verifier)))
  $stateBytes = New-Object byte[] 16
  $rng.GetBytes($stateBytes)
  $state = To-B64Url $stateBytes
  $url = 'https://accounts.spotify.com/authorize?client_id=' + (Encode $clientId) +
    '&response_type=code&redirect_uri=' + (Encode $redirectUri) +
    '&scope=' + (Encode $scope) +
    '&code_challenge_method=S256&code_challenge=' + (Encode $challenge) +
    '&state=' + (Encode $state)
  Start-Process $url
  $code = Wait-AuthCode $state
  if (-not $code) { return $null }
  $form = @{
    grant_type = 'authorization_code'
    code = $code
    redirect_uri = $redirectUri
    client_id = $clientId
    code_verifier = $verifier
  }
  $token = Invoke-RestMethod -Method POST -Uri 'https://accounts.spotify.com/api/token' -Body $form -ContentType 'application/x-www-form-urlencoded' -TimeoutSec 20
  return [string](Update-Token $token).access_token
}

function Invoke-Spotify($method, $url, $token, $json) {
  $headers = @{ Authorization = "Bearer $token"; Accept = 'application/json' }
  $params = @{ Method = $method; Uri = $url; Headers = $headers; TimeoutSec = 20; UseBasicParsing = $true }
  if ($null -ne $json) {
    $params.Body = $json
    $params.ContentType = 'application/json'
  }
  try {
    $res = Invoke-WebRequest @params
    return @{ ok = $true; status = [int]$res.StatusCode; body = [string]$res.Content }
  } catch {
    $code = 0
    $text = $_.Exception.Message
    $resp = $_.Exception.Response
    if ($resp) { $code = [int]$resp.StatusCode }
    return @{ ok = $false; status = $code; body = $text }
  }
}

function Open-Track($uri) {
  Start-Process $uri
}

if (-not ('CapriSpotifyUi' -as [type])) {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public class CapriSpotifyUi {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  public static void ForceForeground(IntPtr h) {
    keybd_event(0x12, 0, 0, UIntPtr.Zero);
    ShowWindow(h, 9);
    SetForegroundWindow(h);
    keybd_event(0x12, 0, 2, UIntPtr.Zero);
  }
}
"@
}
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function Get-SpotifyProcess {
  return Get-Process -Name Spotify -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } |
    Select-Object -First 1
}

function Fold-Text([string]$s) {
  if (-not $s) { return '' }
  $form = $s.ToLowerInvariant().Normalize([Text.NormalizationForm]::FormD)
  $sb = New-Object System.Text.StringBuilder
  foreach ($ch in $form.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$sb.Append($ch)
    }
  }
  return ($sb.ToString() -replace '[^a-z0-9 ]', '')
}

function Get-SearchToken([string]$q) {
  $folded = Fold-Text $q
  $best = ''
  foreach ($part in ($folded -split ' ')) {
    if ($part.Length -gt $best.Length) { $best = $part }
  }
  if ($best.Length -ge 3) { return $best }
  return ($folded -replace ' ', '')
}

function Get-SpotifyUi($proc, [string]$token) {
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $cond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ProcessIdProperty, [int]$proc.Id)
  $win = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)
  if (-not $win) { return $null }
  $rect = New-Object CapriSpotifyUi+RECT
  [void][CapriSpotifyUi]::GetWindowRect([IntPtr]$proc.MainWindowHandle, [ref]$rect)
  $all = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  $now = ''
  $nowDist = [double]::MaxValue
  $transport = ''
  $hero = $null
  $heroY = [double]::MaxValue
  $heroX = 0
  $named = New-Object System.Collections.Generic.List[object]
  $barY = $rect.Bottom - 70
  foreach ($n in $all) {
    try {
      $name = [string]$n.Current.Name
      if (-not $name) { continue }
      $r = $n.Current.BoundingRectangle
      if ($r.Width -lt 8 -or $r.Height -lt 8) { continue }
      [void]$named.Add(@($name, [double]$r.X, [double]$r.Y))
      if ($name.StartsWith('Tocando agora:') -and $r.Y -gt ($rect.Top + 400)) {
        $dist = [Math]::Abs($r.Y - $barY)
        if ($dist -lt $nowDist) { $now = $name; $nowDist = $dist }
      }
      if ([string]$n.Current.ControlType.ProgrammaticName -ne 'ControlType.Button') { continue }
      $isTransportName = ($name -eq 'Play' -or $name -eq 'Pause' -or $name -eq 'Pausar')
      if (-not $isTransportName) { continue }
      if ($r.Height -ge 28 -and $r.Height -le 42 -and $r.Y -gt ($rect.Bottom - 140)) { $transport = $name }
      if ($r.Height -ge 48 -and $r.Y -gt ($rect.Top + 120) -and $r.Y -lt ($rect.Bottom - 80) -and $r.Y -lt $heroY) {
        $hero = $n
        $heroY = $r.Y
        $heroX = $r.X
      }
    } catch {}
  }
  $card = ''
  if ($hero -and $token) {
    foreach ($item in $named) {
      $ny = [double]$item[2]
      $nx = [double]$item[1]
      if ($ny -lt ($heroY - 40) -or $ny -gt ($heroY + 70)) { continue }
      if ($nx -gt ($heroX + 8)) { continue }
      $nm = [string]$item[0]
      if ((Fold-Text $nm) -like ('*' + $token + '*')) {
        if (-not $card -or $nm.Length -lt $card.Length) { $card = $nm }
      }
    }
  }
  return @{
    Now = $now
    NowFold = (Fold-Text $now)
    Transport = $transport
    Hero = $hero
    Card = $card
    Hit = [bool]$card
    Count = [int]$all.Count
  }
}

function Invoke-Hero($hero) {
  $pat = $hero.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
  $pat.Invoke()
}

function Get-RowKind([string]$name) {
  $f = Fold-Text $name
  $f = $f -replace '^explicito ', '' -replace '^explicit ', ''
  foreach ($k in @('musica','album','artista','playlist','single','podcast','audiolivro')) {
    if ($f -eq $k -or $f.StartsWith($k + ' ')) { return $k }
  }
  return ''
}

function Read-SpotifyRows($proc) {
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $cond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ProcessIdProperty, [int]$proc.Id)
  $win = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)
  if (-not $win) { return $null }
  $rect = New-Object CapriSpotifyUi+RECT
  [void][CapriSpotifyUi]::GetWindowRect([IntPtr]$proc.MainWindowHandle, [ref]$rect)
  $all = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  $now = ''
  $nowDist = [double]::MaxValue
  $transport = ''
  $barY = $rect.Bottom - 70
  $named = New-Object System.Collections.Generic.List[object]
  $buttons = New-Object System.Collections.Generic.List[object]
  foreach ($n in $all) {
    try {
      $name = [string]$n.Current.Name
      if (-not $name) { continue }
      $r = $n.Current.BoundingRectangle
      if ($r.Width -lt 8 -or $r.Height -lt 8) { continue }
      $relY = [double]$r.Y - $rect.Top
      if ($name.StartsWith('Tocando agora:') -and $r.Y -gt ($rect.Top + 400)) {
        $dist = [Math]::Abs($r.Y - $barY)
        if ($dist -lt $nowDist) { $now = $name; $nowDist = $dist }
      }
      $relX = [double]$r.X - $rect.Left
      [void]$named.Add([pscustomobject]@{ Name = $name; X = $relX; Y = $relY })
      if ([string]$n.Current.ControlType.ProgrammaticName -ne 'ControlType.Button') { continue }
      $isTransportName = ($name -eq 'Play' -or $name -eq 'Pause' -or $name -eq 'Pausar')
      if ($isTransportName -and $r.Height -ge 28 -and $r.Height -le 42 -and $r.Y -gt ($rect.Bottom - 140)) { $transport = $name }
      if ($name.StartsWith('Tocar ') -and $relY -gt 220 -and $relY -lt (($rect.Bottom - $rect.Top) - 90) -and $r.Height -ge 40) {
        [void]$buttons.Add([pscustomobject]@{ El = $n; Name = $name; X = $relX; Y = $relY })
      }
    } catch {}
  }
  $rows = New-Object System.Collections.Generic.List[object]
  foreach ($btn in $buttons) {
    $kind = ''
    foreach ($item in $named) {
      if ([Math]::Abs($item.Y - $btn.Y) -gt 32) { continue }
      if ($item.X -lt ($btn.X + 80)) { continue }
      $k = Get-RowKind ([string]$item.Name)
      if ($k) { $kind = $k; break }
    }
    $title = ([string]$btn.Name).Substring(6).Trim()
    [void]$rows.Add([pscustomobject]@{
      El = $btn.El
      Name = [string]$btn.Name
      Title = $title
      Fold = (Fold-Text $title)
      Kind = $kind
      RelY = $btn.Y
    })
  }
  return @{
    Rows = $rows
    Now = $now
    NowFold = (Fold-Text $now)
    Transport = $transport
    Top = $rect.Top
    Left = $rect.Left
  }
}

function Select-MusicaRow($rows, [string]$token, $ocrWords) {
  $best = $null
  $bestScore = -1
  foreach ($row in $rows) {
    $kind = [string]$row.Kind
    if ($ocrWords) {
      $ocrKind = ''
      foreach ($w in $ocrWords) {
        if ([Math]::Abs([double]$w.Y - [double]$row.RelY) -gt 32) { continue }
        if ([double]$w.X -lt 700) { continue }
        if ($w.Fold -in @('musica','album','artista','playlist','single','podcast')) { $ocrKind = [string]$w.Fold; break }
      }
      if ($ocrKind) { $kind = $ocrKind }
    }
    if ($kind -ne 'musica') { continue }
    $score = 10000 - [double]$row.RelY
    if ($token -and $row.Fold -eq $token) { $score += 500000 }
    elseif ($token -and $row.Fold.StartsWith($token + ' ')) { $score += 300000 }
    elseif ($token -and $row.Fold.Contains($token)) { $score += 150000 }
    if ($score -gt $bestScore) { $bestScore = $score; $best = $row }
  }
  return $best
}

function Save-SpotifyShot($proc) {
  $hwnd = [IntPtr]$proc.MainWindowHandle
  $rect = New-Object CapriSpotifyUi+RECT
  [void][CapriSpotifyUi]::GetWindowRect($hwnd, [ref]$rect)
  $w = $rect.Right - $rect.Left
  $h = $rect.Bottom - $rect.Top
  if ($w -lt 200 -or $h -lt 200) { return $null }
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $hdc = $g.GetHdc()
  [void][CapriSpotifyUi]::PrintWindow($hwnd, $hdc, 2)
  $g.ReleaseHdc($hdc)
  $path = Join-Path $dir 'last-search.png'
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  return $path
}

function Await-WinRt($winRtTask, $resultType) {
  if (-not $script:CapriAsTask) {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $script:CapriAsTask = @([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
      $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    })[0]
  }
  $asTask = $script:CapriAsTask.MakeGenericMethod($resultType)
  $netTask = $asTask.Invoke($null, @($winRtTask))
  $netTask.Wait(-1) | Out-Null
  return $netTask.Result
}

function Get-OcrWords([string]$path) {
  $null = [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
  $null = [Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
  $null = [Windows.Media.Ocr.OcrEngine,Windows.Media.Ocr,ContentType=WindowsRuntime]
  $null = [Windows.Globalization.Language,Windows.Globalization,ContentType=WindowsRuntime]
  $file = Await-WinRt ([Windows.Storage.StorageFile]::GetFileFromPathAsync($path)) ([Windows.Storage.StorageFile])
  $stream = Await-WinRt ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  try {
    $decoder = Await-WinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await-WinRt ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  } finally {
    $stream.Dispose()
  }
  $lang = New-Object Windows.Globalization.Language 'pt-BR'
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
  if (-not $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }
  if (-not $engine) { return @() }
  $result = Await-WinRt ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $words = New-Object System.Collections.Generic.List[object]
  foreach ($line in $result.Lines) {
    foreach ($word in $line.Words) {
      $text = [string]$word.Text
      $box = $word.BoundingRect
      [void]$words.Add([pscustomobject]@{
        Text = $text
        Fold = (Fold-Text $text)
        X = [double]$box.X
        Y = [double]$box.Y
      })
    }
  }
  return $words
}

function Play-Desktop($q) {
  $token = Get-SearchToken $q
  if (-not $token) {
    return @{ status = 400; body = @{ ok = $false; error = 'empty query' } }
  }
  $proc = Get-SpotifyProcess
  if (-not $proc) {
    Start-Process explorer.exe 'shell:AppsFolder\SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify'
    $until = (Get-Date).AddSeconds(18)
    while ((Get-Date) -lt $until -and -not $proc) {
      Start-Sleep -Milliseconds 400
      $proc = Get-SpotifyProcess
    }
  }
  if (-not $proc) {
    return @{ status = 503; body = @{ ok = $false; error = 'spotify not open' } }
  }
  try {
    [CapriSpotifyUi]::ForceForeground([IntPtr]$proc.MainWindowHandle)
    Start-Sleep -Milliseconds 200
    [System.Windows.Forms.SendKeys]::SendWait('{ESC}')
  } catch {}
  $enc = [Uri]::EscapeDataString($q.Trim())
  Start-Process ('spotify:search:' + $enc)
  $before = ''
  $choice = $null
  $rows = $null
  $deadline = (Get-Date).AddSeconds(12)
  $started = Get-Date
  $lastTitle = ''
  $stable = 0
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 350
    $proc = Get-SpotifyProcess
    if (-not $proc) { continue }
    $snap = Read-SpotifyRows $proc
    if (-not $snap) { continue }
    if (-not $before -and $snap.Now) { $before = [string]$snap.Now }
    if (((Get-Date) - $started).TotalSeconds -lt 0.8) { continue }
    $pick = Select-MusicaRow $snap.Rows $token $null
    if (-not $pick) { $stable = 0; $lastTitle = ''; continue }
    $rows = $snap.Rows
    if ($pick.Title -eq $lastTitle) { $stable++ } else { $stable = 1; $lastTitle = [string]$pick.Title }
    if ($stable -ge 2) { $choice = $pick; break }
  }
  if (-not $choice) {
    Log ("desktop no musica row token=" + $token)
    return @{ status = 502; body = @{ ok = $false; error = 'no song row' } }
  }
  try {
    $proc = Get-SpotifyProcess
    $shot = Save-SpotifyShot $proc
    $ocr = @(Get-OcrWords $shot)
    if ($ocr.Count -gt 0 -and $rows) {
      $seen = Select-MusicaRow $rows $token $ocr
      if ($seen) { $choice = $seen }
    }
  } catch {
    Log ("desktop shot failed " + $_.Exception.Message)
  }
  Log ("desktop click " + $choice.Name + " kind=" + $choice.Kind + " y=" + [int]$choice.RelY)
  $wanted = [string]$choice.Fold
  $pretty = $null
  for ($try = 0; $try -lt 2 -and -not $pretty; $try++) {
    $proc = Get-SpotifyProcess
    $snap = Read-SpotifyRows $proc
    $already = $false
    if ($snap -and $wanted -and ($snap.NowFold -like ('*' + $wanted + '*')) -and ($snap.Transport -eq 'Pausar' -or $snap.Transport -eq 'Pause')) {
      $already = $true
    }
    if (-not $already) {
      try {
        $fresh = $null
        if ($snap) {
          $fresh = $snap.Rows | Where-Object { $_.Title -eq $choice.Title -and $_.Kind -eq 'musica' } | Select-Object -First 1
        }
        if ($fresh) { Invoke-Hero $fresh.El } else { Invoke-Hero $choice.El }
      } catch {
        Log ("desktop invoke failed " + $_.Exception.Message)
        if ($try -eq 1) {
          return @{ status = 502; body = @{ ok = $false; error = 'play button failed' } }
        }
      }
    }
    $confirmUntil = (Get-Date).AddSeconds(3.5)
    while ((Get-Date) -lt $confirmUntil) {
      Start-Sleep -Milliseconds 350
      $proc = Get-SpotifyProcess
      if (-not $proc) { break }
      $snap = Read-SpotifyRows $proc
      if (-not $snap) { continue }
      $playing = ($snap.Transport -eq 'Pausar' -or $snap.Transport -eq 'Pause')
      $changed = $before -and $snap.Now -and ($snap.Now -ne $before)
      $matches = $wanted -and ($snap.NowFold -like ('*' + $wanted + '*'))
      if ($playing -and ($changed -or $matches -or $already)) {
        $pretty = [string]$snap.Now
        if ($pretty.StartsWith('Tocando agora: ')) { $pretty = $pretty.Substring(15) }
      }
    }
  }
  if ($pretty) {
    Log ("desktop play ok " + $pretty)
    return @{ status = 200; body = @{ ok = $true; via = 'desktop'; track = $pretty } }
  }
  Log ("desktop play unverified token=" + $token)
  return @{ status = 502; body = @{ ok = $false; error = 'play not confirmed' } }
}

function Play-Query($q) {
  $clientId = Get-ClientId
  if (-not $clientId) {
    return Play-Desktop $q
  }
  $token = Get-AccessToken
  if (-not $token) { $token = Start-Login }
  if (-not $token) {
    return @{ status = 503; body = @{ ok = $false; error = 'not logged in' } }
  }
  $searchUrl = 'https://api.spotify.com/v1/search?type=track&limit=1&q=' + (Encode $q)
  $found = Invoke-Spotify GET $searchUrl $token $null
  if (-not $found.ok) {
    return @{ status = 502; body = @{ ok = $false; error = 'search failed' } }
  }
  $parsed = $found.body | ConvertFrom-Json
  $track = $parsed.tracks.items | Select-Object -First 1
  if (-not $track) {
    return @{ status = 404; body = @{ ok = $false; error = 'no track' } }
  }
  $trackUri = [string]$track.uri
  $albumUri = [string]$track.album.uri
  $label = '{0} - {1}' -f $track.artists[0].name, $track.name
  $devices = Invoke-Spotify GET 'https://api.spotify.com/v1/me/player/devices' $token $null
  $deviceId = $null
  if ($devices.ok -and $devices.body) {
    $list = @(($devices.body | ConvertFrom-Json).devices)
    $pick = $list | Where-Object { $_.is_active } | Select-Object -First 1
    if (-not $pick) { $pick = $list | Where-Object { $_.type -eq 'Computer' } | Select-Object -First 1 }
    if (-not $pick) { $pick = $list | Select-Object -First 1 }
    if ($pick) { $deviceId = [string]$pick.id }
  }
  $playBody = if ($albumUri) {
    @{ context_uri = $albumUri; offset = @{ uri = $trackUri } } | ConvertTo-Json -Depth 4 -Compress
  } else {
    @{ uris = @($trackUri) } | ConvertTo-Json -Compress
  }
  $playUrl = 'https://api.spotify.com/v1/me/player/play'
  if ($deviceId) { $playUrl += '?device_id=' + (Encode $deviceId) }
  $played = Invoke-Spotify PUT $playUrl $token $playBody
  if ($played.ok) {
    return @{ status = 200; body = @{ ok = $true; via = 'api'; track = $label } }
  }
  Open-Track $trackUri
  Log ("api play failed status=$($played.status); opened $trackUri")
  return @{ status = 200; body = @{ ok = $true; via = 'app'; track = $label } }
}

Add-Type -AssemblyName System.Web

$script:nowCache = $null
$script:nowAt = [datetime]::MinValue
$script:smtcReady = $false
$script:smtcTried = $false
$script:smtcAwait = $null
$script:nowWarned = $false

function Ensure-Smtc {
  if ($script:smtcTried) { return $script:smtcReady }
  $script:smtcTried = $true
  try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $script:smtcAwait = @([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
      $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    })[0]
    $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
    $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
    $script:smtcReady = $true
  } catch {
    Log ("now playing unavailable: " + $_.Exception.Message)
    $script:smtcReady = $false
  }
  return $script:smtcReady
}

function Await-WinRt($task, $type) {
  $asTask = $script:smtcAwait.MakeGenericMethod($type)
  $net = $asTask.Invoke($null, @($task))
  if (-not $net.Wait(2500)) { throw 'now playing timeout' }
  return $net.Result
}

function Get-NowPlaying {
  $none = @{ ok = $true; status = 'none'; title = ''; artist = '' }
  if ($script:nowCache -and (([datetime]::UtcNow - $script:nowAt).TotalSeconds -lt 2.5)) { return $script:nowCache }
  if (-not (Ensure-Smtc)) { return $none }
  try {
    $mgrType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
    $propType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
    $mgr = Await-WinRt ($mgrType::RequestAsync()) $mgrType
    $session = $mgr.GetCurrentSession()
    if (-not $session) {
      $script:nowCache = $none
      $script:nowAt = [datetime]::UtcNow
      return $none
    }
    $props = Await-WinRt ($session.TryGetMediaPropertiesAsync()) $propType
    $status = [string]$session.GetPlaybackInfo().PlaybackStatus
    $title = ([string]$props.Title).Trim()
    $artist = ([string]$props.Artist).Trim()
    if ($title.Length -gt 120) { $title = $title.Substring(0, 120) }
    if ($artist.Length -gt 80) { $artist = $artist.Substring(0, 80) }
    $body = @{ ok = $true; status = $status; title = $title; artist = $artist }
    $script:nowCache = $body
    $script:nowAt = [datetime]::UtcNow
    return $body
  } catch {
    if (-not $script:nowWarned) {
      Log ("now playing failed: " + $_.Exception.Message)
      $script:nowWarned = $true
    }
    $script:nowCache = $none
    $script:nowAt = [datetime]::UtcNow
    return $none
  }
}

Log 'listening on 127.0.0.1:47824'
$listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $port)
$listener.Start()
try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $req = Read-Request $client
      if (-not $req) { continue }
      $pathOnly = ($req.Path -split '\?')[0]
      if ($req.Method -eq 'GET' -and $pathOnly -eq '/health') {
        $ready = [bool](Get-ClientId)
        Send-Http $req.Stream 200 @{ ok = $true; name = 'capri-spotify'; client = $ready; desktop = $true }
      } elseif ($req.Method -eq 'GET' -and $pathOnly -eq '/now') {
        Send-Http $req.Stream 200 (Get-NowPlaying)
      } elseif ($req.Method -eq 'POST' -and $pathOnly -eq '/play') {
        $q = ''
        try { $q = [string](($req.Body | ConvertFrom-Json).q) } catch { $q = '' }
        $q = $q.Trim()
        if (-not $q) {
          Send-Http $req.Stream 400 @{ ok = $false; error = 'empty query' }
        } else {
          try {
            $result = Play-Query $q
            Send-Http $req.Stream $result.status $result.body
          } catch {
            Log $_.Exception.Message
            Send-Http $req.Stream 500 @{ ok = $false; error = 'play failed' }
          }
        }
      } else {
        Send-Http $req.Stream 404 @{ ok = $false }
      }
    } catch {
      Log $_.Exception.Message
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
  $mutex.ReleaseMutex()
}
