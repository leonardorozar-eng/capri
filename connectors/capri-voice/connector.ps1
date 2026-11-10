# Capri voice connector. Listens on 127.0.0.1:47826.
# Maria speaks. Hey Capri uses the Windows recognizer and keeps only utterances that contain "capri".
$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$statePath = Join-Path $dir 'state.json'
$logPath = Join-Path $dir 'connector.log'
$port = 47826

$mutex = New-Object Threading.Mutex($false, 'Local\CapriVoice')
$gotMutex = $false
try { $gotMutex = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $gotMutex = $true }
if (-not $gotMutex) { exit 0 }

function Log($msg) {
  $safe = [regex]::Replace([string]$msg, '[^\x20-\x7E]', '?')
  $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $safe
  [IO.File]::AppendAllText($logPath, $line + "`r`n")
}

function Send-Http($stream, $status, $obj) {
  $reason = @{ 200 = 'OK'; 400 = 'Bad Request'; 404 = 'Not Found'; 500 = 'Error' }[[int]$status]
  if (-not $reason) { $reason = 'OK' }
  $json = $obj | ConvertTo-Json -Compress -Depth 4
  $body = [Text.Encoding]::UTF8.GetBytes($json)
  $head = "HTTP/1.1 $status $reason`r`nContent-Type: application/json; charset=utf-8`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
  $hb = [Text.Encoding]::ASCII.GetBytes($head)
  $stream.Write($hb, 0, $hb.Length)
  $stream.Write($body, 0, $body.Length)
  $stream.Flush()
}

function Read-Request($client) {
  $client.ReceiveTimeout = 8000
  $stream = $client.GetStream()
  $buf = New-Object byte[] 8192
  $ms = New-Object IO.MemoryStream
  $headerAt = -1
  while ($headerAt -lt 0 -and $ms.Length -lt 65536) {
    $n = $stream.Read($buf, 0, $buf.Length)
    if ($n -le 0) { break }
    $ms.Write($buf, 0, $n)
    $raw = $ms.ToArray()
    $limit = $raw.Length - 4
    for ($i = 0; $i -le $limit; $i++) {
      if ($raw[$i] -eq 13 -and $raw[$i + 1] -eq 10 -and $raw[$i + 2] -eq 13 -and $raw[$i + 3] -eq 10) {
        $headerAt = $i
        break
      }
    }
  }
  if ($headerAt -lt 0) { return $null }
  $all = $ms.ToArray()
  $head = [Text.Encoding]::ASCII.GetString($all, 0, $headerAt)
  $bodyAt = $headerAt + 4
  $len = 0
  foreach ($line in ($head -split "`r`n")) {
    if ($line -match '^Content-Length:\s*(\d+)') { $len = [int]$Matches[1] }
  }
  while (($all.Length - $bodyAt) -lt $len -and $all.Length -lt 65536) {
    $n = $stream.Read($buf, 0, $buf.Length)
    if ($n -le 0) { break }
    $ms.Write($buf, 0, $n)
    $all = $ms.ToArray()
  }
  $body = ''
  if ($len -gt 0 -and ($all.Length - $bodyAt) -ge $len) {
    $body = [Text.Encoding]::UTF8.GetString($all, $bodyAt, $len)
  }
  $parts = (($head -split "`r`n")[0] -split ' ')
  return @{ Method = $parts[0]; Path = (($parts[1] -split '\?')[0]); Body = $body; Stream = $stream }
}

function Write-Listen($on) {
  $flag = 'false'
  if ($on) { $flag = 'true' }
  [IO.File]::WriteAllText($statePath, ('{"listen":' + $flag + '}'))
}

$listen = $true
if (Test-Path $statePath) {
  try {
    $saved = [IO.File]::ReadAllText($statePath) | ConvertFrom-Json
    if ($null -ne $saved.listen) { $listen = [bool]$saved.listen }
  } catch { }
}

