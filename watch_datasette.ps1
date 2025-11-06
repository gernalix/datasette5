$ErrorActionPreference = 'Stop'
$root     = (Get-Item -LiteralPath 'Z:\download\datasette5\').FullName
$venv     = 'Z:\download\datasette5\\.venv313\Scripts\python.exe'
$db       = 'Z:\download\datasette5\\output.db'
$caltxt   = 'Z:\download\datasette5\\static\custom\calendar_columns.txt'
$bindHost = '0.0.0.0'
$bindPort = '8001'
$cert     = 'C:\ProgramData\Tailscale\certs\daniele.tail6b4058.ts.net.crt'
$key      = 'C:\ProgramData\Tailscale\certs\daniele.tail6b4058.ts.net.key'

function Start-DS {
  Write-Host '[BUILD] Rigenero calendario...'
  $scriptPath = Join-Path $root 'scripts\build_calendar.py'
  $buildArgs  = @($scriptPath, $db, $caltxt, '--base-path', '/')
  $procBuild  = Start-Process -FilePath $venv -ArgumentList $buildArgs -WorkingDirectory $root -Wait -PassThru
  if ($procBuild.ExitCode -ne 0) { throw 'build_calendar.py fallito' }
  Write-Host '[RUN] Avvio Datasette'
  $templates = Join-Path $root 'templates'
  $staticCus = 'custom:' + (Join-Path $root 'static\custom')
  $metadata  = Join-Path $root 'metadata.json'
  $args = @('-m','datasette', $db, '--host', $bindHost, '--port', $bindPort, '--setting','base_url','/', '--template-dir', $templates, '--static', $staticCus, '--metadata', $metadata)
  $useHttps = (Test-Path -LiteralPath $cert) -and (Test-Path -LiteralPath $key)
  if ($useHttps) {
    $args += @('--ssl-certfile', $cert, '--ssl-keyfile', $key)
    Write-Host ('[INFO] Modalita'':'' HTTPS (host={0} port={1})' -f $bindHost, $bindPort)
  } else {
    Write-Host ('[INFO] Modalita'':'' HTTP (host={0} port={1})' -f $bindHost, $bindPort)
  }
  $global:proc = Start-Process -FilePath $venv -ArgumentList $args -WorkingDirectory $root -PassThru
  if (-not $global:proc) { throw 'Impossibile avviare Datasette' }
}

function Stop-DS {
  param([System.Diagnostics.Process]$p)
  if ($p -and -not $p.HasExited) {
    Write-Host ('[STOP] PID {0}' -f $p.Id)
    try { $p.Kill() } catch {}
    $p.WaitForExit() | Out-Null
  }
}

Start-DS

$fsw = New-Object IO.FileSystemWatcher $root -Property @{ IncludeSubdirectories = $true; EnableRaisingEvents = $true; NotifyFilter = [IO.NotifyFilters]::FileName -bor [IO.NotifyFilters]::LastWrite -bor [IO.NotifyFilters]::DirectoryName }
Register-ObjectEvent $fsw Changed -Action { $global:changed = $true } > $null
Register-ObjectEvent $fsw Created -Action { $global:changed = $true } > $null
Register-ObjectEvent $fsw Deleted -Action { $global:changed = $true } > $null
Register-ObjectEvent $fsw Renamed -Action { $global:changed = $true } > $null
Write-Host ('[WATCH] ' + $root)
while ($true) {
  Start-Sleep -Milliseconds 800
  if ($global:changed) {
    $global:changed = $false
    Stop-DS $global:proc
    Start-DS
  }
}