$shared = [hashtable]::Synchronized(@{
  heard = ''
  listen = $listen
  stop = $false
  speakUntil = [datetime]::SpecifyKind([datetime]::MinValue, [datetimekind]::Utc)
  ears = $false
  error = ''
})

$earScript = @'
$ErrorActionPreference = "Continue"
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $script:asTask = @([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq "AsTask" -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1
  } | Where-Object { $_.GetParameters()[0].ParameterType.Name -like "IAsyncOperation*" })[0]
  if (-not $script:asTask) {
    $names = @([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq "AsTask" } | ForEach-Object { $_.GetParameters()[0].ParameterType.Name })
    $shared.error = "no AsTask " + ($names -join ",")
    return
  }
  function Await([object]$task, [type]$type) {
    $net = $script:asTask.MakeGenericMethod($type).Invoke($null, @($task))
    if (-not $net.Wait(20000)) { return $null }
    return $net.Result
  }
  $null = [Windows.Media.SpeechRecognition.SpeechRecognizer, Windows.Media.SpeechRecognition, ContentType = WindowsRuntime]
  $null = [Windows.Media.SpeechRecognition.SpeechRecognitionCompilationResult, Windows.Media.SpeechRecognition, ContentType = WindowsRuntime]
  $null = [Windows.Media.SpeechRecognition.SpeechRecognitionResult, Windows.Media.SpeechRecognition, ContentType = WindowsRuntime]
  $rec = [Windows.Media.SpeechRecognition.SpeechRecognizer]::new()
  $compiled = Await ($rec.CompileConstraintsAsync()) ([Windows.Media.SpeechRecognition.SpeechRecognitionCompilationResult])
  if (-not $compiled -or [string]$compiled.Status -ne "Success") {
    $shared.ears = $false
    $shared.error = "compile failed"
    return
  }
  $rec.Timeouts.InitialSilenceTimeout = [TimeSpan]::FromSeconds(12)
  $rec.Timeouts.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(700)
  $shared.ears = $true
  $shared.error = ""
  $fails = 0
  while (-not $shared.stop) {
    if (-not $shared.listen) { Start-Sleep -Milliseconds 300; continue }
    $until = [datetime]$shared.speakUntil
    if ($until -gt [datetime]::UtcNow) { Start-Sleep -Milliseconds 200; continue }
    try {
      $sw = [Diagnostics.Stopwatch]::StartNew()
      $result = Await ($rec.RecognizeAsync()) ([Windows.Media.SpeechRecognition.SpeechRecognitionResult])
      if (-not $result) { Start-Sleep -Milliseconds 400; continue }
      if ($sw.ElapsedMilliseconds -lt 500) { Start-Sleep -Milliseconds 700 }
      $fails = 0
      $shared.ears = $true
      $text = [string]$result.Text
      if ([string]$result.Status -eq "Success" -and $text -match "(?i)\bcapri\b") {
        $shared.heard = $text
      }
    } catch {
      $fails = $fails + 1
      $msg = [string]$_.Exception.Message
      if ($msg.Length -gt 160) { $msg = $msg.Substring(0, 160) }
      $shared.error = $msg
      if ($fails -ge 3) {
        $shared.ears = $false
        Start-Sleep -Seconds 20
        $fails = 0
        try { $rec.Dispose() } catch { }
        $rec = [Windows.Media.SpeechRecognition.SpeechRecognizer]::new()
        $again = Await ($rec.CompileConstraintsAsync()) ([Windows.Media.SpeechRecognition.SpeechRecognitionCompilationResult])
        if ($again -and [string]$again.Status -eq "Success") {
          $rec.Timeouts.InitialSilenceTimeout = [TimeSpan]::FromSeconds(12)
          $rec.Timeouts.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(700)
          $shared.ears = $true
          $shared.error = ""
        }
      } else {
        Start-Sleep -Seconds 1
      }
    }
  }
  try { $rec.Dispose() } catch { }
} catch {
  $shared.ears = $false
  $msg = [string]$_.Exception.Message
  if ($msg.Length -gt 160) { $msg = $msg.Substring(0, 160) }
  $shared.error = $msg
}
'@

$rs = [runspacefactory]::CreateRunspace()
$rs.ApartmentState = [Threading.ApartmentState]::STA
$rs.Open()
$earPs = [powershell]::Create()
$earPs.Runspace = $rs
$earPs.Runspace.SessionStateProxy.SetVariable('shared', $shared)
[void]$earPs.AddScript($earScript)
$earHandle = $earPs.BeginInvoke()

Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$picked = $null
foreach ($v in $synth.GetInstalledVoices()) {
  if ($v.Enabled -and $v.VoiceInfo.Culture.Name -eq 'pt-BR') { $picked = $v.VoiceInfo.Name; break }
}
if ($picked) { $synth.SelectVoice($picked) }

$kokoroRoot = Join-Path $dir 'kokoro'
$kokoroExe = Join-Path $kokoroRoot 'sherpa113\sherpa-onnx-v1.13.8-win-x64-shared-MD-Release\bin\sherpa-onnx-offline-tts.exe'
$kokoroPack = Join-Path $kokoroRoot 'pack'
$kokoroOut = Join-Path $kokoroRoot 'out'
New-Item -ItemType Directory -Force -Path $kokoroOut | Out-Null
$script:player = New-Object System.Media.SoundPlayer
$script:wavSlot = 0
$script:kokoroOk = Test-Path -LiteralPath $kokoroExe

function Quote-Arg([string]$s) {
  return '"' + ($s.Replace('"', '')) + '"'
}

function Stop-Talk {
  try { $script:player.Stop() } catch { }
}

function Wav-Ms([string]$path) {
  try {
    $fs = [IO.File]::Open($path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    try {
      $br = New-Object IO.BinaryReader($fs)
      $null = $br.ReadBytes(24)
      $rate = $br.ReadInt32()
      $null = $br.ReadBytes(12)
      $nbytes = $br.ReadInt32()
      if ($rate -lt 8000 -or $nbytes -lt 2) { return 800 }
      return [int][Math]::Min(12000, (1000.0 * $nbytes / 2 / $rate) + 350)
    } finally { $fs.Close() }
  } catch { return 1500 }
}

function Invoke-Kokoro([string]$text) {
  if (-not $script:kokoroOk) { return $null }
  $safe = $text.Replace('"', ' ').Replace("`r", ' ').Replace("`n", ' ').Trim()
  if (-not $safe) { return $null }
  $script:wavSlot = 1 - $script:wavSlot
  $wav = Join-Path $kokoroOut ('say' + $script:wavSlot + '.wav')
  if (Test-Path -LiteralPath $wav) {
    try { Remove-Item -LiteralPath $wav -Force -ErrorAction SilentlyContinue } catch { }
  }
  $arg = @(
    ('--kokoro-model=' + (Quote-Arg (Join-Path $kokoroPack 'model.onnx'))),
    ('--kokoro-voices=' + (Quote-Arg (Join-Path $kokoroPack 'voices.bin'))),
    ('--kokoro-tokens=' + (Quote-Arg (Join-Path $kokoroPack 'tokens.txt'))),
    ('--kokoro-data-dir=' + (Quote-Arg (Join-Path $kokoroPack 'espeak-ng-data'))),
    '--kokoro-lang=pt-br',
    '--sid=53',
    '--speed=1.1',
    '--num-threads=4',
    ('--output-filename=' + (Quote-Arg $wav)),
    (Quote-Arg $safe)
  ) -join ' '
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $kokoroExe
  $psi.WorkingDirectory = Split-Path -Parent $kokoroExe
  $psi.Arguments = $arg
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $proc = New-Object System.Diagnostics.Process
  $proc.StartInfo = $psi
  [void]$proc.Start()
  $outTask = $proc.StandardOutput.ReadToEndAsync()
  $errTask = $proc.StandardError.ReadToEndAsync()
  if (-not $proc.WaitForExit(8000)) {
    try { $proc.Kill() } catch { }
    return $null
  }
  try { $null = $outTask.Wait(2000) } catch { }
  try { $null = $errTask.Wait(2000) } catch { }
  if ($proc.ExitCode -ne 0) { return $null }
  if (-not (Test-Path -LiteralPath $wav)) { return $null }
  if ((Get-Item -LiteralPath $wav).Length -lt 1000) { return $null }
  return $wav
}

Log 'listening on 127.0.0.1:47826'
$listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $port)
$listener.Start()
try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $req = Read-Request $client
      if (-not $req) { continue }
      if ($req.Method -eq 'GET' -and $req.Path -eq '/health') {
        $voiceName = 'maria'
        if ($script:kokoroOk) { $voiceName = 'kokoro' }
        Send-Http $req.Stream 200 @{
          ok = $true
          name = 'capri-voice'
          ears = [bool]$shared.ears
          listen = [bool]$shared.listen
          error = [string]$shared.error
          voice = $voiceName
        }
      } elseif ($req.Method -eq 'GET' -and $req.Path -eq '/heard') {
        $text = [string]$shared.heard
        $shared.heard = ''
        Send-Http $req.Stream 200 @{ text = $text }
      } elseif ($req.Method -eq 'POST' -and $req.Path -eq '/say') {
        $line = ''
        try { $line = [string](($req.Body | ConvertFrom-Json).text) } catch { $line = '' }
        $line = $line.Trim()
        if ($line.Length -gt 220) { $line = $line.Substring(0, 220) }
        if (-not $line) {
          Send-Http $req.Stream 400 @{ ok = $false }
        } else {
          $shared.speakUntil = [datetime]::UtcNow.AddSeconds(12)
          $wav = $null
          try { $wav = Invoke-Kokoro $line } catch { $wav = $null }
          $played = $false
          if ($wav) {
            try { $synth.SpeakAsyncCancelAll() } catch { }
            try { Stop-Talk } catch { }
            try {
              $hold = Wav-Ms $wav
              $script:player.SoundLocation = $wav
              $script:player.Load()
              $script:player.Play()
              $shared.speakUntil = [datetime]::UtcNow.AddMilliseconds($hold)
              $played = $true
            } catch {
              $played = $false
            }
          }
          if ($played) {
            Log 'spoke kokoro'
            try { Send-Http $req.Stream 200 @{ ok = $true; voice = 'kokoro' } } catch { }
          } else {
            try {
              $ms = [Math]::Min(12000, 500 + ($line.Length * 75))
              $shared.speakUntil = [datetime]::UtcNow.AddMilliseconds($ms)
              $synth.SpeakAsyncCancelAll()
              [void]$synth.SpeakAsync($line)
              Log 'spoke maria'
              Send-Http $req.Stream 200 @{ ok = $true; voice = 'maria' }
            } catch {
              $shared.speakUntil = [datetime]::UtcNow
              try { Send-Http $req.Stream 500 @{ ok = $false } } catch { }
            }
          }
        }
      } elseif ($req.Method -eq 'POST' -and $req.Path -eq '/listen') {
        $on = $true
        try { $on = [bool](($req.Body | ConvertFrom-Json).on) } catch { $on = $true }
        $shared.listen = $on
        if (-not $on) { $shared.heard = '' }
        Write-Listen $on
        Send-Http $req.Stream 200 @{ ok = $true; listen = [bool]$on }
      } else {
        Send-Http $req.Stream 404 @{ ok = $false }
      }
    } catch {
      $msg = [string]$_.Exception.Message
      if ($msg -notmatch 'transporte|transport') { Log ('request failed: ' + $msg) }
    } finally {
      try { $client.Close() } catch { }
    }
  }
} finally {
  $shared.stop = $true
  try { $listener.Stop() } catch { }
  try { Stop-Talk } catch { }
  try { $synth.SpeakAsyncCancelAll() } catch { }
  try { $synth.Dispose() } catch { }
}
